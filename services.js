/* LBServices: pricing and pre-upload checks for cores that bill per item (cell culture, media,
   sample prep), not per instrument hour. Pure functions; used by close.js and tests/services.test.js.
   Price = (consumables + share of fixed costs + labor) x (1 + overage); academic = x (1 - subsidy),
   industry = x (1 + markup). Labor and fixed costs are spread so they are fully recovered at the
   expected yearly volume (full-cost recovery, the basis 2 CFR 200.468 expects). */
(function (root) {
  'use strict';

  function r2(n) { return Math.round(n * 100) / 100; }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }

  // model: { fixed: {maintenance, stockPerMonth, other}, salaries, overagePct, subsidyPct, industryPct, volumePct,
  //          skus: [{ sku, name, unit, recipe: [{ item, qty, cost }], laborMin, volume, current }] }
  function price(model) {
    var m = model || {}, f = m.fixed || {}, vol = (m.volumePct == null ? 100 : m.volumePct) / 100;
    var skus = (m.skus || []).map(function (s) {
      var cons = (s.recipe || []).reduce(function (a, it) { return a + num(it.qty) * num(it.cost); }, 0);
      return { s: s, cons: cons, units: Math.max(0, num(s.volume) * vol), mins: Math.max(0, num(s.laborMin)) };
    });
    var units = skus.reduce(function (a, x) { return a + x.units; }, 0);
    var minutes = skus.reduce(function (a, x) { return a + x.units * x.mins; }, 0);
    var fixedYr = num(f.maintenance) + num(f.stockPerMonth) * 12 + num(f.other);
    var perUnit = units > 0 ? fixedYr / units : 0;
    var perMin = minutes > 0 ? num(m.salaries) / minutes : 0;
    var over = num(m.overagePct) / 100, sub = num(m.subsidyPct) / 100, ind = num(m.industryPct) / 100;
    var rows = skus.map(function (x) {
      var labor = x.mins * perMin, full = (x.cons + perUnit + labor) * (1 + over);
      var acad = Math.round(full * (1 - sub)), indus = Math.round(full * (1 + ind));
      var flags = [];
      if (acad < x.cons) flags.push('below_supplies');
      var cur = num(x.s.current);
      if (cur > 0 && Math.abs(cur - acad) / Math.max(acad, 1) > 0.15) flags.push(cur < acad ? 'current_low' : 'current_high');
      return { sku: String(x.s.sku), name: x.s.name || '', unit: x.s.unit || 'Each', volume: Math.round(x.units),
        consumables: r2(x.cons), fixed: r2(perUnit), labor: r2(labor), full: r2(full), academic: acad, industry: indus,
        current: cur || null, flags: flags };
    });
    var cost = rows.reduce(function (a, r) { return a + r.full * r.volume; }, 0);
    var revenue = rows.reduce(function (a, r) { return a + r.academic * r.volume; }, 0);
    return { rows: rows, fixedYr: fixedYr, perUnit: r2(perUnit), perMin: r2(perMin), units: Math.round(units),
      cost: Math.round(cost), revenue: Math.round(revenue), subsidy: Math.round(cost - revenue) };
  }

  // Recipe CSV (one row per ingredient): SKU, Name, Unit, Item, Qty, Unit cost, Labor min, Volume/yr, Current price
  function recipesFromTable(t) {
    var col = finder(t.head);
    var c = { sku: col(/^sku|product.?(id|code)/i), name: col(/^name|description|service/i), unit: col(/^unit$|^per$/i),
      item: col(/^item|ingredient|supply|material/i), qty: col(/^qty|quantity/i), cost: col(/unit.?cost|^cost/i),
      mins: col(/labor|minutes|mins/i), vol: col(/volume|per.?year|\/yr/i), cur: col(/current|price/i) };
    if (c.sku < 0) throw new Error('Recipe file needs a SKU column.');
    var by = {}, order = [];
    t.rows.forEach(function (r) {
      var k = String(r[c.sku] || '').trim(); if (!k) return;
      if (!by[k]) { by[k] = { sku: k, name: '', unit: 'Each', recipe: [], laborMin: 0, volume: 0, current: 0 }; order.push(k); }
      var s = by[k];
      if (c.name >= 0 && r[c.name]) s.name = String(r[c.name]).trim();
      if (c.unit >= 0 && r[c.unit]) s.unit = String(r[c.unit]).trim();
      if (c.mins >= 0 && num(r[c.mins])) s.laborMin = num(r[c.mins]);
      if (c.vol >= 0 && num(r[c.vol])) s.volume = num(r[c.vol]);
      if (c.cur >= 0 && num(r[c.cur])) s.current = num(r[c.cur]);
      if (c.item >= 0 && r[c.item]) s.recipe.push({ item: String(r[c.item]).trim(), qty: c.qty >= 0 ? num(r[c.qty]) : 1, cost: c.cost >= 0 ? num(r[c.cost]) : 0 });
    });
    return order.map(function (k) { return by[k]; });
  }

  function finder(head) {
    return function (re) { for (var i = 0; i < head.length; i++) if (re.test(String(head[i]).trim())) return i; return -1; };
  }

  // Upload lines from an FBS-style eLog/invoice CSV: Quantity, SKU, Description, Date, Unit Price, Requested by, Lab, Charge
  function linesFromTable(t) {
    var col = finder(t.head);
    var c = { qty: col(/^qty|quantity/i), sku: col(/^sku|product/i), desc: col(/description|service/i), date: col(/date/i),
      price: col(/unit.?price|^price|rate/i), user: col(/request|user|customer/i), lab: col(/^lab|^pi|bill.?to/i),
      charge: col(/charge|worktag|account|grant/i) };
    if (c.sku < 0 || c.qty < 0) throw new Error('Upload file needs Quantity and SKU columns.');
    return t.rows.map(function (r, i) {
      var g = function (k) { return c[k] >= 0 ? String(r[c[k]] == null ? '' : r[c[k]]).trim() : ''; };
      return { i: i, qty: num(g('qty')), sku: g('sku'), desc: g('desc'), date: g('date'), price: g('price') === '' ? null : num(g('price')),
        user: g('user'), lab: g('lab'), charge: g('charge') };
    }).filter(function (l) { return l.sku || l.qty; });
  }

  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); var n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }

  // list: [{sku, academic, industry}] ; roster (optional): { user: [labs] }
  function check(lines, list, roster) {
    var bySku = {}; (list || []).forEach(function (p) { bySku[String(p.sku)] = p; });
    var qtys = {}; lines.forEach(function (l) { (qtys[l.sku] = qtys[l.sku] || []).push(l.qty); });
    var usual = {};
    if (!roster) {
      var counts = {};
      lines.forEach(function (l) { if (!l.user || !l.lab) return; var u = counts[l.user] = counts[l.user] || {}; u[l.lab] = (u[l.lab] || 0) + 1; });
      Object.keys(counts).forEach(function (u) {
        var labs = Object.keys(counts[u]).sort(function (a, b) { return counts[u][b] - counts[u][a]; });
        if (labs.length > 1 && counts[u][labs[0]] >= 3 * counts[u][labs[1]]) usual[u] = [labs[0]];
      });
    }
    var labs = {}; lines.forEach(function (l) { if (l.lab) labs[l.lab] = 1; });
    var surname = {}; Object.keys(labs).forEach(function (L) { var s = L.replace(/\s+lab$/i, '').trim().split(/[\s,]+/).filter(Boolean); var k = (/,/.test(L) ? s[0] : s[s.length - 1] || '').toLowerCase(); (surname[k] = surname[k] || []).push(L); });
    var out = lines.map(function (l) {
      var issues = [], p = bySku[l.sku];
      if (!p) issues.push({ code: 'unknown_sku', sev: 'high', why: 'SKU ' + (l.sku || '(blank)') + ' is not in the price list' });
      if (p && l.price != null && l.price !== p.academic && l.price !== p.industry) issues.push({ code: 'price', sev: 'medium', why: 'Price $' + l.price + ' differs from the list ($' + p.academic + ' academic, $' + p.industry + ' industry)', fix: p.academic });
      var med = median(qtys[l.sku] || []);
      if (l.qty <= 0) issues.push({ code: 'qty_zero', sev: 'high', why: 'Quantity is ' + l.qty });
      else if (l.qty >= 5 && l.qty >= 5 * Math.max(med, 1)) issues.push({ code: 'qty', sev: 'high', why: 'Quantity ' + l.qty + ' is ' + Math.round(l.qty / Math.max(med, 1)) + '× the usual ' + med + ' for this SKU. Typo?' });
      if (!l.charge) issues.push({ code: 'no_charge', sev: 'high', why: 'No account / worktag on the line' });
      var ok = roster ? roster[l.user] : usual[l.user];
      if (l.user && l.lab && ok && ok.indexOf(l.lab) < 0) {
        var twin = (surname[(l.lab.replace(/\s+lab$/i, '').trim().split(/[\s,]+/).filter(Boolean)[/,/.test(l.lab) ? 0 : 1] || l.lab).toLowerCase()] || []);
        issues.push({ code: 'wrong_lab', sev: 'high', why: l.user + ' usually bills to ' + ok.join(' / ') + ', not ' + l.lab + (twin.length > 1 ? ' (two labs with a similar name)' : '') });
      }
      var unit = p ? (l.price != null ? l.price : p.academic) : (l.price || 0);
      return { line: l, issues: issues, amount: r2(unit * l.qty) };
    });
    var byLab = {}; out.forEach(function (o) { var k = o.line.lab || '?'; byLab[k] = (byLab[k] || 0) + o.amount; });
    var held = out.filter(function (o) { return o.issues.length; });
    return { lines: out, held: held, clean: out.length - held.length, total: r2(out.reduce(function (a, o) { return a + o.amount; }, 0)), byLab: byLab };
  }

  // ---------- synthetic sample: a cell culture core (all names, SKUs, costs invented)
  function sampleModel() {
    var R = function (item, qty, cost) { return { item: item, qty: qty, cost: cost }; };
    var media = R('Growth media (mL)', 0, 0.12), fbs = R('Serum (mL)', 0, 0.9);
    var with_ = function (base, extra) { return base.concat(extra); };
    var plate = [R('Plate / dish', 1, 1.1), R('Pipette tips', 4, 0.08), R('Tube', 1, 0.25)];
    return {
      fixed: { maintenance: 40000, stockPerMonth: 2500, other: 6000 },
      salaries: 190000, overagePct: 10, subsidyPct: 25, industryPct: 66, volumePct: 100,
      skus: [
        { sku: '201', name: 'T75 flask, HEK293', unit: 'Each', recipe: [R('T75 flask', 1, 2.6), R('Growth media (mL)', 15, 0.12), R('Serum (mL)', 1.5, 0.9), R('Pipettes', 2, 0.35)], laborMin: 12, volume: 900, current: 44 },
        { sku: '202', name: 'T75 flask, CHO', unit: 'Each', recipe: [R('T75 flask', 1, 2.6), R('CHO media (mL)', 15, 0.18), R('Pipettes', 2, 0.35)], laborMin: 12, volume: 420, current: 44 },
        { sku: '203', name: 'T75 flask, primary fibroblast', unit: 'Each', recipe: [R('T75 flask', 1, 2.6), R('Growth media (mL)', 15, 0.12), R('Serum (mL)', 3, 0.9), R('Supplement kit', 0.1, 38)], laborMin: 18, volume: 160, current: 44 },
        { sku: '261', name: '6-well plate, adherent HEK', unit: 'Each', recipe: with_(plate, [R('Growth media (mL)', 12, 0.12), R('Serum (mL)', 1.2, 0.9)]), laborMin: 10, volume: 1300, current: 30 },
        { sku: '262', name: '35 mm dish, HEK', unit: 'Each', recipe: with_(plate, [R('Growth media (mL)', 2, 0.12), R('Serum (mL)', 0.2, 0.9)]), laborMin: 4, volume: 1100, current: 12 },
        { sku: '270', name: '96-well plate, seeded', unit: 'Each', recipe: [R('96-well plate', 1, 3.4), R('Growth media (mL)', 20, 0.12), R('Serum (mL)', 2, 0.9), R('Pipette tips', 8, 0.08)], laborMin: 15, volume: 380, current: 35 },
        { sku: '310', name: 'Transient transfection, 30 mL', unit: 'Each', recipe: [R('Expression media (mL)', 30, 0.35), R('Transfection reagent', 1, 24), R('Shake flask', 1, 6.5)], laborMin: 45, volume: 260, current: 95 },
        { sku: '311', name: 'Transient transfection, 250 mL', unit: 'Each', recipe: [R('Expression media (mL)', 250, 0.35), R('Transfection reagent', 6, 24), R('Shake flask', 1, 14)], laborMin: 90, volume: 70, current: 420 },
        { sku: '320', name: 'Baculovirus amplification (Sf9)', unit: 'Each', recipe: [R('Insect media (mL)', 50, 0.22), R('Shake flask', 1, 6.5)], laborMin: 40, volume: 150, current: 85 },
        { sku: '330', name: 'Harvest: pellet + supernatant', unit: 'Each', recipe: [R('Conical tubes', 2, 0.6), R('Filter unit', 1, 7.5)], laborMin: 25, volume: 300, current: 30 },
        { sku: '340', name: 'Mycoplasma test', unit: 'Each', recipe: [R('Test kit (per sample)', 1, 9.5)], laborMin: 20, volume: 240, current: 25 },
        { sku: '350', name: 'Thaw and expand (cryovial)', unit: 'Each', recipe: [R('Cryovial handling', 1, 1.5), R('T25 flask', 2, 1.9), R('Growth media (mL)', 20, 0.12), R('Serum (mL)', 2, 0.9)], laborMin: 30, volume: 120, current: 60 },
        { sku: '360', name: 'Cryopreserve, 5 vials', unit: 'Each', recipe: [R('Cryovials', 5, 0.9), R('Freezing media (mL)', 5, 1.4)], laborMin: 25, volume: 140, current: 55 },
        { sku: '900', name: 'Hood time, trained user', unit: 'Hour', recipe: [R('Disinfectant + wipes', 1, 1.2)], laborMin: 6, volume: 500, current: 18 }
      ]
    };
  }

  // The price list FBS holds today (current prices where known), which upload lines are checked against.
  function fbsList(priced, industryPct) {
    var ind = num(industryPct) / 100;
    return priced.rows.map(function (r) { var a = r.current || r.academic; return { sku: r.sku, name: r.name, unit: r.unit, academic: a, industry: Math.round(a * (1 + ind)) }; });
  }

  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // One synthetic month of upload lines, with five planted mistakes.
  function sampleMonth(list) {
    var rand = rng(11), pick = function (a) { return a[Math.floor(rand() * a.length)]; };
    var labs = [
      ['Okafor Lab', 'USC.CA100101.GR2000101', ['Ada Brooks', 'Tomas Reyes', 'Ivy Park']],
      ['Chen, L. Lab', 'USC.CA100102.GR2000102', ['Mei Lin', 'Noah Price', 'Sara Haddad']],
      ['Chen, W. Lab', 'USC.CA100103.GR2000103', ['Owen Hart', 'Lina Moreau']],
      ['Ramirez Lab', 'USC.CA100104.GR2000104', ['Kofi Mensah', 'Elena Rossi', 'Jun Mori']],
      ['Patel Lab', 'USC.CA100105.GR2000105', ['Grace Kim', 'Ravi Shah']],
      ['Nguyen Lab', 'USC.CA100106.GR2000106', ['Hana Sato', 'Leo Novak', 'Maya Ortiz']]
    ];
    var skus = ['201', '201', '202', '261', '261', '261', '262', '262', '270', '310', '320', '330', '340', '350', '360', '900'];
    var byS = {}; list.forEach(function (p) { byS[p.sku] = p; });
    var lines = [];
    for (var i = 0; i < 190; i++) {
      var L = pick(labs), u = pick(L[2]), s = pick(skus), d = 1 + Math.floor(rand() * 30);
      var q = s === '900' ? 1 + Math.floor(rand() * 3) : 1;
      lines.push({ qty: q, sku: s, desc: byS[s].name, date: '2026-10-' + (d < 10 ? '0' : '') + d, price: byS[s].academic, user: u, lab: L[0], charge: L[1] });
    }
    lines.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    // planted mistakes (the kinds a manager described: wrong lab with a shared surname, 12 for 1, stale price)
    lines[40] = { qty: 1, sku: '261', desc: byS['261'].name, date: lines[40].date, price: byS['261'].academic, user: 'Mei Lin', lab: 'Chen, W. Lab', charge: 'USC.CA100103.GR2000103' };
    lines[77] = { qty: 12, sku: '262', desc: byS['262'].name, date: lines[77].date, price: byS['262'].academic, user: 'Grace Kim', lab: 'Patel Lab', charge: 'USC.CA100105.GR2000105' };
    lines[101] = { qty: 1, sku: '201', desc: byS['201'].name, date: lines[101].date, price: 40, user: 'Kofi Mensah', lab: 'Ramirez Lab', charge: 'USC.CA100104.GR2000104' };
    lines[133] = { qty: 1, sku: '2610', desc: '6-well plate', date: lines[133].date, price: byS['261'].academic, user: 'Hana Sato', lab: 'Nguyen Lab', charge: 'USC.CA100106.GR2000106' };
    lines[160] = { qty: 1, sku: '330', desc: byS['330'].name, date: lines[160].date, price: byS['330'].academic, user: 'Ada Brooks', lab: 'Okafor Lab', charge: '' };
    var roster = {}; labs.forEach(function (L) { L[2].forEach(function (u) { roster[u] = [L[0]]; }); });
    return { lines: lines.map(function (l, i) { l.i = i; return l; }), roster: roster };
  }

  var API = { fbsList: fbsList, price: price, check: check, recipesFromTable: recipesFromTable, linesFromTable: linesFromTable, sampleModel: sampleModel, sampleMonth: sampleMonth };
  root.LBServices = API;
  if (typeof module !== 'undefined') { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
