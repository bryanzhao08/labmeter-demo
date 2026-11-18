'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const { startSimulator, validMonth } = require('./simulator.cjs');
const { mapColumns } = require('./mapper.cjs');
const { AGENTS, AGENT_IDS, PRESETS, getAgent, normalizeAgentSelection } = require('./roster.cjs');
const { predictText, predictTabular } = require('./ml.cjs');
const { trainAllModels } = require('./train.cjs');
const { listOllamaModels, generateCrewBriefing } = require('./llm.cjs');
const { planCommand } = require('./commander.cjs');

const S = require('../schedule.js');
const R = require('../ratesheet.js');
const H = require('../helpers.js');
const E = require('../reconcile-engine.js');
const M = require('../month.js');

const HEAD = ['Reservation ID', 'Resource', 'Owner', 'Lab', 'Account', 'Start', 'End', 'Reservation type', 'User type', 'Status'];
const fields = ['id', 'resource', 'user', 'lab', 'account', 'start', 'end', 'service', 'tier', 'status'];
const key = s => String(s || '').trim().toLowerCase();

const stamp = s => {
  if (!/^20\d{2}-(0[1-9]|1[0-2])-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(s)) return NaN;
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 19).replace('T', ' ') === s ? d.getTime() : NaN;
};

const csv = table => [table.head, ...table.rows]
  .map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(','))
  .join('\n');

function normalize(pages, resources, month, columnModel = null) {
  const activeModel = columnModel || require('./model/columns.json');
  const rows = [], issues = [], seen = new Map(), evidence = [];
  let duplicates = 0, cancelled = 0;

  for (const [pageNo, page] of pages.entries()) {
    const { mapping, evidence: ev } = mapColumns(activeModel, page.headers);
    if (!pageNo) evidence.push(...ev);
    for (const [index, row] of page.rows.entries()) {
      const ref = { page: pageNo + 1, row: index + 1 };
      if (!Array.isArray(row) || row.length !== page.headers.length || row.some(x => typeof x !== 'string' || x.length > 500)) {
        issues.push({ ...ref, reason: 'Unexpected row shape' });
        continue;
      }
      const out = fields.map(k => mapping[k] === undefined ? '' : row[mapping[k]].trim());
      const [id, resource, user, , , start, end, , , status] = out;
      if (
        !id || !resource || !user ||
        !Number.isFinite(stamp(start)) || !Number.isFinite(stamp(end)) ||
        stamp(end) <= stamp(start) || !start.startsWith(month + '-') ||
        !resources.some(r => r.name === resource) ||
        !['Confirmed', 'Cancelled'].includes(status)
      ) {
        issues.push({ ...ref, reason: 'Invalid identity, instrument, date, time or status' });
        continue;
      }
      if (seen.has(id)) {
        if (seen.get(id) !== JSON.stringify(out)) issues.push({ ...ref, reason: 'Conflicting records share a reservation ID' });
        else duplicates++;
        continue;
      }
      seen.set(id, JSON.stringify(out));
      if (status === 'Cancelled') cancelled++;
      rows.push(out);
    }
  }
  return { table: { head: HEAD, rows }, issues, duplicates, cancelled, mapping: evidence };
}

function trigramDice(a, b) {
  const s1 = key(a).replace(/[^a-z0-9]/g, '');
  const s2 = key(b).replace(/[^a-z0-9]/g, '');
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1;
  if (s1.length < 3 || s2.length < 3) return s1 === s2 ? 1 : 0;
  const g1 = new Set(), g2 = new Set();
  for (let i = 0; i <= s1.length - 3; i++) g1.add(s1.slice(i, i + 3));
  for (let i = 0; i <= s2.length - 3; i++) g2.add(s2.slice(i, i + 3));
  let inter = 0;
  for (const g of g1) if (g2.has(g)) inter++;
  return (2 * inter) / (g1.size + g2.size);
}

function normalizeWorkspaceReservations(table, resources) {
  if (!table || !Array.isArray(table.head) || !Array.isArray(table.rows)) {
    throw Error('No reservation spreadsheet is loaded in this workspace.');
  }
  const parsed = S.readReservations(table);
  if (!parsed) throw Error('Workspace reservation table is missing required columns (resource, owner, start, end).');
  const seen = new Set();
  let duplicates = 0;
  const rows = [];
  for (const r of parsed.table.rows) {
    const id = String(r[0] || '').trim();
    if (seen.has(id)) { duplicates++; continue; }
    seen.add(id);
    const sTime = r[5].length === 16 ? r[5] + ':00' : r[5];
    const eTime = r[6].length === 16 ? r[6] + ':00' : r[6];
    rows.push([id, r[1], r[2], r[3], r[4], sTime, eTime, r[7] || 'Self-service', r[8] || 'Internal', 'Confirmed']);
  }
  const issues = parsed.issues.map((reason, i) => ({ page: 1, row: i + 1, reason }));
  const mapping = table.head.map((h, i) => ({ header: h, index: i, label: 'detected', confidence: 1 }));
  return {
    table: { head: HEAD, rows },
    issues,
    duplicates,
    cancelled: parsed.cancelled,
    mapping,
    resources: resources.length ? resources : S.resources(parsed.items).map((name, i) => ({ id: 'ws-' + (i + 1), name }))
  };
}

