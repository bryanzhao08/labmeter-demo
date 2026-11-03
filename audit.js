"use strict";
/* LabMeter monthly audit: reservations export vs usage log (vs optional sensor runs), per user per day,
   with the core's own grace and penalty rules. Everything runs in the browser; files are never uploaded. */
(function () {
  var RULES_KEY = "labmeter-audit-rules-v1";
  var DEF = { grace: 60, early: 15, mult: 2, flat: 0, noshow: 0, round: 1, basis: "instrument", transferMin: 30 };
  var SRC = {
    res: {
      label: "Reservations", hint: "FBS reservation export", sample: "data/audit/fbs_reservations.csv", sampleName: "fbs_reservations.csv",
      fields: [
        ["resource", "Instrument / resource", [/resource|instrument|equipment|system/i], true],
        ["user", "User email or username", [/e-?mail/i, /user ?name|netid|login/i, /user/i], true],
        ["name", "User name", [/reserved by|full name|^name$|^user$/i], false],
        ["account", "Account / grant", [/account|fund|grant|chart|cost/i], false],
        ["pi", "PI / lab", [/^pi$|principal|^lab$|^group$/i], false],
        ["start", "Start date (or date and time)", [/start ?date/i, /^date$/i, /^start|begin|^from/i], true],
        ["startTime", "Start time", [/start ?time/i], false],
        ["end", "End date (or date and time)", [/end ?date/i, /^end|finish|^to$/i], false],
        ["endTime", "End time", [/end ?time/i], false],
        ["status", "Status", [/status|state/i], false]
      ]
    },
    use: {
      label: "Usage log", hint: "Bookitlab, software or login log", sample: "data/audit/usage_log.csv", sampleName: "usage_log.csv",
      fields: [
        ["instrument", "Workstation / instrument", [/workstation|computer|host|machine|pc/i, /instrument|resource|system/i], true],
        ["user", "Username", [/user|netid|e-?mail|account name/i], true],
        ["start", "Session start", [/logon|log ?in|start|begin|^in$/i], true],
        ["end", "Session end", [/logoff|log ?out|end|stop|^out$/i], true]
      ]
    },
    run: {
      label: "Instrument runs", hint: "LabMeter sensor (optional)", sample: "data/audit/instrument_runs.csv", sampleName: "instrument_runs.csv", optional: true,
      fields: [
        ["instrument", "Sensor / instrument", [/sensor|instrument|device|resource/i], true],
        ["start", "Run start", [/start|begin/i], true],
        ["end", "Run end", [/end|stop/i], true]
      ]
    }
  };
  var ST = { files: {}, amap: { use: {}, run: {} }, filter: "action", open: {}, sample: false, rates: {} };
  var H, root;

  // ---------- utils
  function loadRules() { var r = {}; try { r = JSON.parse(localStorage.getItem(RULES_KEY) || "{}") || {}; } catch (e) { r = {}; } var o = {}; Object.keys(DEF).forEach(function (k) { o[k] = r[k] != null ? r[k] : DEF[k]; }); o.rates = r.rates || {}; return o; }
  var R = loadRules();
  function saveRules() { try { localStorage.setItem(RULES_KEY, JSON.stringify(R)); } catch (e) { /* ignore */ } }
  function esc(s) { return H.esc(s); }
  function money(n) { return H.fmtMoney(n); }
  function hm(min) { min = Math.round(min); var h = Math.floor(min / 60), m = min % 60; return h ? h + " h" + (m ? " " + m + " m" : "") : m + " m"; }
  var dayf = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  function dayLabel(d) { return dayf.format(new Date(d * 86400000)); }
  function clock(m) { var d = new Date(m * 60000); return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
  function isoDay(d) { return new Date(d * 86400000).toISOString().slice(0, 10); }

  function parseCSV(text) {
    text = String(text).replace(/^﻿/, "");
    var first = text.split(/\r?\n/, 1)[0] || "", delim = ",";
    if ((first.match(/\t/g) || []).length > (first.match(/,/g) || []).length) delim = "\t";
    else if ((first.match(/;/g) || []).length > (first.match(/,/g) || []).length) delim = ";";
    var rows = [], row = [], f = "", q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(f); f = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(f); rows.push(row); row = []; f = ""; }
      else f += c;
    }
    if (f !== "" || row.length) { row.push(f); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ""; }); });
    var head = (rows.shift() || []).map(function (h) { return String(h).trim(); });
    return { head: head, rows: rows };
  }
  // Naive wall-clock minutes (no time zone conversion): both exports are in the facility's local time.
  function parseDT(a, b) {
    var s = (String(a == null ? "" : a).trim() + (b ? " " + String(b).trim() : "")).trim(), m, Y, Mo, D, h = 0, mi = 0, se = 0, ap;
    if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(am|pm)?)?/i.exec(s))) { Y = +m[1]; Mo = +m[2]; D = +m[3]; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0); ap = m[7]; }
    else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?/i.exec(s))) { Y = +m[3]; if (Y < 100) Y += 2000; Mo = +m[1]; D = +m[2]; h = +(m[4] || 0); mi = +(m[5] || 0); se = +(m[6] || 0); ap = m[7]; }
    else if ((m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s))) { return { timeOnly: (((+m[1]) % 12 + (m[4] && /pm/i.test(m[4]) ? 12 : (m[4] ? 0 : (+m[1] >= 12 ? 12 : 0)))) * 60 + +m[2]) }; }
    else { var t = Date.parse(s); return isNaN(t) ? NaN : t / 60000; }
    if (ap) { h = h % 12 + (/pm/i.test(ap) ? 12 : 0); }
    return Date.UTC(Y, Mo - 1, D, h, mi, se) / 60000;
  }
  function userKey(v) { v = String(v || "").trim().toLowerCase(); var at = v.indexOf("@"); if (at > 0) v = v.slice(0, at); var bs = v.lastIndexOf("\\"); if (bs >= 0) v = v.slice(bs + 1); return v; }
  function squash(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  function guessResource(name, resources) {
    var toks = String(name).toLowerCase().split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 3; }), best = "", bs = 0;
    resources.forEach(function (r) { var sq = squash(r), sc = 0; toks.forEach(function (t) { if (sq.indexOf(t) >= 0) sc += t.length; }); if (squash(name) === sq) sc += 100; if (sc > bs) { bs = sc; best = r; } });
    return best;
  }
  function guessMap(src, head) {
    var used = {}, map = {};
    SRC[src].fields.forEach(function (f) {
      for (var p = 0; p < f[2].length && map[f[0]] == null; p++) {
        for (var k = 0; k < head.length; k++) { if (!used[k] && f[2][p].test(head[k])) { map[f[0]] = k; used[k] = 1; break; } }
      }
      if (map[f[0]] == null) map[f[0]] = -1;
    });
    return map;
  }
  // intervals: arrays of [s, e]
  function merge(list) { list = list.filter(function (x) { return x[1] > x[0]; }).sort(function (a, b) { return a[0] - b[0]; }); var o = []; list.forEach(function (x) { var l = o[o.length - 1]; if (l && x[0] <= l[1]) l[1] = Math.max(l[1], x[1]); else o.push([x[0], x[1]]); }); return o; }
  function inter(a, b) { var o = []; a.forEach(function (x) { b.forEach(function (y) { var s = Math.max(x[0], y[0]), e = Math.min(x[1], y[1]); if (e > s) o.push([s, e]); }); }); return merge(o); }
  function len(list) { return list.reduce(function (s, x) { return s + x[1] - x[0]; }, 0); }

  // ---------- data in
  function setFile(src, name, text) {
    var p = parseCSV(text);
    ST.files[src] = { name: name, head: p.head, rows: p.rows, map: guessMap(src, p.head) };
    ST.amap[src] = {};
  }
  function loadSample() {
    ST.sample = true;
    return Promise.all(["res", "use", "run"].map(function (k) { return fetch(SRC[k].sample).then(function (r) { if (!r.ok) throw new Error(SRC[k].sample + " " + r.status); return r.text(); }).then(function (t) { setFile(k, SRC[k].sampleName, t); }); }));
  }
  function col(f, row, key) { var i = f.map[key]; return i != null && i >= 0 ? row[i] : ""; }
  function build() {
    var out = { res: [], use: [], run: [], bad: { res: 0, use: 0, run: 0 }, resources: [], unmapped: { use: [], run: [] } };
    var fr = ST.files.res;
    if (!fr) return out;
    var names = {};
    fr.rows.forEach(function (row) {
      var st = col(fr, row, "status");
      if (/cancel|delet|denied|reject/i.test(st)) return;
      var s = parseDT(col(fr, row, "start"), col(fr, row, "startTime")), e;
      var ed = col(fr, row, "end"), et = col(fr, row, "endTime");
      if (fr.map.end >= 0 && ed) e = parseDT(ed, et);
      else if (et && typeof s === "number") { var tt = parseDT(et); e = tt && tt.timeOnly != null ? Math.floor(s / 1440) * 1440 + tt.timeOnly : NaN; if (e <= s) e += 1440; }
      var res = String(col(fr, row, "resource")).trim(), u = userKey(col(fr, row, "user"));
      if (typeof s !== "number" || typeof e !== "number" || isNaN(s) || isNaN(e) || e <= s || !res || !u) { out.bad.res++; return; }
      var nm = String(col(fr, row, "name")).trim(); if (nm) names[u] = nm;
      out.res.push({ res: res, user: u, acct: String(col(fr, row, "account")).trim() || "(no account)", pi: String(col(fr, row, "pi")).trim(), s: s, e: e });
    });
    out.names = names;
    var rs = {}; out.res.forEach(function (r) { rs[r.res] = 1; }); out.resources = Object.keys(rs).sort();
    ["use", "run"].forEach(function (k) {
      var f = ST.files[k]; if (!f) return;
      var seen = {};
      f.rows.forEach(function (row) {
        var n = String(col(f, row, "instrument")).trim(), s = parseDT(col(f, row, "start")), e = parseDT(col(f, row, "end"));
        if (!n || typeof s !== "number" || typeof e !== "number" || isNaN(s) || isNaN(e) || e <= s) { out.bad[k]++; return; }
        if (!(n in ST.amap[k])) ST.amap[k][n] = guessResource(n, out.resources);
        seen[n] = 1;
        var res = ST.amap[k][n];
        if (!res) return;
        var o = { res: res, s: s, e: e }; if (k === "use") o.user = userKey(col(f, row, "user"));
        out[k].push(o);
      });
      Object.keys(seen).forEach(function (n) { if (!ST.amap[k][n]) out.unmapped[k].push(n); });
    });
    return out;
  }

  // ---------- reconciliation
  function audit(B, basis) {
    var hasRuns = B.run.length > 0;
    if (!hasRuns) basis = "computer";
    var runsBy = {}; B.run.forEach(function (r) { (runsBy[r.res] || (runsBy[r.res] = [])).push([r.s, r.e]); });
    Object.keys(runsBy).forEach(function (k) { runsBy[k] = merge(runsBy[k]); });
    var acctOf = {}; B.res.forEach(function (r) { acctOf[r.user] = acctOf[r.user] || { acct: r.acct, pi: r.pi }; });
    var rows = {}, rateOf = function (res) { var v = parseFloat(R.rates[res]); return isNaN(v) ? 50 : v; };
    function row(res, user, day) {
      var k = day + "|" + res + "|" + user;
      return rows[k] || (rows[k] = { key: k, day: day, res: res, user: user, booked: 0, comp: 0, inst: 0, billed: 0, outside: 0, charge: 0, penalty: 0, flags: {}, bk: [], ss: [], rn: [], notes: [] });
    }
    var resBy = {}; B.res.forEach(function (r) { (resBy[r.res + "|" + r.user] || (resBy[r.res + "|" + r.user] = [])).push(r); });
    var hit = {};
    B.use.forEach(function (u) {
      var mine = resBy[u.res + "|" + u.user] || [];
      var win = mine.map(function (r) { return [r.s - R.early, r.e]; });
      var sess = [[u.s, u.e]], runs = hasRuns ? inter(sess, runsBy[u.res] || []) : [];
      var used = basis === "instrument" ? runs : sess;
      var cov = inter(used, win), usedM = len(used), covM = len(cov), out = usedM - covM;
      var touches = mine.filter(function (r) { return r.s - R.early < u.e && r.e + R.grace + 240 > u.s; });
      touches.forEach(function (r) { hit[r.s + "|" + r.res + "|" + r.user] = 1; });
      var rw = row(u.res, u.user, Math.floor(u.s / 1440)), rate = rateOf(u.res) / 60;
      var inc = Math.max(1, +R.round || 1), billM = Math.ceil(usedM / inc - 1e-9) * inc;
      if (usedM < 0.5) billM = 0;
      rw.ss.push([u.s, u.e]); runs.forEach(function (x) { rw.rn.push(x); });
      rw.comp += u.e - u.s; rw.inst += len(runs); rw.billed += billM; rw.outside += out;
      var base = billM * rate, pen = 0;
      if (usedM < 0.5) { rw.flags.idle = 1; rw.notes.push("Logged in " + clock(u.s) + "–" + clock(u.e) + ", instrument never ran"); }
      else if (!touches.length || covM < 0.5) { pen = billM * rate * (R.mult - 1) + (+R.flat || 0); rw.flags.unbooked = 1; rw.notes.push("No reservation for " + clock(u.s) + "–" + clock(u.e) + " (" + hm(usedM) + " used)"); }
      else if (out > R.grace) { pen = out * rate * (R.mult - 1) + (+R.flat || 0); rw.flags.penalty = 1; rw.notes.push("Ran " + hm(out) + " past the reservation (grace " + hm(R.grace) + ")"); }
      else if (out >= 5) { rw.flags.grace = 1; rw.notes.push("Ran " + hm(out) + " past the reservation, within grace, billed at actual"); }
      if (hasRuns && (u.e - u.s) - len(runs) >= R.transferMin && usedM >= 0.5) { rw.flags.transfer = 1; rw.notes.push("Computer stayed on " + hm((u.e - u.s) - len(runs)) + " after acquisition (data transfer)" + (basis === "instrument" ? ", not billed" : "")); }
      rw.charge += base + pen; rw.penalty += pen;
    });
    B.res.forEach(function (r) {
      var rw = row(r.res, r.user, Math.floor(r.s / 1440));
      rw.booked += r.e - r.s; rw.bk.push([r.s, r.e]);
      if (!hit[r.s + "|" + r.res + "|" + r.user]) {
        var pen = (r.e - r.s) * rateOf(r.res) / 60 * (+R.noshow || 0) / 100;
        rw.flags.noshow = 1; rw.penalty += pen; rw.charge += pen; rw.notes.push("Booked " + clock(r.s) + "–" + clock(r.e) + ", no session" + (pen ? ", no-show fee" : ""));
      }
    });
    var list = Object.keys(rows).map(function (k) { var r = rows[k], a = acctOf[r.user] || { acct: "(unknown user)", pi: "" }; r.acct = a.acct; r.pi = a.pi; r.name = B.names[r.user] || r.user; r.status = status(r); return r; });
    list.sort(function (a, b) { return a.day - b.day || a.res.localeCompare(b.res) || a.name.localeCompare(b.name); });
    return { rows: list, basis: basis, hasRuns: hasRuns };
  }
  var STATUS = {
    unbooked: ["Unbooked use", "danger", 0], penalty: ["Overrun past grace", "danger", 1], noshow: ["No-show", "muted", 2],
    idle: ["Logged in, never ran", "muted", 3], grace: ["Overrun within grace", "warn", 4], transfer: ["Data transfer excluded", "info", 5], ok: ["Matches", "ok", 6]
  };
  function status(r) { var best = "ok"; Object.keys(r.flags).forEach(function (f) { if (STATUS[f][2] < STATUS[best][2]) best = f; }); return best; }
  function needsAction(r) { return r.flags.unbooked || r.flags.penalty || r.flags.noshow; }

  // ---------- render
  function srcCard(k) {
    var s = SRC[k], f = ST.files[k];
    var stat = f ? '<span class="aok">' + esc(f.name) + "</span> · " + f.rows.length + " rows" : '<span class="muted">' + (s.optional ? "Not loaded (optional)" : "Not loaded") + "</span>";
    var miss = f ? s.fields.filter(function (x) { return x[3] && !(f.map[x[0]] >= 0); }) : [];
    var map = f ? '<details class="amap"' + (miss.length ? " open" : "") + "><summary>Columns" + (miss.length ? ' <span class="atag danger">' + miss.length + " missing</span>" : ' <span class="muted">auto-detected</span>') + "</summary>" +
      s.fields.map(function (x) {
        return '<label class="arow2"><span>' + esc(x[1]) + (x[3] ? "" : ' <span class="muted">(optional)</span>') + '</span><select data-src="' + k + '" data-field="' + x[0] + '"><option value="-1">(none)</option>' +
          f.head.map(function (h, i) { return '<option value="' + i + '"' + (f.map[x[0]] === i ? " selected" : "") + ">" + esc(h) + "</option>"; }).join("") + "</select></label>";
      }).join("") + "</details>" : "";
    return '<div class="card asrc"><div class="asrch"><h3>' + esc(s.label) + '</h3><span class="muted small">' + esc(s.hint) + '</span></div><p class="small">' + stat + "</p>" +
      '<div class="btnrow"><label class="btn sm"><input type="file" accept=".csv,.tsv,.txt,text/csv" data-up="' + k + '" class="vh">Upload CSV</label><a class="btn sm" href="' + s.sample + '" download>Sample file</a>' + (f && k === "run" ? '<button class="btn sm" data-clear="run" type="button">Remove</button>' : "") + "</div>" + map + "</div>";
  }
  function num(id, label, val, unit, step, help) {
    return '<label class="rule"><span class="rl">' + label + '</span><span class="ri"><input type="number" inputmode="decimal" min="0" step="' + (step || 1) + '" id="' + id + '" value="' + esc(val) + '"><span class="muted small">' + unit + "</span></span>" + (help ? '<span class="rh">' + help + "</span>" : "") + "</label>";
  }
  function rulesCard(B) {
    var hasRuns = !!(ST.files.run && B.run.length);
    return '<div class="card"><div class="rules">' +
      num("r-grace", "Overrun grace", R.grace, "min", 5, "Use past the reservation up to this is billed at actual") +
      num("r-mult", "Penalty rate", R.mult, "× hourly", 0.25, "Applied to overrun past grace and to unbooked use") +
      num("r-flat", "Flat penalty fee", R.flat, "$ per incident", 5) +
      num("r-noshow", "No-show charge", R.noshow, "% of booked", 5, "0 = flag only") +
      num("r-early", "Early start allowed", R.early, "min", 5) +
      num("r-round", "Round billed time up to", R.round, "min", 1, "1 = exact minutes") +
      '</div><fieldset class="seg"><legend>Bill on</legend>' +
      '<label><input type="radio" name="basis" value="instrument"' + (R.basis === "instrument" && hasRuns ? " checked" : "") + (hasRuns ? "" : " disabled") + '><span>Instrument running<small>Sensor runs inside the session</small></span></label>' +
      '<label><input type="radio" name="basis" value="computer"' + (R.basis === "computer" || !hasRuns ? " checked" : "") + '><span>Computer session<small>Logon to logoff</small></span></label></fieldset>' +
      (hasRuns ? "" : '<p class="small muted tight">Add instrument runs to bill only time the instrument ran, so data transfer after acquisition is not charged.</p>') +
      '<details class="amap"><summary>Hourly rates and instrument names</summary><div class="rates">' +
      B.resources.map(function (r) { return '<label class="arow2"><span>' + esc(r) + '</span><span class="ri"><span class="muted small">$</span><input type="number" min="0" step="1" data-rate="' + esc(r) + '" value="' + esc(R.rates[r] != null ? R.rates[r] : 50) + '"><span class="muted small">/h</span></span></label>'; }).join("") +
      ["use", "run"].map(function (k) {
        var m = ST.amap[k], ns = Object.keys(m);
        if (!ns.length) return "";
        return '<p class="small muted tight">' + esc(SRC[k].label) + " names matched to reservation resources</p>" + ns.sort().map(function (n) {
          return '<label class="arow2"><span>' + esc(n) + '</span><select data-amap="' + k + '" data-name="' + esc(n) + '"><option value="">(ignore)</option>' + B.resources.map(function (r) { return "<option" + (m[n] === r ? " selected" : "") + ">" + esc(r) + "</option>"; }).join("") + "</select></label>";
        }).join("");
      }).join("") + "</div></details></div>";
  }
  function sum(rows, f) { return rows.reduce(function (s, r) { return s + f(r); }, 0); }
  function tag(st) { return '<span class="ftag f-' + st + '">' + esc(STATUS[st][0]) + "</span>"; }
  function mini(r) {
    var all = r.bk.concat(r.ss, r.rn); if (!all.length) return "";
    var lo = Math.min.apply(null, all.map(function (x) { return x[0]; })) - 20, hi = Math.max.apply(null, all.map(function (x) { return x[1]; })) + 20;
    lo = Math.floor(lo / 60) * 60; hi = Math.ceil(hi / 60) * 60;
    var W = 640, lx = 92, pw = W - lx - 8, L = 14, g = 6, lanes = [["Reserved", r.bk, "var(--book)"], ["Computer", r.ss, "var(--claim)"]];
    if (r.rn.length || ST.files.run) lanes.push(["Instrument", r.rn, "var(--run)"]);
    var Hh = lanes.length * (L + g) + 20, x = function (m) { return lx + (m - lo) / (hi - lo) * pw; };
    var s = '<svg class="amini" viewBox="0 0 ' + W + " " + Hh + '" role="img" aria-label="Reserved, computer and instrument time for this day">';
    for (var t = lo; t <= hi; t += 60) s += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="0" y2="' + (Hh - 16) + '" stroke="var(--line)"/><text x="' + x(t) + '" y="' + (Hh - 3) + '" text-anchor="middle">' + clock(t) + "</text>";
    lanes.forEach(function (ln, i) {
      var y = i * (L + g);
      s += '<text x="0" y="' + (y + 11) + '">' + ln[0] + '</text><rect x="' + lx + '" y="' + y + '" width="' + pw + '" height="' + L + '" rx="3" fill="var(--surface2)"/>';
      ln[1].forEach(function (iv) { s += '<rect x="' + x(iv[0]).toFixed(1) + '" y="' + y + '" width="' + Math.max(2, x(iv[1]) - x(iv[0])).toFixed(1) + '" height="' + L + '" rx="2" fill="' + ln[2] + '"><title>' + ln[0] + " " + clock(iv[0]) + "–" + clock(iv[1]) + "</title></rect>"; });
    });
    return s + "</svg>";
  }
  function results(B) {
    var el = root.querySelector("#ares");
    if (!ST.files.res || !ST.files.use) { el.innerHTML = '<p class="empty">Load a reservations export and a usage log to run the audit.</p>'; return; }
    if (!B.res.length) { el.innerHTML = '<p class="notice">No reservations could be read. Check the column choices under Reservations.</p>'; return; }
    var t0 = performance.now(), A = audit(B, R.basis), other = A.hasRuns ? audit(B, A.basis === "instrument" ? "computer" : "instrument") : null, ms = performance.now() - t0;
    var rows = A.rows, act = rows.filter(needsAction);
    var pen = sum(rows, function (r) { return r.penalty; }), chg = sum(rows, function (r) { return r.charge; });
    var cnt = function (f) { return rows.filter(function (r) { return r.flags[f]; }).length; };
    var days = rows.length ? Math.round(rows[rows.length - 1].day - rows[0].day + 1) : 0;
    var h = '<p class="small muted arun">Matched ' + B.res.length + " reservations against " + B.use.length + " sessions" + (A.hasRuns ? " and " + B.run.length + " instrument runs" : "") + " over " + days + " days in " + Math.max(1, Math.round(ms)) + " ms." +
      (B.bad.res + B.bad.use + B.bad.run ? " Skipped " + (B.bad.res + B.bad.use + B.bad.run) + " rows with unreadable times." : "") +
      (B.unmapped.use.length ? ' <b class="warnt">' + B.unmapped.use.length + " workstation" + (B.unmapped.use.length > 1 ? "s" : "") + " not matched to an instrument.</b>" : "") + "</p>";
    h += H.strip([
      { l: "Needs a decision", v: String(act.length), n: cnt("unbooked") + " unbooked · " + cnt("penalty") + " past grace · " + cnt("noshow") + " no-shows" },
      { l: "Penalties", v: money(pen), n: "From your rules above" },
      { l: "Total to bill", v: money(chg), n: rows.length + " user-days" },
      A.hasRuns ? { l: "Data transfer not billed", v: hm(sum(rows, function (r) { return r.flags.transfer && r.inst ? r.comp - r.inst : 0; })), n: A.basis === "instrument" ? "Computer on, instrument idle" : "Switch to Instrument running to exclude" }
        : { l: "Overruns within grace", v: String(cnt("grace")), n: "Billed at actual" }
    ]);
    if (other) {
      var oa = other.rows.filter(needsAction).length, op = sum(other.rows, function (r) { return r.penalty; });
      h += '<p class="notice">' + (A.basis === "instrument"
        ? "Billing on computer logon time instead would flag <b>" + oa + "</b> user-days and charge <b>" + money(op) + "</b> in penalties, mostly for people moving data after the run."
        : "Billing on instrument run time instead would flag <b>" + oa + "</b> user-days and charge <b>" + money(op) + "</b> in penalties.") + "</p>";
    }
    var F = [["action", "Needs a decision", act.length], ["all", "All", rows.length], ["unbooked", "Unbooked", cnt("unbooked")], ["penalty", "Past grace", cnt("penalty")], ["noshow", "No-show", cnt("noshow")], ["grace", "Within grace", cnt("grace")]];
    if (A.hasRuns) F.push(["transfer", "Data transfer", cnt("transfer")]);
    h += '<h2 class="sec">Per user, per day</h2><div class="toolbar"><div class="filters" id="afil" role="group" aria-label="Filter findings">' +
      F.map(function (f) { return '<button type="button" data-f="' + f[0] + '" aria-pressed="' + (ST.filter === f[0]) + '">' + f[1] + " (" + f[2] + ")</button>"; }).join("") + "</div></div>";
    var shown = rows.filter(function (r) { return ST.filter === "all" ? true : ST.filter === "action" ? needsAction(r) : r.flags[ST.filter]; });
    h += '<div class="card flush"><table class="tbl stack atbl"><thead><tr><th>Day</th><th>User</th><th>Instrument</th><th class="num">Reserved</th><th class="num">Computer</th>' + (A.hasRuns ? '<th class="num">Instrument</th>' : "") + '<th>Finding</th><th class="num">Charge</th><th class="num">Penalty</th></tr></thead><tbody>' +
      (shown.length ? shown.map(function (r) {
        var o = ST.open[r.key];
        return '<tr class="arow3' + (o ? " on" : "") + '" data-k="' + esc(r.key) + '"><td data-l="Day"><button type="button" class="aexp" aria-expanded="' + !!o + '"><span aria-hidden="true">' + (o ? "▾" : "▸") + "</span> " + esc(dayLabel(r.day)) + '</button></td><td data-l="User">' + esc(r.name) + '<span class="sub">' + esc(r.pi ? r.pi + " lab" : r.acct) + '</span></td><td data-l="Instrument">' + esc(r.res) + "</td>" +
          '<td class="num" data-l="Reserved">' + (r.booked ? hm(r.booked) : "—") + '</td><td class="num" data-l="Computer">' + (r.comp ? hm(r.comp) : "—") + "</td>" + (A.hasRuns ? '<td class="num" data-l="Instrument time">' + (r.inst ? hm(r.inst) : "—") + "</td>" : "") +
          '<td data-l="Finding">' + tag(r.status) + '</td><td class="num" data-l="Charge">' + money(r.charge) + '</td><td class="num" data-l="Penalty">' + (r.penalty ? money(r.penalty) : "—") + "</td></tr>" +
          (o ? '<tr class="adet"><td colspan="' + (A.hasRuns ? 9 : 8) + '"><div class="adetin">' + mini(r) + '<ul class="anotes">' + (r.notes.length ? r.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") : "<li>Use matches the reservation.</li>") + "</ul></div></td></tr>" : "");
      }).join("") : '<tr><td colspan="9" class="muted">Nothing in this filter.</td></tr>') + "</tbody></table></div>";
    // accounts
    var acc = {};
    rows.forEach(function (r) {
      var a = acc[r.acct] || (acc[r.acct] = { acct: r.acct, pi: r.pi, users: {}, billed: 0, booked: 0, charge: 0, penalty: 0, issues: 0, unused: 0 });
      a.users[r.user] = 1; a.billed += r.billed; a.booked += r.booked; a.charge += r.charge; a.penalty += r.penalty; if (needsAction(r)) a.issues++;
      a.unused += Math.max(0, r.booked - len(inter(merge(r.basis_used || (A.basis === "instrument" ? r.rn : r.ss)), merge(r.bk))));
    });
    var al = Object.keys(acc).map(function (k) { return acc[k]; }).sort(function (a, b) { return b.charge - a.charge; });
    h += '<h2 class="sec">By account</h2><div class="card flush"><table class="tbl stack"><thead><tr><th>Account</th><th class="num">Users</th><th class="num">Billed time</th><th class="num">Reserved, not used</th><th class="num">Issues</th><th class="num">Penalties</th><th class="num">Total</th></tr></thead><tbody>' +
      al.map(function (a) { return '<tr><td data-l="Account">' + esc(a.acct) + (a.pi ? '<span class="sub">' + esc(a.pi) + " lab</span>" : "") + '</td><td class="num" data-l="Users">' + Object.keys(a.users).length + '</td><td class="num" data-l="Billed time">' + hm(a.billed) + '</td><td class="num" data-l="Reserved, not used">' + hm(a.unused) + '</td><td class="num" data-l="Issues">' + a.issues + '</td><td class="num" data-l="Penalties">' + money(a.penalty) + '</td><td class="num" data-l="Total"><b>' + money(a.charge) + "</b></td></tr>"; }).join("") + "</tbody></table></div>" +
      '<p class="small muted">"Reserved, not used" is time held on the calendar while the instrument sat idle. The core pays for that time either way, so it goes on each PI statement.</p>';
    h += '<h2 class="sec">Export</h2><div class="card"><div class="btnrow"><button class="btn primary" type="button" id="ax1">Download findings CSV</button><button class="btn" type="button" id="ax2">Download account totals CSV</button></div><p class="small muted tight">Findings have one row per user per day, with the reason for every charge and penalty, ready to attach to a PI statement.</p></div>';
    el.innerHTML = h;
    el.querySelector("#afil").addEventListener("click", function (ev) { var b = ev.target.closest("[data-f]"); if (!b) return; ST.filter = b.getAttribute("data-f"); results(B); var nb = root.querySelector('#afil [data-f="' + ST.filter + '"]'); if (nb) nb.focus(); });
    el.querySelector(".atbl").addEventListener("click", function (ev) { var tr = ev.target.closest(".arow3"); if (!tr || !ev.target.closest(".aexp")) return; var k = tr.getAttribute("data-k"); if (ST.open[k]) delete ST.open[k]; else ST.open[k] = 1; results(B); var nb = root.querySelector('.arow3[data-k="' + k.replace(/"/g, '\\"') + '"] .aexp'); if (nb) nb.focus(); });
    el.querySelector("#ax1").addEventListener("click", function () {
      dl("labmeter-audit-findings.csv", [["date", "user", "user_name", "account", "pi", "instrument", "reserved_min", "computer_min", "instrument_min", "billed_min", "outside_reservation_min", "finding", "notes", "charge", "penalty"]].concat(rows.map(function (r) {
        return [isoDay(r.day), r.user, r.name, r.acct, r.pi, r.res, Math.round(r.booked), Math.round(r.comp), A.hasRuns ? Math.round(r.inst) : "", Math.round(r.billed), Math.round(r.outside), STATUS[r.status][0], r.notes.join("; "), r.charge.toFixed(2), r.penalty.toFixed(2)];
      })));
    });
    el.querySelector("#ax2").addEventListener("click", function () {
      dl("labmeter-audit-accounts.csv", [["account", "pi", "users", "billed_hours", "reserved_unused_hours", "issues", "penalties", "total"]].concat(al.map(function (a) { return [a.acct, a.pi, Object.keys(a.users).length, (a.billed / 60).toFixed(2), (a.unused / 60).toFixed(2), a.issues, a.penalty.toFixed(2), a.charge.toFixed(2)]; })));
    });
  }
  function dl(name, rows) {
    var q = function (v) { v = String(v == null ? "" : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var blob = new Blob([rows.map(function (r) { return r.map(q).join(","); }).join("\n") + "\n"], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function draw() {
    var B = build();
    B.resources.forEach(function (r) { if (R.rates[r] == null) R.rates[r] = sampleRate(r); });
    root.querySelector("#asrcs").innerHTML = ["res", "use", "run"].map(srcCard).join("");
    root.querySelector("#arules").innerHTML = rulesCard(B);
    results(B);
  }
  function sampleRate(r) { var m = { "Zeiss LSM 880 Confocal": 45, "BD LSRFortessa Analyzer": 60, "Leica SP8 Lightning": 50, "Nikon Ti2 Widefield": 30 }; return m[r] != null ? m[r] : 50; }
  function bind() {
    root.addEventListener("change", function (ev) {
      var t = ev.target;
      if (t.matches("[data-up]")) {
        var k = t.getAttribute("data-up"), file = t.files && t.files[0]; if (!file) return;
        if (file.size > 20 * 1024 * 1024) { H.toast("That file is over 20 MB."); return; }
        var rd = new FileReader();
        rd.onload = function () { ST.sample = false; setFile(k, file.name, rd.result); ST.open = {}; draw(); H.toast(SRC[k].label + " loaded: " + ST.files[k].rows.length + " rows. Nothing left this browser."); };
        rd.onerror = function () { H.toast("Could not read that file."); };
        rd.readAsText(file);
        return;
      }
      if (t.matches("[data-field]")) { ST.files[t.getAttribute("data-src")].map[t.getAttribute("data-field")] = +t.value; if (t.getAttribute("data-field") === "instrument" || t.getAttribute("data-src") === "res") { ST.amap.use = {}; ST.amap.run = {}; } draw(); return; }
      if (t.matches("[data-amap]")) { ST.amap[t.getAttribute("data-amap")][t.getAttribute("data-name")] = t.value; draw(); return; }
      if (t.matches("[data-rate]")) { R.rates[t.getAttribute("data-rate")] = Math.max(0, parseFloat(t.value) || 0); saveRules(); results(build()); return; }
      if (t.name === "basis") { R.basis = t.value; saveRules(); results(build()); return; }
      if (/^r-/.test(t.id)) { R[t.id.slice(2)] = Math.max(t.id === "r-mult" ? 1 : t.id === "r-round" ? 1 : 0, parseFloat(t.value) || 0); saveRules(); results(build()); }
    });
    root.addEventListener("click", function (ev) {
      var c = ev.target.closest("[data-clear]"); if (c) { delete ST.files[c.getAttribute("data-clear")]; ST.amap.run = {}; draw(); return; }
      if (ev.target.closest("#asample")) { ST.open = {}; loadSample().then(draw); return; }
      if (ev.target.closest("#areset")) { var keep = R.rates; R = loadRules(); Object.keys(DEF).forEach(function (k) { R[k] = DEF[k]; }); R.rates = keep; saveRules(); draw(); }
    });
  }

  window.LMAudit = function (el, helpers) {
    H = helpers;
    el.innerHTML = '<div id="auditpg"></div>';
    root = el.firstChild;
    root.innerHTML = H.pageHead("Monthly audit", "Upload a reservations export and a usage log. Each user's actual use is compared with what they reserved, day by day, and your grace and penalty rules are applied. This replaces the monthly spreadsheet diff.") +
      '<p class="notice">Works beside FBS and your current usage tracker. Files are read in this browser and never uploaded. The sample month is synthetic, and the sample column layouts are mock-ups of an FBS export and a login log. <button type="button" class="linkb" id="asample">Reload the sample month</button></p>' +
      '<h2 class="sec">1. Data</h2><div class="agrid" id="asrcs"></div>' +
      '<h2 class="sec">2. Your rules <button type="button" class="linkb small" id="areset">Reset to defaults</button></h2><div id="arules"></div>' +
      '<h2 class="sec">3. Results</h2><div id="ares"><p class="muted loadmsg" role="status"><span class="spin" aria-hidden="true"></span>Loading the sample month</p></div>';
    bind();
    if (ST.files.res) draw();
    else loadSample().then(draw).catch(function (e) { root.querySelector("#ares").innerHTML = '<p class="notice" role="alert">Could not load the sample files (' + esc(e.message) + "). You can still upload your own.</p>"; draw(); });
  };
})();
