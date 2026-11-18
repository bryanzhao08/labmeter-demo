'use strict';

const { AGENT_IDS, AGENTS } = require('./roster.cjs');

const OLLAMA_ORIGIN = 'http://127.0.0.1:11434';
const VALID_SYSTEMS = Object.freeze(['fbs', 'ilab', 'workspace']);
const VALID_SCENARIOS = Object.freeze(['normal', 'retry', 'invalid', 'pitch']);
const VALID_VIEWS = Object.freeze(['schedule', 'results']);
const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

function cleanText(value, maxLen) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function parseJsonObject(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const candidates = [trimmed];
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) candidates.push(fenced[1].trim());
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

async function listOllamaModels() {
  try {
    const res = await fetch(`${OLLAMA_ORIGIN}/api/tags`, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(1800)
    });
    if (!res.ok) return { available: false, models: [] };

    const data = await res.json();
    const rawModels = Array.isArray(data?.models) ? data.models : [];
    const models = rawModels
      .map(m => {
        const name = cleanText(m?.name || m?.model || '', 120);
        if (!name) return null;
        const sizeNum = Number(m?.size);
        return {
          name,
          size: Number.isFinite(sizeNum) && sizeNum >= 0 ? sizeNum : 0,
          parameterSize: cleanText(m?.details?.parameter_size ?? m?.parameterSize ?? '', 40),
          family: cleanText(m?.details?.family ?? m?.family ?? '', 60)
        };
      })
      .filter(Boolean);

    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  }
}

function compactDiscrepancies(discrepancies) {
  if (!Array.isArray(discrepancies)) return [];
  const prioritized = discrepancies.filter(d => d && d.label !== 'clean_match');
  const source = prioritized.length ? prioritized : discrepancies;
  return source.slice(0, 15).map(d => {
    if (!d || typeof d !== 'object') return d;
    return {
      user: d.user ?? null,
      instrument: d.instrument ?? null,
      date: d.date ?? null,
      label: d.label ?? null,
      severity: d.severity ?? null,
      bookedMin: d.bookedMin ?? null,
      plugActiveMin: d.plugActiveMin ?? null,
      idleTailMin: d.idleTailMin ?? null,
      billedMin: d.billedMin ?? null,
      amount: d.amount ?? null,
      summary: typeof d.summary === 'string' ? d.summary.slice(0, 180) : null
    };
  });
}

function formatRunSummaryLines(runSummary) {
  if (!runSummary || typeof runSummary !== 'object') return 'No run summary metrics provided.';
  const entries = Object.entries(runSummary)
    .filter(([, v]) => v !== undefined && v !== null && typeof v !== 'object')
    .slice(0, 16)
    .map(([k, v]) => `${k}: ${v}`);
  return entries.length ? entries.join(', ') : JSON.stringify(runSummary).slice(0, 800);
}

function formatDiscrepancyLines(discrepancies) {
  const items = compactDiscrepancies(discrepancies);
  if (!items.length) return 'None.';
  return items.map((d, i) => {
    if (!d || typeof d !== 'object') return `${i + 1}. ${String(d)}`;
    const parts = [
      d.user || 'Unknown user',
      d.instrument ? `on ${d.instrument}` : '',
      d.date ? `(${d.date})` : '',
      d.label ? `[${d.label}]` : '',
      d.bookedMin != null ? `booked ${d.bookedMin}m` : '',
      d.plugActiveMin != null ? `active ${d.plugActiveMin}m` : '',
      d.idleTailMin ? `idle ${d.idleTailMin}m` : '',
      d.amount != null ? `$${d.amount}` : ''
    ].filter(Boolean);
    return `${i + 1}. ${parts.join(' ')}${d.summary ? ' — ' + d.summary : ''}`;
  }).join('\n');
}

