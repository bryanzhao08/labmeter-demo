const fs = require('fs'), path = require('path'), assert = require('assert');
global.window = {}; global.localStorage = { getItem: () => null, setItem: () => {} };
eval(fs.readFileSync(path.join(__dirname, '../audit.js'), 'utf8'));
const C = window.LMAuditCore;
const read = p => fs.readFileSync(path.join(__dirname, p), 'utf8');
C.setFile('use', 'usage_log.csv', read('../data/audit/usage_log.csv'));
C.setFile('run', 'instrument_runs.csv', read('../data/audit/instrument_runs.csv'));
function evaluate(name, text) {
  C.setFile('res', name, text);
  const B = C.build(); C.ensureRates(B);
  return { count: B.res.length, charge: C.audit(B, 'instrument').rows.reduce((s, r) => s + r.charge, 0) };
}
const original = evaluate('fbs_reservations.csv', read('../data/audit/fbs_reservations.csv'));
const cases = [
  ['ilab_reservations.csv', {resource:'Equipment', user:'Customer Email', name:'Customer Name', account:'Payment Info', pi:'PI Name', start:'Start', startTime:null, end:'End', endTime:null, status:'Status'}],
  ['ppms_reservations.tsv', {resource:'System', user:'User login', name:'User full name', account:'Account', pi:'Group', start:'Date', startTime:'From', end:null, endTime:'To', status:'State'}]
];
let failed = false;
for (const [name, expected] of cases) {
  const result = evaluate(name, read('../data/audit/' + name));
  const { map, head } = C.state.files.res;
  const errors = [];
  for (const [field, want] of Object.entries(expected)) {
    const got = map[field] >= 0 ? head[map[field]] : null;
    if (got !== want) errors.push(`${field}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)} (index ${map[field]})`);
  }
  try { assert.strictEqual(result.count, original.count, 'reservation count'); } catch (e) { errors.push(`reservation count: expected ${original.count}, got ${result.count}`); }
  try { assert(Math.abs(result.charge - original.charge) <= 0.01, 'total charge'); } catch (e) { errors.push(`total charge: expected ${original.charge.toFixed(2)}, got ${result.charge.toFixed(2)}`); }
  if (errors.length) { failed = true; console.error(`${name}:\n  ${errors.join('\n  ')}`); }
}
if (failed) process.exitCode = 1; else console.log('ok');
