'use strict';

const { AGENT_IDS, getAgent } = require('./roster.cjs');
const { predictText } = require('./ml.cjs');
const { planGoalWithLLM } = require('./llm.cjs');

const VALID_SYSTEMS = Object.freeze(['fbs', 'ilab', 'workspace']);
const VALID_SCENARIOS = Object.freeze(['normal', 'retry', 'invalid', 'pitch']);
const VALID_VIEWS = Object.freeze(['schedule', 'results']);
const MONTH_RE = /^20\d{2}-(0[1-9]|1[0-2])$/;

const INTENT_SPECS = Object.freeze({
  full_close_pitch: Object.freeze({
    action: 'run',
    agents: Object.freeze([...AGENT_IDS]),
    scenario: 'pitch',
    targetView: 'schedule',
    description: 'Run all 6 Parity specialists end-to-end on the monthly close.'
  }),
  audit_flags: Object.freeze({
    action: 'run',
    agents: Object.freeze([...AGENT_IDS]),
    targetView: 'results',
    description: 'Reconcile sessions and run Captain Nitpick to surface discrepancy flags.'
  }),
  pull_schedule: Object.freeze({
    action: 'run',
    agents: Object.freeze(['scout', 'scheduler']),
    targetView: 'schedule',
    description: 'Discover capabilities and pull booking schedules.'
  }),
  inspect_power: Object.freeze({
    action: 'run',
    agents: Object.freeze(['scout', 'scheduler', 'telemetry', 'matcher']),
    targetView: 'schedule',
    description: 'Pull schedules, inspect smart-plug watts and PC logins, and match sessions.'
  }),
  price_month: Object.freeze({
    action: 'run',
    agents: Object.freeze(['scout', 'scheduler', 'telemetry', 'matcher', 'pricer']),
    targetView: 'schedule',
    description: 'Reconcile sessions and apply rates, tiers, and rounding rules.'
  }),
  check_workspace: Object.freeze({
    action: 'run',
    agents: Object.freeze([...AGENT_IDS]),
    system: 'workspace',
    targetView: 'schedule',
    description: 'Run the full crew on spreadsheets loaded in your local workspace.'
  }),
  scout_sources: Object.freeze({
    action: 'run',
    agents: Object.freeze(['scout']),
    targetView: 'schedule',
    description: 'Have Sherlock Ohms scout sources, classify tables, and hash provenance.'
  }),
  train_models: Object.freeze({
    action: 'train',
    agents: Object.freeze([...AGENT_IDS]),
    targetView: 'schedule',
    description: 'Train all local Parity ML classifiers and evaluate held-out accuracy.'
  })
});

const MONTH_WORDS = Object.freeze({
  january: '01', jan: '01',
  february: '02', feb: '02',
  march: '03', mar: '03',
  april: '04', apr: '04',
  june: '06', jun: '06',
  july: '07', jul: '07',
  august: '08', aug: '08',
  september: '09', sept: '09', sep: '09',
  october: '10', oct: '10',
  november: '11', nov: '11',
  december: '12', dec: '12'
});

function extractExplicitAgents(text) {
  if (!text) return [];
  const matched = new Set();

  if (/\b(sherlock|ohms|source\s+scout|scout)\b/i.test(text)) {
    matched.add('scout');
  }
  if (
    /\b(slots(?:-a-lot)?|schedule\s+puller)\b/i.test(text) ||
    (/\bscheduler\b/i.test(text) &&
      !/(?:fbs|ilab|ppms|booked)\s+scheduler\b/i.test(text) &&
      !/\bscheduler\s+(?:capabilities|export|report|billing|log|api)\b/i.test(text))
  ) {
    matched.add('scheduler');
  }
  if (
    /\b(wattula|plug\s*(?:&|and)?\s*log\s+collector|plug\s+collector)\b/i.test(text) ||
    /(?:\b(?:have|use|ask|tell|only|solo|agent|with|just)\s+(?:the\s+)?|\b(?:scout|scheduler|matcher|pricer|auditor)\s*(?:,|and)\s*)telemetry\b/i.test(text) ||
    /\btelemetry\s+(?:agent|only|solo)\b/i.test(text) ||
    /\btelemetry\s*,\s*(?:scout|scheduler|matcher|pricer|auditor)\b/i.test(text) ||
    /(?<!smart[-\s])(?<!wall[-\s])(?<!outlet\s)\bplug\b(?!\s*(?:watt|watts|wattage|power|draw|telemetry|stream|log|logs|meter|sensor|interval|intervals|data|usage|run|runs|csv|signature|reading|readings))/i.test(text)
  ) {
    matched.add('telemetry');
  }
  if (/\b(venn|session\s+matcher|booking-to-usage\s+matcher|matcher)\b/i.test(text)) {
    matched.add('matcher');
  }
  if (/\b(baron|markup|rate\s*(?:&|and)?\s*rule\s+pricer|pricer)\b/i.test(text)) {
    matched.add('pricer');
  }
  if (/\b(nitpick|discrepancy\s+auditor|auditor)\b/i.test(text)) {
    matched.add('auditor');
  }

  return AGENT_IDS.filter(id => matched.has(id));
}

