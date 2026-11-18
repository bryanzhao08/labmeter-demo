#!/usr/bin/env node
'use strict';
// Stdio JSON-RPC MCP server for Parity's selectable 6-agent crew & practice simulators.
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const { createRuntime } = require('./runtime.cjs');
const { AGENTS, AGENT_IDS, PRESETS } = require('./roster.cjs');
const { readSafeFile } = require('../safe-read.cjs');
const M = require('../month.js');
const I = require('../intake.js');
const R = require('../ratesheet.js');
const H = require('../helpers.js');

const version = require('../package.json').version;
const argv = process.argv.slice(2);
const fullCrewMode = argv.includes('--full-crew');
const flagValue = flag => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
};

const runsDirRaw = flagValue('--runs-dir');
const runsDir = runsDirRaw ? path.resolve(runsDirRaw) : null;
const folderRaw = flagValue('--folder');
let folderBase = null;
if (folderRaw) {
  try {
    const resolved = fs.realpathSync(folderRaw);
    if (fs.statSync(resolved).isDirectory()) folderBase = resolved;
  } catch {}
}

let savedRules = null;
const rulesRaw = flagValue('--rules');
if (rulesRaw) {
  try {
    const resolved = path.resolve(rulesRaw);
    const parsed = JSON.parse(readSafeFile(path.dirname(resolved), path.basename(resolved), 2 * 1024 * 1024).toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) savedRules = parsed;
  } catch {}
}

const MAX_FILE = 20 * 1024 * 1024;
const FILE_RX = /\.(csv|tsv|txt|xlsx|xls)$/i;

function loadWorkspaceFromFolder() {
  if (!folderBase) {
    throw Error('No connected exports folder on this MCP server. Pass system "fbs" or "ilab", or connect a folder in Parity first.');
  }
  const files = [];
  (function walk(dir, depth) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (ent.name.startsWith('.') || ent.name.startsWith('~$') || ent.name === 'node_modules') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) { if (depth < 2) walk(full, depth + 1); continue; }
      if (!ent.isFile() || !FILE_RX.test(ent.name)) continue;
      try {
        const st = fs.statSync(full);
        if (st.size > 0 && st.size <= MAX_FILE) files.push({ name: path.relative(folderBase, full), mtime: st.mtimeMs });
      } catch {}
    }
  })(folderBase, 0);
  files.sort((a, b) => b.mtime - a.mtime || a.name.localeCompare(b.name));

  const entries = files.slice(0, 120).map(f => {
    try {
      const data = readSafeFile(folderBase, f.name, MAX_FILE);
      let table;
      if (/\.xlsx?$/i.test(f.name)) {
        const X = require('../vendor/xlsx.full.min.js');
        const book = X.read(data, { type: 'buffer' });
        const sheet = book.Sheets[book.SheetNames[0]];
        const rows = X.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
        table = { head: (rows.shift() || []).map(String), rows: rows.map(row => row.map(String)) };
      } else {
        table = M.parseCSV(data.toString('utf8'));
      }
      const info = I.classify(table);
      return { ...f, table, info, kind: info.kind };
    } catch {
      return { ...f, table: { head: [], rows: [] }, info: {}, kind: 'error' };
    }
  });

  const picked = I.pickDefaults(entries);
  const book = picked.find(e => e.kind === 'reservations' && e.include);
  const logs = picked.filter(e => e.kind === 'logs' && e.include);
  const price = picked.find(e => e.kind === 'prices' && e.include);
  const parsedPrice = price ? R.parseRates([price.table.head, ...price.table.rows]) : null;
  const profile = savedRules || {
    basis: 'union', evidence: 'login', round_minutes: 30,
    rates: { self: 60, assisted: 125, training: 125 },
    machine_rules: {}, machines: [], machines_on: [], default_tier: 'internal', rate_card: [], tiers: []
  };
  if (!savedRules && parsedPrice) H.applyRateCard(profile, parsedPrice);
  if (!book) throw Error('No reservation export found in connected folder: ' + folderBase);

  return {
    reservations: { name: book.name, table: book.table },
    logs: logs.map(l => ({ name: l.name, table: l.table, machine: '' })),
    prices: price ? { name: price.name, rows: [price.table.head, ...price.table.rows] } : null,
    profile
  };
}

function resolveAgentRef(ref) {
  const clean = String(ref || '').trim().toLowerCase();
  if (!clean) return null;
  const exact = AGENTS.find(a => a.id === clean || a.name.toLowerCase() === clean);
  if (exact) return exact.id;
  if (/sherlock|ohms|scout/.test(clean)) return 'scout';
  if (/slots|scheduler|pull/.test(clean)) return 'scheduler';
  if (/watt|telemetry|plug/.test(clean)) return 'telemetry';
  if (/venn|match/.test(clean)) return 'matcher';
  if (/baron|markup|pric/.test(clean)) return 'pricer';
  if (/nitpick|audit|flag/.test(clean)) return 'auditor';
  return clean;
}

