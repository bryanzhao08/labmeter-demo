"use strict";
/* LaBro Close: month-end close for a shared-instrument core. Uses the LMAuditCore engine (audit.js)
   for parsing + reconciliation and LBRates (rates.js) for recharge-rate checks. All in the browser. */
(function () {
  var C = window.LMAuditCore, RT = window.LBRates;
  var app = document.getElementById("app"), modal = document.getElementById("modal"), mbody = document.getElementById("mbody");
  var DKEY = "labro-close-decisions-v1";
  var STORE = load(DKEY, {}); if (typeof STORE !== "object" || Array.isArray(STORE)) STORE = {};
  var S = { B: null, A: null, L: null, filter: "action", dec: {}, fp: null, pi: "", loaded: false };
  var STATIC = /[?&]static/.test(location.search);

  function load(k, d) { try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  var usd2 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  function $(n) { return usd.format(Math.round(n)); }
  function $2(n) { return usd2.format(n); }
  function h1(m) { return (m / 60).toFixed(1); }
  function rate(res) { return +C.rules().rates[res] || 0; }
  function sum(a, f) { return a.reduce(function (s, x) { return s + f(x); }, 0); }

  // ---------- data
  // Decisions belong to one exact set of files + column/instrument mappings; change anything and they reset.
  function fingerprint() {
    return ["res", "use", "run"].map(function (k) { var f = C.state.files[k]; return f ? f.name + ":" + f.rows.length + ":" + JSON.stringify(f.map) : "-"; }).join("|") + "|" + JSON.stringify(C.state.amap);
  }
  function saveDec() { if (!S.fp) return; STORE[S.fp] = S.dec; var keys = Object.keys(STORE); while (keys.length > 8) delete STORE[keys.shift()]; save(DKEY, STORE); }
  function compute() {
    S.B = C.build(); C.ensureRates(S.B);
    var fp = fingerprint(); if (fp !== S.fp) { S.fp = fp; S.dec = STORE[fp] || {}; }
    S.A = C.audit(S.B, "instrument"); S.L = C.audit(S.B, "computer");
  }
  function decided(r) { return S.dec[r.key]; }
  // What actually gets billed for a line, after the manager's decision.
  function eff(r) {
    var d = S.dec[r.key], rt = rate(r.res);
    if (d === "zero") return { charge: 0, penalty: 0, mins: 0, why: "Not billed (manager decision)" };
    if (d === "booked") return { charge: r.booked / 60 * rt, penalty: 0, mins: r.booked, why: "Billed booked time (manager decision)" };
    if (d === "waive") return { charge: r.charge - r.penalty, penalty: 0, mins: r.billed, why: (r.notes.join("; ") || "As booked") + "; penalty waived" };
    return { charge: r.charge, penalty: r.penalty, mins: r.billed, why: r.notes.join("; ") || "As booked" };
  }
  function finalCharge(r) {
    var d = S.dec[r.key];
    if (d === "waive") return r.charge - r.penalty;
    if (d === "booked") return r.booked / 60 * rate(r.res);
    if (d === "zero") return 0;
    return r.charge;
  }
  function totals() {
    var rows = S.A.rows;
    return {
      booked: sum(rows, function (r) { return r.booked / 60 * rate(r.res); }),
      login: sum(S.L.rows, function (r) { return r.charge - r.penalty; }),
      actual: sum(rows, function (r) { return r.charge - r.penalty; }),
      final: sum(rows, finalCharge),
      penalties: sum(rows, function (r) { return r.penalty; }),
      flagged: rows.filter(C.needsAction).length,
      open: rows.filter(function (r) { return C.needsAction(r) && !decided(r); }).length,
      hrs: { booked: sum(rows, function (r) { return r.booked; }), login: sum(rows, function (r) { return r.comp; }), run: sum(rows, function (r) { return r.inst; }) }
    };
  }
  function month() { var r = S.A.rows[0]; return r ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(r.day * 86400000)) : ""; }

  // ---------- views
  function viewClose() {
    var T = totals(), mx = Math.max(T.booked, T.login, T.actual) || 1, noRuns = !C.state.files.run, R = C.rules();
    var files = ["res", "use", "run"].map(function (k) {
      var f = C.state.files[k], s = C.SRC[k];
      return '<label class="drop" data-drop="' + k + '"><div class="k">' + esc(s.label) + (s.optional ? " · optional" : "") + '</div>' +
        '<div class="n">' + (f ? '<span class="ok">✓</span> ' + esc(f.name) : "Drop a CSV here") + '</div>' +
        '<div class="muted small">' + (f ? f.rows.length + " rows · " + esc(s.hint) : esc(s.hint)) + '</div><input type="file" accept=".csv,.tsv,.txt" data-file="' + k + '" aria-label="Upload ' + esc(s.label) + '"></label>';
    }).join("");
    var bar = function (lbl, v, col, note) { return '<div class="bar"><span>' + lbl + '</span><span class="t"><i style="width:' + (v / mx * 100).toFixed(1) + '%;background:' + col + '"></i></span><span class="num">' + $(v) + '</span></div>' + (note ? '<div class="muted small" style="margin:-4px 0 4px 162px">' + note + '</div>' : ""); };
    var gap = Math.abs(T.login - T.booked);
    return '' +
      '<p class="muted small" style="margin:0 0 6px">' + esc(month()) + ' · one imaging core · 5 instruments · ' + S.A.rows.length + ' user-days</p>' +
      '<h1>Same month, same core: bookings say ' + $(T.booked) + ', logins say ' + $(T.login) + '.</h1>' +
      '<p class="lede">That ' + $(gap) + ' gap is what a core manager reconciles by hand every month, line by line, before charges go to the labs. LaBro does it in one pass, gives every charge a reason, and leaves only the lines that need a human decision.</p>' +
      '<div class="card"><div class="bars">' +
      bar("By booking", T.booked, "var(--book)", "What FBS charges if you bill reserved time.") +
      bar("By PC login", T.login, "var(--login)", "Includes time spent copying data after the instrument stopped.") +
      (noRuns ? "" : bar("By actual run", T.actual, "var(--run)", "Instrument-on time from LaBro sensors, inside each user's session.")) +
      '</div><p class="muted small" style="margin:12px 0 0">Hours: booked ' + h1(T.hrs.booked) + ' h · logged in ' + h1(T.hrs.login) + ' h' + (noRuns ? "" : ' · instrument running ' + h1(T.hrs.run) + ' h') + '. Your rules: overruns within ' + R.grace + ' min billed at actual, past that ' + R.mult + '× · unbooked use ' + R.mult + '× · ' + R.round + '-min increments · no-show fee ' + R.noshow + '%. <a href="overview.html#/audit">Edit rules and rates</a></p></div>' +
      '<section class="persona card" style="margin:22px 0"><div class="avatar" aria-hidden="true">D</div><div><h3>Dana runs this core</h3>' +
      '<div class="muted">Today: export reservations from FBS, pull login logs from five instrument PCs, line them up in a spreadsheet, and find overruns, walk-ups and forgotten logouts by eye, then answer PI emails disputing charges. With LaBro: drop the files below, decide ' + T.flagged + ' lines, send. <span class="small">(Dana is a composite persona.)</span></div></div></section>' +
      '<ol class="steps"><li class="done"><b>1</b>Add files</li><li class="' + (T.open ? "" : "done") + '"><b>2</b>Decide ' + T.flagged + ' flagged lines</li><li class="' + (T.open ? "" : "done") + '"><b>3</b>Send charges &amp; PI statements</li></ol>' +
      '<div class="grid g3">' + files + '</div>' +
      mapping() +
      '<div class="row" style="margin-top:10px"><button class="btn ghost small" data-act="sample">Sample month (FBS)</button><button class="btn ghost small" data-act="sample-ilab">Sample month (iLab layout)</button><button class="btn ghost small" data-act="nosensor">' + (noRuns ? "Add sensor runs back" : "Try without sensors") + '</button><span class="muted small">Your files stay in this browser.</span></div>' +
      '<div class="grid g4" style="margin-top:22px">' +
      stat(S.A.rows.length - T.flagged, "lines matched automatically") + stat(T.flagged, "lines need a decision") + stat(T.open, "still open", T.open ? "" : "hero") + stat($(T.final), "final charges, incl. " + $(sum(S.A.rows, function (r) { return eff(r).penalty; })) + " penalties", "hero") +
      '</div>' +
      '<h2 id="queue">Decide the flagged lines</h2>' +
      (T.open ? '<div class="row" style="margin-bottom:8px"><button class="btn" data-act="acceptall">Apply your rules to all ' + T.open + ' open lines</button><span class="muted small">Penalties as your policy says, no-show fees as set, runs with no one to bill set aside. Change any line after.</span></div>' : '<p class="ok" style="margin:0 0 8px">All flagged lines decided.</p>') +
      queue() +
      accountsSection() +
      '<h2>Send</h2>' + preview(T) +
      '<div class="grid g3" style="margin-top:14px">' +
      '<div class="card"><h3>Charges file for FBS</h3><p class="muted small">One line per user, instrument and day: hours, rate, charge and the reason. Map its columns once to your FBS import or journal template.</p><button class="btn" data-act="csv"' + (T.open ? " disabled" : "") + '>Download charges CSV</button>' + (T.open ? '<p class="small muted">Decide the open lines first.</p>' : "") + '</div>' +
      '<div class="card"><h3>PI statements</h3><p class="muted small">A printable statement per lab: every charge with booked, login and run time, and why.</p><select data-pi aria-label="Choose a PI">' + piOptions() + '</select> <button class="btn ghost" data-act="stmt">Open</button></div>' +
      '<div class="card"><h3>Evidence for a dispute</h3><p class="muted small">Click any line above: booking, login and instrument run on one strip, plus a reply you can paste to the PI.</p></div>' +
      '</div>';
  }
  // Column check: show what LaBro read from each file and let the user fix any guess.
  function mapping() {
    var B = S.B, bad = [], html = "";
    ["res", "use", "run"].forEach(function (k) {
      var f = C.state.files[k]; if (!f) return;
      var miss = C.SRC[k].fields.filter(function (fd) { return fd[3] && f.map[fd[0]] < 0; });
      var rowsBad = B.bad[k];
      if (miss.length || rowsBad || S.showMap) bad.push(k);
    });
    var um = (B.unmapped.use || []).concat(B.unmapped.run || []);
    if (!bad.length && !um.length) return '<p class="muted small" style="margin:8px 0 0">✓ Columns recognized in every file. <button class="linkb" data-act="showmap">Check the column mapping</button></p>';
    html += '<div class="card" style="margin-top:12px;border-color:var(--warn)"><h3>Check how LaBro read your files</h3>';
    bad.forEach(function (k) {
      var f = C.state.files[k];
      html += '<p class="small" style="margin:10px 0 4px"><b>' + esc(C.SRC[k].label) + '</b>' + (B.bad[k] ? ' · <span style="color:var(--warn)">' + B.bad[k] + ' rows could not be read</span>' : "") + '</p><div class="row">';
      C.SRC[k].fields.forEach(function (fd) {
        html += '<label class="small">' + esc(fd[1]) + (fd[3] ? " *" : "") + ' <select data-map="' + k + '" data-field="' + fd[0] + '"><option value="-1">—</option>' + f.head.map(function (h, i) { return '<option value="' + i + '"' + (f.map[fd[0]] === i ? " selected" : "") + '>' + esc(h) + '</option>'; }).join("") + '</select></label>';
      });
      html += '</div>';
    });
    if (um.length) html += '<p class="small" style="margin:12px 0 4px"><b>Computers or sensors not matched to an instrument</b></p><div class="row">' + um.map(function (n) {
      var k = (B.unmapped.use || []).indexOf(n) >= 0 ? "use" : "run";
      return '<label class="small">' + esc(n) + ' → <select data-amap="' + k + '" data-name="' + esc(n) + '"><option value="">skip</option>' + B.resources.map(function (r) { return '<option>' + esc(r) + '</option>'; }).join("") + '</select></label>';
    }).join("") + '</div>';
    return html + '</div>';
  }
  // Grant end dates: charges after an account ends get rejected or need a late cost transfer, so flag them before sending.
  function acctInfo() {
    var A = S.accts; if (!A) return null;
    var hi = function (re) { for (var i = 0; i < A.head.length; i++) if (re.test(A.head[i])) return i; return -1; };
    var ia = hi(/account|fund|chart|worktag/i), ie = hi(/end|expir/i), is = hi(/sponsor|agency|type/i);
    if (ia < 0 || ie < 0) return null;
    var m = {}; A.rows.forEach(function (r) { var d = Date.parse(String(r[ie]).trim()); if (!isNaN(d)) m[String(r[ia]).trim()] = { end: Math.floor(d / 86400000), sponsor: is >= 0 ? r[is] : "" }; });
    return m;
  }
  function accountsSection() {
    var M = acctInfo(), WIN = 30;
    var head = '<h2>Accounts to check before you send</h2>';
    var up = '<label class="btn ghost small" style="position:relative;overflow:hidden">Upload account end dates<input type="file" accept=".csv,.tsv,.txt" data-accts style="position:absolute;inset:0;opacity:0;cursor:pointer"></label>';
    if (!M) return head + '<div class="card"><p class="muted" style="margin-top:0">Add a list of accounts with end dates (any CSV with an account column and an end-date column) and LaBro flags charges to grants that have ended or end within ' + WIN + ' days.</p>' + up + '</div>';
    var last = Math.max.apply(null, S.A.rows.map(function (r) { return r.day; })), by = {};
    S.A.rows.forEach(function (r) {
      var a = M[r.acct], amt = finalCharge(r); if (!a || amt < 0.005) return;
      var g = by[r.acct] || (by[r.acct] = { acct: r.acct, pi: r.pi, end: a.end, sponsor: a.sponsor, after: 0, total: 0, n: 0 });
      g.total += amt; if (r.day > a.end) { g.after += amt; g.n++; }
    });
    var list = Object.keys(by).map(function (k) { return by[k]; }).filter(function (g) { return g.after > 0 || g.end - last <= WIN; }).sort(function (a, b) { return a.end - b.end; });
    if (!list.length) return head + '<p class="ok">No charges to accounts that have ended or end within ' + WIN + ' days.</p>';
    return head + list.map(function (g) {
      var ended = g.end < last, sev = g.after > 0 ? "high" : "medium";
      return '<div class="find"><span class="sev ' + sev + '">' + (g.after > 0 ? "ended" : "ends soon") + '</span><div><b>' + esc(g.pi) + ' lab · ' + esc(g.acct) + '</b> ' + (g.sponsor ? '<span class="muted">(' + esc(g.sponsor) + ')</span> ' : "") + '· ends ' + esc(C.isoDay(g.end)) +
        (g.after > 0 ? '<div>' + $2(g.after) + ' across ' + g.n + ' lines was used <b>after</b> the end date. Move these to another account before sending, or they will need a late cost transfer.</div>' : '<div>' + (ended ? "Ended" : "Ends") + ' ' + Math.abs(g.end - last) + ' days ' + (ended ? "before" : "after") + ' this month closes. ' + $2(g.total) + ' this month. Remind the PI to name a new account for next month.</div>') + '</div></div>';
    }).join("") + '<div style="margin-top:8px">' + up + ' <span class="muted small">Sample end dates are synthetic.</span></div>';
  }
  function preview(T) {
    var rows = S.A.rows.filter(function (r) { return finalCharge(r) > 0.004; });
    var byPi = {}; rows.forEach(function (r) { var k = r.pi || "?"; byPi[k] = (byPi[k] || 0) + finalCharge(r); });
    var pis = Object.keys(byPi).sort(function (a, b) { return byPi[b] - byPi[a]; });
    return '<div class="grid g3"><div class="card" style="grid-column:span 2"><h3>What goes back to FBS</h3><div class="tw"><table><thead><tr><th>Date</th><th>User</th><th>Instrument</th><th class="n">Billed</th><th class="n">Charge</th><th>Reason</th></tr></thead><tbody>' +
      rows.slice(0, 6).map(function (r) { return '<tr><td>' + esc(C.isoDay(r.day)) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.res.split(" ").slice(0, 2).join(" ")) + '</td><td class="n">' + h1(eff(r).mins) + ' h</td><td class="n">' + $2(finalCharge(r)) + '</td><td class="small muted">' + esc(eff(r).why.slice(0, 46)) + '</td></tr>'; }).join("") +
      '</tbody></table></div><p class="muted small" style="margin:8px 0 0">' + rows.length + ' lines · ' + $2(sum(rows, finalCharge)) + '</p></div>' +
      '<div class="card"><h3>By lab</h3>' + pis.map(function (p) { return '<div class="row" style="justify-content:space-between"><span>' + esc(p) + ' lab</span><b>' + $(byPi[p]) + '</b></div>'; }).join("") + '</div></div>';
  }
  function stat(v, l, cls) { return '<div class="card stat ' + (cls || "") + '"><div class="v">' + v + '</div><div class="l">' + l + '</div></div>'; }
  function piOptions() {
    var pis = {}; S.A.rows.forEach(function (r) { if (r.pi) pis[r.pi] = 1; });
    return Object.keys(pis).sort().map(function (p) { return '<option' + (p === S.pi ? " selected" : "") + '>' + esc(p) + '</option>'; }).join("");
  }
  var SUGGEST = { nouser: "zero", unbooked: "measured", penalty: "measured", noshow: "measured" };
  function queue() {
    var rows = S.A.rows.filter(function (r) {
      if (S.filter === "action") return C.needsAction(r);
      if (S.filter === "all") return true;
      return r.status === S.filter;
    });
    var counts = {}; S.A.rows.forEach(function (r) { counts[r.status] = (counts[r.status] || 0) + 1; });
    var chips = [["action", "Needs a decision", S.A.rows.filter(C.needsAction).length]].concat(Object.keys(C.STATUS).filter(function (k) { return counts[k]; }).map(function (k) { return [k, C.STATUS[k][0], counts[k]]; })).concat([["all", "All lines", S.A.rows.length]]);
    var html = '<div class="filters" role="group" aria-label="Filter lines">' + chips.map(function (c) { return '<button class="chip" data-filter="' + c[0] + '" aria-pressed="' + (S.filter === c[0]) + '">' + esc(c[1]) + ' · ' + c[2] + '</button>'; }).join("") + '</div>';
    var shown = rows.slice(0, S.more ? 400 : 15);
    html += '<div class="q">' + shown.map(function (r) {
      var st = C.STATUS[r.status], d = S.dec[r.key], act = C.needsAction(r);
      var opts = act ? '<select data-dec="' + esc(r.key) + '" aria-label="Decision">' +
        [["", "Decide…"], ["measured", "Bill as measured" + (r.penalty ? " + penalty" : "")], ["waive", "Waive penalty"], ["booked", "Bill booked time"], ["zero", "Don't bill"]]
          .map(function (o) { return '<option value="' + o[0] + '"' + ((d || "") === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select>' : '<span class="muted small">auto</span>';
      return '<div class="qi' + (d ? " decided" : "") + (r.flags.penalty ? " pen" : "") + '" data-row="' + esc(r.key) + '" tabindex="0" role="button" aria-label="Open evidence for ' + esc(r.name) + '">' +
        '<div class="small muted">' + esc(C.dayLabel(r.day)) + '</div>' +
        '<div><div class="who">' + esc(r.name) + '</div><div class="small muted">' + esc(r.res) + '</div></div>' +
        '<div><span class="tag ' + st[1] + '">' + esc(st[0]) + '</span><div class="why">' + esc(r.notes.join(" · ") || "Booking, login and run agree") + '</div></div>' +
        '<div class="amt">' + $2(finalCharge(r)) + (eff(r).penalty ? '<div class="small muted">incl. ' + $2(eff(r).penalty) + ' penalty</div>' : "") + '</div>' +
        '<div class="noclick">' + opts + '</div></div>';
    }).join("") + '</div>';
    if (rows.length > shown.length) html += '<div class="row" style="margin-top:8px"><button class="btn ghost small" data-act="more">Show all ' + rows.length + ' lines</button><span class="muted small">The CSV has all of them.</span></div>';
    return html;
  }

  // ---------- evidence timeline
  function strip(r) {
    var all = r.bk.concat(r.ss, r.rn); if (!all.length) return "";
    var lo = Math.min.apply(null, all.map(function (x) { return x[0]; })) - 30, hi = Math.max.apply(null, all.map(function (x) { return x[1]; })) + 30;
    lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
    var W = 760, L = 110, X = function (m) { return L + (m - lo) / (hi - lo) * (W - L - 10); };
    var lanes = [["Booked", r.bk, "var(--book)"], ["PC login", r.ss, "var(--login)"], ["Instrument ran", r.rn, "var(--run)"]];
    var svg = '<svg class="tl" viewBox="0 0 ' + W + ' 150" role="img" aria-label="Timeline of booking, login and instrument run">';
    for (var t = lo; t <= hi; t += 60) svg += '<line x1="' + X(t) + '" x2="' + X(t) + '" y1="8" y2="122" stroke="var(--line)"/><text x="' + X(t) + '" y="142" text-anchor="middle">' + C.clock(t) + '</text>';
    lanes.forEach(function (ln, i) {
      var y = 14 + i * 38;
      svg += '<text x="0" y="' + (y + 17) + '">' + ln[0] + '</text>';
      ln[1].forEach(function (iv) { svg += '<rect x="' + X(iv[0]) + '" y="' + y + '" width="' + Math.max(2, X(iv[1]) - X(iv[0])) + '" height="24" rx="5" fill="' + ln[2] + '"><title>' + C.clock(iv[0]) + '–' + C.clock(iv[1]) + '</title></rect>'; });
      if (!ln[1].length) svg += '<text x="' + (L + 4) + '" y="' + (y + 17) + '" font-style="italic">none</text>';
    });
    return svg + '</svg>';
  }
  function evidence(key) {
    var r = S.A.rows.filter(function (x) { return x.key === key; })[0]; if (!r) return;
    var st = C.STATUS[r.status];
    openModal('<p class="muted small">Evidence · ' + esc(C.dayLabel(r.day)) + '</p><h2 id="mtitle" style="margin-top:0">' + esc(r.name) + ' on ' + esc(r.res) + '</h2>' +
      '<p><span class="tag ' + st[1] + '">' + esc(st[0]) + '</span> ' + esc(r.notes.join(" · ") || "Booking, login and run agree") + '</p>' + strip(r) +
      '<div class="tw" style="margin-top:14px"><table><tr><th>PI / account</th><th class="n">Booked</th><th class="n">Logged in</th><th class="n">Ran</th><th class="n">Billed</th><th class="n">Rate</th><th class="n">Charge</th></tr>' +
      '<tr><td>' + esc(r.pi) + ' · ' + esc(r.acct) + '</td><td class="n">' + C.hm(r.booked) + '</td><td class="n">' + C.hm(r.comp) + '</td><td class="n">' + C.hm(r.inst) + '</td><td class="n">' + C.hm(r.billed) + '</td><td class="n">' + $2(rate(r.res)) + '/h</td><td class="n">' + $2(finalCharge(r)) + '</td></tr></table></div>' +
      '<p class="muted small">Sources: FBS reservation export, instrument-PC login log, LaBro current sensor on the instrument. Sensor data in this demo is simulated.</p>' +
      '<h3>Reply to the PI</h3><textarea id="reply" rows="5" style="width:100%;font:inherit;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:10px">' + esc(reply(r)) + '</textarea>' +
      '<div class="row noprint" style="margin-top:10px"><button class="btn" data-copy>Copy reply</button><button class="btn ghost" onclick="window.print()">Print or save as PDF</button></div>');
  }
  function reply(r) {
    var amt = finalCharge(r), who = r.pi ? "Dr. " + r.pi : "there", ran = S.A.hasRuns ? r.inst : r.comp;
    var body = "On " + C.dayLabel(r.day) + ", " + r.name + " booked the " + r.res + " for " + C.hm(r.booked) + ". ";
    if (ran >= 1) body += "The instrument log shows it running " + C.hm(ran) + (r.comp ? " during a " + C.hm(r.comp) + " login session" : "") + ". ";
    else body += "The instrument did not run during that booking. ";
    if (r.notes[0]) body += r.notes[0] + ". ";
    body += amt > 0.004 ? "The charge of " + $2(amt) + (eff(r).penalty ? ", including " + $2(eff(r).penalty) + " under the core's overrun policy," : "") + " is based on that measured time. The timeline is attached; happy to go through it." : "There is no charge for this line.";
    return "Hi " + who + ",\n\n" + body + "\n\nThanks,\nDana";
  }
  function statement(pi) {
    var rows = S.A.rows.filter(function (r) { return r.pi === pi && finalCharge(r) > 0.004; });
    var tot = sum(rows, finalCharge), bookedTot = sum(S.A.rows.filter(function (r) { return r.pi === pi; }), function (r) { return r.booked / 60 * rate(r.res); });
    openModal('<p class="muted small">Statement · ' + esc(month()) + ' · Imaging core (demo)</p><h2 id="mtitle" style="margin-top:0">' + esc(pi) + ' lab</h2>' +
      '<div class="grid g3" style="margin-bottom:14px">' + stat($2(tot), "total this month", "hero") + stat(rows.length, "charged lines") + stat($2(bookedTot), "what bookings alone would show") + '</div>' +
      '<div class="tw"><table><thead><tr><th>Date</th><th>User</th><th>Instrument</th><th class="n">Booked</th><th class="n">' + (S.A.hasRuns ? "Ran" : "Logged in") + '</th><th class="n">Charge</th><th>Why</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + esc(C.dayLabel(r.day)) + '</td><td>' + esc(r.name) + '</td><td>' + esc(r.res) + '</td><td class="n">' + C.hm(r.booked) + '</td><td class="n">' + C.hm(S.A.hasRuns ? r.inst : r.comp) + '</td><td class="n">' + $2(finalCharge(r)) + '</td><td class="small">' + esc(eff(r).why) + '</td></tr>'; }).join("") +
      '</tbody><tfoot><tr><td colspan="5">Total</td><td class="n">' + $2(tot) + '</td><td></td></tr></tfoot></table></div>' +
      '<p class="muted small">Every line has an evidence timeline (booking, login, instrument run). Reply to dispute a line.</p><div class="row noprint"><button class="btn" onclick="window.print()">Print or save as PDF</button></div>');
  }
  function openModal(h) { mbody.innerHTML = h; modal.hidden = false; modal.querySelector(".x").focus(); }
  function closeModal() { modal.hidden = true; }

  function csv() {
    var head = ["Date", "Instrument", "User", "Email", "PI", "Account", "Booked h", "Logged-in h", "Ran h", "Billed h", "Rate", "Charge", "Penalty", "Decision", "Reason"];
    var lines = [head].concat(S.A.rows.filter(function (r) { return finalCharge(r) > 0.004; }).map(function (r) {
      var e = eff(r);
      return [C.isoDay(r.day), r.res, r.name, r.email, r.pi, r.acct, h1(r.booked), h1(r.comp), S.A.hasRuns ? h1(r.inst) : "", h1(e.mins), rate(r.res).toFixed(2), e.charge.toFixed(2), e.penalty.toFixed(2), S.dec[r.key] || "auto", e.why];
    }));
    dlCsv("labro-charges-" + (S.A.rows[0] ? C.isoDay(S.A.rows[0].day).slice(0, 7) : "month") + ".csv", lines);
  }

  // ---------- usage per instrument (shared by rates, grants, alerts)
  function usage() {
    var by = {};
    S.A.rows.forEach(function (r) {
      var u = by[r.res] || (by[r.res] = { res: r.res, booked: 0, login: 0, run: 0, pis: {}, nouser: 0, nouserMin: 0, transfer: 0, sensorOnly: false, users: {} });
      u.booked += r.booked; u.login += r.comp; u.run += r.inst; if (r.sensorOnly) u.sensorOnly = true;
      if (r.user !== "(no user)") { u.pis[r.pi || "?"] = (u.pis[r.pi || "?"] || 0) + (S.A.hasRuns ? r.inst : r.comp); u.users[r.user] = 1; }
      if (r.flags.nouser) { u.nouser++; u.nouserMin += r.inst; }
      if (r.flags.transfer) u.transfer += r.comp - r.inst;
    });
    return Object.keys(by).sort().map(function (k) { return by[k]; });
  }
  function days() { var d = {}; S.A.rows.forEach(function (r) { d[r.day] = 1; }); var k = Object.keys(d).map(Number); return k.length ? Math.max.apply(null, k) - Math.min.apply(null, k) + 1 : 30; }

  function viewRates() {
    if (!RT) return '<h1>Rates</h1><p class="muted">The rates engine did not load.</p>';
    var sample = RT.sampleCore(), U = usage(), months = days() / 30.4, byName = {};
    sample.instruments.forEach(function (i) { byName[i.name] = i; });
    // Build one rate row per instrument in the loaded files. Hours: this month annualized (measured run time, or
    // login time when no sensor file is loaded). Cost pools are synthetic: assume this year's rate was set the
    // usual way, cost ÷ booked hours. Sample instruments keep their demo cost lines (e.g. one unallowable purchase).
    var core = { instruments: [], rateSchedule: [] };
    U.forEach(function (u) {
      var smp = byName[u.res], billed = rate(u.res) || (smp && smp.billedRate) || 0;
      var ins = { name: u.res, carry: 0, billedRate: billed,
        bookedHours: Math.round(RT.annualize(u.booked / 60, months)),
        loginHours: u.sensorOnly ? null : Math.round(RT.annualize(u.login / 60, months)),
        measuredHours: Math.round(RT.annualize((S.A.hasRuns ? u.run : u.login) / 60, months)) };
      var k = { "BD LSRFortessa Analyzer": 0.9, "Nikon Ti2 Widefield": 0.97 }[u.res] || 1;
      ins.pool = Math.max(500, Math.round(billed * ins.bookedHours * k / 500) * 500);
      if (smp && smp.items) ins.items = [{ label: "Allowable operating costs", amount: ins.pool, kind: "other" }].concat(smp.items.filter(function (it) { return RT.costPool([it]).unallowable > 0; }));
      core.instruments.push(ins);
      var sch = sample.rateSchedule.filter(function (r) { return r.instrument === u.res; });
      if (sch.length) { var diff = sch.filter(function (r) { return r.userType === "federal"; })[0].rate - sch.filter(function (r) { return r.userType === "internal"; })[0].rate; core.rateSchedule.push({ userType: "internal", rate: billed, instrument: u.res }, { userType: "federal", rate: billed + diff, instrument: u.res }); }
    });
    if (!core.instruments.length) return '<h1>Rates</h1><p class="muted">Load a reservation export on the Close tab first.</p>';
    var findings = RT.checks(core);
    core.instruments.forEach(function (ins) {
      var c = RT.compare(ins);
      if (ins.billedRate > 0 && (c.flags.indexOf("rate_from_bookings") >= 0 || (c.measured.rate && Math.abs(c.measured.rate - ins.billedRate) / ins.billedRate > 0.1)))
        findings.push({ severity: "medium", instrument: ins.name, finding: "Rate of " + $2(ins.billedRate) + "/h matches booked hours; measured hours need " + $2(c.measured.rate) + "/h to break even", cite: "2 CFR 200.468(a)" });
      if (c.flags.indexOf("under_recovery") >= 0) findings.push({ severity: "low", instrument: ins.name, finding: "Projected deficit of " + $(-c.measured.recovery) + " this year: the institution covers it or next year's rate rises", cite: "" });
    });
    findings.forEach(function (f) {
      if (f.finding === "Pool contains unallowable costs") {
        var ins = core.instruments.filter(function (i) { return i.name === f.instrument; })[0], ex = ins && ins.items ? RT.costPool(ins.items).excluded : [];
        if (ex.length) f.finding = "Cost pool includes " + ex.map(function (x) { return x.label.toLowerCase() + " (" + $(x.amount) + ")"; }).join(", ") + ". " + ex[0].reason;
      }
      if (f.finding === "Federal users charged more than internal users") {
        var fr = core.rateSchedule.filter(function (r) { return r.instrument === f.instrument; });
        var fed = fr.filter(function (r) { return r.userType === "federal"; })[0], int = fr.filter(function (r) { return r.userType === "internal"; })[0];
        if (fed && int) f.finding = "Rate schedule charges federally funded users " + $2(fed.rate) + "/h but internal users " + $2(int.rate) + "/h. Rates can't discriminate between federal and other users.";
      }
    });
    var sevOrder = { high: 0, medium: 1, low: 2 }; findings.sort(function (a, b) { return sevOrder[a.severity] - sevOrder[b.severity]; });
    var rows = core.instruments.map(function (ins) {
      var c = RT.compare(ins), pool = RT.costPool(ins.items || []).allowable || ins.pool;
      return { ins: ins, c: c, pool: pool };
    });
    var under = sum(rows, function (x) { return Math.min(0, x.c.measured.recovery); }), over = sum(rows, function (x) { return Math.max(0, x.c.measured.recovery); });
    return '<h1>Is next year\'s rate built on real hours?</h1>' +
      '<p class="lede">Federal rules for recharge centers (2 CFR 200.468) say rates must recover cost, not make a profit, and must not charge federal grants more than anyone else. A rate is cost ÷ hours, so if the hours come from bookings, the rate is wrong before the year starts. LaBro rebuilds each rate from measured hours and flags what an auditor would.</p>' +
      '<div class="callout"><b>Rate = (annual cost pool − last year\'s surplus) ÷ billable hours.</b> <span class="muted">If you bill measured run time, billable hours are measured hours, not bookings. Hours below are ' + (months < 1.5 ? "one month of files ×12: load a full year for the real rate file." : Math.round(months) + " months of files, annualized.") + '</span></div>' +
      '<div class="grid g3">' + stat(findings.filter(function (f) { return f.severity === "high"; }).length, "high-risk findings", "hero") + stat($(-under), "projected under-recovery / yr") + stat($(over), "projected over-recovery / yr") + '</div>' +
      '<h2>Rate by where the hours come from</h2><div class="tw"><table><thead><tr><th>Instrument</th><th class="n">Cost pool / yr</th><th class="n">Booked h</th><th class="n">Measured h</th><th class="n">Rate if booked</th><th class="n">Rate if measured</th><th class="n">Billed now</th><th class="n">Surplus / deficit</th></tr></thead><tbody>' +
      rows.map(function (x) {
        var c = x.c, i = x.ins, rc = c.measured.recovery;
        return '<tr><td>' + esc(i.name) + '</td><td class="n">' + $(i.pool - (i.carry || 0)) + '</td><td class="n">' + (i.bookedHours || 0).toLocaleString() + '</td><td class="n">' + (i.measuredHours || 0).toLocaleString() + '</td><td class="n">' + (c.booked.rate == null ? "—" : $2(c.booked.rate)) + '</td><td class="n"><b>' + (c.measured.rate == null ? "—" : $2(c.measured.rate)) + '</b></td><td class="n">' + $2(i.billedRate) + '</td><td class="n" style="color:' + (rc < 0 ? "var(--bad)" : "var(--acc)") + '">' + (rc < 0 ? "−" : "+") + $(Math.abs(rc)) + '</td></tr>';
      }).join("") + '</tbody></table></div>' +
      '<p class="muted small">Hours are this month\'s files annualized. Cost pools, carry-forwards and the rate schedule are a synthetic sample core. Surplus / deficit = billed rate × measured hours − cost pool.</p>' +
      '<h2>What an auditor would flag</h2>' + findings.map(function (f) { return '<div class="find"><span class="sev ' + f.severity + '">' + f.severity + '</span><div><b>' + esc(f.instrument || "Core") + '</b> · ' + esc(f.finding) + (f.cite ? ' <span class="cite">' + esc(f.cite) + '</span>' : "") + '</div></div>'; }).join("") +
      '<h2>Fill the rate forms your finance office already uses</h2><div class="card"><p class="muted" style="margin-top:0">USC\'s Office of Financial Analysis publishes a Recharge Center Rate Analysis workbook and a Statement of Activities form. Both ask for <b>volume per service</b>: hours by user type for next year, and actual yearly usage. LaBro fills those rows from measured hours instead of bookings.</p>' +
      '<div class="row"><button class="btn" data-act="uscvol">Volume tab rows (CSV)</button><button class="btn ghost" data-act="uscsoa">Statement of Activities: rate × yearly usage (CSV)</button></div>' +
      '<p class="muted small" style="margin-bottom:0">Columns follow the public templates at <a href="https://fbs.usc.edu/financial-analysis/recharge/recharge-center-forms/">fbs.usc.edu › Recharge Center Forms</a>. Every sample user is internal; with real data, the user type comes from the FBS account.</p></div>' +
      '<div class="callout muted">Why it matters: the rule asks for rates based on actual usage, adjusted at least every two years, with last period\'s surplus or deficit carried in (<a href="https://www.law.cornell.edu/cfr/text/2/200.468">2 CFR 200.468</a>). Auditors still question these charges: NSF OIG\'s 2025 audit of the University of Nebraska–Lincoln questioned $92,865 of inadequately supported internal service-center expenses, and its 2020 Yale audit questioned $12,855 billed without a formal rate schedule. Most cores build rates in a spreadsheet.</div>';
  }

  function viewGrants() {
    var U = usage();
    return '<h1>Usage evidence for the next instrument grant</h1>' +
      '<p class="lede">NIH S10 awardees file an Annual Usage Report for four years after the award: users, their NIH grants, and hours, and major NIH-funded users should account for at least 35% of the instrument\'s accessible time. LaBro keeps that record as a side effect of billing: measured hours per lab, per instrument. <a href="https://grants.nih.gov/grants/guide/pa-files/PAR-17-074.html">NIH S10 notice</a></p>' +
      U.map(function (u) {
        var tot = sum(Object.keys(u.pis), function (k) { return u.pis[k]; }) || 1, mx = 0; Object.keys(u.pis).forEach(function (k) { mx = Math.max(mx, u.pis[k]); }); mx = mx || 1;
        var top3 = Object.keys(u.pis).map(function (k) { return u.pis[k]; }).sort(function (a, b) { return b - a; }).slice(0, 3), major = sum(top3, function (v) { return v; }) / (days() / 7 * 50 * 60);
        return '<div class="card" style="margin-bottom:14px"><div class="row" style="justify-content:space-between"><h3>' + esc(u.res) + ' <span class="tag ' + (major >= .35 ? "ok" : "warn") + '" title="Top 3 labs stand in for the major users named in the grant; accessible time = 50 staffed hours a week">Major users: ' + Math.round(major * 100) + '% of accessible time · S10 asks ≥35%</span></h3><span class="muted small">' + h1(u.run) + ' h measured · ' + Object.keys(u.users).length + ' users · ' + Object.keys(u.pis).length + ' labs</span></div><div class="heat">' +
          Object.keys(u.pis).sort(function (a, b) { return u.pis[b] - u.pis[a]; }).map(function (p) { var v = u.pis[p]; return '<div class="hrow"><span class="nm">' + esc(p) + ' lab</span><span class="t"><i style="width:' + (v / mx * 100).toFixed(1) + '%;background:var(--run)"></i></span><span class="num small">' + Math.round(v / tot * 100) + '%</span></div>'; }).join("") + '</div></div>';
      }).join("") +
      '<div class="row"><button class="btn" data-act="grantcsv">Download usage table (CSV)</button><span class="muted small">Columns: instrument, lab, measured hours, share. Add grant numbers in FBS accounts to group by funded project.</span></div>';
  }

  // Service intervals by run-hours are illustrative defaults (lamp / laser / rotor), not vendor specs.
  var SERVICE = { "Zeiss LSM 880 Confocal": ["Laser service check", 2000, 1710], "BD LSRFortessa Analyzer": ["Fluidics preventive maintenance", 1500, 1380], "Leica SP8 Lightning": ["Laser service check", 2000, 640], "Nikon Ti2 Widefield": ["LED / lamp check", 1000, 905], "Beckman Optima XPN Ultracentrifuge": ["Rotor run-hour log review", 1000, 760] };
  function groupBy(rows) { var g = {}; rows.forEach(function (r) { (g[r.res] || (g[r.res] = { res: r.res, rows: [] })).rows.push(r); }); return Object.keys(g).map(function (k) { return g[k]; }); }
  function viewAlerts() {
    var U = usage(), noUserRows = S.A.rows.filter(function (r) { return r.flags.nouser; }), transfer = S.A.rows.filter(function (r) { return r.flags.transfer; });
    return '<h1>Catch it the same day, not at month end.</h1>' +
      '<p class="lede">The same sensor that bills the run notices when an instrument runs with nobody booked, and counts real run-hours toward service intervals instead of calendar months.</p>' +
      '<h2>Ran with no one booked · ' + noUserRows.length + '</h2>' +
      (noUserRows.length ? groupBy(noUserRows).map(function (g) { return '<div class="find"><span class="sev high">' + g.rows.length + '×</span><div><b>' + esc(g.res) + '</b> · ' + C.hm(sum(g.rows, function (r) { return r.inst; })) + ' of running with no booking, on ' + g.rows.map(function (r) { return esc(C.dayLabel(r.day)); }).join(", ") + '<div class="muted small">' + (g.rows.every(function (r) { return r.sensorOnly; }) ? "No PC on this instrument, so FBS and login logs never saw these runs. " : "") + 'LaBro would text the core manager once a run passes 15 minutes with no booking.</div></div></div>'; }).join("") : '<p class="muted">None this month.</p>') +
      '<h2>Logins that kept the instrument PC busy after the run · ' + transfer.length + '</h2><p class="muted">Total ' + h1(sum(transfer, function (r) { return r.comp - r.inst; })) + ' h of PC time after acquisition ended. Billing by login would charge it; billing by run does not.</p>' +
      '<h2>Service by run-hours</h2><div class="heat">' + U.map(function (u) {
        var s = SERVICE[u.res]; if (!s) return "";
        var used = s[2] + Math.round(u.run / 60), pct = Math.min(1, used / s[1]);
        return '<div class="hrow"><span class="nm">' + esc(u.res) + '<div class="muted small">' + esc(s[0]) + '</div></span><span class="t"><i style="width:' + (pct * 100).toFixed(1) + '%;background:' + (pct > .9 ? "var(--warn)" : "var(--run)") + '"></i></span><span class="num small">' + (pct >= 1 ? '<b style="color:var(--bad)">Due</b> ' : "") + used + ' / ' + s[1] + ' h</span></div>';
      }).join("") + '</div><p class="muted small">Intervals and starting hours are illustrative, not vendor specs.</p>';
  }

  // Campus view: this core's real file-derived utilization plus synthetic peer cores.
  function seeded(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function viewCampus() {
    var rnd = seeded(42), U = usage(), avail = days() / 7 * 50 * 60; // 50 staffed hours/week
    var cores = [{ name: "Imaging core (your files)", items: U.map(function (u) { return [u.res, u.run / avail, null]; }) }];
    var peers = [["Flow cytometry core", ["Cell sorter A", "Cell sorter B", "Spectral analyzer", "Benchtop analyzer"]], ["Genomics core", ["Short-read sequencer", "Long-read sequencer", "Fragment analyzer", "qPCR system"]], ["Mass spec core", ["Orbitrap MS", "Triple-quad MS", "MALDI-TOF"]], ["Engineering machine shop", ["5-axis CNC mill", "CNC lathe", "Laser cutter", "Waterjet"]], ["Nanofab cleanroom", ["E-beam writer", "Mask aligner", "ALD system", "SEM"]]];
    peers.forEach(function (p) { cores.push({ name: p[0] + " (simulated)", items: p[1].map(function (n) { var r = rnd(); return [n, r < .25 ? .04 + rnd() * .1 : r > .85 ? .86 + rnd() * .12 : .25 + rnd() * .55, Math.round(40 + rnd() * 160) * 1000]; }) }); });
    var all = []; cores.forEach(function (c) { c.items.forEach(function (i) { all.push(i); }); });
    var idle = all.filter(function (i) { return i[1] < .15; }), full = all.filter(function (i) { return i[1] > .85; });
    var color = function (u) { return u < .15 ? "var(--bad)" : u > .85 ? "var(--warn)" : "var(--run)"; };
    return '<h1>Every shared machine on campus, on one page.</h1>' +
      '<p class="lede">When every core bills from measured run time, the research office gets something it has never had: real utilization across campus. Which instruments sit idle while their service contracts renew, which ones have a waitlist, and where a purchase request duplicates something already on campus.</p>' +
      '<p class="notice-sim">Illustration: only the imaging core comes from your files. The other five cores are simulated to show what a campus rollout would look like.</p>' + '<div class="grid g3">' + stat(all.length, "instruments tracked") + stat(idle.length, "under 15% used: review the service contract", "hero") + stat(full.length, "over 85% used: candidates for a second unit") + '</div>' +
      '<div class="legend" style="margin:18px 0 4px"><span><i class="dot" style="background:var(--bad)"></i>Under 15%</span><span><i class="dot" style="background:var(--run)"></i>Healthy</span><span><i class="dot" style="background:var(--warn)"></i>Over 85%</span><span>Share of 50 staffed hours a week</span></div>' +
      '<div class="heat">' + cores.map(function (c) { return '<div class="hcore">' + esc(c.name) + '</div>' + c.items.map(function (i) { return '<div class="hrow"><span class="nm">' + esc(i[0]) + '</span><span class="t"><i style="width:' + Math.max(2, Math.min(100, i[1] * 100)).toFixed(1) + '%;background:' + color(i[1]) + '"></i></span><span class="num small">' + Math.round(i[1] * 100) + '%</span></div>'; }).join(""); }).join("") + '</div>' +
      '<p class="muted small">Only the imaging core comes from the loaded files. The other cores are simulated to show the campus view.</p>';
  }

  // ---------- routing + events
  var VIEWS = { close: viewClose, rates: viewRates, grants: viewGrants, alerts: viewAlerts, campus: viewCampus };
  function tab() { var t = (location.hash || "#close").slice(1).split("?")[0]; return VIEWS[t] ? t : "close"; }
  function render(keepScroll) {
    var y = window.scrollY;
    if (!S.loaded) return;
    compute();
    var t = tab();
    document.querySelectorAll("[data-tab]").forEach(function (a) { a.setAttribute("aria-selected", a.getAttribute("data-tab") === t); });
    app.innerHTML = VIEWS[t]();
    if (keepScroll) window.scrollTo(0, y);
  }
  window.addEventListener("hashchange", function () { render(false); window.scrollTo(0, 0); });
  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act],[data-filter]");
    if (b && b.dataset.filter) { S.filter = b.dataset.filter; render(true); return; }
    if (b) {
      var a = b.dataset.act;
      if (a === "sample") { S.saved = null; C.loadSample().then(function () { render(true); }); }
      if (a === "sample-ilab") { S.saved = null; C.loadSample().then(function () { return fetch("data/audit/ilab_reservations.csv").then(function (r) { return r.text(); }); }).then(function (t) { C.setFile("res", "ilab_reservations.csv", t); render(true); }); }
      if (a === "nosensor") { if (C.state.files.run) { S.saved = { f: C.state.files.run, amap: C.state.amap.run }; delete C.state.files.run; C.state.amap.run = {}; } else if (S.saved) { C.state.files.run = S.saved.f; C.state.amap.run = S.saved.amap; S.saved = null; } render(true); }
      if (a === "csv") csv();
      if (a === "stmt") statement(app.querySelector("[data-pi]").value);
      if (a === "acceptall") { S.A.rows.filter(C.needsAction).forEach(function (r) { if (!S.dec[r.key]) S.dec[r.key] = SUGGEST[r.status] || "measured"; }); saveDec(); render(true); }
      if (a === "grantcsv") grantCsv();
      if (a === "uscvol" || a === "uscsoa") uscForms(a);
      if (a === "more") { S.more = true; render(true); }
      if (a === "showmap") { S.showMap = true; render(true); }
      return;
    }
    if (e.target.closest(".noclick")) return;
    var row = e.target.closest("[data-row]"); if (row) evidence(row.dataset.row);
  });
  app.addEventListener("keydown", function (e) { var row = e.target.closest("[data-row]"); if (row && (e.key === "Enter" || e.key === " ") && e.target === row) { e.preventDefault(); evidence(row.dataset.row); } });
  app.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset.dec != null) { if (t.value) S.dec[t.dataset.dec] = t.value; else delete S.dec[t.dataset.dec]; saveDec(); render(true); }
    if (t.dataset.pi != null) S.pi = t.value;
    if (t.dataset.map) { C.state.files[t.dataset.map].map[t.dataset.field] = +t.value; C.state.amap.use = {}; C.state.amap.run = {}; render(true); }
    if (t.dataset.amap) { C.state.amap[t.dataset.amap][t.dataset.name] = t.value; render(true); }
    if (t.dataset.file) readFile(t.dataset.file, t.files[0]);
    if (t.dataset.accts != null && t.files[0]) { var rd = new FileReader(); rd.onload = function () { S.accts = C.parseCSV(rd.result); render(true); }; rd.readAsText(t.files[0]); }
  });
  app.addEventListener("dragover", function (e) { var d = e.target.closest("[data-drop]"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  app.addEventListener("dragleave", function (e) { var d = e.target.closest("[data-drop]"); if (d) d.classList.remove("over"); });
  app.addEventListener("drop", function (e) { var d = e.target.closest("[data-drop]"); if (d) { e.preventDefault(); readFile(d.dataset.drop, e.dataTransfer.files[0]); } });
  function readFile(k, f) { if (!f) return; var rd = new FileReader(); rd.onload = function () { S.saved = null; C.setFile(k, f.name, rd.result); render(false); }; rd.readAsText(f); }
  // CSV writer: quotes cells and neutralizes text that a spreadsheet would run as a formula (=, +, -, @).
  function cell(v) {
    if (typeof v === "number") return String(v);
    v = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v)) v = "'" + v;
    return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  function dlCsv(name, lines) {
    var q = cell;
    var blob = new Blob([lines.map(function (l) { return l.map(q).join(","); }).join("\n") + "\n"], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function uscForms(kind) {
    var U = usage(), months = days() / 30.4;
    if (kind === "uscvol") {
      var L = [["Long Name", "Short Name", "Basis for Billing", "Internal", "External Non-Profit", "External Profit", "Free Service", "Total", "Source"]];
      U.forEach(function (u) { var hrs = Math.round(RT.annualize(u.run / 60, months)); L.push([u.res, u.res.split(" ").slice(0, 2).join(" "), "Hourly", hrs, 0, 0, 0, hrs, "LaBro measured run hours, " + (months < 1.5 ? "1 month x12" : Math.round(months) + " months annualized")]); });
      dlCsv("usc-rate-analysis-volume.csv", L);
    } else {
      var L2 = [["Rate Description", "Rate", "Yearly Usage (volume)", "FY Total", "Booked hours (for comparison)"]];
      U.forEach(function (u) { var hrs = Math.round(RT.annualize(u.run / 60, months)), r = rate(u.res); L2.push([u.res + " (per hour)", r.toFixed(2), hrs, (r * hrs).toFixed(2), Math.round(RT.annualize(u.booked / 60, months))]); });
      dlCsv("usc-statement-of-activities-usage.csv", L2);
    }
  }
  function grantCsv() {
    var lines = [["Instrument", "Lab", (S.A.hasRuns ? "Measured" : "Logged-in") + " hours", "Share"]];
    usage().forEach(function (u) { var tot = sum(Object.keys(u.pis), function (k) { return u.pis[k]; }) || 1; Object.keys(u.pis).forEach(function (p) { lines.push([u.res, p, h1(u.pis[p]), (u.pis[p] / tot * 100).toFixed(1) + "%"]); }); });
    dlCsv("labro-instrument-usage.csv", lines);
  }
  modal.addEventListener("click", function (e) {
    if (e.target.closest("[data-copy]")) { var t = document.getElementById("reply"); t.select(); try { navigator.clipboard.writeText(t.value); } catch (x) { document.execCommand("copy"); } e.target.textContent = "Copied"; return; } if (e.target === modal || e.target.closest("[data-close]")) closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeModal(); });
  if (STATIC) document.documentElement.classList.add("static");

  fetch("data/audit/accounts.csv").then(function (r) { return r.ok ? r.text() : ""; }).then(function (t) { if (t) { S.accts = C.parseCSV(t); if (S.loaded) render(true); } }).catch(function () {});
  C.loadSample().then(function () { S.loaded = true; render(false); if (/[?&]tour/.test(location.search)) tourShow(0); }).catch(function (e) { app.innerHTML = '<p class="loading">Could not load the sample files (' + esc(e.message) + ').</p>'; });
  // ---------- 60-second guided tour (button in the header, or ?tour)
  var TOUR = [
    ["close", "h1", "One core, one month. Billing by bookings and billing by PC logins disagree by thousands of dollars. Dana reconciles that gap by hand every month."],
    ["close", ".bars", "LaBro lines up three sources per user per day: the FBS booking, the PC login, and the instrument actually running (clip-on sensor)."],
    ["close", "#queue", "Most lines match automatically. Only the ones that need a human decision are listed, each with the reason."],
    ["close", ".qi.pen", "Click any line: booking, login and run on one timeline, plus a reply Dana can paste to the PI who disputes it.", "evidence"],
    ["close", ".find", "Before sending: charges to grants that already ended get flagged, so they don't come back as late cost transfers."],
    ["close", ".tw", "Out goes a charges file for FBS and a statement per lab. Every number traces back to a booking, a login or a run."],
    ["rates", "h1", "The bigger stake: next year's rate is cost ÷ hours. Built on bookings, it's wrong all year. Federal rules (2 CFR 200.468) want actual usage."],
    ["rates", ".find", "LaBro flags what an auditor would, and fills the volume rows of the finance office's own rate template."],
    ["grants", "h1", "The same hours become NIH S10 usage evidence: hours by lab, and the major users' share of accessible time."],
    ["campus", "h1", "Across campus: which instruments sit idle while their service contracts renew, and which need a second unit. That's the university plan."]
  ];
  var tourI = -1, tourEl = document.createElement("div");
  tourEl.className = "tour"; tourEl.hidden = true; tourEl.setAttribute("role", "dialog"); tourEl.setAttribute("aria-live", "polite"); document.body.appendChild(tourEl);
  function tourShow(i) {
    document.querySelectorAll(".tour-hl").forEach(function (e) { e.classList.remove("tour-hl"); });
    if (i < 0 || i >= TOUR.length) { tourI = -1; tourEl.hidden = true; closeModal(); return; }
    tourI = i; var st = TOUR[i];
    if (tab() !== st[0]) { location.hash = "#" + st[0]; }
    setTimeout(function () {
      closeModal();
      var el = app.querySelector(st[1]);
      if (el) { el.classList.add("tour-hl"); el.scrollIntoView({ behavior: STATIC ? "auto" : "smooth", block: "center" }); }
      if (st[3] === "evidence" && el) setTimeout(function () { evidence(el.dataset.row); }, STATIC ? 0 : 700);
      tourEl.innerHTML = '<div class="small muted">' + (i + 1) + ' / ' + TOUR.length + '</div><p>' + esc(st[2]) + '</p><div class="row"><button class="btn ghost small" data-tour="-1">Back</button><button class="btn small" data-tour="1">' + (i === TOUR.length - 1 ? "Done" : "Next") + '</button><button class="linkb small" data-tour="x">End tour</button></div>';
      tourEl.hidden = false;
    }, tab() === st[0] ? 0 : 150);
  }
  tourEl.addEventListener("click", function (e) { var b = e.target.closest("[data-tour]"); if (!b) return; var v = b.dataset.tour; tourShow(v === "x" ? -1 : tourI + +v); });
  document.addEventListener("keydown", function (e) { if (tourI >= 0 && (e.key === "ArrowRight" || e.key === "ArrowLeft") && !/input|select|textarea/i.test(e.target.tagName)) { tourShow(tourI + (e.key === "ArrowRight" ? 1 : -1)); } });
  var tb = document.getElementById("tourbtn"); if (tb) tb.addEventListener("click", function () { tourShow(0); });

  window.LBClose = { S: S, totals: totals, render: render, tour: tourShow };
})();
