var assert = require('assert');
var S = require('../services'), R = require('../rules'), C = require('../campus');

var list = [{ sku: 'A', name: 'T75 flask, HEK', academic: 40 }, { sku: 'B', name: 'Dish', academic: 10 }];
var labs = [{ name: 'Chen, L. Lab', type: 'academic', charge: 'W1', members: ['Mei'] }, { name: 'Chen, W. Lab', type: 'academic', charge: 'W2', members: ['Owen'] },
  { name: 'Helix', type: 'industry', charge: 'PO', members: ['Pia'] }, { name: 'Old Lab', type: 'academic', charge: 'W9', ends: '2026-10-10', members: ['Dev'] }];
var rules = R.defaults().concat([{ id: 'own', name: 'own flask', on: true, when: [{ field: 'lab', op: 'is', value: 'chen, l. lab' }, { field: 'service', op: 'contains', value: 't75' }], then: { type: 'minus', value: 2.5 } }]);
var req = function (o) { return Object.assign({ date: '2026-10-05', qty: 1, charge: 'W', status: 'delivered' }, o); };
var reqs = [
  req({ id: 1, user: 'Mei', lab: 'Chen, L. Lab', sku: 'A' }),             // own-flask discount
  req({ id: 2, user: 'Pia', lab: 'Helix', sku: 'A' }),                    // industry +66%
  req({ id: 3, user: 'Mei', lab: 'Chen, W. Lab', sku: 'B' }),             // wrong lab, similar name
  req({ id: 4, user: 'Owen', lab: 'Chen, W. Lab', sku: 'B', qty: 12 }),   // 12 for 1
  req({ id: 5, user: 'Owen', lab: 'Chen, W. Lab', sku: 'B', charge: '' }),// no worktag
  req({ id: 6, user: 'Dev', lab: 'Old Lab', sku: 'B', date: '2026-10-20' }), // worktag ended
  req({ id: 7, user: 'Owen', lab: 'Chen, W. Lab', sku: 'BB' }),           // unknown SKU, near match
  req({ id: 8, user: 'Owen', lab: 'Chen, W. Lab', sku: 'B' }),
  req({ id: 9, user: 'Stranger', lab: 'Helix', sku: 'B' })                // not on any roster
];
var out = R.apply(reqs, rules, { list: list, labs: labs });
var L = function (id) { return out.lines.filter(function (l) { return l.req.id === id; })[0]; };
assert.strictEqual(L(1).unit, 37.5); assert.strictEqual(L(1).trace.length, 1); assert.ok(!L(1).held);
assert.strictEqual(L(2).unit, 66.4); assert.strictEqual(L(2).trace[0].id, 'industry');
assert.ok(L(3).held && /Chen, L\. Lab roster, not Chen, W\. Lab/.test(L(3).holds[0].why) && /similar name/.test(L(3).holds[0].why));
assert.strictEqual(L(3).holds[0].fix.set.lab, 'Chen, L. Lab'); assert.strictEqual(L(3).holds[0].fix.set.charge, 'W1');
assert.ok(L(4).held && /Quantity 12 is 12× the usual 1/.test(L(4).holds[0].why)); assert.strictEqual(L(4).holds[0].fix.set.qty, 1);
assert.ok(L(5).held && L(5).holds[0].id === 'nocharge' && L(5).holds[0].fix.set.charge === 'W2');
assert.ok(L(6).held && /ended 2026-10-10/.test(L(6).holds[0].why));
assert.ok(L(7).held && L(7).holds[0].fix.set.sku === 'B');
assert.ok(!L(8).held && L(8).amount === 10);
assert.ok(L(9).held && L(9).holds[0].fix.roster.user === 'Stranger');
assert.strictEqual(out.held.length, 6);
assert.strictEqual(out.stats.industry.n, 2); assert.strictEqual(out.stats.own.delta, -2.5);
// approving a held line releases it but keeps the trail; turning a rule off stops it
reqs[3].ok = true; var o2 = R.apply(reqs, rules, { list: list, labs: labs });
assert.ok(!o2.lines[3].held && o2.lines[3].approved && o2.lines[3].holds.length === 1);
reqs[6].ok = true; assert.ok(R.apply(reqs, rules, { list: list, labs: labs }).lines[6].held, 'unknown SKU cannot be approved as is'); reqs[6].ok = false;
rules.filter(function (x) { return x.id === 'roster'; })[0].on = false;
assert.strictEqual(R.apply(reqs, rules, { list: list, labs: labs }).held.length, 3);
// price rules chain in order; set_price and discount
var chain = [{ id: 'a', on: true, when: [{ field: 'sku', op: 'is', value: 'A' }], then: { type: 'set_price', value: 100 } }, { id: 'b', on: true, when: [{ field: 'qty', op: 'gte', value: 2 }], then: { type: 'discount_pct', value: 10 } }];
var o3 = R.apply([req({ id: 1, user: 'Mei', lab: 'Chen, L. Lab', sku: 'A', qty: 2 })], chain, { list: list, labs: labs });
assert.strictEqual(o3.lines[0].unit, 90); assert.strictEqual(o3.total, 180);
assert.ok(/^When lab is Ramirez Lab and service name contains T75 flask, take off \$2\.60 per unit\.$/.test(R.sentence(R.defaults()[1])));
assert.ok(!R.matches({ when: [], then: { type: 'hold' } }, {}));   // a rule with no condition never fires

// sample desk: exactly the six planted holds, and the month recovers about (100 - subsidy)% of a month of cost
var P = S.price(S.sampleModel()), D = R.sampleDesk(P);
var sl = S.fbsList(P, 66).map(function (p, i) { return { sku: p.sku, name: p.name, academic: P.rows[i].academic }; });
var o4 = R.apply(D.requests.filter(function (r) { return r.status === 'delivered'; }), D.rules, { list: sl, labs: D.labs });
assert.deepStrictEqual(o4.held.map(function (l) { return l.holds[0].id; }).sort(), ['ended', 'ended', 'nocharge', 'qty', 'roster', 'sku']);
var rec = (o4.total - o4.heldAmount) / (P.cost / 12) * 100;
assert.ok(rec > 65 && rec < 90, 'recovery ' + rec);
assert.ok(o4.stats.industry.n > 5 && o4.stats.ownflask.n > 0);

// campus
var mine = C.summary({ core: 'Cell culture core', billed: o4.total - o4.heldAmount, cost: P.cost / 12, target: 75, lines: o4.lines.length, held: o4.held.length, heldAmount: o4.heldAmount, labs: o4.byLab });
var roll = C.rollup([mine].concat(C.samplePeers('2026-10')), { expectedCores: ['Proteomics core'] });
assert.strictEqual(roll.cores.length, 5);
assert.strictEqual(roll.cores[0].status, 'ok');
assert.ok(roll.flags.some(function (f) { return f.core === 'Mass spectrometry core' && f.sev === 'high'; }));
assert.ok(roll.flags.some(function (f) { return /No summary received/.test(f.text); }));
assert.ok(roll.flags.some(function (f) { return /Triple-quad MS/.test(f.text); }));
assert.strictEqual(roll.flags[0].sev, 'high');
var ok = roll.labs.filter(function (l) { return l.lab === 'Okafor Lab'; })[0]; assert.ok(ok.n >= 3 && ok.total > 25000);
assert.strictEqual(C.parse(JSON.stringify(mine))[0].core, 'Cell culture core');
assert.throws(function () { C.parse('{"x":1}'); }); assert.throws(function () { C.parse('nope'); });
console.log('rules + campus tests passed; sample recovery ' + rec.toFixed(1) + '%, requests ' + D.requests.length);
