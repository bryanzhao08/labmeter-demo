/* LBRules: a core's billing rules as data, not spreadsheet formulas. Each rule is "when <conditions> then <action>".
   Price rules change the unit price of a request; hold rules keep a line out of the FBS upload until someone looks.
   Every priced line carries a trace of the rules that touched it. Pure functions; used by desk.js and tests/rules.test.js. */
(function (root) {
  'use strict';

  function r2(n) { return Math.round(n * 100) / 100; }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[$,\s]/g, '')); return isFinite(n) ? n : 0; }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }
  function money(n) { return '$' + (Math.round(n * 100) % 100 ? n.toFixed(2) : String(Math.round(n))); }

  var FIELDS = {
    lab: { label: 'lab', kind: 'lab' },
    labType: { label: 'customer type', kind: 'enum', options: ['academic', 'industry'] },
    user: { label: 'requester', kind: 'text' },
    sku: { label: 'SKU', kind: 'text' },
    service: { label: 'service name', kind: 'text' },
    qty: { label: 'quantity', kind: 'num' },
    qtyRatio: { label: 'quantity vs the usual (×)', kind: 'num' },
    amount: { label: 'line total ($)', kind: 'num' },
    onRoster: { label: 'requester is on the lab roster', kind: 'bool' },
    hasCharge: { label: 'worktag is on the line', kind: 'bool' },
    chargeOpen: { label: 'worktag is open on the service date', kind: 'bool' },
    inList: { label: 'SKU is in the price list', kind: 'bool' }
  };
  var OPS = { is: 'is', isnt: 'is not', contains: 'contains', gte: 'is at least', lte: 'is at most' };
  var OPS_FOR = { text: ['is', 'isnt', 'contains'], lab: ['is', 'isnt', 'contains'], 'enum': ['is', 'isnt'], num: ['gte', 'lte'], bool: ['is'] };
  var ACTIONS = {
    markup_pct: { label: 'add', unit: '%', kind: 'price' },
    discount_pct: { label: 'take off', unit: '%', kind: 'price' },
    minus: { label: 'take off', unit: '$ per unit', kind: 'price' },
    set_price: { label: 'set the unit price to', unit: '$', kind: 'price' },
    hold: { label: 'hold the line for a look', unit: '', kind: 'hold' }
  };

  function test(c, f) {
    var def = FIELDS[c.field]; if (!def) return false;
    var v = f[c.field];
    if (def.kind === 'bool') return !!v === (String(c.value) === 'yes' || c.value === true);
    if (def.kind === 'num') { var n = num(c.value); return c.op === 'lte' ? v <= n : v >= n; }
    var a = String(v == null ? '' : v).toLowerCase(), b = String(c.value == null ? '' : c.value).toLowerCase().trim();
    if (!b) return false;
    if (c.op === 'contains') return a.indexOf(b) >= 0;
    return c.op === 'isnt' ? a !== b : a === b;
  }
  function matches(rule, f) { return !!(rule.when && rule.when.length) && rule.when.every(function (c) { return test(c, f); }); }

  // Plain-words sentence for a rule (used in the UI and in exported audit trails).
  function sentence(rule) {
    var w = (rule.when || []).map(function (c) {
      var d = FIELDS[c.field] || { label: c.field, kind: 'text' };
      if (d.kind === 'bool') return (String(c.value) === 'yes' ? '' : 'not: ') + d.label;
      return d.label + ' ' + (OPS[c.op] || c.op) + ' ' + c.value;
    }).join(' and ');
    var a = ACTIONS[rule.then.type] || { label: rule.then.type, unit: '' }, t = rule.then;
    var act = t.type === 'hold' ? a.label : t.type === 'markup_pct' || t.type === 'discount_pct' ? a.label + ' ' + num(t.value) + '%' : a.label + ' ' + money(num(t.value)) + (t.type === 'minus' ? ' per unit' : '');
    return 'When ' + (w || '(no condition yet)') + ', ' + act + '.';
  }

  // Why a hold fired, in the manager's words, with a one-click fix when there is an obvious one.
  function explain(rule, f, ctx) {
    var fields = (rule.when || []).map(function (c) { return c.field; }), r = f.req;
    if (fields.indexOf('onRoster') >= 0 && !f.onRoster) {
      var home = (ctx.labs || []).filter(function (L) { return (L.members || []).indexOf(r.user) >= 0; });
      if (home.length) return { why: r.user + ' is on the ' + home.map(function (L) { return L.name; }).join(' / ') + ' roster, not ' + (r.lab || '(no lab)') + (similar(home[0].name, r.lab) ? '. Two labs with a similar name.' : ''), fix: { set: { lab: home[0].name, charge: home[0].charge || '' }, label: 'Move to ' + home[0].name } };
      return { why: r.user + ' is not on the ' + (r.lab || '(no lab)') + ' roster', fix: f.labObj ? { roster: { lab: f.labObj.name, user: r.user }, label: 'Add ' + r.user + ' to the roster' } : null };
    }
    if (fields.indexOf('qtyRatio') >= 0) return { why: 'Quantity ' + f.qty + ' is ' + Math.round(f.qtyRatio) + '× the usual ' + f.usual + ' for this service. Typo?', fix: { set: { qty: f.usual }, label: 'Change to ' + f.usual } };
    if (fields.indexOf('hasCharge') >= 0 && !f.hasCharge) return { hard: true, why: 'No worktag on the line', fix: f.labObj && f.labObj.charge ? { set: { charge: f.labObj.charge }, label: 'Use the worktag on file for ' + f.labObj.name } : null };
    if (fields.indexOf('chargeOpen') >= 0 && !f.chargeOpen) return { why: 'Worktag ended ' + f.labObj.ends + ', before this service date. Ask the lab for a new one.', fix: null };
    if (fields.indexOf('inList') >= 0 && !f.inList) {
      var near = (ctx.list || []).filter(function (p) { return r.sku && (String(r.sku).indexOf(p.sku) === 0 || p.sku.indexOf(String(r.sku)) === 0); })[0];
      return { hard: true, why: 'SKU ' + (r.sku || '(blank)') + ' is not in the price list', fix: near ? { set: { sku: near.sku }, label: 'Change to ' + near.sku + ' (' + near.name + ')' } : null };
    }
    return { why: rule.name || sentence(rule), fix: null };
  }
  function surname(lab) { var s = String(lab || '').replace(/\s+lab$/i, '').trim().split(/[\s,]+/).filter(Boolean); return (/,/.test(lab) ? s[0] : s[s.length - 1] || '').toLowerCase(); }
  function similar(a, b) { return !!a && !!b && a !== b && surname(a) === surname(b); }

  // requests: [{ id, date, user, lab, sku, qty, charge, status, ok }]
  // ctx: { list: [{sku, name, academic}], labs: [{name, type, charge, ends, members}] }
  function apply(requests, rules, ctx) {
    ctx = ctx || {};
    var bySku = {}; (ctx.list || []).forEach(function (p) { bySku[String(p.sku)] = p; });
    var byLab = {}; (ctx.labs || []).forEach(function (L) { byLab[L.name] = L; });
    var qtys = {}; requests.forEach(function (r) { (qtys[r.sku] = qtys[r.sku] || []).push(num(r.qty)); });
    var on = (rules || []).filter(function (x) { return x.on !== false; });
    var price = on.filter(function (x) { return (ACTIONS[x.then.type] || {}).kind === 'price'; });
    var holdRules = on.filter(function (x) { return x.then.type === 'hold'; });
    var stats = {}; (rules || []).forEach(function (x) { stats[x.id] = { n: 0, delta: 0 }; });

    var lines = requests.map(function (r) {
      var p = bySku[String(r.sku)], L = byLab[r.lab], qty = num(r.qty), usual = Math.max(median(qtys[r.sku] || []), 1);
      var base = p ? num(p.academic) : 0, unit = base, trace = [];
      var f = { req: r, labObj: L, lab: r.lab, labType: L ? L.type || 'academic' : 'academic', user: r.user, sku: r.sku, service: p ? p.name : r.desc || '',
        qty: qty, usual: usual, qtyRatio: qty / usual, amount: r2(base * qty),
        onRoster: !!(L && (L.members || []).indexOf(r.user) >= 0), hasCharge: !!r.charge,
        chargeOpen: !(L && L.ends && r.date && String(r.date) > String(L.ends)), inList: !!p };
      price.forEach(function (x) {
        if (!matches(x, f)) return;
        var before = unit, v = num(x.then.value);
        if (x.then.type === 'markup_pct') unit = unit * (1 + v / 100);
        else if (x.then.type === 'discount_pct') unit = unit * (1 - Math.min(v, 100) / 100);
        else if (x.then.type === 'minus') unit = Math.max(0, unit - v);
        else if (x.then.type === 'set_price') unit = Math.max(0, v);
        unit = r2(unit);
        trace.push({ id: x.id, name: x.name, text: money(before) + ' → ' + money(unit) });
        stats[x.id].n++; stats[x.id].delta += (unit - before) * qty;
      });
      f.amount = r2(unit * qty);
      var holds = [];
      holdRules.forEach(function (x) {
        if (!matches(x, f)) return;
        var e = explain(x, f, ctx);
        holds.push({ id: x.id, name: x.name, why: e.why, fix: e.fix, hard: !!e.hard });
        stats[x.id].n++; stats[x.id].delta += f.amount;
      });
      // A line with no price or no worktag cannot be uploaded at all, so it cannot be approved as is.
      var hard = holds.some(function (h) { return h.hard; });
      return { req: r, service: f.service, base: base, unit: unit, qty: qty, amount: f.amount, trace: trace, holds: holds, held: holds.length > 0 && (!r.ok || hard), approved: holds.length > 0 && !!r.ok && !hard };
    });
    Object.keys(stats).forEach(function (k) { stats[k].delta = r2(stats[k].delta); });
    var sumIf = function (fn) { return r2(lines.reduce(function (a, l) { return a + (fn(l) ? l.amount : 0); }, 0)); };
    var labs = {}; lines.forEach(function (l) { if (!l.held) labs[l.req.lab || '?'] = r2((labs[l.req.lab || '?'] || 0) + l.amount); });
    return { lines: lines, stats: stats, total: sumIf(function () { return true; }), heldAmount: sumIf(function (l) { return l.held; }),
      held: lines.filter(function (l) { return l.held; }), byLab: labs };
  }

  function defaults() {
    return [
      { id: 'industry', name: 'Industry customers', on: true, when: [{ field: 'labType', op: 'is', value: 'industry' }], then: { type: 'markup_pct', value: 66 } },
      { id: 'ownflask', name: 'Ramirez Lab brings its own flasks', on: true, when: [{ field: 'lab', op: 'is', value: 'Ramirez Lab' }, { field: 'service', op: 'contains', value: 'T75 flask' }], then: { type: 'minus', value: 2.6 } },
      { id: 'roster', name: 'Requester must belong to the lab that pays', on: true, when: [{ field: 'onRoster', op: 'is', value: 'no' }], then: { type: 'hold' } },
      { id: 'qty', name: 'Quantity far above the usual', on: true, when: [{ field: 'qty', op: 'gte', value: 5 }, { field: 'qtyRatio', op: 'gte', value: 5 }], then: { type: 'hold' } },
      { id: 'nocharge', name: 'No worktag', on: true, when: [{ field: 'hasCharge', op: 'is', value: 'no' }], then: { type: 'hold' } },
      { id: 'ended', name: 'Worktag already ended', on: true, when: [{ field: 'chargeOpen', op: 'is', value: 'no' }], then: { type: 'hold' } },
      { id: 'sku', name: 'Unknown SKU', on: true, when: [{ field: 'inList', op: 'is', value: 'no' }], then: { type: 'hold' } }
    ];
  }

  function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  // Synthetic cell culture core: labs, rosters and one month of requests sized to the yearly volumes in the price model.
  // Six mistakes are planted (the kinds a core manager described): wrong lab with a shared surname, 12 for 1,
  // a mistyped SKU, a missing worktag, and two requests on a worktag that had already ended.
  function sampleDesk(priced, month) {
    month = month || '2026-10';
    var rand = rng(7), pick = function (a) { return a[Math.floor(rand() * a.length)]; };
    var labs = [
      { name: 'Okafor Lab', type: 'academic', charge: 'USC.CA100101.GR2000101', ends: '', members: ['Ada Brooks', 'Tomas Reyes', 'Ivy Park'] },
      { name: 'Chen, L. Lab', type: 'academic', charge: 'USC.CA100102.GR2000102', ends: '', members: ['Mei Lin', 'Noah Price', 'Sara Haddad'] },
      { name: 'Chen, W. Lab', type: 'academic', charge: 'USC.CA100103.GR2000103', ends: '', members: ['Owen Hart', 'Lina Moreau'] },
      { name: 'Ramirez Lab', type: 'academic', charge: 'USC.CA100104.GR2000104', ends: '', members: ['Kofi Mensah', 'Elena Rossi', 'Jun Mori'] },
      { name: 'Patel Lab', type: 'academic', charge: 'USC.CA100105.GR2000105', ends: '', members: ['Grace Kim', 'Ravi Shah'] },
      { name: 'Nguyen Lab', type: 'academic', charge: 'USC.CA100106.GR2000106', ends: '', members: ['Hana Sato', 'Leo Novak', 'Maya Ortiz'] },
      { name: 'Abara Lab', type: 'academic', charge: 'USC.CA100107.GR2000107', ends: month + '-28', members: ['Dev Anand', 'Zoe Fischer'] },
      { name: 'Helix Bio', type: 'industry', charge: 'EXT.HELIX.PO-4471', ends: '', members: ['Pia Lund', 'Marco Diaz'] }
    ];
    var rows = (priced && priced.rows) || [], bag = [];
    rows.forEach(function (r) { var n = Math.max(1, Math.round(r.volume / 12)); for (var i = 0; i < n; i++) bag.push(r.sku); });
    for (var i = bag.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = bag[i]; bag[i] = bag[j]; bag[j] = t; }
    var weights = [5, 5, 3, 5, 4, 5, 2, 2], wl = [];
    labs.forEach(function (L, k) { for (var n = 0; n < weights[k]; n++) wl.push(L); });
    var reqs = bag.map(function (sku) {
      var L = pick(wl), d = 1 + Math.floor(rand() * (L.ends ? 27 : 30));
      return { date: month + '-' + (d < 10 ? '0' : '') + d, user: pick(L.members), lab: L.name, sku: sku, qty: 1, charge: L.charge, status: 'delivered' };
    });
    reqs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var at = function (frac) { return reqs[Math.floor(reqs.length * frac)]; };
    var m1 = at(0.21); m1.user = 'Mei Lin'; m1.lab = 'Chen, W. Lab'; m1.charge = labs[2].charge; m1.sku = '261';
    var m2 = at(0.4); m2.user = 'Grace Kim'; m2.lab = 'Patel Lab'; m2.charge = labs[4].charge; m2.sku = '262'; m2.qty = 12;
    var m3 = at(0.63); m3.user = 'Hana Sato'; m3.lab = 'Nguyen Lab'; m3.charge = labs[5].charge; m3.sku = '2610';
    var m4 = at(0.8); m4.user = 'Ada Brooks'; m4.lab = 'Okafor Lab'; m4.sku = '330'; m4.charge = '';
    reqs.push({ date: month + '-29', user: 'Dev Anand', lab: 'Abara Lab', sku: '201', qty: 1, charge: labs[6].charge, status: 'delivered' });
    reqs.push({ date: month + '-30', user: 'Zoe Fischer', lab: 'Abara Lab', sku: '340', qty: 1, charge: labs[6].charge, status: 'delivered' });
    var next = month.slice(0, 5) + ('0' + (+month.slice(5) % 12 + 1)).slice(-2);
    if (+month.slice(5) === 12) next = (+month.slice(0, 4) + 1) + '-01';
    reqs.push({ date: next + '-02', user: 'Ivy Park', lab: 'Okafor Lab', sku: '310', qty: 1, charge: labs[0].charge, status: 'in progress' });
    reqs.push({ date: next + '-03', user: 'Jun Mori', lab: 'Ramirez Lab', sku: '201', qty: 2, charge: labs[3].charge, status: 'in progress' });
    reqs.push({ date: next + '-03', user: 'Pia Lund', lab: 'Helix Bio', sku: '311', qty: 1, charge: labs[7].charge, status: 'new' });
    reqs.forEach(function (r, k) { r.id = 'R' + (1001 + k); });
    return { labs: labs, requests: reqs, rules: defaults(), seq: 1001 + reqs.length, month: month };
  }

  var API = { FIELDS: FIELDS, OPS: OPS, OPS_FOR: OPS_FOR, ACTIONS: ACTIONS, apply: apply, matches: matches, sentence: sentence, defaults: defaults, sampleDesk: sampleDesk };
  root.LBRules = API;
  if (typeof module !== 'undefined') { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
