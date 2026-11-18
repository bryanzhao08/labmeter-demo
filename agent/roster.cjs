'use strict';

const AGENTS = Object.freeze([
  {
    id: 'scout',
    name: 'Sherlock Ohms',
    role: 'Source Scout',
    badge: '01 · FIND',
    modelKey: 'source_classifier',
    modelLabel: 'Source & Schema Classifier',
    tagline: 'Sniffs out FBS, iLab, PPMS & mystery spreadsheets before anyone blames IT.',
    taskSummary: 'Probes scheduler capabilities, classifies local files, and hashes provenance.',
    tasks: [
      'Discover booking capabilities & instrument catalog',
      'Classify CSV/XLSX/telemetry files with trained text model',
      'Stamp SHA-256 provenance digest on source payloads'
    ],
    color: '#3B6EA5'
  },
  {
    id: 'scheduler',
    name: 'Sir Slots-a-Lot',
    role: 'Schedule Puller',
    badge: '02 · PULL',
    modelKey: 'column_mapper',
    modelLabel: 'Column Header Mapper',
    tagline: 'Politely retries rate limits until every last reservation page surrenders.',
    taskSummary: 'Paginates bookings with bounded 429/502/503 retries, maps columns, deduplicates.',
    tasks: [
      'Paginate FBS / iLab reservation reports (bounded retries)',
      'Map unfamiliar export headers to canonical schema via ML',
      'Reject invalid dates/IDs & deduplicate cross-page repeats'
    ],
    color: '#3F7F6E'
  },
  {
    id: 'telemetry',
    name: 'Count Wattula',
    role: 'Plug & Log Collector',
    badge: '03 · SENSE',
    modelKey: 'power_state',
    modelLabel: 'Smart-Plug Power Classifier',
    tagline: 'Counts every watt after midnight; knows file-copying from real laser runs.',
    taskSummary: 'Collects instrument PC logon logs + smart-plug watt streams and separates idle from active runs.',
    tasks: [
      'Pull workstation logon/logoff sessions & smart-plug watts',
      'Classify intervals: off, standby_idle, active_acquisition, sensor_dropout',
      'Measure active laser/pump minutes vs idle PC copy tails'
    ],
    color: '#7A5C99'
  },
  {
    id: 'matcher',
    name: 'Dr. Venn',
    role: 'Session Matcher',
    badge: '04 · MATCH',
    modelKey: 'session_matcher',
    modelLabel: 'Booking-to-Usage Matcher',
    tagline: 'Overlaps calendars, logins, and wall plugs; refuses to invent fake logoffs.',
    taskSummary: 'Pairs reservations with PC & plug runs; isolates unbooked walk-ups and no-shows.',
    tasks: [
      'Score candidate booking ↔ PC/plug pairs via ML matcher',
      'Merge overlapping usage intervals without guessing ends',
      'Separate matched sessions, unbooked walk-ups, and no-shows'
    ],
    color: '#B0702A'
  },
  {
    id: 'pricer',
    name: 'Baron Von Markup',
    role: 'Rate & Rule Pricer',
    badge: '05 · PRICE',
    modelKey: 'policy_pricer',
    modelLabel: 'Rate & Clause Classifier',
    tagline: 'Fluent in Internal, External, Commercial, and 2 AM emergency confocal tariffs.',
    taskSummary: 'Parses price sheets and billing rules, applies rounding steps, tiers, and after-hours splits.',
    tasks: [
      'Classify rate lines, user tiers & billing policy clauses',
      'Resolve per-instrument rates, rounding & after-hours windows',
      'Compute draft line-item totals per session'
    ],
    color: '#A8455E'
  },
  {
    id: 'auditor',
    name: 'Captain Nitpick',
    role: 'Discrepancy Auditor',
    badge: '06 · FLAG',
    modelKey: 'anomaly_auditor',
    modelLabel: 'Discrepancy & Anomaly Classifier',
    tagline: 'Spots John’s overrun, Adam’s sneaky walk-up, and Billy’s 20-minute sprint in seconds.',
    taskSummary: 'Classifies every session discrepancy with confidence scores and stages review flags.',
    tasks: [
      'Classify clean_match, overrun, walk_up_unbooked, no_show, short_underrun, idle_login_mismatch, duration_outlier',
      'Score anomaly confidence & attach plain-English audit reasons',
      'Hold flagged rows for manager sign-off before export'
    ],
    color: '#B23A1C'
  }
]);

const AGENT_IDS = Object.freeze(AGENTS.map(a => a.id));
const AGENT_MAP = new Map(AGENTS.map(a => [a.id, a]));

const PRESETS = Object.freeze([
  { id: 'full', label: 'Full Crew (All 6)', agents: [...AGENT_IDS] },
  { id: 'pull_only', label: 'Schedule Pull Only', agents: ['scout', 'scheduler'] },
  { id: 'sense_match', label: 'Sensors & Match', agents: ['scout', 'scheduler', 'telemetry', 'matcher'] },
  { id: 'booked_bill', label: 'Booked-Time Billing', agents: ['scout', 'scheduler', 'pricer', 'auditor'] }
]);

function getAgent(id) {
  return AGENT_MAP.get(id) || null;
}

function normalizeAgentSelection(input) {
  if (input === undefined || input === null) return [...AGENT_IDS];
  if (!Array.isArray(input)) throw Error('Select valid agents from the Parity crew.');
  const wanted = new Set();
  for (const raw of input) {
    const id = String(raw || '').trim();
    if (!AGENT_MAP.has(id)) throw Error('Unknown agent selected: ' + id);
    wanted.add(id);
  }
  const ordered = AGENT_IDS.filter(id => wanted.has(id));
  if (!ordered.length) throw Error('Enable at least one agent in the crew.');
  return ordered;
}

module.exports = { AGENTS, AGENT_IDS, PRESETS, getAgent, normalizeAgentSelection };
