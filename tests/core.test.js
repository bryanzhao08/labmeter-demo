// node tests/core.test.js — loads audit.js headless and checks the LaBro Close engine on the sample month.
const fs = require("fs"), path = require("path"), assert = require("assert");
global.window = {}; global.localStorage = { getItem: () => null, setItem: () => {} };
eval(fs.readFileSync(path.join(__dirname, "../audit.js"), "utf8"));
const C = window.LMAuditCore, d = p => fs.readFileSync(path.join(__dirname, "../data/audit", p), "utf8");
C.setFile("res", "r", d("fbs_reservations.csv")); C.setFile("use", "u", d("usage_log.csv")); C.setFile("run", "x", d("instrument_runs.csv"));
const B = C.build(); C.ensureRates(B);
const A = C.audit(B, "instrument"), L = C.audit(B, "computer");
const sum = (rs, k) => rs.reduce((s, r) => s + r[k], 0);
const R = C.rules();
const bookedUSD = A.rows.reduce((s, r) => s + r.booked / 60 * R.rates[r.res], 0);
console.log(JSON.stringify({ resources: B.resources.length, reservations: B.res.length, sessions: B.use.length, runs: B.run.length, rows: A.rows.length,
  actualUSD: +sum(A.rows, "charge").toFixed(2), loginUSD: +sum(L.rows, "charge").toFixed(2), bookedUSD: +bookedUSD.toFixed(2),
  flagged: A.rows.filter(C.needsAction).length, bad: B.bad }));
assert(B.resources.length >= 5); assert(A.rows.length > 50); assert(A.hasRuns);
assert(sum(A.rows, "charge") > 0);
// remapped columns: rename headers, engine must still find them
const renamed = d("fbs_reservations.csv").replace(/^.*\n/, "Booking #,Equipment,Full Name,E-mail,Lab,Fund,Start Date,Start Time,End Date,End Time,State\n");
C.setFile("res", "r2", renamed); const B2 = C.build(); assert.strictEqual(B2.res.length, B.res.length, "renamed headers parse");
console.log("ok");
