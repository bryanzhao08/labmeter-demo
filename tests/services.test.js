var assert = require('assert');
var S = require('../services');

// price: fixed and labor fully recovered at volume
var m = { fixed: { maintenance: 1000, stockPerMonth: 0, other: 0 }, salaries: 600, overagePct: 0, subsidyPct: 0, industryPct: 50,
  skus: [{ sku: 'A', recipe: [{ qty: 2, cost: 1.5 }], laborMin: 10, volume: 50 }, { sku: 'B', recipe: [], laborMin: 20, volume: 50 }] };
var p = S.price(m);
assert.strictEqual(p.fixedYr, 1000);
assert.strictEqual(p.perUnit, 10);           // 1000 / 100 units
assert.strictEqual(p.perMin, 0.4);           // 600 / (500 + 1000) min
assert.strictEqual(p.rows[0].full, 17);      // 3 + 10 + 4
assert.strictEqual(p.rows[1].full, 18);      // 0 + 10 + 8
assert.strictEqual(p.rows[0].industry, 26);  // 17 * 1.5 = 25.5 -> 26
assert.strictEqual(p.cost, 1750);            // 3*50 supplies + 1000 + 600
assert.strictEqual(p.subsidy, 0);
// subsidy + overage
m.subsidyPct = 50; m.overagePct = 10;
p = S.price(m);
assert.strictEqual(p.rows[0].full, 18.7);
assert.strictEqual(p.rows[0].academic, 9);
assert.ok(p.subsidy > 0);
// lower volume raises price
m.volumePct = 50; var p2 = S.price(m); assert.ok(p2.rows[0].full > p.rows[0].full);
// below supplies flag
var b = S.price({ fixed: {}, salaries: 0, subsidyPct: 90, skus: [{ sku: 'X', recipe: [{ qty: 1, cost: 10 }], laborMin: 0, volume: 10 }] });
assert.ok(b.rows[0].flags.indexOf('below_supplies') >= 0);

// recipe table
var rec = S.recipesFromTable({ head: ['SKU', 'Name', 'Item', 'Qty', 'Unit cost', 'Labor min', 'Volume/yr', 'Current price'],
  rows: [['1', 'Flask', 'T75', '1', '2.60', '12', '100', '$44'], ['1', '', 'Media (mL)', '15', '0.12', '', '', ''], ['2', 'Dish', 'Dish', '1', '1', '4', '50', '']] });
assert.strictEqual(rec.length, 2);
assert.strictEqual(rec[0].recipe.length, 2);
assert.strictEqual(rec[0].current, 44);
assert.strictEqual(rec[0].volume, 100);

// sample model + month: all five planted mistakes caught, nothing else
var pm = S.price(S.sampleModel());
assert.strictEqual(pm.rows.length, 14);
assert.ok(pm.rows.every(function (r) { return r.academic > 0 && r.industry > r.academic; }));
var list = S.fbsList(pm, 66);
var mo = S.sampleMonth(list);
var c = S.check(mo.lines, list, mo.roster);
var codes = c.held.map(function (h) { return h.issues[0].code; }).sort();
assert.deepStrictEqual(codes, ['no_charge', 'price', 'qty', 'unknown_sku', 'wrong_lab']);
assert.strictEqual(c.clean, mo.lines.length - 5);
// without a roster the wrong lab is still inferred from history
var c2 = S.check(mo.lines, list, null);
assert.ok(c2.held.some(function (h) { return h.issues.some(function (i) { return i.code === 'wrong_lab' && /similar name/.test(i.why); }); }));

// upload table parsing (FBS invoice-like columns)
var lines = S.linesFromTable({ head: ['Quantity', 'Per', 'SKU', 'Description', 'Date', 'Unit Price', 'Requested by', 'Lab', 'Charge'],
  rows: [['1.000', 'Each', '261', 'AD-6WELL', '05-05-2026', '$ 30.00', 'A B', 'X Lab', 'USC.1']] });
assert.strictEqual(lines[0].qty, 1); assert.strictEqual(lines[0].price, 30); assert.strictEqual(lines[0].charge, 'USC.1');
assert.throws(function () { S.linesFromTable({ head: ['Foo'], rows: [] }); });
console.log('services tests passed');