async function generateCrewBriefing({ modelName, runSummary, discrepancies } = {}) {
  const model = cleanText(modelName, 120);
  if (!model) return null;

  const flagged = Array.isArray(discrepancies)
    ? discrepancies.filter(d => d && d.label !== 'clean_match')
    : [];
  const totalCount = Array.isArray(discrepancies) ? discrepancies.length : 0;

  const summaryText = formatRunSummaryLines(runSummary);
  const discText = formatDiscrepancyLines(discrepancies);

  const prompt = [
    'Summarize this Parity core-facility reconciliation run for a lab manager in plain English.',
    'Rules:',
    '- Use ONLY exact names, instruments, counts, minutes, and dollar amounts listed below.',
    '- Do NOT invent any names, counts, or numbers.',
    '- Write plain prose strings (do NOT put JSON inside string values).',
    '- Output a JSON object with exactly 3 string fields:',
    '  "headline": short title under 100 chars,',
    '  "briefing": 1-2 plain English sentences summarizing counts/totals and flagged users,',
    flagged.length
      ? '  "topPriority": 1 short sentence naming the most urgent flagged user and issue.'
      : '  "topPriority": "No discrepancies flagged for review."',
    '',
    `Run Summary: ${summaryText}`,
    `Total Audited: ${totalCount}, Flagged Count: ${flagged.length}`,
    'Flagged Items:',
    discText
  ].join('\n').slice(0, 5000);

  try {
    const res = await fetch(`${OLLAMA_ORIGIN}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        options: { temperature: 0, num_predict: 220 },
        prompt
      })
    });
    if (!res.ok) return null;

    const data = await res.json();
    const parsed = parseJsonObject(data?.response);
    if (!parsed) return null;

    const headline = cleanText(parsed.headline, 160);
    const briefing = cleanText(parsed.briefing, 600);
    const topPriority = cleanText(parsed.topPriority, 220);

    if (!headline || !briefing || !topPriority) return null;
    if (headline.startsWith('{') || briefing.startsWith('{')) return null;
    return { headline, briefing, topPriority };
  } catch {
    return null;
  }
}

async function planGoalWithLLM({ modelName, prompt, availableSystems } = {}) {
  const model = cleanText(modelName, 120);
  const goal = cleanText(prompt, 800);
  if (!model || !goal) return null;

  let systems = [...VALID_SYSTEMS];
  if (Array.isArray(availableSystems) && availableSystems.length) {
    const allowedSet = new Set(availableSystems.map(s => cleanText(s, 32).toLowerCase()));
    systems = VALID_SYSTEMS.filter(s => allowedSet.has(s));
    if (!systems.length) return null;
  }

  const crewDesc = AGENTS.map(a => `${a.id} = ${a.name} (${a.role})`).join('; ');
  const llmPrompt = [
    'Route this Parity facility request to a strict JSON plan.',
    `Specialists: ${crewDesc}.`,
    'JSON fields:',
    `- "agents": non-empty array from [${AGENT_IDS.join(', ')}].`,
    `- "system": one of [${systems.join(', ')}]. Use "${systems[0]}" unless iLab/FBS/workspace is named.`,
    '- "month": "YYYY-MM" (use "2026-10" unless another month is named).',
    `- "scenario": one of [${VALID_SCENARIOS.join(', ')}]. Default "pitch". Only use "retry" for 429/rate-limit/retry, "invalid" for invalid rows, "normal" for normal.`,
    `- "targetView": one of [${VALID_VIEWS.join(', ')}]. Use "results" ONLY for billing/flags/discrepancies/approval; otherwise "schedule".`,
    'Return ONLY JSON.',
    '',
    `Request: ${goal}`
  ].join('\n');

  try {
    const res = await fetch(`${OLLAMA_ORIGIN}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        model,
        stream: false,
        format: 'json',
        options: { temperature: 0, num_predict: 180 },
        prompt: llmPrompt
      })
    });
    if (!res.ok) return null;

    const data = await res.json();
    const parsed = parseJsonObject(data?.response);
    if (!parsed) return null;

    if (!Array.isArray(parsed.agents)) return null;
    const wanted = new Set(parsed.agents.map(a => cleanText(a, 32).toLowerCase()));
    const agents = AGENT_IDS.filter(id => wanted.has(id));
    if (!agents.length) return null;

    const system = cleanText(parsed.system, 32).toLowerCase();
    if (!systems.includes(system)) return null;

    const month = cleanText(parsed.month, 16);
    if (!MONTH_RE.test(month)) return null;

    const scenario = cleanText(parsed.scenario, 32).toLowerCase();
    if (!VALID_SCENARIOS.includes(scenario)) return null;

    const targetView = cleanText(parsed.targetView, 32).toLowerCase();
    if (!VALID_VIEWS.includes(targetView)) return null;

    return { agents, system, month, scenario, targetView };
  } catch {
    return null;
  }
}

module.exports = {
  listOllamaModels,
  generateCrewBriefing,
  planGoalWithLLM
};