function classifyPowerIntervals(models, powerTable) {
  if (!powerTable || !Array.isArray(powerTable.rows) || !powerTable.rows.length) return [];
  const head = (powerTable.head || []).map(key);
  const col = name => head.findIndex(h => h.includes(name));
  const iInst = Math.max(0, col('instrument'));
  const iUser = col('operator') >= 0 ? col('operator') : col('user');
  const iStart = col('start') >= 0 ? col('start') : 2;
  const iEnd = col('end') >= 0 ? col('end') : 3;
  const iMean = col('mean') >= 0 ? col('mean') : 4;
  const iPeak = col('peak') >= 0 ? col('peak') : 5;
  const iStd = col('std') >= 0 ? col('std') : 6;
  const iDuty = col('duty') >= 0 ? col('duty') : 7;
  const iPc = col('pc') >= 0 ? col('pc') : 8;

  const out = [];
  for (const row of powerTable.rows) {
    const startStr = String(row[iStart] || '').trim();
    const endStr = String(row[iEnd] || '').trim();
    const sMin = E.time(startStr, 'iso');
    const eMin = E.time(endStr, 'iso');
    if (!Number.isFinite(sMin) || !Number.isFinite(eMin) || eMin <= sMin) continue;
    const durationMin = Math.round(eMin - sMin);
    const meanWatts = Number(row[iMean]) || 0;
    const peakWatts = Number(row[iPeak]) || meanWatts;
    const stdWatts = Number(row[iStd]) || 0;
    const dutyCycle = Number(row[iDuty]) || 0;
    const pcActiveRatio = Number(row[iPc]) || 0;
    const pred = predictTabular(models.power_state, [meanWatts, peakWatts, stdWatts, dutyCycle, durationMin, pcActiveRatio]);
    out.push({
      instrument: String(row[iInst] || '').trim(),
      operator: iUser >= 0 ? String(row[iUser] || '').trim() : '',
      start: startStr,
      end: endStr,
      startMin: sMin,
      endMin: eMin,
      day: Math.floor(sMin / 1440),
      durationMin,
      meanWatts,
      peakWatts,
      dutyCycle,
      state: pred.label,
      confidence: pred.confidence,
      probabilities: pred.probabilities
    });
  }
  return out;
}

function buildPricingProfile(baseProfile, rateRows, notes, resources) {
  const fallback = {
    lab_name: 'Practice Core',
    booking_system: 'FBS',
    basis: 'union',
    round_minutes: 30,
    evidence: 'login',
    rates: { self: 60, assisted: 125, training: 125 },
    machines: resources.map(r => r.name),
    machines_on: resources.map(r => r.name),
    machine_rules: {},
    rate_card: [],
    tiers: [],
    default_tier: 'internal',
    after_hours: { start: 18, end: 9, weekends: true },
    price_notes: notes || [],
    alert_over: ''
  };
  const profile = baseProfile ? { ...fallback, ...structuredClone(baseProfile) } : fallback;
  if (rateRows && rateRows.length) {
    const parsed = R.parseRates(rateRows);
    if (notes && notes.length) {
      const noteParsed = R.parseRates(notes.join('\n'));
      const merged = R.merge([parsed, noteParsed]);
      H.applyRateCard(profile, merged);
    } else if (parsed.items.length) {
      H.applyRateCard(profile, parsed);
    }
  }
  return profile;
}

function loadBaselineBundle() {
  const models = require('./model/models.json');
  const evaluation = require('./model/evaluation.json');
  return { models, evaluation };
}

