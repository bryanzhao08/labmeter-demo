"use strict";
/* LaBro desk: the request log, the rules editor and the research-office roll-up. Views plug into close.js through
   window.LBApp. Engines: LBRules (rules.js), LBCampus (campus.js), LBServices (services.js). Requests, labs and
   rules are kept in this browser's localStorage; nothing is uploaded. */
(function () {
  var A = window.LBApp, RL = window.LBRules, CP = window.LBCampus;
  if (!A || !RL || !CP) return;
  var esc = A.esc, $ = A.usd, $2 = A.usd2, stat = A.stat, app = document.getElementById("app");
  var KEY = "labro-desk-v1", D = null, UI = { filter: "all", all: false, note: "" };
  var STATUSES = ["new", "in progress", "delivered"];

  function desk() {
    if (D) return D;
    try { var j = JSON.parse(localStorage.getItem(KEY) || "null"); if (j && Array.isArray(j.requests) && Array.isArray(j.rules) && Array.isArray(j.labs)) D = j; } catch (e) { /* fall through to the sample */ }
    if (!D) D = RL.sampleDesk(A.svc().P);
    D.extra = D.extra || []; D.corrected = D.corrected || 0;
    return D;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* private mode */ } }
  function priceList() { return A.svc().P.rows.map(function (r) { return { sku: r.sku, name: r.name, unit: r.unit, academic: r.academic }; }); }
  function run(reqs) {
    var d = desk(), out = RL.apply(reqs || d.requests, d.rules, { list: priceList(), labs: d.labs });
    out.lines.forEach(function (l) { if (l.req.status === "billed") { l.unit = l.req.unit; l.amount = l.req.amount; l.held = false; } });
    return out;
  }
  function byId(id) { return desk().requests.filter(function (r) { return r.id === id; })[0]; }
  function total(ls) { return A.sum(ls, function (l) { return l.amount; }); }
  function monthLabel(m) { var p = String(m || "").split("-"); return p.length === 2 ? new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(Date.UTC(+p[0], +p[1] - 1, 1))) : ""; }
  function dl(name, text, type) { var b = new Blob([text], { type: type || "text/plain" }), a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
  function opt(v, label, sel) { return '<option value="' + esc(v) + '"' + (String(v) === String(sel) ? " selected" : "") + '>' + esc(label == null ? v : label) + '</option>'; }
  function note() { var n = UI.note; UI.note = ""; return n ? '<p class="ok" role="status" style="margin:0 0 14px">' + esc(n) + '</p>' : ""; }

  // ---------- Requests
  function groups(out) {
    var L = out.lines;
    return { held: L.filter(function (l) { return l.held; }), ready: L.filter(function (l) { return l.req.status === "delivered" && !l.held; }),
      open: L.filter(function (l) { return l.req.status === "new" || l.req.status === "in progress"; }), billed: L.filter(function (l) { return l.req.status === "billed"; }) };
  }
  function viewRequests() {
    var d = desk(), out = run(), G = groups(out), list = priceList(), users = [];
    d.labs.forEach(function (L) { (L.members || []).forEach(function (u) { if (users.indexOf(u) < 0) users.push(u); }); });
    var show = { all: out.lines, open: G.open, held: G.held, ready: G.ready, billed: G.billed }[UI.filter] || out.lines;
    show = show.slice().reverse();
    var cut = UI.all ? show : show.slice(0, 25);
    var chip = function (k, label, n) { return '<button class="chip" data-dk="filter" data-v="' + k + '" aria-pressed="' + (UI.filter === k) + '">' + label + ' · ' + n + '</button>'; };
    return '<h1 class="apph">Requests</h1><p class="muted small" style="margin:0 0 16px">Cell culture core (sample) · ' + esc(monthLabel(d.month)) + '. Every request is priced from your price list and <a href="#rules">rules</a>, then checked before it reaches FBS.</p>' + note() +
      '<div class="grid g4">' + stat($(total(G.ready)), G.ready.length + " delivered, ready to bill", "hero") + stat(G.held.length, "held for a look · " + $(total(G.held))) + stat(G.open.length, "still open") + stat($(total(G.billed)), G.billed.length + " already sent to FBS") + '</div>' +
      '<div class="card" style="margin-top:16px"><h3 style="margin:0 0 12px">New request</h3><div class="form">' +
      '<label>Requester<input type="text" list="dk-users" data-dkf="user" placeholder="Name" autocomplete="off"></label><datalist id="dk-users">' + users.map(function (u) { return '<option value="' + esc(u) + '">'; }).join("") + '</datalist>' +
      '<label>Lab that pays<select data-dkf="lab">' + d.labs.map(function (L) { return opt(L.name, L.name + (L.type === "industry" ? " (industry)" : "")); }).join("") + '</select></label>' +
      '<label>Service<select data-dkf="sku">' + list.map(function (p) { return opt(p.sku, p.sku + " · " + p.name); }).join("") + '</select></label>' +
      '<label>Quantity<input type="number" min="1" step="1" value="1" data-dkf="qty"></label>' +
      '<label>Date<input type="date" data-dkf="date" value="' + new Date().toISOString().slice(0, 10) + '"></label>' +
      '<button class="btn" data-dk="add">Add request</button></div><p class="pv muted small" id="dk-pv">Pick a requester: the lab fills in from the roster, and the price comes from the list and your rules.</p></div>' +
      '<h2 id="dk-held">Held for a look · ' + G.held.length + '</h2>' +
      (G.held.length ? '<div class="q">' + G.held.map(function (l) {
        var r = l.req;
        return '<div class="qi held"><span class="small muted">' + esc(r.date) + '<br>' + esc(r.id) + '</span><span><b>' + esc(r.user || "?") + '</b><br><span class="small muted">' + esc(r.lab) + ' · ' + esc(l.service || "SKU " + r.sku) + ' × ' + l.qty + '</span></span>' +
          '<span class="why">' + l.holds.map(function (h) { return esc(h.why); }).join("<br>") + '</span><span class="amt">' + $2(l.amount) + '</span><span class="acts">' +
          l.holds.map(function (h, i) { return h.fix ? '<button class="btn small" data-dk="fix" data-id="' + esc(r.id) + '" data-h="' + i + '">' + esc(h.fix.label) + '</button>' : ""; }).join("") +
          (l.holds.some(function (h) { return h.hard; }) ? "" : '<button class="btn ghost small" data-dk="ok" data-id="' + esc(r.id) + '" aria-label="Approve ' + esc(r.id) + ' as is">Approve as is</button>') + '</span></div>';
      }).join("") + '</div>' : '<p class="ok">Nothing held. Every line passed your rules.</p>') +
      '<div class="row" style="margin-top:20px"><button class="btn" data-dk="bill"' + (G.ready.length ? "" : " disabled") + '>Bill ' + G.ready.length + ' clean lines: FBS upload file (CSV)</button><button class="btn ghost" data-dk="trail">Audit trail: every line and its rules (CSV)</button>' +
      '<label class="btn ghost" style="cursor:pointer">Import requests (CSV / Excel)<input type="file" accept=".csv,.tsv,.txt,.xlsx,.xls" data-dkfile="requests" hidden></label><button class="btn ghost" data-dk="summary">Month summary for the research office</button></div>' +
      '<p class="muted small" style="margin:8px 0 0">The upload file has the columns of an FBS eLog upload (Quantity, Per, SKU, Description, Date, Unit Price, Requested by, Lab, Charge). Held lines never go into it.</p>' +
      '<h2>All requests</h2><div class="filters">' + chip("all", "All", out.lines.length) + chip("open", "Open", G.open.length) + chip("ready", "Ready to bill", G.ready.length) + chip("held", "Held", G.held.length) + chip("billed", "Billed", G.billed.length) + '</div>' +
      '<div class="tw"><table class="reqs"><thead><tr><th>Date</th><th>Requester · lab</th><th>Service</th><th class="n">Qty</th><th class="n">Unit</th><th class="n">Total</th><th>Rules that touched it</th><th>Status</th></tr></thead><tbody>' +
      (cut.length ? cut.map(function (l) {
        var r = l.req, tags = l.trace.map(function (t) { return '<span class="tag info" title="' + esc(t.text) + '">' + esc(t.name) + '</span>'; }).concat(l.held ? l.holds.map(function (h) { return '<span class="tag danger">' + esc(h.name) + '</span>'; }) : []).concat(l.approved ? ['<span class="tag warn">approved as is</span>'] : []).concat((r.log || []).length ? ['<span class="tag ok" title="' + esc(r.log.join("; ")) + '">corrected</span>'] : []);
        return '<tr><td>' + esc(r.date) + '<br><span class="small muted">' + esc(r.id) + '</span></td><td>' + esc(r.user) + '<br><span class="small muted">' + esc(r.lab) + '</span></td><td>' + esc(l.service || "SKU " + r.sku) + '</td><td class="n">' + l.qty + '</td><td class="n">' + $2(l.unit) + '</td><td class="n">' + $2(l.amount) + '</td><td class="wrap">' + (tags.join(" ") || '<span class="muted small">list price</span>') + '</td><td>' +
          (r.status === "billed" ? '<span class="tag ok">billed</span>' : '<select data-dkstatus="' + esc(r.id) + '" aria-label="Status of ' + esc(r.id) + '">' + STATUSES.map(function (s) { return opt(s, s, r.status); }).join("") + '</select>') + '</td></tr>';
      }).join("") : '<tr><td colspan="8" class="muted">No requests here.</td></tr>') + '</tbody></table></div>' +
      (show.length > cut.length ? '<p style="margin:10px 0 0"><button class="linkb" data-dk="showall">Show all ' + show.length + '</button></p>' : "") +
      '<p class="muted small" style="margin:18px 0 0">Saved on this computer only. <button class="linkb small" data-dk="reset">Reset to the sample month</button></p>';
  }
  function formVal() {
    var g = function (k) { var e = app.querySelector('[data-dkf="' + k + '"]'); return e ? e.value : ""; };
    return { user: g("user").trim(), lab: g("lab"), sku: g("sku"), qty: Math.max(0, Math.round(parseFloat(g("qty")) || 0)), date: g("date") };
  }
  function preview() {
    var pv = document.getElementById("dk-pv"); if (!pv) return;
    var d = desk(), v = formVal(), L = d.labs.filter(function (x) { return x.name === v.lab; })[0];
    if (!v.user || !v.qty) { pv.textContent = "Pick a requester: the lab fills in from the roster, and the price comes from the list and your rules."; return; }
    var draft = { id: "draft", date: v.date, user: v.user, lab: v.lab, sku: v.sku, qty: v.qty, charge: L ? L.charge : "", status: "new" };
    var l = run(d.requests.concat([draft])).lines.pop();
    pv.innerHTML = '<b style="color:var(--ink)">' + $2(l.amount) + '</b> · ' + l.qty + ' × ' + $2(l.unit) + (l.trace.length ? ' · ' + l.trace.map(function (t) { return esc(t.name) + ' (' + esc(t.text) + ')'; }).join(", ") : " · list price") +
      (l.holds.length ? '<br><span style="color:var(--warn)">Would be held: ' + l.holds.map(function (h) { return esc(h.why); }).join("; ") + '</span>' : "");
  }
  function fbsRows(ls) {
    var per = {}; priceList().forEach(function (p) { per[p.sku] = p.unit || "Each"; });
    return [["Quantity", "Per", "SKU", "Description", "Date", "Unit Price", "Requested by", "Lab", "Charge"]].concat(ls.map(function (l) { var r = l.req; return [l.qty, per[r.sku] || "Each", r.sku, l.service, r.date, l.unit.toFixed(2), r.user, r.lab, r.charge]; }));
  }
  function trailRows(out) {
    return [["No.", "Date", "Requested by", "Lab", "SKU", "Description", "Quantity", "List price", "Unit price", "Total", "Status", "Price rules", "Holds", "Manager actions"]].concat(out.lines.map(function (l) {
      var r = l.req;
      return [r.id, r.date, r.user, r.lab, r.sku, l.service, l.qty, l.base.toFixed(2), l.unit.toFixed(2), l.amount.toFixed(2), l.held ? "held" : r.status,
        l.trace.map(function (t) { return t.name + ": " + t.text; }).join("; "), l.holds.map(function (h) { return h.name + ": " + h.why; }).join("; "), (r.log || []).join("; ")];
    }));
  }
  // What this core reports upward for the month: totals only, no requester names.
  function cultureSummary() {
    var d = desk(), P = A.svc().P, m = A.S.svc.model, out = run();
    var inMonth = out.lines.filter(function (l) { return String(l.req.date).indexOf(d.month) === 0 && (l.req.status === "delivered" || l.req.status === "billed"); });
    var good = inMonth.filter(function (l) { return !l.held; }), held = inMonth.filter(function (l) { return l.held; }), labs = {};
    good.forEach(function (l) { labs[l.req.lab] = (labs[l.req.lab] || 0) + l.amount; });
    return CP.summary({ core: "Cell culture core", kind: "services", month: d.month, billed: total(good), cost: P.cost / 12, target: 100 - (+m.subsidyPct || 0), lines: inMonth.length, held: held.length, heldAmount: total(held), corrected: d.corrected, labs: labs, source: "requests in this browser" });
  }
  function imagingSummary() {
    var S = A.S, T = A.totals(), U = A.usage(), avail = A.days() / 7 * 50 * 60, rows = S.A.rows, labs = {};
    rows.forEach(function (r) { if (r.pi) labs[r.pi + " Lab"] = (labs[r.pi + " Lab"] || 0) + A.finalCharge(r); });
    var open = rows.filter(function (r) { return A.C.needsAction(r) && !A.decided(r); });
    var first = rows[0] ? new Date(rows[0].day * 86400000).toISOString().slice(0, 7) : "";
    return CP.summary({ core: "Imaging core", kind: "hourly", month: first, billed: T.final, cost: T.booked, target: 100, lines: rows.length, held: open.length, heldAmount: A.sum(open, A.finalCharge), corrected: Math.abs(T.actual - T.booked),
      bookedH: T.hrs.booked / 60, measuredH: (S.A.hasRuns ? T.hrs.run : T.hrs.login) / 60, instruments: U.map(function (u) { return { name: u.res, util: u.run / avail, contract: 0 }; }), labs: labs, source: "files in this browser" });
  }

  // ---------- Rules
  function condHtml(x, c, i) {
    var F = RL.FIELDS, def = F[c.field] || F.lab, key = function (p) { return ' data-dkr="' + esc(x.id) + "|when." + i + "." + p + '"'; }, val;
    if (def.kind === "bool") val = '<select' + key("value") + ' aria-label="Yes or no">' + opt("yes", "yes", c.value) + opt("no", "no", c.value) + '</select>';
    else if (def.kind === "enum") val = '<select' + key("value") + ' aria-label="Value">' + def.options.map(function (o) { return opt(o, o, c.value); }).join("") + '</select>';
    else if (def.kind === "num") val = '<input type="number" step="any"' + key("value") + ' value="' + esc(c.value) + '" aria-label="Value">';
    else val = '<input type="text"' + (def.kind === "lab" ? ' list="dk-labs"' : "") + key("value") + ' value="' + esc(c.value) + '" aria-label="Value">';
    return '<div class="rline"><span class="kw">' + (i ? "and" : "When") + '</span><select' + key("field") + ' aria-label="Field">' + Object.keys(F).map(function (k) { return opt(k, F[k].label, c.field); }).join("") + '</select>' +
      (def.kind === "bool" ? '<span class="muted">:</span>' : '<select' + key("op") + ' aria-label="Comparison">' + RL.OPS_FOR[def.kind].map(function (o) { return opt(o, RL.OPS[o], c.op); }).join("") + '</select>') + val +
      (x.when.length > 1 ? '<button class="xbtn" data-dk="delcond" data-id="' + esc(x.id) + '" data-h="' + i + '" aria-label="Remove this condition">×</button>' : "") + '</div>';
  }
  function ruleHtml(x, st, month) {
    var act = RL.ACTIONS[x.then.type] || RL.ACTIONS.hold, hold = x.then.type === "hold", n = st ? st.n : 0;
    var fx = x.on === false ? "Off: not applied." : !n ? "No lines touched in the current data." : hold ? '<b>' + n + '</b> line' + (n === 1 ? "" : "s") + ' matched · ' + $(st.delta) + ' kept out of an invoice until checked' : '<b>' + n + '</b> line' + (n === 1 ? "" : "s") + ' changed · ' + (st.delta < 0 ? "−" : "+") + $(Math.abs(st.delta)).replace("-", "") + ' in total';
    return '<div class="rule' + (x.on === false ? " off" : "") + '"><label class="sw" title="Turn this rule on or off"><input type="checkbox" data-dkr="' + esc(x.id) + '|on"' + (x.on === false ? "" : " checked") + ' aria-label="Rule on: ' + esc(x.name) + '"></label><div>' +
      '<input type="text" class="rname" data-dkr="' + esc(x.id) + '|name" value="' + esc(x.name) + '" aria-label="Rule name">' +
      x.when.map(function (c, i) { return condHtml(x, c, i); }).join("") +
      '<div class="rline"><span class="kw">then</span>' + (hold ? '<span>hold the line for a look</span>' :
        '<select data-dkr="' + esc(x.id) + '|then.type" aria-label="Action">' + Object.keys(RL.ACTIONS).filter(function (k) { return RL.ACTIONS[k].kind === "price"; }).map(function (k) { return opt(k, RL.ACTIONS[k].label + " (" + RL.ACTIONS[k].unit + ")", x.then.type); }).join("") + '</select><input type="number" step="any" min="0" data-dkr="' + esc(x.id) + '|then.value" value="' + esc(x.then.value) + '" aria-label="Amount"> <span class="muted">' + esc(act.unit) + '</span>') +
      '<button class="linkb small" data-dk="addcond" data-id="' + esc(x.id) + '">+ condition</button></div>' +
      '<div class="fx">' + fx + '</div></div><button class="xbtn" data-dk="delrule" data-id="' + esc(x.id) + '" aria-label="Delete rule: ' + esc(x.name) + '">×</button></div>';
  }
  function viewRules() {
    var d = desk(), out = run(), R = A.C.rules(), T = A.totals();
    var price = d.rules.filter(function (x) { return x.then.type !== "hold"; }), hold = d.rules.filter(function (x) { return x.then.type === "hold"; });
    var hr = function (k, label, suf, step, hint) { return '<label>' + label + '<span><input type="number" min="0" step="' + step + '" data-dkh="' + k + '" value="' + esc(R[k]) + '"> ' + suf + '</span>' + (hint ? '<span class="small">' + hint + '</span>' : "") + '</label>'; };
    return '<h1 class="apph">Rules</h1><p class="muted small" style="margin:0 0 16px">How this core bills, written once in plain words. Rules run on every request and every instrument session; each charge keeps a note of the rules that touched it.</p>' + note() +
      '<datalist id="dk-labs">' + d.labs.map(function (L) { return '<option value="' + esc(L.name) + '">'; }).join("") + '</datalist>' +
      '<h2 style="margin-top:8px">Price rules · ' + price.length + '</h2><p class="muted small" style="margin:0 0 12px">Start from the list price on the <a href="#services">Prices</a> tab, then apply these top to bottom. This is where lab exceptions live.</p>' +
      price.map(function (x) { return ruleHtml(x, out.stats[x.id]); }).join("") + '<button class="btn ghost" data-dk="addrule" data-v="price">+ Price rule</button>' +
      '<h2>Hold rules · ' + hold.length + '</h2><p class="muted small" style="margin:0 0 12px">A line that matches is kept out of the FBS upload until someone fixes or approves it on the <a href="#requests">Requests</a> tab.</p>' +
      hold.map(function (x) { return ruleHtml(x, out.stats[x.id]); }).join("") + '<button class="btn ghost" data-dk="addrule" data-v="hold">+ Hold rule</button>' +
      '<h2>Instrument time rules</h2><p class="muted small" style="margin:0 0 12px">For instruments billed by the hour. These drive the <a href="#close">Close the month</a> tab: ' + T.flagged + ' lines flagged, ' + $(T.penalties) + ' in penalties in the loaded month.</p>' +
      '<div class="card"><div class="form">' + hr("grace", "Overrun grace", "min", 5, "billed at actual up to this") + hr("mult", "Penalty rate", "× hourly", 0.25, "past grace, and unbooked use") + hr("flat", "Flat penalty fee", "$", 5) + hr("noshow", "No-show charge", "% of booked", 5, "0 = flag only") + hr("early", "Early start allowed", "min", 5) + hr("round", "Round billed time up to", "min", 1, "1 = exact minutes") + '</div></div>' +
      '<p class="muted small" style="margin:18px 0 0"><button class="linkb small" data-dk="defaults">Restore the sample rules</button></p>';
  }
  function setPath(o, path, v) { var k = path.split("."); for (var i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = v; }

  // ---------- Research office
  function summaries() {
    var d = desk(), mine = [imagingSummary(), cultureSummary()], month = mine[1].month;
    var all = mine.concat(CP.samplePeers(month));
    d.extra.forEach(function (s) { var i = -1; all.forEach(function (x, k) { if (x.core === s.core) i = k; }); if (i >= 0) all[i] = s; else all.push(s); });
    return all;
  }
  function viewCampus() {
    var all = summaries(), R = CP.rollup(all, { expectedCores: ["Proteomics core"] }), T = R.totals, sim = all.filter(function (s) { return s.source === "simulated"; }).length;
    var unplanned = R.support - R.planned, hrs = all.filter(function (s) { return s.bookedH > 0; }), mx = Math.max(T.bookedH, T.measuredH) || 1;
    var short = function (n) { return n.replace(/ core$| cleanroom$/i, ""); };
    var recBar = function (c) { if (c.recovery == null) return "—"; var w = Math.min(c.recovery, 130) / 130 * 100, t = Math.min(c.s.target, 130) / 130 * 100, col = c.status === "under" ? "var(--bad)" : c.status === "over" ? "var(--warn)" : "var(--run)"; return '<span class="rec"><span class="t"><i style="width:' + w.toFixed(1) + '%;background:' + col + '"></i><u style="left:' + t.toFixed(1) + '%"></u></span><span>' + Math.round(c.recovery) + '%</span></span>'; };
    var color = function (u) { return u < .15 ? "var(--bad)" : u > .85 ? "var(--warn)" : "var(--run)"; };
    return '<h1 class="apph">Campus</h1><p class="muted small" style="margin:0 0 16px">Research office view · ' + esc(monthLabel(all[1].month)) + ' · ' + all.length + ' cores reporting, ' + R.instruments + ' instruments. Each core sends one month summary: totals by lab and instrument, no requester names.</p>' + note() +
      '<p class="notice-sim">Two cores come from this browser: the imaging core (the files on Close the month) and the cell culture core (Requests). ' + sim + ' more are simulated to show a campus rollout.</p>' +
      '<div class="grid g4">' + stat($(T.billed), "billed to labs this month") + stat($(T.cost), "cost of running the cores") + stat(R.recovery == null ? "—" : Math.round(R.recovery) + "%", "of cost recovered from users") + stat($(Math.max(0, unplanned)), "shortfall beyond the planned subsidy of " + $(R.planned), "hero") + '</div>' +
      (hrs.length ? '<div class="card" style="margin-top:16px"><h3>Hours: what FBS shows and what was measured</h3><p class="muted small" style="margin:0 0 10px">' + hrs.length + ' hourly cores. Bookings are what the university sees today; measured hours come from logins and run sensors.</p><div class="bars">' +
        '<div class="bar"><span>Booked in FBS</span><span class="t"><i style="width:' + (T.bookedH / mx * 100).toFixed(1) + '%;background:var(--book)"></i></span><span class="num">' + Math.round(T.bookedH).toLocaleString("en-US") + ' h</span></div>' +
        '<div class="bar"><span>Measured</span><span class="t"><i style="width:' + (T.measuredH / mx * 100).toFixed(1) + '%;background:var(--run)"></i></span><span class="num">' + Math.round(T.measuredH).toLocaleString("en-US") + ' h</span></div></div>' +
        '<p class="muted small" style="margin:10px 0 0">' + (R.hoursGap < 0 ? Math.abs(Math.round(R.hoursGap)) + '% fewer' : Math.round(R.hoursGap) + '% more') + ' hours ran than were booked. Rates set on booked hours inherit that gap.</p></div>' : "") +
      '<h2>Needs attention · ' + R.flags.length + '</h2>' + (R.flags.length ? R.flags.map(function (f) { return '<div class="find"><span class="sev ' + f.sev + '">' + f.sev + '</span><div><b>' + esc(f.core) + '</b> · ' + esc(f.text) + '</div></div>'; }).join("") : '<p class="ok">Nothing flagged.</p>') +
      '<h2>Core by core</h2><div class="tw"><table><thead><tr><th>Core</th><th class="n">Billed</th><th class="n">Cost</th><th>Recovered (mark = target)</th><th class="n">Against target</th><th class="n">Booked h</th><th class="n">Measured h</th><th class="n">Lines held</th><th>Source</th></tr></thead><tbody>' +
      R.cores.map(function (c) { var s = c.s; return '<tr><td><b>' + esc(s.core) + '</b><br><span class="small muted">' + (s.kind === "hourly" ? "bills by the hour" : "bills per item") + '</span></td><td class="n">' + $(s.billed) + '</td><td class="n">' + $(s.cost) + '</td><td>' + recBar(c) + '</td><td class="n" style="color:' + (c.status === "under" ? "var(--bad)" : c.status === "over" ? "var(--warn)" : "inherit") + '">' + (c.gap >= 0 ? "+" : "−") + $(Math.abs(c.gap)) + '</td><td class="n">' + (s.bookedH ? Math.round(s.bookedH).toLocaleString("en-US") : "—") + '</td><td class="n">' + (s.measuredH ? Math.round(s.measuredH).toLocaleString("en-US") : "—") + '</td><td class="n">' + s.held + ' / ' + s.lines + '</td><td class="small muted">' + esc(s.source) + '</td></tr>'; }).join("") +
      '</tbody><tfoot><tr><td>All cores</td><td class="n">' + $(T.billed) + '</td><td class="n">' + $(T.cost) + '</td><td>' + (R.recovery == null ? "" : Math.round(R.recovery) + "%") + '</td><td class="n">' + (T.billed - T.expected >= 0 ? "+" : "−") + $(Math.abs(T.billed - T.expected)) + '</td><td class="n">' + Math.round(T.bookedH).toLocaleString("en-US") + '</td><td class="n">' + Math.round(T.measuredH).toLocaleString("en-US") + '</td><td class="n">' + T.held + ' / ' + T.lines + '</td><td></td></tr></tfoot></table></div>' +
      '<h2>Labs across cores</h2><p class="muted small" style="margin:0 0 12px">A lab gets one invoice per core. This adds them up: who the heaviest users of shared equipment are, and where.</p><div class="tw"><table><thead><tr><th>Lab</th><th class="n">This month</th><th class="n">Cores used</th><th>Where</th></tr></thead><tbody>' +
      R.labs.slice(0, 10).map(function (L) { return '<tr><td>' + esc(L.lab) + '</td><td class="n"><b>' + $(L.total) + '</b></td><td class="n">' + L.n + '</td><td class="wrap small muted">' + Object.keys(L.cores).sort(function (a, b) { return L.cores[b] - L.cores[a]; }).map(function (k) { return esc(short(k)) + " " + $(L.cores[k]); }).join(" · ") + '</td></tr>'; }).join("") + '</tbody></table></div>' +
      '<h2>Instruments</h2><div class="grid g3">' + stat(R.instruments, "instruments tracked") + stat(R.idle.length, "under 15% used: review the service contract") + stat(R.full.length, "over 85% used: candidates for a second unit") + '</div>' +
      '<div class="legend" style="margin:18px 0 4px"><span><i class="dot" style="background:var(--bad)"></i>Under 15%</span><span><i class="dot" style="background:var(--run)"></i>Healthy</span><span><i class="dot" style="background:var(--warn)"></i>Over 85%</span><span>Share of 50 staffed hours a week</span></div>' +
      '<div class="heat">' + all.filter(function (s) { return s.instruments.length; }).map(function (s) { return '<div class="hcore">' + esc(s.core) + (s.source === "simulated" ? " (simulated)" : "") + '</div>' + s.instruments.map(function (i) { return '<div class="hrow"><span class="nm">' + esc(i.name) + '</span><span class="t"><i style="width:' + Math.max(2, Math.min(100, i.util * 100)).toFixed(1) + '%;background:' + color(i.util) + '"></i></span><span class="num small">' + Math.round(i.util * 100) + '%</span></div>'; }).join(""); }).join("") + '</div>' +
      '<h2>How cores report</h2><p class="muted small" style="margin:0 0 12px">Today a core downloads its month summary and sends the file. There is no live feed from FBS or from the cores yet.</p>' +
      '<div class="row"><label class="btn" style="cursor:pointer">Add a core\'s summary (JSON)<input type="file" accept=".json,application/json" data-dkfile="summary" hidden></label><button class="btn ghost" data-dk="rollcsv">Roll-up table (CSV)</button><button class="btn ghost" data-dk="mine">This browser\'s two summaries (JSON)</button></div>';
  }

  A.views.requests = viewRequests; A.views.rules = viewRules; A.views.campus = viewCampus;

  // ---------- events
  var rr = function () { save(); A.render(true); };
  app.addEventListener("click", function (e) {
    var b = e.target.closest("[data-dk]"); if (!b) return;
    var a = b.dataset.dk, d = desk(), id = b.dataset.id, r, x;
    if (a === "filter") { UI.filter = b.dataset.v; UI.all = false; A.render(true); }
    if (a === "showall") { UI.all = true; A.render(true); }
    if (a === "add") {
      var v = formVal(), L = d.labs.filter(function (q) { return q.name === v.lab; })[0];
      if (!v.user) { A.alertBox("Add the requester's name first."); return; }
      if (!v.qty) { A.alertBox("Quantity has to be at least 1."); return; }
      r = { id: "R" + (d.seq++), date: v.date || new Date().toISOString().slice(0, 10), user: v.user, lab: v.lab, sku: v.sku, qty: v.qty, charge: L ? L.charge || "" : "", status: "new" };
      d.requests.push(r); UI.filter = "all"; UI.note = "Added " + r.id + " for " + r.user + ". It shows at the top of the list below."; rr();
    }
    if (a === "fix" || a === "ok") {
      r = byId(id); if (!r) return;
      var line = run().lines.filter(function (l) { return l.req === r; })[0], before = line.amount; r.log = r.log || [];
      if (a === "ok") { r.ok = true; r.log.push("Approved as is despite: " + line.holds.map(function (h) { return h.name; }).join(", ")); }
      else {
        var h = line.holds[+b.dataset.h]; if (!h || !h.fix) return;
        if (h.fix.set) Object.keys(h.fix.set).forEach(function (k) { r[k] = h.fix.set[k]; });
        if (h.fix.roster) { var lab = d.labs.filter(function (q) { return q.name === h.fix.roster.lab; })[0]; if (lab && lab.members.indexOf(h.fix.roster.user) < 0) lab.members.push(h.fix.roster.user); }
        r.log.push(h.name + ": " + h.fix.label.charAt(0).toLowerCase() + h.fix.label.slice(1));
        var after = run().lines.filter(function (l) { return l.req === r; })[0].amount;
        d.corrected += Math.abs(before - after) || (h.fix.set && h.fix.set.lab ? after : 0);
      }
      rr();
    }
    if (a === "bill") {
      var ready = groups(run()).ready; if (!ready.length) return;
      A.dlCsv("labro-fbs-upload.csv", fbsRows(ready));
      ready.forEach(function (l) { l.req.status = "billed"; l.req.unit = l.unit; l.req.amount = l.amount; });
      UI.note = ready.length + " lines, " + $2(total(ready)) + ", written to labro-fbs-upload.csv and marked billed. Held lines stay here until fixed."; rr();
    }
    if (a === "trail") A.dlCsv("labro-audit-trail.csv", trailRows(run()));
    if (a === "summary") dl("labro-summary-cell-culture-" + d.month + ".json", JSON.stringify(cultureSummary(), null, 1), "application/json");
    if (a === "mine") dl("labro-summaries-" + d.month + ".json", JSON.stringify([imagingSummary(), cultureSummary()], null, 1), "application/json");
    if (a === "rollcsv") { var R = CP.rollup(summaries()); A.dlCsv("labro-campus-rollup.csv", [["Core", "Month", "Billed", "Cost", "Recovered %", "Target %", "Against target", "Booked hours", "Measured hours", "Lines", "Lines held", "Source"]].concat(R.cores.map(function (c) { var s = c.s; return [s.core, s.month, s.billed.toFixed(2), s.cost.toFixed(2), c.recovery == null ? "" : c.recovery.toFixed(1), s.target, c.gap.toFixed(2), Math.round(s.bookedH), Math.round(s.measuredH), s.lines, s.held, s.source]; }))); }
    if (a === "reset") { D = RL.sampleDesk(A.svc().P); D.extra = []; D.corrected = 0; UI.note = "Back to the sample month."; rr(); }
    if (a === "defaults") { d.rules = RL.defaults(); UI.note = "Sample rules restored."; rr(); }
    if (a === "addrule") {
      x = b.dataset.v === "hold" ? { name: "New hold rule", when: [{ field: "amount", op: "gte", value: 1000 }], then: { type: "hold" } } : { name: "New price rule", when: [{ field: "lab", op: "is", value: d.labs[0] ? d.labs[0].name : "" }], then: { type: "discount_pct", value: 10 } };
      x.id = "r" + Date.now().toString(36); x.on = true; d.rules.push(x); rr();
    }
    x = id && d.rules.filter(function (q) { return q.id === id; })[0];
    if (a === "delrule" && x) { d.rules.splice(d.rules.indexOf(x), 1); rr(); }
    if (a === "addcond" && x) { x.when.push({ field: "service", op: "contains", value: "" }); rr(); }
    if (a === "delcond" && x) { x.when.splice(+b.dataset.h, 1); rr(); }
  });
  app.addEventListener("change", function (e) {
    var t = e.target, d = desk();
    if (t.dataset.dkstatus) { var r = byId(t.dataset.dkstatus); if (r) { r.status = t.value; rr(); } return; }
    if (t.dataset.dkr) {
      var p = t.dataset.dkr.split("|"), x = d.rules.filter(function (q) { return q.id === p[0]; })[0]; if (!x) return;
      if (p[1] === "on") x.on = t.checked;
      else if (p[1] === "name") x.name = t.value.trim() || "Untitled rule";
      else {
        setPath(x, p[1], /\.value$/.test(p[1]) && t.type === "number" ? parseFloat(t.value) || 0 : t.value);
        var m = /^when\.(\d+)\.field$/.exec(p[1]);
        if (m) { var c = x.when[+m[1]], def = RL.FIELDS[c.field]; c.op = RL.OPS_FOR[def.kind][0]; c.value = def.kind === "bool" ? "no" : def.kind === "enum" ? def.options[0] : def.kind === "num" ? 1 : ""; }
      }
      rr(); return;
    }
    if (t.dataset.dkh) { var R = A.C.rules(), k = t.dataset.dkh; R[k] = Math.max(k === "mult" || k === "round" ? 1 : 0, parseFloat(t.value) || 0); try { localStorage.setItem("labmeter-audit-rules-v1", JSON.stringify(R)); } catch (err) { /* private mode */ } A.render(true); return; }
    if (t.dataset.dkf) {
      if (t.dataset.dkf === "user") { var home = d.labs.filter(function (L) { return (L.members || []).indexOf(t.value.trim()) >= 0; })[0], sel = app.querySelector('[data-dkf="lab"]'); if (home && sel) sel.value = home.name; }
      preview(); return;
    }
    if (t.dataset.dkfile && t.files[0]) {
      var f = t.files[0], kind = t.dataset.dkfile;
      (kind === "summary" ? new Promise(function (res) { var rd = new FileReader(); rd.onload = function () { res(rd.result); }; rd.readAsText(f); }) : A.readText(f)).then(function (txt) {
        if (kind === "summary") { var got = CP.parse(txt); got.forEach(function (s) { d.extra = d.extra.filter(function (q) { return q.core !== s.core; }); d.extra.push(s); }); UI.note = "Added " + got.map(function (s) { return s.core; }).join(", ") + " from " + f.name + "."; }
        else {
          var lines = A.SV.linesFromTable(A.C.parseCSV(txt)); if (!lines.length) throw new Error("No request lines found in " + f.name + ".");
          lines.forEach(function (l) { var L = d.labs.filter(function (q) { return q.name === l.lab; })[0]; d.requests.push({ id: "R" + (d.seq++), date: l.date, user: l.user, lab: l.lab, sku: l.sku, desc: l.desc, qty: l.qty, charge: l.charge || (L ? "" : ""), status: "delivered" }); });
          UI.note = "Imported " + lines.length + " requests from " + f.name + " as delivered. Anything that breaks a rule is under Held.";
        }
        rr();
      }).catch(function (err) { A.alertBox(err.message); });
    }
  });
  app.addEventListener("input", function (e) { if (e.target.dataset && e.target.dataset.dkf) { if (e.target.dataset.dkf === "user") { var d = desk(), home = d.labs.filter(function (L) { return (L.members || []).indexOf(e.target.value.trim()) >= 0; })[0], sel = app.querySelector('[data-dkf="lab"]'); if (home && sel) sel.value = home.name; } preview(); } });

  // ---------- role switch: the research office sees Campus; everything else is the core manager's
  var lastCore = "requests";
  function role() {
    var office = A.tab() === "campus"; if (!office) lastCore = A.tab();
    document.body.setAttribute("data-role", office ? "office" : "core");
    document.querySelectorAll("[data-rolebtn]").forEach(function (a) { var on = (a.dataset.rolebtn === "office") === office; if (on) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); if (a.dataset.rolebtn === "core") a.setAttribute("href", "#" + lastCore); });
  }
  window.addEventListener("hashchange", role); role();
  window.LBDesk = { desk: desk, run: run, summaries: summaries, cultureSummary: cultureSummary, imagingSummary: imagingSummary };
})();
