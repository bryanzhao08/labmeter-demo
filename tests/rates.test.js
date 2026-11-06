var assert = require('assert');
var rates = require('../rates');
var vm = require('vm');
var fs = require('fs');

var pool = rates.costPool([
  { label: 'Staff', amount: 1000, kind: 'labor' },
  { label: 'Service', amount: 200, kind: 'service' },
  { label: 'Purchase', amount: 6000, kind: 'equipment_purchase' },
  { label: 'Party', amount: 50, kind: 'entertainment' },
  { label: 'Debt', amount: 20, kind: 'bad_debt' }
]);
assert.strictEqual(pool.allowable, 1200);
assert.strictEqual(pool.unallowable, 6070);
assert.strictEqual(pool.excluded.length, 3);
assert.ok(pool.excluded.every(function (item) { return item.reason; }));
assert.strictEqual(rates.rate(1000, 100, 100), 9);
assert.strictEqual(rates.rate(1000, 100, -100), 11);
assert.strictEqual(rates.rate(100, 3, 0), 33.33);
assert.strictEqual(rates.rate(100, 0, 0), null);
assert.strictEqual(rates.rate(100, -1, 0), null);
var input = { name: 'Scope', pool: 1000, carry: 0, bookedHours: 100, loginHours: 90, measuredHours: 75, billedRate: 10 };
var comparison = rates.compare(input);
assert.strictEqual(comparison.booked.rate, 10);
assert.strictEqual(comparison.login.rate, 11.11);
assert.strictEqual(comparison.measured.rate, 13.33);
assert.strictEqual(comparison.booked.recovery, -250);
assert.strictEqual(comparison.surplusPct, -0.25);
assert.ok(comparison.flags.indexOf('under_recovery') !== -1);
assert.ok(comparison.flags.indexOf('rate_from_bookings') !== -1);
assert.strictEqual(rates.annualize(300, 3), 1200);
var findings = rates.checks({ instruments: [{ name: 'Scope', pool: 1000, carry: 0, bookedHours: 100, loginHours: 80, measuredHours: 40, billedRate: 30, items: [{ label: 'Party', amount: 20, kind: 'entertainment' }] }], rateSchedule: [{ instrument: 'Scope', userType: 'federal', rate: 30 }, { instrument: 'Scope', userType: 'internal', rate: 25 }] });
assert.strictEqual(findings.length, 4);
assert.ok(findings.some(function (f) { return f.severity === 'low'; }));
assert.ok(findings.some(function (f) { return f.severity === 'medium'; }));
assert.strictEqual(findings.filter(function (f) { return f.severity === 'high'; }).length, 2);
var sample = rates.sampleCore();
assert.strictEqual(sample.instruments.length, 5);
assert.ok(rates.checks(sample).some(function (f) { return f.severity === 'high'; }));
assert.ok(rates.checks(sample).some(function (f) { return f.severity === 'medium'; }));
var context = { window: {} };
vm.runInNewContext(fs.readFileSync(__dirname + '/../rates.js', 'utf8'), context);
assert.strictEqual(typeof context.window.LBRates.rate, 'function');
console.log('ok');