async function createRuntime({ directory, onEvent = () => {} } = {}) {
  const sim = await startSimulator();
  const runs = new Map();
  let active = null;
  let watcher = null;
  let syncTimer = null;
  let lastModelMtime = 0;
  let ollamaStatus = { available: false, models: [], checkedAt: null };

  async function refreshOllama() {
    const res = await listOllamaModels();
    ollamaStatus = {
      available: !!res.available,
      models: Array.isArray(res.models) ? res.models : [],
      checkedAt: new Date().toISOString()
    };
    return structuredClone(ollamaStatus);
  }
  void refreshOllama();

  let { models, evaluation } = loadBaselineBundle();
  function loadTrainedFromDir() {
    if (!directory) return false;
    const trainedPath = path.join(directory, 'trained-models.json');
    if (!fs.existsSync(trainedPath)) return false;
    try {
      const st = fs.statSync(trainedPath);
      if (st.mtimeMs <= lastModelMtime) return false;
      const savedBundle = JSON.parse(fs.readFileSync(trainedPath, 'utf8'));
      if (savedBundle?.models?.column_mapper && savedBundle?.evaluation?.models) {
        models = savedBundle.models;
        evaluation = savedBundle.evaluation;
        lastModelMtime = st.mtimeMs;
        return true;
      }
    } catch {}
    return false;
  }

  function syncFromDisk(isBoot = false) {
    if (!directory) return false;
    let changed = loadTrainedFromDir();
    let files = [];
    try {
      files = fs.readdirSync(directory).filter(n => /^[a-f0-9-]{36}\.json$/.test(n)).slice(-30);
    } catch {
      return changed;
    }
    for (const name of files) {
      const id = name.slice(0, -5);
      if (active?.id === id) continue;
      try {
        const r = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
        if (isBoot && r.status === 'running') {
          r.status = 'interrupted';
          r.error = 'Parity closed before this run finished. Start a new run.';
        }
        const prev = runs.get(r.id);
        if (!prev || prev.status !== r.status || prev.finished !== r.finished || (prev.events?.length || 0) !== (r.events?.length || 0)) {
          runs.set(r.id, r);
          changed = true;
        }
      } catch {}
    }
    return changed;
  }

  if (directory) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    syncFromDisk(true);
    try {
      watcher = fs.watch(directory, (_, filename) => {
        if (!filename || (!/^[a-f0-9-]{36}\.json$/.test(String(filename)) && filename !== 'trained-models.json')) return;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
          if (syncFromDisk(false)) onEvent({ type: 'external-sync' });
        }, 120);
      });
      watcher.on('error', () => {});
    } catch {}
  }

  const save = r => {
    if (!directory) return;
    const p = path.join(directory, r.id + '.json');
    fs.writeFileSync(p + '.tmp', JSON.stringify(r), { mode: 0o600 });
    fs.renameSync(p + '.tmp', p);
  };

  const emit = (r, tool, message, agent = null, extra = {}) => {
    const ev = {
      at: new Date().toISOString(),
      tool,
      ...(agent ? { agentId: agent.id, agentName: agent.name, agentBadge: agent.badge } : {}),
      message,
      ...extra
    };
    r.events.push(ev);
    onEvent({ id: r.id, status: r.status, event: ev });
  };

  const summary = r => ({
    id: r.id,
    system: r.system,
    month: r.month,
    scenario: r.scenario,
    agents: r.agents,
    engine: r.engine || 'builtin',
    llmModel: r.llmModel || '',
    triggeredBy: r.triggeredBy || 'app',
    targetView: r.targetView || 'schedule',
    status: r.status,
    started: r.started,
    finished: r.finished,
    counts: r.counts,
    crewCounts: r.crewCounts,
    error: r.error
  });

  async function getJSON(r, endpoint, signal, agent = null) {
    const u = new URL(endpoint, sim.origin);
    if (u.origin !== sim.origin || !u.pathname.startsWith('/api/' + r.system + '/')) {
      throw Error('Source requested an unexpected endpoint.');
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      signal.throwIfAborted();
      const timeout = AbortSignal.timeout(5000);
      const combined = AbortSignal.any([signal, timeout]);
      const response = await fetch(u, { signal: combined, redirect: 'error' });
      if ([429, 502, 503].includes(response.status) && attempt < 2) {
        emit(r, 'retry', `Source returned ${response.status}; retry ${attempt + 1} of 2.`, agent);
        await new Promise((resolve, reject) => {
          const stop = () => { clearTimeout(timer); reject(signal.reason); };
          const timer = setTimeout(() => { signal.removeEventListener('abort', stop); resolve(); }, 150 * (attempt + 1));
          signal.addEventListener('abort', stop, { once: true });
        });
        continue;
      }
      if (!response.ok) throw Error('Scheduling source returned HTTP ' + response.status + '. Try again.');
      const reader = response.body.getReader();
      let bytes = 0;
      const chunks = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.byteLength;
          if (bytes > 1024 * 1024) throw Error('Scheduling response exceeds 1 MB.');
          chunks.push(Buffer.from(value));
        }
      } finally {
        await reader.cancel();
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  }

  function setCrewState(r, id, status, summaryText = '') {
    const item = r.crew.find(c => c.id === id);
    if (item) {
      item.status = status;
      if (summaryText) item.summary = summaryText;
    }
  }

  async function execute(r, controller, workspaceInput) {
    const signal = controller.signal;
    const enabled = new Set(r.agents);
    const scoutAgent = getAgent('scout');
    const schedulerAgent = getAgent('scheduler');
    const telemetryAgent = getAgent('telemetry');
    const matcherAgent = getAgent('matcher');
    const pricerAgent = getAgent('pricer');
    const auditorAgent = getAgent('auditor');

    try {
      const sysLabel = r.system === 'fbs' ? 'FBS' : r.system === 'ilab' ? 'iLab' : 'Workspace';
      emit(r, 'plan', `Crew assembled (${r.agents.length}/6 active) for ${sysLabel} · ${r.month} (${r.scenario}).`);

      let manifest = r.system === 'workspace'
        ? { system: 'workspace', mode: 'workspace', readOnly: true }
        : {
          system: r.system,
          mode: 'synthetic',
          readOnly: true,
          resources: `/api/${r.system}/resources`,
          reservations: `/api/${r.system}/reservations`,
          usage: `/api/${r.system}/usage`,
          power: `/api/${r.system}/power`,
          prices: `/api/${r.system}/prices`
        };
      let resources = [];
      let sourceClassifications = [];
      let sourceSha = '';

      // 1. Sherlock Ohms (scout)
      if (enabled.has('scout')) {
        setCrewState(r, 'scout', 'running', 'Probing sources...');
        if (r.system === 'workspace') {
          const ws = workspaceInput || {};
          const candidates = [];
          if (ws.reservations?.table) candidates.push({ name: ws.reservations.name || 'reservations', text: (ws.reservations.table.head || []).join(' ') });
          for (const l of ws.logs || []) if (l.table) candidates.push({ name: l.name || 'usage log', text: (l.table.head || []).join(' ') });
          if (ws.power?.table) candidates.push({ name: ws.power.name || 'smart-plug telemetry', text: (ws.power.table.head || []).join(' ') });
          if (ws.prices?.rows) candidates.push({ name: ws.prices.name || 'price sheet', text: ws.prices.rows.slice(0, 6).flat().join(' ') });
          sourceClassifications = candidates.map(c => {
            const p = predictText(models.source_classifier, c.text);
            return { name: c.name, kind: p.label || 'unknown', confidence: p.confidence };
          });
          const rawRes = ws.reservations?.table ? S.readReservations(ws.reservations.table) : null;
          resources = (rawRes ? S.resources(rawRes.items) : (ws.profile?.machines_on || [])).map((name, i) => ({ id: 'ws-' + (i + 1), name }));
          sourceSha = crypto.createHash('sha256').update(JSON.stringify(ws)).digest('hex');
          emit(r, 'discover_source', `${scoutAgent.name} classified ${sourceClassifications.length} local sources and found ${resources.length} instruments.`, scoutAgent);
        } else {
          manifest = await getJSON(r, `/api/${r.system}/manifest`, signal, scoutAgent);
          if (manifest.mode !== 'synthetic' || !manifest.readOnly) throw Error('Unexpected source capabilities.');
          emit(r, 'discover_source', `${scoutAgent.name}: Practice source verified (read-only). Endpoints mapped.`, scoutAgent);
          const resPayload = await getJSON(r, manifest.resources, signal, scoutAgent);
          resources = resPayload.resources;
          if (!Array.isArray(resources) || resources.length > 100) throw Error('Unexpected equipment list.');
          sourceClassifications = [
            { name: `${r.system}-reservations`, ...predictText(models.source_classifier, 'Reservation ID Resource Start End Service User Status') },
            { name: `${r.system}-workstation-log`, ...predictText(models.source_classifier, 'Workstation Username Logon Time Logoff Time') },
            { name: `${r.system}-plug-telemetry`, ...predictText(models.source_classifier, 'Smart plug Mean Watts Peak Watts Duty Cycle') },
            { name: `${r.system}-rate-sheet`, ...predictText(models.source_classifier, 'Core Facility Rates Internal External Commercial Hourly') }
          ].map(x => ({ name: x.name, kind: x.label, confidence: x.confidence }));
          emit(r, 'list_resources', `${scoutAgent.name} cataloged ${resources.length} instruments and classified 4 source streams.`, scoutAgent);
        }
        setCrewState(r, 'scout', 'done', `${resources.length} instruments · ${sourceClassifications.length} sources`);
      } else {
        setCrewState(r, 'scout', 'skipped', 'Disabled (fallback catalog)');
        if (r.system !== 'workspace') {
          const resPayload = await getJSON(r, manifest.resources, signal);
          resources = resPayload.resources || [];
        }
      }

      // 2. Sir Slots-a-Lot (scheduler)
      let normalized = { table: { head: HEAD, rows: [] }, issues: [], duplicates: 0, cancelled: 0, mapping: [] };
      let pagesRead = 0;

      if (enabled.has('scheduler')) {
        setCrewState(r, 'scheduler', 'running', 'Pulling bookings...');
        if (r.system === 'workspace') {
          const wsNorm = normalizeWorkspaceReservations(workspaceInput?.reservations?.table, resources);
          normalized = { table: wsNorm.table, issues: wsNorm.issues, duplicates: wsNorm.duplicates, cancelled: wsNorm.cancelled, mapping: wsNorm.mapping };
          if (!resources.length) resources = wsNorm.resources;
          pagesRead = 1;
          emit(r, 'map_columns', `${schedulerAgent.name} mapped workspace columns and normalized ${normalized.table.rows.length} bookings.`, schedulerAgent);
          emit(r, 'validate', `${normalized.table.rows.length} unique reservations; ${normalized.duplicates} duplicate removed; ${normalized.issues.length} rejected rows.`, schedulerAgent);
        } else {
          const pages = [], visited = new Set();
          let p = 1;
          while (p !== null) {
            signal.throwIfAborted();
            if (!Number.isInteger(p) || p < 1 || visited.has(p) || visited.size >= 10) {
              throw Error('Pagination loop or report page limit reached. No data imported.');
            }
            visited.add(p);
            const payload = await getJSON(r, `${manifest.reservations}?month=${r.month}&page=${p}&scenario=${r.scenario}&run=${r.id}`, signal, schedulerAgent);
            const report = r.system === 'fbs' ? payload : payload.ilab_response?.reservation_report;
            if (!report || !Array.isArray(report.headers) || !Array.isArray(report.rows) || report.rows.length > 1000) {
              throw Error('Scheduling report has an unsupported shape.');
            }
            pages.push(report);
            emit(r, 'pull_reservations', `${schedulerAgent.name} read page ${p}: ${report.rows.length} source rows.`, schedulerAgent);
            p = report.nextPage;
          }
          if (pages.some(page => !Number.isInteger(page.total) || page.total !== pages[0].total) || pages.reduce((n, page) => n + page.rows.length, 0) !== pages[0].total) {
            throw Error('Report is incomplete. Source row count does not match downloaded pages.');
          }
          pagesRead = pages.length;
          sourceSha = crypto.createHash('sha256').update(JSON.stringify(pages)).digest('hex');
          normalized = normalize(pages, resources, r.month, models.column_mapper);
          emit(r, 'map_columns', `${schedulerAgent.name} mapped ${normalized.mapping.filter(m => m.confidence >= 0.45).length} columns with trained ML mapper.`, schedulerAgent);
          emit(r, 'validate', `${normalized.table.rows.length} unique reservations; ${normalized.duplicates} duplicate removed; ${normalized.issues.length} rejected rows.`, schedulerAgent);
        }
        setCrewState(r, 'scheduler', 'done', `${normalized.table.rows.length} bookings (${pagesRead}p)`);
      } else {
        setCrewState(r, 'scheduler', 'skipped', 'Disabled');
        if (r.system === 'workspace' && workspaceInput?.reservations?.table) {
          const wsNorm = normalizeWorkspaceReservations(workspaceInput.reservations.table, resources);
          normalized = { table: wsNorm.table, issues: wsNorm.issues, duplicates: wsNorm.duplicates, cancelled: wsNorm.cancelled, mapping: wsNorm.mapping };
          if (!resources.length) resources = wsNorm.resources;
        }
        if (!sourceSha) sourceSha = crypto.createHash('sha256').update(`${r.system}:${r.month}:${r.scenario}:partial`).digest('hex');
      }

      // 3. Count Wattula (telemetry)
      let usage = { head: ['Workstation', 'Username', 'Logon Time', 'Logoff Time'], rows: [] };
      let powerRaw = { head: ['Instrument', 'Operator', 'Start', 'End', 'Mean Watts', 'Peak Watts', 'Std Watts', 'Duty Cycle', 'PC Active Ratio'], rows: [] };
      let powerClassified = [];

      if (enabled.has('telemetry')) {
        setCrewState(r, 'telemetry', 'running', 'Reading PC logs & plugs...');
        if (r.system === 'workspace') {
          const ws = workspaceInput || {};
          if (Array.isArray(ws.logs) && ws.logs.length) {
            // Convert event/interval tables via reconcile-engine into canonical usage intervals
            const allRows = [];
            for (const l of ws.logs) {
              const det = H.detectColumns(l.table, 'use');
              const un = E.normalize(l.table, det.map, { events: det.events, format: det.format, source: l.name || 'log', instrument: l.machine || '' });
              for (const rec of un.records) {
                const fmtIso = m => new Date(m * 60000).toISOString().slice(0, 19).replace('T', ' ');
                allRows.push([rec.instrument, rec.user, fmtIso(rec.s), fmtIso(rec.e)]);
              }
            }
            usage = { head: ['Workstation', 'Username', 'Logon Time', 'Logoff Time'], rows: allRows };
          }
          if (ws.power?.table) {
            powerRaw = ws.power.table;
            powerClassified = classifyPowerIntervals(models, powerRaw);
          }
        } else {
          const fetchedUsage = await getJSON(r, `${manifest.usage}?month=${r.month}&scenario=${r.scenario}`, signal, telemetryAgent);
          if (!fetchedUsage || JSON.stringify(fetchedUsage.head) !== JSON.stringify(['Workstation', 'Username', 'Logon Time', 'Logoff Time']) || !Array.isArray(fetchedUsage.rows) ||
            fetchedUsage.rows.some(row => !Array.isArray(row) || row.length !== 4 || !Number.isFinite(stamp(row[2])) || !Number.isFinite(stamp(row[3])) || stamp(row[3]) <= stamp(row[2]))) {
            throw Error('Usage report did not pass validation.');
          }
          usage = fetchedUsage;
          if (manifest.power) {
            powerRaw = await getJSON(r, `${manifest.power}?month=${r.month}&scenario=${r.scenario}`, signal, telemetryAgent);
            powerClassified = classifyPowerIntervals(models, powerRaw);
          }
        }
        const activeCount = powerClassified.filter(p => p.state === 'active_acquisition').length;
        const idleCount = powerClassified.filter(p => p.state === 'standby_idle').length;
        const offCount = powerClassified.filter(p => p.state === 'off').length;
        emit(
          r,
          'collect_telemetry',
          `${telemetryAgent.name} collected ${usage.rows.length} PC logins and classified ${powerClassified.length} smart-plug intervals (${activeCount} active, ${idleCount} standby/copy, ${offCount} off).`,
          telemetryAgent
        );
        setCrewState(r, 'telemetry', 'done', `${usage.rows.length} logins · ${activeCount} active plug runs`);
      } else {
        setCrewState(r, 'telemetry', 'skipped', 'Disabled');
      }

      // Build pricing card early if needed for reconciliation or later in pricer
      let rateRows = null;
      let priceNotes = [];
      if (r.system === 'workspace') {
        rateRows = workspaceInput?.prices?.rows || null;
        priceNotes = workspaceInput?.profile?.price_notes || [];
      } else if (enabled.has('pricer') && manifest.prices) {
        const fetchedPrices = await getJSON(r, manifest.prices, signal, pricerAgent);
        rateRows = [fetchedPrices.head, ...fetchedPrices.rows];
        priceNotes = fetchedPrices.notes || [];
      }

      // 4. Dr. Venn (matcher)
      let matchedSessions = [];
      let pricingProfile = buildPricingProfile(workspaceInput?.profile, rateRows, priceNotes, resources);

      // Prepare active usage table for reconciliation (prefer active smart-plug acquisition intervals when available)
      const activePlugRows = powerClassified
        .filter(p => p.state === 'active_acquisition' && p.operator)
        .map(p => [p.instrument, p.operator, p.start, p.end]);
      const effectiveUsageTable = activePlugRows.length
        ? { head: ['Workstation', 'Username', 'Logon Time', 'Logoff Time'], rows: activePlugRows }
        : usage;

      if (enabled.has('matcher')) {
        setCrewState(r, 'matcher', 'running', 'Matching bookings & runs...');
        const scheduleObj = S.readReservations(normalized.table);
        const bookInput = {
          name: `${r.system}-bookings`,
          table: scheduleObj ? scheduleObj.table : normalized.table,
          detect: H.detectColumns(scheduleObj ? scheduleObj.table : normalized.table, 'book'),
          canonical: true,
          reservationIssues: []
        };
        const pcLogInput = [{ name: 'Workstation logins', table: usage, detect: H.detectColumns(usage, 'use') }];
        const activeLogInput = [{ name: 'Active sensor/PC usage', table: effectiveUsageTable, detect: H.detectColumns(effectiveUsageTable, 'use') }];

        const reconciled = M.check(pricingProfile, bookInput, activeLogInput);
        const pcOnly = M.check(pricingProfile, bookInput, pcLogInput);
        const pcMap = new Map(pcOnly.rows.map(row => [row.id, row]));

        // Map standby/idle plug intervals per instrument|user|day
        const idleMap = new Map();
        for (const p of powerClassified) {
          if (p.state === 'standby_idle' && p.operator) {
            const k = `${key(p.instrument)}|${key(p.operator)}|${p.day}`;
            idleMap.set(k, (idleMap.get(k) || 0) + p.durationMin);
          }
        }

        // Score booking <-> usage pairs with session_matcher tabular ML model
        const bookNorm = E.normalize(bookInput.table, bookInput.detect.map, { events: false, format: bookInput.detect.format, source: bookInput.name }).records;
        const useNorm = E.normalize(effectiveUsageTable, H.detectColumns(effectiveUsageTable, 'use').map, { events: false, format: 'iso', source: 'usage' }).records;

        matchedSessions = reconciled.rows.map(row => {
          const pcRow = pcMap.get(row.id);
          const pcUsedMin = pcRow ? pcRow.used : row.used;
          const plugActiveMin = activePlugRows.length ? row.used : row.used;
          const idleTailMin = idleMap.get(row.id) ?? Math.max(0, pcUsedMin - plugActiveMin);

          const bRec = bookNorm.find(b => `${key(b.instrument)}|${key(b.user)}|${Math.floor(b.s / 1440)}` === row.id);
          const uRec = useNorm.find(u => `${key(u.instrument)}|${key(u.user)}|${Math.floor(u.s / 1440)}` === row.id);

          let matchScore = { label: 'unmatched', confidence: 0.99 };
          if (bRec && uRec) {
            const inter = Math.max(0, Math.min(bRec.e, uRec.e) - Math.max(bRec.s, uRec.s));
            const union = Math.max(1, Math.max(bRec.e, uRec.e) - Math.min(bRec.s, uRec.s));
            const iou = inter / union;
            const sDiff = Math.min(1, Math.abs(bRec.s - uRec.s) / 180);
            const eDiff = Math.min(1, Math.abs(bRec.e - uRec.e) / 180);
            const exactUser = key(bRec.user) === key(uRec.user) ? 1 : 0;
            const dice = trigramDice(bRec.user, uRec.user);
            matchScore = predictTabular(models.session_matcher, [1, iou, sDiff, eDiff, exactUser, dice, 1]);
          }

          return {
            id: row.id,
            day: row.day,
            date: S.ymd(row.day),
            instrument: row.instrument,
            user: row.user,
            lab: row.lab,
            account: row.account,
            service: row.mode || 'self',
            tier: row.tier || 'internal',
            bookedMin: row.booked,
            pcUsedMin,
            plugActiveMin,
            idleTailMin,
            billedMin: row.billed,
            afterMinutes: row.afterMinutes || 0,
            rate: row.rate,
            afterRate: row.afterRate,
            amount: row.amount,
            hasBooking: row.book.length > 0,
            hasUsage: row.use.length > 0,
            matchLabel: matchScore.label,
            matchConfidence: matchScore.confidence,
            deterministicFlags: row.flags
          };
        });

        const paired = matchedSessions.filter(s => s.hasBooking && s.hasUsage).length;
        const walkups = matchedSessions.filter(s => !s.hasBooking && s.hasUsage).length;
        const noshows = matchedSessions.filter(s => s.hasBooking && !s.hasUsage).length;
        emit(
          r,
          'match_sessions',
          `${matcherAgent.name} paired ${paired} sessions, isolated ${walkups} unbooked walk-up(s), and caught ${noshows} no-show(s).`,
          matcherAgent
        );
        setCrewState(r, 'matcher', 'done', `${paired} paired · ${walkups} walk-up · ${noshows} no-show`);
      } else if (enabled.has('pricer') && normalized.table.rows.length) {
        // Booked-time billing preset without telemetry/matcher: price directly from booked slots
        const scheduleObj = S.readReservations(normalized.table);
        if (scheduleObj) {
          matchedSessions = scheduleObj.items
            .filter(it => !it.cancelled)
            .map(it => {
              const bookedMin = it.end - it.start;
              const p = H.policyFor({ ...pricingProfile, basis: 'booked' }, it.resource);
              const mode = /assist/i.test(it.service) ? 'assisted' : /train/i.test(it.service) ? 'training' : 'self';
              const tier = H.tierKey(it.tier, (pricingProfile.tiers || []).map(t => t.key)) || p.defaultTier;
              const rate = p.rateFor ? p.rateFor(mode, tier, false) : Number(p.rates[mode]);
              const billedMin = Math.ceil(bookedMin / p.round - 1e-9) * p.round;
              const amount = Math.round((billedMin / 60 * (Number.isFinite(rate) ? rate : 0)) * 100) / 100;
              return {
                id: `${key(it.resource)}|${key(it.user)}|${it.day}`,
                day: it.day,
                date: S.ymd(it.day),
                instrument: it.resource,
                user: it.user,
                lab: it.lab,
                account: it.account,
                service: mode,
                tier,
                bookedMin,
                pcUsedMin: 0,
                plugActiveMin: 0,
                idleTailMin: 0,
                billedMin,
                afterMinutes: 0,
                rate: Number.isFinite(rate) ? rate : 0,
                afterRate: Number.isFinite(rate) ? rate : 0,
                amount,
                hasBooking: true,
                hasUsage: false,
                matchLabel: 'booked_only',
                matchConfidence: 1,
                deterministicFlags: []
              };
            });
        }
        setCrewState(r, 'matcher', 'skipped', 'Disabled (booked-only)');
      } else {
        setCrewState(r, 'matcher', 'skipped', 'Disabled');
      }

      // 5. Baron Von Markup (pricer)
      let policyEvidence = [];
      let pricingSummary = null;
      if (enabled.has('pricer')) {
        setCrewState(r, 'pricer', 'running', 'Applying rate card...');
        const clauseTexts = [
          ...(pricingProfile.rate_card || []).slice(0, 12).map(it => `${it.machine} ${it.mode} ${it.unit}`),
          ...(pricingProfile.price_notes || [])
        ].filter(Boolean);
        policyEvidence = clauseTexts.map(txt => ({
          text: txt,
          ...predictText(models.policy_pricer, txt)
        }));
        const totalAmount = Math.round(matchedSessions.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) * 100) / 100;
        const totalHours = Math.round(matchedSessions.reduce((sum, s) => sum + (Number(s.billedMin) || 0) / 60, 0) * 100) / 100;
        pricingSummary = {
          priced: true,
          rateItems: (pricingProfile.rate_card || []).length,
          tiers: (pricingProfile.tiers || []).map(t => t.label),
          roundMinutes: pricingProfile.round_minutes,
          basis: pricingProfile.basis,
          totalAmount,
          totalHours,
          policyEvidence
        };
        emit(
          r,
          'price_sessions',
          `${pricerAgent.name} classified ${policyEvidence.length} rate/policy clauses and priced ${matchedSessions.length} sessions ($${totalAmount.toFixed(2)} draft total).`,
          pricerAgent
        );
        setCrewState(r, 'pricer', 'done', `$${totalAmount.toFixed(2)} across ${matchedSessions.length} sessions`);
      } else {
        matchedSessions = matchedSessions.map(s => ({ ...s, amount: null, rate: null }));
        setCrewState(r, 'pricer', 'skipped', 'Disabled');
      }

      // 6. Captain Nitpick (auditor)
      let discrepancies = [];
      if (enabled.has('auditor')) {
        setCrewState(r, 'auditor', 'running', 'Auditing discrepancies...');
        if (!matchedSessions.length) {
          emit(r, 'audit_sessions', `${auditorAgent.name}: 0 matched sessions to audit (enable Sir Slots-a-Lot + Dr. Venn to inspect sessions).`, auditorAgent);
          setCrewState(r, 'auditor', 'done', '0 sessions to audit');
        } else {
          // Compute per-instrument robust z-score matching H.outliers
          const byInst = new Map();
          for (const s of matchedSessions) {
            if (!byInst.has(s.instrument)) byInst.set(s.instrument, []);
            byInst.get(s.instrument).push(s.billedMin || s.plugActiveMin || s.bookedMin || 0);
          }
          const statsByInst = new Map();
          for (const [inst, vals] of byInst.entries()) {
            const sorted = vals.slice().sort((a, b) => a - b);
            const med = sorted.length % 2 ? sorted[Math.floor(sorted.length / 2)] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
            const devs = sorted.map(v => Math.abs(v - med)).sort((a, b) => a - b);
            const mad = devs.length % 2 ? devs[Math.floor(devs.length / 2)] : (devs[devs.length / 2 - 1] + devs[devs.length / 2]) / 2;
            statsByInst.set(inst, { med, mad, count: vals.length });
          }

          discrepancies = matchedSessions.map(s => {
            const st = statsByInst.get(s.instrument) || { med: 120, mad: 0, count: 1 };
            const dur = s.billedMin || s.plugActiveMin || s.bookedMin || 0;
            const robustZ = (st.count >= 8 && st.mad > 0) ? (0.6745 * (dur - st.med) / st.mad) : 0;
            const overrunMin = Math.max(0, (s.plugActiveMin || s.pcUsedMin) - s.bookedMin);
            const underrunRatio = s.bookedMin > 0 ? (s.plugActiveMin || s.pcUsedMin) / s.bookedMin : 0;

            const vec = [
              s.bookedMin,
              s.pcUsedMin,
              s.plugActiveMin,
              overrunMin,
              underrunRatio,
              s.hasBooking ? 1 : 0,
              s.hasUsage ? 1 : 0,
              s.idleTailMin,
              robustZ
            ];
            const pred = predictTabular(models.anomaly_auditor, vec);
            let label = pred.label;

            // Deterministic guard overrides so physical constraints are never violated
            if (s.hasBooking && !s.hasUsage && enabled.has('telemetry')) label = 'no_show';
            else if (!s.hasBooking && s.hasUsage) label = 'walk_up_unbooked';
            else if (robustZ >= 3.5 && dur >= 2 * st.med) label = 'duration_outlier';

            let summaryText = 'Booked and active runtime match cleanly.';
            let severity = 'ok';
            if (label === 'overrun') {
              summaryText = `${s.user} booked ${(s.bookedMin / 60).toFixed(1)}h on ${s.instrument} and ran ${(s.plugActiveMin / 60).toFixed(1)}h (+${Math.round(overrunMin)} min overrun).`;
              severity = 'warn';
            } else if (label === 'idle_login_mismatch') {
              summaryText = `${s.user} ran ${s.instrument} for ${Math.round(s.plugActiveMin)} min, then left PC logged in ${Math.round(s.idleTailMin)} min at standby (${Math.round(overrunMin)} min past slot).`;
              severity = 'warn';
            } else if (label === 'walk_up_unbooked') {
              summaryText = `${s.user} used ${s.instrument} for ${Math.round(s.plugActiveMin || s.pcUsedMin)} min with no reservation.`;
              severity = 'bad';
            } else if (label === 'no_show') {
              summaryText = `${s.user} booked ${Math.round(s.bookedMin)} min on ${s.instrument} with 0 min PC or smart-plug activity.`;
              severity = 'warn';
            } else if (label === 'short_underrun') {
              summaryText = `${s.user} booked ${(s.bookedMin / 60).toFixed(1)}h on ${s.instrument} but only ran ${Math.round(s.plugActiveMin || s.pcUsedMin)} min.`;
              severity = 'warn';
            } else if (label === 'duration_outlier') {
              summaryText = `Unusually long ${(dur / 60).toFixed(1)}h session on ${s.instrument} (${robustZ.toFixed(1)}σ above median).`;
              severity = 'bad';
            }

            return {
              id: s.id,
              date: s.date,
              user: s.user,
              instrument: s.instrument,
              lab: s.lab,
              account: s.account,
              bookedMin: s.bookedMin,
              pcUsedMin: s.pcUsedMin,
              plugActiveMin: s.plugActiveMin,
              idleTailMin: s.idleTailMin,
              billedMin: s.billedMin,
              amount: s.amount,
              label,
              confidence: pred.confidence,
              severity,
              summary: summaryText,
              deterministicFlags: s.deterministicFlags
            };
          });

          const flagged = discrepancies.filter(d => d.label !== 'clean_match');
          emit(
            r,
            'audit_sessions',
            `${auditorAgent.name} audited ${discrepancies.length} sessions and flagged ${flagged.length} discrepancy item(s) for manager approval.`,
            auditorAgent
          );
          setCrewState(r, 'auditor', 'done', `${flagged.length} flagged / ${discrepancies.length} audited`);
        }
      } else {
        setCrewState(r, 'auditor', 'skipped', 'Disabled');
      }

      signal.throwIfAborted();

      const flaggedCount = discrepancies.filter(d => d.label !== 'clean_match').length;
      let llmBriefing = null;
      if (r.engine === 'local_llm') {
        const modelName = r.llmModel || ollamaStatus.models[0]?.name || 'llama3.2:1b';
        const runSummary = {
          system: r.system,
          month: r.month,
          reservations: normalized.table.rows.length,
          cancelled: normalized.cancelled,
          duplicates: normalized.duplicates,
          rejected: normalized.issues.length,
          matchedSessions: matchedSessions.length,
          flaggedDiscrepancies: flaggedCount,
          draftTotalUSD: pricingSummary ? pricingSummary.totalAmount : null
        };
        const generated = await generateCrewBriefing({ modelName, runSummary, discrepancies });
        signal.throwIfAborted();
        if (generated) {
          llmBriefing = { model: modelName, ...generated };
          emit(r, 'llm_briefing', `${modelName}: ${generated.headline} — ${generated.topPriority}`, auditorAgent);
        } else {
          emit(r, 'llm_briefing', `Local Ollama (${modelName}) unavailable or timed out; used built-in trained ML models.`, auditorAgent);
        }
      }

      r.result = {
        ...normalized,
        usage,
        power: powerRaw,
        powerClassified,
        resources,
        sourceClassifications,
        matchedSessions,
        discrepancies,
        rateCard: pricingProfile.rate_card || [],
        tiers: pricingProfile.tiers || [],
        afterHours: pricingProfile.after_hours || null,
        pricingProfile,
        pricingSummary,
        llmBriefing,
        crew: r.crew,
        source: {
          system: r.system,
          mode: r.system === 'workspace' ? 'workspace' : 'synthetic',
          month: r.month,
          scenario: r.scenario,
          engine: r.engine || 'builtin',
          triggeredBy: r.triggeredBy || 'app',
          pages: pagesRead,
          sha256: sourceSha
        },
        csv: csv(normalized.table)
      };

      // Preserve exact 5-key shape for existing unit tests!
      r.counts = {
        reservations: normalized.table.rows.length,
        cancelled: normalized.cancelled,
        duplicates: normalized.duplicates,
        rejected: normalized.issues.length,
        pages: pagesRead
      };

      r.crewCounts = {
        activeAgents: r.agents.length,
        totalAgents: AGENTS.length,
        powerIntervals: powerClassified.length,
        matchedSessions: matchedSessions.length,
        flaggedDiscrepancies: flaggedCount,
        draftTotal: pricingSummary ? pricingSummary.totalAmount : null
      };

      r.status = normalized.issues.length ? 'needs_review' : 'ready';
      emit(
        r,
        'stage',
        normalized.issues.length
          ? 'Review rejected rows before importing.'
          : `Crew staged ${normalized.table.rows.length} bookings${flaggedCount ? ` and ${flaggedCount} discrepancy flags` : ''}. Choose “Use in Parity” to import.`
      );
    } catch (e) {
      r.status = signal.aborted ? 'cancelled' : 'failed';
      r.error = signal.aborted ? 'Run cancelled. Current schedule was kept.' : String(e.message || 'Source pull failed.').slice(0, 300);
      for (const c of r.crew) if (c.status === 'running') c.status = r.status;
      emit(r, r.status, r.error);
    } finally {
      r.finished = new Date().toISOString();
      save(r);
      if (active?.id === r.id) active = null;
      onEvent({ id: r.id, status: r.status });
    }
  }

  function trainModels(options = {}) {
    if (active) throw Error('Wait for the running crew to finish before training models.');
    const bundle = trainAllModels({
      customSamples: options?.customSamples || {},
      outDir: directory || null
    });
    models = bundle.models;
    evaluation = bundle.evaluation;
    return {
      trainedAt: bundle.trainedAt,
      durationMs: evaluation.durationMs,
      totalTrainingSamples: evaluation.totalTrainingSamples,
      totalHeldoutSamples: evaluation.totalHeldoutSamples,
      averageAccuracy: evaluation.averageAccuracy,
      averageMacroF1: evaluation.averageMacroF1,
      models: evaluation.models
    };
  }

  function start(input) {
    if (active) throw Error('An agent is already running. Wait or cancel it.');
    if (!input || !['fbs', 'ilab', 'workspace'].includes(input.system)) {
      throw Error('Choose FBS, iLab or workspace.');
    }
    validMonth(input.month);
    const scenario = input.scenario || 'normal';
    if (!['normal', 'retry', 'invalid', 'pitch'].includes(scenario)) {
      throw Error('Unknown practice scenario.');
    }
    const engine = input.engine || 'builtin';
    if (!['builtin', 'local_llm'].includes(engine)) {
      throw Error('Choose builtin or local_llm engine.');
    }
    const llmModel = input.llmModel ? String(input.llmModel).trim().slice(0, 120) : '';
    const triggeredBy = input.triggeredBy ? String(input.triggeredBy).trim().slice(0, 40) : 'app';
    const targetView = input.targetView === 'results' ? 'results' : 'schedule';
    const selectedAgents = normalizeAgentSelection(input.agents);
    const crew = AGENTS.map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      badge: a.badge,
      modelKey: a.modelKey,
      enabled: selectedAgents.includes(a.id),
      status: selectedAgents.includes(a.id) ? 'queued' : 'skipped',
      summary: selectedAgents.includes(a.id) ? 'Waiting in queue' : 'Disabled'
    }));
    const r = {
      id: crypto.randomUUID(),
      system: input.system,
      month: input.month,
      scenario,
      agents: selectedAgents,
      engine,
      llmModel,
      triggeredBy,
      targetView,
      crew,
      status: 'running',
      started: new Date().toISOString(),
      events: []
    };
    runs.set(r.id, r);
    while (runs.size > 30) {
      const oldest = [...runs.values()].sort((a, b) => a.started.localeCompare(b.started))[0];
      runs.delete(oldest.id);
      if (directory && /^[a-f0-9-]{36}$/.test(oldest.id)) {
        fs.rmSync(path.join(directory, oldest.id + '.json'), { force: true });
      }
    }
    active = { id: r.id, controller: new AbortController() };
    save(r);
    void execute(r, active.controller, input.workspace || null);
    return summary(r);
  }

  return {
    info: () => {
      syncFromDisk(false);
      return {
        mode: 'synthetic',
        systems: ['fbs', 'ilab', 'workspace'],
        roster: AGENTS,
        presets: PRESETS,
        ollama: ollamaStatus,
        model: {
          type: models.column_mapper.type,
          trainingSamples: evaluation.trainingSamples,
          accuracy: evaluation.accuracy,
          heldoutSamples: evaluation.heldoutSamples,
          scope: evaluation.scope
        },
        models: evaluation.models,
        trainedAt: evaluation.trainedAt,
        averageAccuracy: evaluation.averageAccuracy,
        averageMacroF1: evaluation.averageMacroF1,
        totalTrainingSamples: evaluation.totalTrainingSamples,
        totalHeldoutSamples: evaluation.totalHeldoutSamples,
        runs: [...runs.values()].sort((a, b) => b.started.localeCompare(a.started)).slice(0, 20).map(summary)
      };
    },
    start,
    async ask(input) {
      if (!input || typeof input.prompt !== 'string' || !input.prompt.trim()) {
        throw Error('Tell the crew what you want Parity to do.');
      }
      const engine = input.engine === 'local_llm' ? 'local_llm' : 'builtin';
      const llmModel = input.llmModel ? String(input.llmModel).trim().slice(0, 120) : (ollamaStatus.models[0]?.name || '');
      const plan = await planCommand(input.prompt, models, {
        engine,
        llmModel,
        defaultSystem: input.system || 'fbs',
        defaultMonth: input.month || '2026-10',
        defaultScenario: input.scenario || 'pitch',
        availableSystems: ['fbs', 'ilab', 'workspace']
      });
      if (plan.action === 'train') {
        const trainResult = trainModels(input.trainOptions || {});
        return { kind: 'train', plan, trainResult };
      }
      const run = start({
        system: plan.system,
        month: plan.month,
        scenario: plan.scenario,
        agents: plan.agents,
        engine,
        llmModel,
        targetView: plan.targetView,
        triggeredBy: input.triggeredBy || 'autopilot',
        workspace: input.workspace || null
      });
      return { kind: 'run', plan, run };
    },
    llmStatus: refreshOllama,
    get(id) {
      syncFromDisk(false);
      const r = runs.get(id);
      if (!r) throw Error('Run not found.');
      return structuredClone(r);
    },
    cancel(id) {
      if (active?.id === id) active.controller.abort();
      return true;
    },
    train(options) {
      return trainModels(options);
    },
    practiceURL(system) {
      if (!['fbs', 'ilab'].includes(system)) throw Error('Choose FBS or iLab.');
      return sim.origin + '/' + system;
    },
    async close() {
      clearTimeout(syncTimer);
      if (watcher) { try { watcher.close(); } catch {} watcher = null; }
      if (active) active.controller.abort();
      await sim.close();
    }
  };
}

module.exports = { createRuntime, normalize, csv };