function extractMentionedSystem(text) {
  if (!text) return null;
  if (/\b(workspace|folder|my\s+files|local\s+files|loaded\s+files)\b/i.test(text)) return 'workspace';
  if (/\bilab\b/i.test(text)) return 'ilab';
  if (/\bfbs\b/i.test(text)) return 'fbs';
  if (/\b(spreadsheets?|csvs?|excel|xlsx)\b/i.test(text)) return 'workspace';
  return null;
}

function extractMentionedScenario(text) {
  if (!text) return null;
  if (/\b(retry|retries|retrying|rate[\s-]*limits?|429)\b/i.test(text)) return 'retry';
  if (/\binvalid\b/i.test(text)) return 'invalid';
  if (/\bnormal\b/i.test(text)) return 'normal';
  if (/\b(pitch|john|adam|billy)\b/i.test(text)) return 'pitch';
  return null;
}

function extractMentionedMonth(text) {
  if (!text) return null;
  const iso = text.match(/\b(20\d{2})-(0[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const wordMatch = text.match(/\b(?:(20\d{2})\s+)?(january|jan|february|feb|march|mar|april|apr|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b(?:\s+(20\d{2}))?/i);
  if (wordMatch) {
    const mm = MONTH_WORDS[wordMatch[2].toLowerCase()];
    const yr = wordMatch[1] || wordMatch[3] || '2026';
    return `${yr}-${mm}`;
  }

  const mayMatch = text.match(/(?:\b(?:for|in|of|month(?:\s+of)?)\s+may\b|\bMay\b)(?:\s+(20\d{2}))?/);
  if (mayMatch) {
    const yr = mayMatch[1] || '2026';
    return `${yr}-05`;
  }

  return null;
}

function extractMentionedTargetView(text) {
  if (!text) return null;
  if (/result|bill|flag|discrepanc|approve|charge/i.test(text)) return 'results';
  return null;
}

function formatAgentList(ids) {
  if (ids.length === AGENT_IDS.length) return 'all 6 specialists';
  return ids.map(id => getAgent(id)?.name || id).join(', ');
}

async function planCommand(prompt, models, opts = {}) {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  const intentModel = models?.intent_router || models?.models?.intent_router || null;
  const pred = (text && intentModel) ? predictText(intentModel, text) : { label: null, confidence: 0 };

  const predictedIntent = pred?.label && INTENT_SPECS[pred.label] ? pred.label : 'full_close_pitch';
  const confidence = typeof pred?.confidence === 'number' ? pred.confidence : 0;
  const spec = INTENT_SPECS[predictedIntent];
  const action = spec.action;

  let llmPlan = null;
  let usedLLM = false;
  if (opts.engine === 'local_llm' && opts.llmModel && predictedIntent !== 'train_models' && text) {
    const candidate = await planGoalWithLLM({
      modelName: opts.llmModel,
      prompt: text,
      availableSystems: opts.availableSystems
    });
    if (candidate && typeof candidate === 'object') {
      const validAgents = Array.isArray(candidate.agents)
        ? AGENT_IDS.filter(id => candidate.agents.includes(id))
        : [];
      if (
        validAgents.length &&
        VALID_SYSTEMS.includes(candidate.system) &&
        MONTH_RE.test(candidate.month) &&
        VALID_SCENARIOS.includes(candidate.scenario) &&
        VALID_VIEWS.includes(candidate.targetView)
      ) {
        llmPlan = { ...candidate, agents: validAgents };
        usedLLM = true;
      }
    }
  }

  const explicitAgents = extractExplicitAgents(text);
  const agents = explicitAgents.length
    ? explicitAgents
    : (llmPlan ? llmPlan.agents : [...spec.agents]);

  const mentionedSystem = extractMentionedSystem(text);
  const fallbackSystem = VALID_SYSTEMS.includes(opts.defaultSystem) ? opts.defaultSystem : 'fbs';
  const system = mentionedSystem || spec.system || (llmPlan ? llmPlan.system : fallbackSystem);

  const mentionedMonth = extractMentionedMonth(text);
  const fallbackMonth = MONTH_RE.test(String(opts.defaultMonth || '')) ? opts.defaultMonth : '2026-10';
  const month = mentionedMonth || (llmPlan ? llmPlan.month : fallbackMonth);

  const mentionedScenario = extractMentionedScenario(text);
  const fallbackScenario = VALID_SCENARIOS.includes(opts.defaultScenario) ? opts.defaultScenario : 'pitch';
  const scenario = mentionedScenario || spec.scenario || (llmPlan ? llmPlan.scenario : fallbackScenario);

  const mentionedView = extractMentionedTargetView(text);
  const targetView = mentionedView || (spec.targetView === 'results' ? 'results' : (llmPlan ? llmPlan.targetView : 'schedule'));

  const confPct = Math.round(confidence * 100);
  const via = usedLLM ? ' + local LLM' : '';
  const agentNote = explicitAgents.length ? `${formatAgentList(agents)} (named)` : formatAgentList(agents);
  const explanation = action === 'train'
    ? `Intent ${predictedIntent} (${confPct}% local ML). Retraining all local Parity specialist models.`
    : `Intent ${predictedIntent} (${confPct}% local ML${via}). Assigned ${agentNote} on ${system} · ${month} (${scenario}) -> ${targetView}.`;

  return {
    intent: predictedIntent,
    confidence,
    action,
    agents,
    system,
    month,
    scenario,
    targetView,
    explanation,
    usedLLM
  };
}

module.exports = {
  planCommand,
  INTENT_SPECS
};
