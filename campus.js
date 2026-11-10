/* LBCampus: the research office's view. Each core sends one small month summary (a JSON file today; no live feed yet).
   This module normalizes summaries, rolls them up and lists what needs attention. Pure functions;
   used by desk.js and tests/campus.test.js. */
(function (root) {
  'use strict';

  function n(v) { v = +v; return isFinite(v) ? v : 0; }
  function r0(v) { return Math.round(v); }
  function usd(v) { return (v < 0 ? '−$' : '$') + Math.abs(Math.round(v)).toLocaleString('en-US'); }

  // One core, one month. cost = that month's share of the core's yearly cost pool; target = % of cost the core is
  // expected to recover from users (100 unless the university subsidizes it).
  function summary(o) {
    o = o || {};
    var labs = {}; Object.keys(o.labs || {}).forEach(function (k) { if (n(o.labs[k])) labs[String(k)] = Math.round(n(o.labs[k]) * 100) / 100; });
    return { v: 1, core: String(o.core || 'Unnamed core'), kind: o.kind === 'hourly' ? 'hourly' : 'services', month: String(o.month || ''),
      billed: n(o.billed), cost: n(o.cost), target: o.target == null ? 100 : n(o.target),
      lines: r0(n(o.lines)), held: r0(n(o.held)), heldAmount: n(o.heldAmount), corrected: n(o.corrected),
      bookedH: n(o.bookedH), measuredH: n(o.measuredH),
      instruments: (o.instruments || []).map(function (i) { return { name: String(i.name || ''), util: Math.max(0, n(i.util)), contract: n(i.contract) }; }),
      labs: labs, source: String(o.source || 'file') };
  }

  function parse(text) {
    var j; try { j = JSON.parse(text); } catch (e) { throw new Error('That file is not a LaBro core summary (not JSON).'); }
    var list = Array.isArray(j) ? j : [j];
    list.forEach(function (s) { if (!s || typeof s !== 'object' || !s.core || s.billed == null) throw new Error('That file is not a LaBro core summary (needs "core" and "billed").'); });
    return list.map(function (s) { var x = summary(s); x.source = 'file'; return x; });
  }

  function rollup(list, opts) {
    opts = opts || {};
    var idleAt = opts.idleAt == null ? 0.15 : opts.idleAt, fullAt = opts.fullAt == null ? 0.85 : opts.fullAt;
    var T = { billed: 0, cost: 0, bookedH: 0, measuredH: 0, lines: 0, held: 0, heldAmount: 0, corrected: 0, expected: 0 };
    var flags = [], labs = {}, idle = [], full = [], count = 0;
    var cores = list.map(function (s) {
      var rec = s.cost > 0 ? s.billed / s.cost * 100 : null, expected = s.cost * s.target / 100, gap = s.billed - expected;
      var hoursGap = s.bookedH > 0 ? (s.measuredH - s.bookedH) / s.bookedH * 100 : null;
      T.billed += s.billed; T.cost += s.cost; T.bookedH += s.bookedH; T.measuredH += s.measuredH; T.lines += s.lines; T.held += s.held; T.heldAmount += s.heldAmount; T.corrected += s.corrected; T.expected += expected;
      Object.keys(s.labs).forEach(function (k) { var L = labs[k] || (labs[k] = { lab: k, total: 0, cores: {} }); L.total += s.labs[k]; L.cores[s.core] = (L.cores[s.core] || 0) + s.labs[k]; });
      s.instruments.forEach(function (i) { count++; if (i.util < idleAt) idle.push({ core: s.core, name: i.name, util: i.util, contract: i.contract }); else if (i.util > fullAt) full.push({ core: s.core, name: i.name, util: i.util }); });
      var status = rec == null ? 'none' : rec < s.target - 10 ? 'under' : rec > Math.max(s.target, 100) + 5 ? 'over' : 'ok';
      if (status === 'under') flags.push({ sev: 'high', core: s.core, amount: -gap, text: 'Recovered ' + r0(rec) + '% of cost against a ' + r0(s.target) + '% target: ' + usd(-gap) + ' short this month. The university covers it or next year\'s rate rises.' });
      if (status === 'over') flags.push({ sev: 'medium', core: s.core, amount: gap, text: 'Recovered ' + r0(rec) + '% of cost. A surplus has to come off next year\'s rate (2 CFR 200.468).' });
      if (hoursGap != null && Math.abs(hoursGap) >= 15) flags.push({ sev: 'medium', core: s.core, amount: 0, text: 'FBS shows ' + r0(s.bookedH) + ' booked hours; ' + r0(s.measuredH) + ' were measured (' + (hoursGap > 0 ? '+' : '−') + Math.abs(r0(hoursGap)) + '%). A rate built on bookings is off by about that much.' });
      if (s.lines > 0 && s.held / s.lines >= 0.05) flags.push({ sev: 'low', core: s.core, amount: s.heldAmount, text: s.held + ' of ' + s.lines + ' lines held before upload (' + usd(s.heldAmount) + ').' });
      return { s: s, recovery: rec, expected: expected, gap: gap, hoursGap: hoursGap, status: status };
    });
    idle.sort(function (a, b) { return b.contract - a.contract; });
    idle.forEach(function (i) { if (i.contract > 0) flags.push({ sev: 'medium', core: i.core, amount: i.contract, text: i.name + ' ran ' + r0(i.util * 100) + '% of staffed hours and carries a ' + usd(i.contract) + ' / yr service contract.' }); });
    (opts.expectedCores || []).forEach(function (name) { if (!list.some(function (s) { return s.core === name; })) flags.push({ sev: 'low', core: name, amount: 0, text: 'No summary received for this month.' }); });
    var order = { high: 0, medium: 1, low: 2 };
    flags.sort(function (a, b) { return order[a.sev] - order[b.sev] || b.amount - a.amount; });
    var labList = Object.keys(labs).map(function (k) { var L = labs[k]; L.n = Object.keys(L.cores).length; return L; }).sort(function (a, b) { return b.total - a.total; });
    return { cores: cores, totals: T, recovery: T.cost > 0 ? T.billed / T.cost * 100 : null, support: T.cost - T.billed, planned: T.cost - T.expected,
      hoursGap: T.bookedH > 0 ? (T.measuredH - T.bookedH) / T.bookedH * 100 : null, flags: flags, labs: labList, idle: idle, full: full, instruments: count };
  }

  // Simulated peer cores so the campus view has more than the cores open in this browser. Fixed numbers, all invented.
  function samplePeers(month) {
    var S = function (o) { o.month = month; o.source = 'simulated'; return summary(o); };
    return [
      S({ core: 'Flow cytometry core', kind: 'hourly', billed: 38400, cost: 41800, target: 100, lines: 412, held: 9, heldAmount: 1310, corrected: 880, bookedH: 1180, measuredH: 1065,
        instruments: [{ name: 'Cell sorter A', util: 0.71, contract: 62000 }, { name: 'Cell sorter B', util: 0.11, contract: 58000 }, { name: 'Spectral analyzer', util: 0.9, contract: 41000 }, { name: 'Benchtop analyzer', util: 0.44, contract: 18000 }],
        labs: { 'Okafor Lab': 6200, 'Nguyen Lab': 9100, 'Patel Lab': 4300, 'Ramirez Lab': 7800, 'Ruiz Lab': 11000 } }),
      S({ core: 'Genomics core', kind: 'services', billed: 96500, cost: 91000, target: 100, lines: 265, held: 4, heldAmount: 2900, corrected: 1450, bookedH: 0, measuredH: 0,
        instruments: [{ name: 'Short-read sequencer', util: 0.88, contract: 96000 }, { name: 'Long-read sequencer', util: 0.36, contract: 74000 }, { name: 'Fragment analyzer', util: 0.52, contract: 9000 }],
        labs: { 'Chen, L. Lab': 21400, 'Okafor Lab': 18800, 'Abara Lab': 12600, 'Ruiz Lab': 30200, 'Helix Bio': 13500 } }),
      S({ core: 'Mass spectrometry core', kind: 'hourly', billed: 27900, cost: 44200, target: 100, lines: 148, held: 11, heldAmount: 3050, corrected: 610, bookedH: 640, measuredH: 498,
        instruments: [{ name: 'Orbitrap MS', util: 0.58, contract: 88000 }, { name: 'Triple-quad MS', util: 0.09, contract: 52000 }, { name: 'MALDI-TOF', util: 0.22, contract: 24000 }],
        labs: { 'Patel Lab': 8900, 'Chen, W. Lab': 6400, 'Ramirez Lab': 5100, 'Ruiz Lab': 7500 } }),
      S({ core: 'Nanofab cleanroom', kind: 'hourly', billed: 52300, cost: 54000, target: 100, lines: 530, held: 6, heldAmount: 720, corrected: 300, bookedH: 1510, measuredH: 1462,
        instruments: [{ name: 'E-beam writer', util: 0.93, contract: 120000 }, { name: 'Mask aligner', util: 0.47, contract: 15000 }, { name: 'ALD system', util: 0.31, contract: 22000 }, { name: 'SEM', util: 0.66, contract: 35000 }],
        labs: { 'Nguyen Lab': 14800, 'Abara Lab': 9900, 'Helix Bio': 16200, 'Harlow Lab': 11400 } })
    ];
  }

  var API = { summary: summary, parse: parse, rollup: rollup, samplePeers: samplePeers, usd: usd };
  root.LBCampus = API;
  if (typeof module !== 'undefined') { module.exports = API; }
})(typeof window !== 'undefined' ? window : globalThis);