async function waitForRun(runtime, runId, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = runtime.get(runId);
    if (r.status !== 'running') return r;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  return runtime.get(runId);
}

const baseTools = [
  {
    name: 'parity_pull_practice_schedule',
    description: 'Summon Parity’s selectable multi-agent crew (Sherlock Ohms, Sir Slots-a-Lot, Count Wattula, Dr. Venn, Baron Von Markup, Captain Nitpick) to run against the FBS or iLab simulator. Returns a run ID; poll parity_practice_run_status. Synthetic data only. Does not import into the app or change bookings.',
    inputSchema: {
      type: 'object',
      properties: {
        system: { type: 'string', enum: ['fbs', 'ilab'] },
        month: { type: 'string', pattern: '^20[0-9]{2}-(0[1-9]|1[0-2])$' },
        scenario: { type: 'string', enum: ['normal', 'retry', 'invalid', 'pitch'] },
        agents: { type: 'array', items: { type: 'string', enum: AGENT_IDS } }
      },
      required: ['system', 'month'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: 'parity_practice_run_status',
    description: 'Read a crew run, its agent steps, smart-plug classifications, discrepancies, pricing totals, and synthetic reservation preview. No customer data or credentials are used.',
    inputSchema: {
      type: 'object',
      properties: {
        run_id: { type: 'string', pattern: '^[a-f0-9-]{36}$' }
      },
      required: ['run_id'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  }
];

const crewTools = [
  {
    name: 'parity_list_agents',
    description: 'List Parity’s 6 funny-named specialist agents (Sherlock Ohms, Sir Slots-a-Lot, Count Wattula, Dr. Venn, Baron Von Markup, Captain Nitpick), presets, all 7 locally trained ML model accuracies, local Ollama LLMs, and connected folder status.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'parity_run_agent',
    description: 'Run one specific funny-named Parity agent (e.g. "Sir Slots-a-Lot", "Count Wattula", "Captain Nitpick"), a list of agents, or a preset on FBS/iLab practice data or the connected exports folder. Waits for completion and syncs the run live into the Parity desktop app.',
    inputSchema: {
      type: 'object',
      properties: {
        agent: { type: 'string', description: 'Single agent ID or funny name (e.g. "Sir Slots-a-Lot", "Count Wattula", "scout", "auditor").' },
        agents: { type: 'array', items: { type: 'string' }, description: 'Multiple agent IDs or names to enable.' },
        preset: { type: 'string', enum: PRESETS.map(p => p.id) },
        system: { type: 'string', enum: ['fbs', 'ilab', 'workspace'] },
        month: { type: 'string', pattern: '^20[0-9]{2}-(0[1-9]|1[0-2])$' },
        scenario: { type: 'string', enum: ['normal', 'retry', 'invalid', 'pitch'] },
        engine: { type: 'string', enum: ['builtin', 'local_llm'] },
        llm_model: { type: 'string' }
      },
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: 'parity_ask_crew',
    description: 'Give Parity’s agent crew a natural-language goal (e.g. "Have Count Wattula inspect smart-plug watts in FBS" or "Close October pitch month and flag discrepancies"). Plans with Parity’s trained intent router (plus optional local Ollama), executes the crew, and syncs the result into the Parity app.',
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', minLength: 2, maxLength: 500 },
        system: { type: 'string', enum: ['fbs', 'ilab', 'workspace'] },
        month: { type: 'string', pattern: '^20[0-9]{2}-(0[1-9]|1[0-2])$' },
        scenario: { type: 'string', enum: ['normal', 'retry', 'invalid', 'pitch'] },
        engine: { type: 'string', enum: ['builtin', 'local_llm'] },
        llm_model: { type: 'string' }
      },
      required: ['goal'],
      additionalProperties: false
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  {
    name: 'parity_train_models',
    description: 'Retrain all 7 local Parity ML models (source_classifier, column_mapper, power_state, session_matcher, policy_pricer, anomaly_auditor, intent_router) locally and return updated accuracy/macro-F1 evaluation metrics.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  },
  ...baseTools
];

const activeTools = fullCrewMode ? crewTools : baseTools;
const serverName = fullCrewMode ? 'parity-crew' : 'parity-scheduling-practice';
const respond = (id, result, error) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) }) + '\n');

function formatSyncRun(full) {
  return {
    mode: full.system === 'workspace' ? 'workspace' : 'synthetic',
    run_id: full.id,
    system: full.system,
    month: full.month,
    scenario: full.scenario,
    engine: full.engine || 'builtin',
    status: full.status,
    agents_used: full.agents,
    crew: full.crew,
    counts: full.counts,
    crew_counts: full.crewCounts,
    discrepancies: (full.result?.discrepancies || []).filter(d => d.label !== 'clean_match').slice(0, 20),
    all_discrepancy_count: (full.result?.discrepancies || []).length,
    pricing_summary: full.result?.pricingSummary || null,
    llm_briefing: full.result?.llmBriefing || null,
    events: full.events,
    error: full.error || null,
    synced_to_app: !!runsDir
  };
}

(async () => {
  const runtime = await createRuntime(runsDir ? { directory: runsDir } : {});
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async line => {
    let m;
    try { m = JSON.parse(line); } catch { return respond(null, null, { code: -32700, message: 'Parse error' }); }
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return respond(m?.id ?? null, null, { code: -32600, message: 'Invalid request' });
    if (!Object.hasOwn(m, 'id')) return;

    if (m.method === 'initialize') {
      return respond(m.id, {
        protocolVersion: ['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25'].includes(m.params?.protocolVersion) ? m.params.protocolVersion : '2025-11-25',
        capabilities: { tools: {} },
        serverInfo: { name: serverName, version }
      });
    }
    if (m.method === 'ping') return respond(m.id, {});
    if (m.method === 'tools/list') return respond(m.id, { tools: activeTools });
    if (m.method !== 'tools/call') return respond(m.id, null, { code: -32601, message: 'Method not found' });

    try {
      const t = activeTools.find(x => x.name === m.params?.name);
      const args = m.params?.arguments || {};
      if (
        !t || typeof args !== 'object' || Array.isArray(args) ||
        Object.keys(args).some(k => !Object.hasOwn(t.inputSchema.properties, k)) ||
        (t.inputSchema.required || []).some(k => typeof args[k] !== 'string') ||
        (args.agents !== undefined && (!Array.isArray(args.agents) || !args.agents.every(x => typeof x === 'string')))
      ) {
        throw Error('Invalid tool arguments.');
      }

      let output;
      if (t.name === 'parity_pull_practice_schedule') {
        output = { mode: 'synthetic', ...runtime.start({ ...args, triggeredBy: 'mcp' }) };
      } else if (t.name === 'parity_practice_run_status') {
        if (!/^[a-f0-9-]{36}$/.test(args.run_id)) throw Error('Invalid run ID.');
        output = { mode: 'synthetic', ...runtime.get(args.run_id) };
      } else if (t.name === 'parity_list_agents') {
        const ollama = await runtime.llmStatus();
        const info = runtime.info();
        output = {
          roster: info.roster,
          presets: info.presets,
          models: info.models,
          average_accuracy: info.averageAccuracy,
          average_macro_f1: info.averageMacroF1,
          trained_at: info.trainedAt,
          local_ollama: ollama,
          folder_connected: !!folderBase,
          rules_loaded: !!savedRules,
          synced_to_app: !!runsDir
        };
      } else if (t.name === 'parity_train_models') {
        output = { ...runtime.train({}), synced_to_app: !!runsDir };
      } else if (t.name === 'parity_run_agent') {
        let selected = null;
        if (args.preset) {
          const p = PRESETS.find(x => x.id === args.preset);
          if (!p) throw Error('Unknown preset: ' + args.preset);
          selected = [...p.agents];
        } else if (args.agents) {
          selected = args.agents.map(resolveAgentRef);
        } else if (args.agent) {
          selected = [resolveAgentRef(args.agent)];
        }
        const system = args.system || 'fbs';
        const workspace = system === 'workspace' ? loadWorkspaceFromFolder() : null;
        const started = runtime.start({
          system,
          month: args.month || '2026-10',
          scenario: args.scenario || 'pitch',
          agents: selected,
          engine: args.engine || 'builtin',
          llmModel: args.llm_model || '',
          triggeredBy: 'mcp',
          workspace
        });
        const full = await waitForRun(runtime, started.id, args.engine === 'local_llm' ? 14000 : 8000);
        output = formatSyncRun(full);
      } else if (t.name === 'parity_ask_crew') {
        const ws = (args.system === 'workspace' || folderBase) && /workspace|folder|my files|spreadsheet|csv|excel/i.test(args.goal)
          ? loadWorkspaceFromFolder()
          : (args.system === 'workspace' ? loadWorkspaceFromFolder() : null);
        const res = await runtime.ask({
          prompt: args.goal,
          system: args.system,
          month: args.month,
          scenario: args.scenario,
          engine: args.engine || 'builtin',
          llmModel: args.llm_model || '',
          triggeredBy: 'mcp',
          workspace: ws
        });
        if (res.kind === 'train') {
          output = { kind: 'train', plan: res.plan, train_result: res.trainResult, synced_to_app: !!runsDir };
        } else {
          const full = await waitForRun(runtime, res.run.id, args.engine === 'local_llm' ? 14000 : 8000);
          output = { kind: 'run', plan: res.plan, ...formatSyncRun(full) };
        }
      }

      respond(m.id, { content: [{ type: 'text', text: JSON.stringify(output) }], structuredContent: output });
    } catch (e) {
      respond(m.id, { isError: true, content: [{ type: 'text', text: e.message }] });
    }
  });
  rl.on('close', async () => { await runtime.close(); process.exit(0); });
})().catch(e => { process.stderr.write(e.message + '\n'); process.exit(1); });
