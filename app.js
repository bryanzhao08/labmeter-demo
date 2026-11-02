"use strict";
(function () {
  var TAGS = ["flow", "confocal", "centrifuge", "plate", "pcr", "sequencer"];
  var TYPES = {
    walk_up: ["Walk-up", "Instrument ran with no claim"],
    overrun: ["Overrun", "Run continued past the booking end"],
    idle_claimed: ["Idle claim", "Claim open with no run for over 15 min"],
    no_show: ["No-show", "Booking with no claim and no run"],
    sensor_gap: ["Sensor gap", "Missing data during a claim"]
  };
  var STORE = "labmeter-demo-reviews-v1";
  var D = null; // loaded data
  var $main = document.getElementById("main");
  var timer = null;
  var T = null;                    // map scrubber time (epoch seconds)
  var V = "map";                   // current view: map | list
  var VIEWS = ["map", "list"], VSTORE = "labmeter-demo-view-v1";
  var STATE_LABEL = { run: "Running", idle: "Idle (on)", off: "Off", gap: "No sensor data" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function fmtMoney(n) { return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtH(min) { return (min / 60).toFixed(1) + " h"; }
  var dtf = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  var dayf = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
  function fmtT(t) { return dtf.format(new Date(t * 1000)); }
  function fmtDay(t) { return dayf.format(new Date(t * 1000)); }
  function hhmm(t) { var d = new Date(t * 1000); return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
  function uname(id) { return id === "you" ? "You (demo)" : "Researcher " + String(id).replace("user-", ""); }
  function gname(id) { return "Grant " + String(id).replace("grant-", ""); }
  function iname(id) { return D.inst[id] ? D.inst[id].name : id; }

  // ---- review decisions (localStorage, guarded)
  function loadRev() { try { return JSON.parse(localStorage.getItem(STORE) || "{}") || {}; } catch (e) { return {}; } }
  var mem = null;
  function getRev() { if (!mem) mem = loadRev(); return mem; }
  function setRev(key, val) {
    var r = getRev(); if (val) r[key] = val; else delete r[key];
    try { localStorage.setItem(STORE, JSON.stringify(r)); } catch (e) { /* storage unavailable: keep in memory */ }
  }

  // ---- data
  function j(p) { return fetch(p).then(function (r) { if (!r.ok) throw new Error(p + " " + r.status); return r.json(); }); }
  function load() {
    return Promise.all([j("data/reconciliation.json"), j("data/utilization.json"), j("data/instruments.json")].concat(
      TAGS.map(function (t) { return j("data/timeline-" + t + ".json"); }),
      TAGS.map(function (t) { return j("data/tag-" + t + ".json"); }),
      [j("data/layout.json").catch(function () { return null; }), j("data/assets.json").catch(function () { return { assets: [] }; })]
    )).then(function (a) {
      var inst = {}, order = [];
      a[2].forEach(function (i) { inst[i.id] = i; order.push(i.id); });
      var tl = {};
      TAGS.forEach(function (t, k) { tl[t] = a[3 + k]; });
      D = { rec: a[0], util: a[1], inst: inst, order: order, tl: tl, layout: a[a.length - 2], assets: ((a[a.length - 1] && a[a.length - 1].assets) || []).filter(function (x) { return x && x.history && x.history.length; }) };
      derive();
    });
  }
  function derive() {
    var rate = function (id) { return D.inst[id].hourly_rate; };
    var inc = 15;
    D.sessions = D.rec.sessions;
    D.exc = D.rec.exceptions.map(function (e) {
      var min = (e.end - e.start) / 60;
      e.minutes = min; e.value = min / 60 * rate(e.instrument_id);
      return e;
    });
    var allB = [];
    TAGS.forEach(function (t) { D.tl[t].bookings.forEach(function (b) { allB.push(b); }); });
    D.bookings = allB;
    D.bookingOnly = allB.reduce(function (s, b) { var m = Math.floor((b.end - b.start) / 60 / inc) * inc; return s + m / 60 * rate(b.instrument_id); }, 0);
    D.billed = D.sessions.reduce(function (s, x) { return s + x.dollars; }, 0);
    D.billMin = D.sessions.reduce(function (s, x) { return s + x.billable_minutes; }, 0);
    D.runMin = D.sessions.reduce(function (s, x) { return s + x.run_minutes; }, 0);
    var byT = {};
    D.exc.forEach(function (e) { var b = byT[e.type] || (byT[e.type] = { n: 0, v: 0 }); b.n++; b.v += e.value; });
    D.byType = byT;
    D.noShowValue = D.exc.filter(function (e) { return e.type === "no_show"; }).reduce(function (s, e) { return s + e.value; }, 0);
    D.recoverable = (byT.walk_up ? byT.walk_up.v : 0) + (byT.overrun ? byT.overrun.v : 0);
    // utilization: run share of observed (non-unknown) time
    D.u = {}; var tot = { run: 0, obs: 0 };
    D.order.forEach(function (id) { D.u[id] = { run: 0, obs: 0, hours: new Array(24).fill(0) }; });
    D.util.forEach(function (b) {
      var u = D.u[b.instrument_id]; if (!u) return;
      u.run += b.busy_seconds; u.obs += b.busy_seconds + b.idle_seconds + b.off_seconds;
      u.hours[new Date(b.hour * 1000).getUTCHours()] += b.busy_seconds / 60;
    });
    D.order.forEach(function (id) { tot.run += D.u[id].run; tot.obs += D.u[id].obs; });
    D.utilPct = tot.obs ? tot.run / tot.obs * 100 : 0;
    // time bounds and data windows for the map scrubber
    var lo = Infinity, hi = -Infinity, last = -Infinity, iv = [];
    TAGS.forEach(function (t) {
      D.tl[t].states.forEach(function (s) {
        if (s.start < lo) lo = s.start; if (s.end > hi) hi = s.end;
        if (s.state !== "unknown") { iv.push([s.start, s.end]); if (s.end > last) last = s.end; }
      });
    });
    iv.sort(function (a, b) { return a[0] - b[0]; });
    D.windows = [];
    iv.forEach(function (x) {
      var w = D.windows[D.windows.length - 1];
      if (w && x[0] - w[1] < 1800) { if (x[1] > w[1]) w[1] = x[1]; } else D.windows.push([x[0], x[1]]);
    });
    D.t0 = lo; D.t1 = hi; D.tLast = isFinite(last) ? last - 1 : hi;
    D.seen = {};
    TAGS.forEach(function (t) { var m = 0; D.tl[t].states.forEach(function (s) { if (s.state !== "unknown" && s.end > m) m = s.end; }); D.seen[t] = Math.min(m, D.tLast); });
    D.assets = (D.assets || []).map(function (a) { a.history = a.history.slice().sort(function (x, y) { return x.t - y.t; }); a.home_room = a.home_room || a.history[0].room; return a; });
    if (D.layout) { var ok = {}; D.layout.rooms.forEach(function (r) { ok[r.id] = 1; }); D.assets = D.assets.filter(function (a) { a.history = a.history.filter(function (e) { return ok[e.room]; }); return a.history.length; }); }
    // activity windows for the time slider and playback speed (run states only)
    var rw = [];
    TAGS.forEach(function (t) { D.tl[t].states.forEach(function (s) { if (s.state === "run") rw.push([s.start, s.end]); }); });
    rw.sort(function (a, b) { return a[0] - b[0]; });
    D.runWin = [];
    rw.forEach(function (x) { var w = D.runWin[D.runWin.length - 1]; if (w && x[0] - w[1] < 1800) { if (x[1] > w[1]) w[1] = x[1]; } else D.runWin.push([x[0], x[1]]); });
    if (T == null) T = D.tLast;
  }

  // ---- helpers
  function badge(type) { return '<span class="badge" style="color:var(--c-' + type + ')">' + esc(TYPES[type][0]) + "</span>"; }
  function decCell(e) {
    var d = getRev()[e.key];
    return (d ? '<span class="dec ' + d + '">' + (d === "approved" ? "Approved" : "Rejected") + "</span> " : '<span class="muted small">Pending</span> ') +
      '<button class="btn sm" data-act="approved" data-key="' + e.key + '" aria-label="Approve">Approve</button> ' +
      '<button class="btn sm" data-act="rejected" data-key="' + e.key + '" aria-label="Reject">Reject</button>' +
      (d ? ' <button class="btn sm" data-act="" data-key="' + e.key + '" aria-label="Undo decision">Undo</button>' : "");
  }
  function excRows(list, withInst) {
    if (!list.length) return '<tr><td colspan="7" class="muted">Nothing in this view.</td></tr>';
    return list.map(function (e) {
      var who = e.claim_id != null ? "claim #" + e.claim_id : e.booking_id ? "booking " + e.booking_id : "no claim";
      return "<tr><td>" + badge(e.type) + "</td>" + (withInst ? '<td><a href="#/i/' + e.instrument_id + '">' + esc(iname(e.instrument_id)) + "</a></td>" : "") +
        "<td>" + esc(fmtT(e.start)) + '<br><span class="muted small">' + e.minutes.toFixed(0) + " min · " + esc(who) + '</span></td><td class="num">' + (e.type === "idle_claimed" || e.type === "sensor_gap" ? "n/a" : fmtMoney(e.value)) + '</td><td class="rev" data-key="' + e.key + '">' + decCell(e) + "</td></tr>";
    }).join("");
  }
  function bindReview(root, rerender) {
    root.addEventListener("click", function (ev) {
      var b = ev.target.closest("button[data-key]"); if (!b) return;
      setRev(b.getAttribute("data-key"), b.getAttribute("data-act"));
      rerender();
    });
  }


  // ---- facility helpers
  var THREE_URL = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
  var SC = null, SCTOK = 0, VEFF = "map", SEL = null, playing = false, playRaf = 0, threeP = null, REPLAY = false, OPENER = null, WANT_FOCUS = false, CUR = "home";
  var LS = { key: "name", dir: 1 };
  var HOUR = 3600, HSTORE = "labmeter-demo-hint-v1", ASTORE = "labmeter-demo-assets-v1";
  var TYPE_LABEL = { "pipette": "Pipette set", "mini-centrifuge": "Mini-centrifuge", "cart": "Cart", "cooler": "Dry-ice cooler", "vortexer": "Vortexer", "laptop": "Laptop", "power-meter": "Power meter", "label-printer": "Label printer", "ice-bucket": "Ice bucket", "tablet": "Tablet" };
  function typeLabel(k) { return TYPE_LABEL[k] || String(k || "Item").replace(/-/g, " ").replace(/^./, function (c) { return c.toUpperCase(); }); }
  function roomName(id) { var r = D.layout && D.layout.rooms.filter(function (x) { return x.id === id; })[0]; return r ? r.name.replace(/ \(dark\)$/, "") : id; }
  function stateAt(id, t) {
    var a = D.tl[id].states, lo = 0, hi = a.length - 1;
    while (lo <= hi) {
      var m = (lo + hi) >> 1, s = a[m];
      if (t < s.start) hi = m - 1; else if (t >= s.end) lo = m + 1; else return s.state === "unknown" ? "gap" : s.state;
    }
    return "gap";
  }
  function pending(id) { return D.exc.filter(function (e) { return e.instrument_id === id && !getRev()[e.key]; }).length; }
  function runH(id) { return D.u[id].run / 3600; }
  function NOW() { return D.tLast; }
  function isLive(t) { return t >= D.tLast - 60; }
  function dur(sec) {
    sec = Math.max(0, sec);
    if (sec < 5400) return Math.max(1, Math.round(sec / 60)) + " min";
    if (sec < 48 * HOUR) return Math.round(sec / HOUR) + " h";
    return Math.round(sec / 86400) + " d";
  }
  function ago(sec) { return sec < 90 ? "just now" : dur(sec) + " ago"; }
  function lastClaim(id, t) {
    var best = null; D.tl[id].claims.forEach(function (c) { if (c.start <= t && (!best || c.start > best.start)) best = c; });
    return best;
  }
  function runningNow(t) { return D.order.filter(function (id) { return stateAt(id, t) === "run"; }).length; }
  function fmtShort(t) { return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(new Date(t * 1000)) + " " + hhmm(t); }

  // ---- portable assets: effective data = file data + this browser's simulated actions
  var AOV = null, EAC = null, EAM = {};
  function getAov() { if (!AOV) { try { AOV = JSON.parse(localStorage.getItem(ASTORE) || "{}") || {}; } catch (e) { AOV = {}; } } return AOV; }
  function saveAov() { EAC = null; try { localStorage.setItem(ASTORE, JSON.stringify(getAov())); } catch (e) { /* storage unavailable: keep in memory */ } }
  function ovFor(id) { var o = getAov(); return o[id] || (o[id] = { hist: [] }); }
  function effAsset(a) {
    var o = getAov()[a.id], e = {}, k;
    for (k in a) e[k] = a[k];
    e.history = a.history.slice();
    if (o) {
      (o.hist || []).forEach(function (h) { e.history.push(h); });
      e.history = e.history.map(function (h, i) { return { h: h, i: i }; }).sort(function (x, y) { return x.h.t - y.h.t || x.i - y.i; }).map(function (x) { return x.h; });
      if (Object.prototype.hasOwnProperty.call(o, "co")) e.checked_out_by = o.co || null;
      if (o.missing != null) e.reported_missing = o.missing;
    }
    var last = e.history[e.history.length - 1];
    e.room = last.room; e.last_seen = Math.max(e.last_seen || 0, last.t);
    return e;
  }
  function getEA() {
    if (EAC) return EAC;
    EAM = {}; EAC = D.assets.map(function (a) { var e = effAsset(a); EAM[e.id] = e; return e; });
    return EAC;
  }
  function statusOf(e) {
    var now = NOW(), co = e.checked_out_by, ls = e.last_seen || 0, away = e.room !== e.home_room;
    if (e.reported_missing) return { k: "miss", label: "Missing", why: "Reported missing from this browser. Use Mark found once it turns up." };
    if (co) return co.due < now ? { k: "out", label: "Checked out", overdue: true } : { k: "out", label: "Checked out" };
    if (now - ls > 24 * HOUR) return { k: "miss", label: "Missing", why: "No gateway has heard this tag for over 24 h." };
    if (away && now - ls > 6 * HOUR) return { k: "miss", label: "Missing", why: "Outside its home room for over 6 h and not checked out." };
    if (away) return { k: "moved", label: "Moved" };
    return { k: "in", label: "In place" };
  }
  function chip(st) { return '<span class="chip c-' + st.k + '"><i class="cd" aria-hidden="true"></i>' + esc(st.label) + (st.overdue ? " (overdue)" : "") + "</span>"; }
  function lastTap(e) { for (var k = e.history.length - 1; k >= 0; k--) if (e.history[k].by) return e.history[k]; return null; }
  function dueText(co) { return co.due < NOW() ? "overdue by " + dur(NOW() - co.due) : "due in " + dur(co.due - NOW()); }
  function attention() {
    return getEA().map(function (e) { return { e: e, st: statusOf(e) }; }).filter(function (x) { return x.st.k === "miss" || x.st.overdue; })
      .sort(function (a, b) { return (a.st.k === "miss" ? 0 : 1) - (b.st.k === "miss" ? 0 : 1) || a.e.last_seen - b.e.last_seen; });
  }
  function assetNote(n, ev, t) {
    var e = EAM[n.id], live = isLive(t), st = e && live ? statusOf(e) : null, seen = e && live ? e.last_seen : ev.t;
    return (st ? st.label + (st.overdue ? " (overdue)" : "") + ". " : "") + "Last seen " + roomName(ev.room) + (t > seen ? ", " + ago(t - seen) : "");
  }
  function assetStatus(id, t) { var e = EAM[id]; if (!e || !isLive(t)) return ""; var k = statusOf(e).k; return k === "miss" || k === "out" ? k : ""; }
  function flagText(id, t) { var e = EAM[id]; return isLive(t) && e ? "Last seen here, " + ago(NOW() - e.last_seen) : "Last seen here"; }

  // ---- search over instruments and portable assets
  function allItems() {
    var out = [];
    D.order.forEach(function (id) {
      var i = D.inst[id], pin = D.layout && D.layout.pins[id], c = lastClaim(id, NOW());
      out.push({ kind: "inst", id: id, name: i.name, type: String(i.class).replace(/^./, function (x) { return x.toUpperCase(); }), roomId: pin ? pin.room : "", room: pin ? roomName(pin.room) : "Unknown room", seen: D.seen[id], st: { k: "in", label: "In place" },
        who: c ? "Last tapped by " + uname(c.user_id) + ", " + ago(NOW() - c.start) : "No tap recorded this week", hay: [i.name, i.class, id, "instrument fixed", pin ? roomName(pin.room) : ""].join(" ").toLowerCase() });
    });
    getEA().forEach(function (e) {
      var st = statusOf(e), lt = lastTap(e), co = e.checked_out_by, who;
      if (co) who = "Checked out to " + uname(co.user) + ", " + dueText(co);
      else who = lt ? "Last tapped by " + uname(lt.by) + ", " + ago(NOW() - lt.t) : "No tap recorded this week";
      out.push({ kind: "asset", id: e.id, name: e.name, type: typeLabel(e.kind), roomId: e.room, room: roomName(e.room), seen: e.last_seen, st: st, who: who,
        hay: [e.name, e.kind, typeLabel(e.kind), e.id, "portable gear", st.k === "miss" ? "missing lost" : st.k === "out" ? "checked out borrowed" + (st.overdue ? " overdue" : "") : st.k === "moved" ? "moved" : "", roomName(e.room), roomName(e.home_room)].join(" ").toLowerCase() });
    });
    return out;
  }
  var SEV = { miss: 0, out: 1, moved: 2, in: 3 };
  function sevOf(it) { return it.st.overdue ? 0.5 : SEV[it.st.k]; }
  function searchItems(q, filter) {
    var toks = String(q || "").toLowerCase().split(/\s+/).filter(Boolean);
    var res = allItems().filter(function (it) {
      return toks.every(function (t) { return it.hay.indexOf(t) >= 0 || (t.length > 3 && t.charAt(t.length - 1) === "s" && it.hay.indexOf(t.slice(0, -1)) >= 0); });
    });
    var counts = { all: res.length, miss: 0, out: 0, moved: 0, in: 0 };
    res.forEach(function (it) { counts[it.st.k]++; });
    if (filter && filter !== "all") res = res.filter(function (it) { return it.st.k === filter; });
    res.sort(function (a, b) {
      var an = toks.length && a.name.toLowerCase().indexOf(toks[0]) >= 0 ? 0 : 1, bn = toks.length && b.name.toLowerCase().indexOf(toks[0]) >= 0 ? 0 : 1;
      return an - bn || sevOf(a) - sevOf(b) || (a.name < b.name ? -1 : 1);
    });
    res.counts = counts;
    return res;
  }
  function selHref(it) { return "#/?sel=" + it.kind + ":" + it.id + "&view=map"; }
  function resultHTML(it) {
    return '<li><a class="res" href="' + selHref(it) + '"><span class="r1"><strong>' + esc(it.name) + "</strong>" + chip(it.st) + '</span><span class="r2"><span>' + esc(it.type) + "</span><span>" + esc(it.room) + "</span><span>seen " + esc(ago(NOW() - it.seen)) + '</span></span><span class="r3">' + esc(it.who) + "</span></a></li>";
  }

  // ---- toast, hint
  var toastT = 0;
  function toast(msg) {
    var el = document.getElementById("toast"); if (!el) return;
    el.textContent = msg; el.classList.add("on");
    clearTimeout(toastT); toastT = setTimeout(function () { el.classList.remove("on"); }, 3600);
  }
  function hintSeen() { try { return localStorage.getItem(HSTORE) === "1"; } catch (e) { return false; } }
  function hintDone() { try { localStorage.setItem(HSTORE, "1"); } catch (e) { /* storage unavailable */ } }

  // ---- view toggle (Map | List)
  function storedView() { try { var v = localStorage.getItem(VSTORE); return VIEWS.indexOf(v) >= 0 ? v : null; } catch (e) { return null; } }
  function saveView(v) { try { localStorage.setItem(VSTORE, v); } catch (e) { /* storage unavailable */ } }
  function syncToggle() {
    $$("#viewsw button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === VEFF ? "true" : "false"); });
    var sw = document.getElementById("viewsw"); if (sw) sw.hidden = !document.getElementById("viewregion");
  }
  function setView(v) {
    V = v; VEFF = v; saveView(v);
    if (document.getElementById("viewregion")) { try { history.replaceState(null, "", "#/?view=" + v); } catch (e) { /* ignore */ } renderView(); }
    else location.hash = "#/?view=" + v;
    syncToggle();
  }

  // ---- detail panel
  function panelEl() { return document.getElementById("panel"); }
  function stat(l, v) { return "<div><dt>" + l + "</dt><dd>" + v + "</dd></div>"; }
  function personName(id) { return id === "you" ? "You (demo)" : uname(id); }
  function timelineHTML(e, upto) {
    var h = e.history.filter(function (x) { return x.t <= upto; });
    if (!h.length) return '<p class="muted small">No location history yet at this time.</p>';
    var items = h.map(function (x, i) {
      var prev = h[i - 1], what = x.note ? x.note : !prev ? "First seen here" : prev.room !== x.room ? "Moved from " + roomName(prev.room) : "Seen here again";
      return { x: x, what: what };
    }).reverse();
    return '<ol class="tl">' + items.map(function (it, i) {
      return '<li class="' + (i === 0 ? "now" : "") + '"><b>' + esc(roomName(it.x.room)) + (i === 0 ? ' <span class="tl-now">last seen here</span>' : "") + "</b><span>" + esc(fmtT(it.x.t)) + " UTC, " + esc(ago(upto - it.x.t)) + "</span><span>" + esc(it.what) + (it.x.by ? ", " + esc(personName(it.x.by)) : "") + "</span></li>";
    }).join("") + "</ol>";
  }
  function panelHTML() {
    if (!SEL) return "";
    var h = '<button type="button" class="x" id="pclose" aria-label="Close details">&times;</button>';
    if (SEL.kind === "inst") {
      var id = SEL.id, i = D.inst[id], st = stateAt(id, T), u = D.u[id], pct = u.obs ? u.run / u.obs * 100 : 0, c = lastClaim(id, T);
      var room = D.layout && D.layout.pins[id] ? roomName(D.layout.pins[id].room) : "";
      h += '<h2 id="ptitle">' + esc(i.name) + '</h2><p class="sub"><span class="dot s-' + st + '"></span>' + esc(STATE_LABEL[st]) + (room ? " in " + esc(room) : "") + "</p>" +
        '<dl class="stats">' + stat("Rate", fmtMoney(i.hourly_rate) + "/h") + stat("Run this week", runH(id).toFixed(1) + " h") + stat("Utilization", pct.toFixed(0) + "%") + stat("Open exceptions", pending(id)) + "</dl>" +
        '<p class="last">' + (c ? "Last tapped by " + esc(uname(c.user_id)) + " on " + esc(gname(c.account_id)) + ", " + esc(fmtT(c.start)) + " UTC" : "No tap yet at this time") + "</p>" +
        '<div class="acts"><a class="btn primary" href="#/i/' + id + '">Timeline</a><a class="btn" href="#/t/tag-' + id + '">Tap demo</a></div>';
      return h;
    }
    var e = getEA().filter(function (x) { return x.id === SEL.id; })[0]; if (!e) return "";
    var live = isLive(T), sti = statusOf(e), co = e.checked_out_by, ev = e.history[0], k;
    for (k = 0; k < e.history.length; k++) if (e.history[k].t <= T) ev = e.history[k];
    if (!live) {
      return h + '<h2 id="ptitle">' + esc(e.name) + '</h2><p class="sub"><span class="dot s-asset"></span>' + esc(typeLabel(e.kind)) + ', replaying the week</p>' +
        '<dl class="stats">' + stat("In room", esc(roomName(ev.room)) + "<small>at " + esc(fmtT(T)) + " UTC</small>") + stat("Home room", esc(roomName(e.home_room))) + "</dl>" +
        '<p class="note-s">Status and actions are only available in Live. Switch off Replay week to use them.</p><h3>Path so far</h3>' + timelineHTML(e, T);
    }
    h += '<h2 id="ptitle">' + esc(e.name) + '</h2><p class="sub">' + chip(sti) + '<span class="subt">' + esc(typeLabel(e.kind)) + "</span></p>";
    if (sti.why) h += '<p class="why">' + esc(sti.why) + "</p>";
    h += '<dl class="stats">' + stat("Last seen", esc(roomName(e.room)) + "<small>" + esc(ago(NOW() - e.last_seen)) + "</small>") + stat("Home room", esc(roomName(e.home_room)) + (e.room === e.home_room ? "<small>it is here</small>" : "<small>not there now</small>")) +
      (co ? stat("Checked out to", esc(personName(co.user)) + "<small>" + esc(dueText(co)) + "</small>") : stat("Last tapped by", (lastTap(e) ? esc(personName(lastTap(e).by)) + "<small>" + esc(ago(NOW() - lastTap(e).t)) + "</small>" : "No one yet"))) +
      stat("Tag battery", e.battery != null ? e.battery + "%" + (e.battery < 15 ? "<small>low, may stop reporting</small>" : "") : "Unknown") + "</dl>";
    h += '<div class="acts2">' + (sti.k === "miss" ? '<button type="button" class="btn primary" data-act="found" data-id="' + e.id + '">Mark found</button>' : '<button type="button" class="btn" data-act="missing" data-id="' + e.id + '">Report missing</button>') +
      '<button type="button" class="btn" data-act="ring" data-id="' + e.id + '">Ring tag</button>' +
      (co ? '<button type="button" class="btn" data-act="return" data-id="' + e.id + '">Return</button>' : '<button type="button" class="btn" data-act="checkout" data-id="' + e.id + '">Check out to me</button>') + "</div>";
    h += "<h3>Path history</h3>" + timelineHTML(e, NOW());
    h += '<p class="note-s">Location is room-level, from the BLE gateway that last heard the tag. It is not GPS and cannot say where in the room. Buttons here are simulated and saved only in this browser.</p>';
    return h;
  }
  function doAct(act, id) {
    var e = getEA().filter(function (x) { return x.id === id; })[0]; if (!e) return;
    var o = ovFor(id), rebuild = false, msg = "";
    if (act === "ring") { toast("Tag would beep. Requires hardware."); return; }
    if (act === "found") { o.missing = false; o.hist.push({ t: NOW(), room: e.room, by: "you", note: "Marked found" }); msg = "Marked found in " + roomName(e.room) + ".";
    } else if (act === "missing") { o.missing = true; msg = "Reported missing. It now shows in Missing and overdue.";
    } else if (act === "checkout") { o.missing = false; o.co = { user: "you", since: NOW(), due: NOW() + 24 * HOUR }; o.hist.push({ t: NOW(), room: e.room, by: "you", note: "Checked out" }); msg = "Checked out to you, due in 24 h.";
    } else if (act === "return") { o.missing = false; o.co = null; rebuild = e.room !== e.home_room; o.hist.push({ t: NOW(), room: e.home_room, by: "you", note: "Returned to home room" }); msg = "Returned. Shown in " + roomName(e.home_room) + ".";
    } else return;
    saveAov(); toast(msg); nav(CUR); renderAttn(); refreshPanel(); refreshFind();
    if (rebuild && V === "map" && document.getElementById("viewregion")) renderView(); else if (SC) SC.setTime(T);
  }
  function showPanel(kind, id) {
    var p = panelEl(); if (!p) return;
    if (!kind) { hidePanel(); return; }
    var fresh = !SEL || SEL.kind !== kind || SEL.id !== id;
    if (!SEL) OPENER = document.activeElement;
    SEL = { kind: kind, id: id }; p.innerHTML = panelHTML(); p.hidden = false;
    if (!p.innerHTML) { SEL = null; p.hidden = true; return; }
    p.setAttribute("aria-labelledby", "ptitle");
    if (SC) SC.select(kind, id);
    $$("[data-row]").forEach(function (r) { r.classList.toggle("sel", r.getAttribute("data-row") === kind + ":" + id); });
    var x = document.getElementById("pclose"); if (x && fresh) x.focus({ preventScroll: true });
    p.scrollTop = 0;
  }
  function refreshPanel() {
    var p = panelEl(); if (!p || p.hidden || !SEL) return;
    var had = document.activeElement && p.contains(document.activeElement) ? document.activeElement.getAttribute("data-act") : null, top = p.scrollTop;
    p.innerHTML = panelHTML(); p.scrollTop = top;
    if (had) { var b = p.querySelector('[data-act="' + had + '"]') || document.getElementById("pclose"); if (b) b.focus({ preventScroll: true }); }
  }
  function hidePanel() {
    var p = panelEl(); SEL = null; if (p) { p.hidden = true; p.innerHTML = ""; }
    if (SC) SC.select(null, null);
    $$("[data-row]").forEach(function (r) { r.classList.remove("sel"); });
    var o = OPENER; OPENER = null;
    if (o && document.body.contains(o) && o.focus) o.focus({ preventScroll: true });
    else { var s = document.getElementById("scene"); if (s) s.focus({ preventScroll: true }); }
  }

  // ---- list view
  function listRows() {
    var rows = D.order.map(function (id) {
      var st = stateAt(id, T);
      return { kind: "inst", id: id, name: D.inst[id].name, room: D.layout && D.layout.pins[id] ? roomName(D.layout.pins[id].room) : "", srank: { run: 0, idle: 1, off: 2, gap: 3 }[st], html: '<span class="dot s-' + st + '"></span>' + esc(STATE_LABEL[st]), runh: runH(id), exc: pending(id) };
    });
    getEA().forEach(function (e) {
      var live = isLive(T), st = statusOf(e), ev = e.history[0];
      e.history.forEach(function (x) { if (x.t <= T) ev = x; });
      rows.push({ kind: "asset", id: e.id, name: e.name, room: roomName(live ? e.room : ev.room), srank: 4 + (live ? sevOf({ st: st }) : 3), html: live ? chip(st) + ' <span class="muted small">' + esc(ago(NOW() - e.last_seen)) + "</span>" : '<span class="dot s-asset"></span>Portable', runh: -1, exc: -1 });
    });
    var k = LS.key, d = LS.dir;
    rows.sort(function (a, b) {
      var x = a[k], y = b[k]; if (typeof x === "string") { x = x.toLowerCase(); y = y.toLowerCase(); }
      return (x < y ? -1 : x > y ? 1 : a.name < b.name ? -1 : 1) * d;
    });
    return rows;
  }
  function listHTML() {
    var cols = [["name", "Name"], ["room", "Room"], ["srank", "Status"], ["runh", "Run this week", 1], ["exc", "Open exceptions", 1]];
    var h = '<div class="listwrap" tabindex="0" role="region" aria-label="Instruments and portable gear table"><table class="tbl lt"><thead><tr>' + cols.map(function (c) {
      var on = LS.key === c[0];
      return "<th" + (c[2] ? ' class="num"' : "") + ' aria-sort="' + (on ? (LS.dir > 0 ? "ascending" : "descending") : "none") + '"><button type="button" class="sort" data-sort="' + c[0] + '">' + c[1] + (on ? (LS.dir > 0 ? " &#9650;" : " &#9660;") : "") + "</button></th>";
    }).join("") + "</tr></thead><tbody>";
    h += listRows().map(function (r) {
      return '<tr data-row="' + r.kind + ":" + r.id + '"><td data-l="Name"><button type="button" class="pick" data-pick="' + r.kind + ":" + r.id + '">' + esc(r.name) + "</button>" + (r.kind === "asset" ? ' <span class="tag">portable</span>' : "") + "</td>" +
        '<td data-l="Room">' + esc(r.room) + '</td><td data-l="Status">' + r.html + '</td><td class="num" data-l="Run this week">' + (r.runh < 0 ? "&ndash;" : r.runh.toFixed(1) + " h") + '</td><td class="num" data-l="Open exceptions">' + (r.exc < 0 ? "&ndash;" : r.exc) + "</td></tr>";
    }).join("") + "</tbody></table></div>" + '<p class="small muted asof">As of ' + esc(fmtT(T)) + " UTC. Switch to Map to replay the week.</p>";
    return h;
  }
  function bindList(el) {
    el.addEventListener("click", function (ev) {
      var s = ev.target.closest("[data-sort]"); if (!s) return;
      var k = s.getAttribute("data-sort"); if (LS.key === k) LS.dir = -LS.dir; else { LS.key = k; LS.dir = 1; }
      el.innerHTML = listHTML(); var again = el.querySelector('[data-sort="' + k + '"]'); if (again) again.focus();
      if (SEL) $$("[data-row]").forEach(function (r) { r.classList.toggle("sel", r.getAttribute("data-row") === SEL.kind + ":" + SEL.id); });
    });
  }

  // ---- map view
  function loadThree() {
    if (window.THREE) return Promise.resolve();
    if (threeP) return threeP;
    threeP = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = THREE_URL; s.async = true;
      var to = setTimeout(function () { rej(new Error("three.js timed out")); }, 12000);
      s.onload = function () { clearTimeout(to); window.THREE ? res() : rej(new Error("three.js missing")); };
      s.onerror = function () { clearTimeout(to); rej(new Error("three.js failed to load")); };
      document.head.appendChild(s);
    });
    threeP.catch(function () { threeP = null; });
    return threeP;
  }
  function webglOK() { try { var c = document.createElement("canvas"); return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl"))); } catch (e) { return false; } }
  function marks() {
    var span = D.t1 - D.t0, pc = function (t) { return ((t - D.t0) / span * 100).toFixed(2); }, h = "";
    D.runWin.forEach(function (w) { h += '<i class="w" style="left:' + pc(w[0]) + "%;width:" + Math.max(0.5, (w[1] - w[0]) / span * 100).toFixed(2) + '%"></i>'; });
    D.assets.forEach(function (a) { a.history.forEach(function (e, k) { if (k) h += '<i class="m" style="left:' + pc(e.t) + '%"></i>'; }); });
    return h;
  }
  function mapHTML() {
    return '<div class="stage" id="stage"><div class="scene" id="scene" tabindex="0" role="group" aria-label="3D facility view. Drag to rotate, scroll or pinch to zoom, arrow keys also rotate."><p class="loading" role="status">Loading 3D view</p></div>' +
      '<ul class="key" aria-label="Legend"><li><i class="dot s-run"></i>Running</li><li><i class="dot s-idle"></i>Idle</li><li><i class="dot s-off"></i>Off</li><li><i class="dot s-gap"></i>No data</li><li><i class="dot s-asset"></i>Portable</li><li><i class="dot s-miss"></i>Missing</li></ul>' +
      '<div class="dock">' + (hintSeen() ? "" : '<p class="hint" id="hint" role="note"><span>Drag to rotate · click a bubble or item · press / to search</span><button type="button" id="hintx">Got it</button></p>') + '<div class="sbar" id="sbar"></div></div></div>';
  }
  function roText() { return REPLAY ? fmtT(T) + " UTC" : "as of " + fmtT(NOW()) + " UTC"; }
  function drawSbar() {
    var el = document.getElementById("sbar"); if (!el) return;
    el.className = "sbar" + (REPLAY ? " replay" : "");
    el.innerHTML = '<div class="srow"><b class="mode">' + (REPLAY ? "Replay" : '<i class="dot s-run" aria-hidden="true"></i>Live') + '</b><output id="ro">' + esc(roText()) + '</output><button type="button" class="btn sm rp" id="rp" aria-pressed="' + REPLAY + '">Replay week</button></div>' +
      (REPLAY ? '<div class="srow"><button type="button" class="play" id="play" aria-label="Play"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path id="pp" d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg></button>' +
        '<div class="track"><div class="marks" aria-hidden="true">' + marks() + '</div><input type="range" id="tr" min="' + Math.floor(D.t0) + '" max="' + Math.ceil(D.t1) + '" step="60" value="' + Math.round(T) + '" aria-label="Time in the simulated week" aria-valuetext="' + esc(fmtT(T)) + ' UTC"></div></div>' : "");
    document.getElementById("rp").addEventListener("click", function () {
      REPLAY = !REPLAY; pause();
      if (!REPLAY) applyTime(NOW(), false);
      drawSbar(); var b = document.getElementById("rp"); if (b) b.focus({ preventScroll: true });
    });
    if (REPLAY) {
      var tr = document.getElementById("tr");
      tr.addEventListener("input", function () { pause(); applyTime(Number(tr.value), true); });
      document.getElementById("play").addEventListener("click", play); setPlayIcon();
    }
  }
  function setPlayIcon() {
    var pb = document.getElementById("play"), pp = document.getElementById("pp"); if (!pb || !pp) return;
    pb.setAttribute("aria-label", playing ? "Pause" : "Play");
    pp.setAttribute("d", playing ? "M3.5 2.5h3v11h-3zM9.5 2.5h3v11h-3z" : "M4 2.5v11l9-5.5z");
  }
  function inRunWin(t) { for (var k = 0; k < D.runWin.length; k++) if (t >= D.runWin[k][0] - 600 && t <= D.runWin[k][1] + 600) return true; return false; }
  function applyTime(t, fromSlider) {
    T = t;
    if (SC) SC.setTime(t);
    var ro = document.getElementById("ro"), tr = document.getElementById("tr");
    if (ro) ro.textContent = roText();
    if (tr) { if (!fromSlider) tr.value = Math.round(t); tr.setAttribute("aria-valuetext", fmtT(t) + " UTC"); }
    renderHeads(); refreshPanel();
  }
  function pause() { playing = false; if (playRaf) cancelAnimationFrame(playRaf); playRaf = 0; setPlayIcon(); }
  function play() {
    if (playing) { pause(); return; }
    if (T >= D.t1 - 60) T = D.t0;
    playing = true; setPlayIcon();
    var last = performance.now();
    (function step(now) {
      if (!playing) return;
      var dt = Math.min(0.1, (now - last) / 1000); last = now;
      var t = Math.min(D.t1, T + dt * (inRunWin(T) ? 900 : 30000));
      applyTime(t, false);
      if (t >= D.t1) { pause(); return; }
      playRaf = requestAnimationFrame(step);
    })(last);
  }
  function destroyScene() { SCTOK++; pause(); if (SC) { try { SC.destroy(); } catch (e) { /* ignore */ } SC = null; } }
  function fallback(msg) {
    var el = document.getElementById("viewregion"); if (!el) return;
    destroyScene(); VEFF = "list"; syncToggle();
    var mb = document.querySelector('#viewsw [data-v="map"]'); if (mb) { mb.setAttribute("aria-disabled", "true"); mb.title = "3D view is unavailable on this device"; }
    el.innerHTML = '<p class="notice" role="status">' + esc(msg) + "</p>" + listHTML(); bindList(el);
  }
  function startScene(tok) {
    var host = document.getElementById("scene");
    if (!host) return;
    if (!D.layout) return fallback("3D view unavailable: layout data is missing. Showing the list instead.");
    if (!webglOK()) return fallback("3D view unavailable: WebGL is off on this device. Showing the list instead.");
    loadThree().then(function () {
      if (tok !== SCTOK || !document.getElementById("scene")) return;
      host.innerHTML = "";
      var model = {
        vb: D.layout.viewBox, rooms: D.layout.rooms, pins: D.layout.pins,
        instruments: D.order.map(function (id) { return { id: id, name: D.inst[id].name }; }),
        assets: getEA(), stateAt: stateAt, stateText: function (s) { return STATE_LABEL[s]; }, assetNote: assetNote, assetStatus: assetStatus, flagText: flagText, fmtShort: fmtShort
      };
      SC = window.LabScene.create(host, model, { onPick: function (k, id) { if (k) showPanel(k, id); else if (SEL) hidePanel(); } });
      SC.setTime(T);
      if (SEL) SC.select(SEL.kind, SEL.id);
    }).catch(function (e) {
      if (tok === SCTOK) fallback("3D view could not load (" + e.message + "). Showing the list instead. Check your connection and reload to try again.");
    });
  }
  function renderView() {
    var el = document.getElementById("viewregion"); if (!el) return;
    destroyScene(); VEFF = V; syncToggle();
    var mb = document.querySelector('#viewsw [data-v="map"]'); if (mb && V === "map") { mb.removeAttribute("aria-disabled"); mb.removeAttribute("title"); }
    if (V === "map") {
      el.innerHTML = mapHTML(); drawSbar();
      var hx = document.getElementById("hintx");
      if (hx) hx.addEventListener("click", function () { hintDone(); var h = document.getElementById("hint"); if (h && h.parentNode) h.parentNode.removeChild(h); var s = document.getElementById("scene"); if (s) s.focus({ preventScroll: true }); });
      el.querySelector(".stage").addEventListener("keydown", function (ev) { if (ev.key === " " && ev.target.id === "scene" && REPLAY) { ev.preventDefault(); play(); } });
      startScene(SCTOK);
    } else { el.innerHTML = listHTML(); bindList(el); }
    if (SEL) { var s2 = SEL; SEL = null; showPanel(s2.kind, s2.id); }
  }

  // ---- facility page
  function pageHead(title, lede) { return "<h1>" + esc(title) + "</h1>" + (lede ? '<p class="lede">' + lede + "</p>" : ""); }
  function renderHeads() {
    var el = document.getElementById("heads"); if (!el) return;
    var open = D.exc.filter(function (e) { return !getRev()[e.key]; }).length;
    el.innerHTML = '<div><dt>Running at this time</dt><dd>' + runningNow(T) + '<small> of ' + D.order.length + " instruments</small></dd></div>" +
      "<div><dt>Verified billing, week</dt><dd>" + fmtMoney(D.billed) + "</dd></div>" +
      '<div><dt>Runs to review</dt><dd><a href="#/billing">' + open + "</a></dd></div>";
  }
  function renderAttn() {
    var el = document.getElementById("attn"); if (!el) return;
    var list = attention();
    el.innerHTML = "<h2>Missing &amp; overdue <span class=\"count\">" + list.length + "</span></h2>" + (list.length ? '<ul class="attn-l">' + list.map(function (x) {
      var e = x.e, line = x.st.k === "miss" ? "Last seen " + roomName(e.room) + ", " + ago(NOW() - e.last_seen) : "With " + personName(e.checked_out_by.user) + ", " + dueText(e.checked_out_by);
      return '<li><button type="button" class="attn-b" data-pick="asset:' + e.id + '"><span class="r1"><strong>' + esc(e.name) + "</strong>" + chip(x.st) + '</span><span class="r3">' + esc(line) + "</span></button></li>";
    }).join("") + "</ul>" : '<p class="empty">Nothing is missing or overdue. Every portable item is in its room or checked out on time.</p>') +
      '<p class="small muted">Room-level location from BLE gateways. <a href="#/find">Search all items</a></p>';
  }
  function facility() {
    $main.innerHTML = pageHead("Facility", "Rooms glow when an instrument inside is running. Pink dots are portable gear; tap one to see where it has been.") +
      '<div class="fsearch"><form role="search" id="fsf" class="sbox"><label class="vh" for="fsq">Find an instrument or portable item</label><input id="fsq" type="search" placeholder="Find a pipette, centrifuge, room" autocomplete="off" aria-controls="fsug"><button class="btn primary" type="submit">Search</button></form><ul class="sug" id="fsug" hidden></ul></div>' +
      '<div id="viewregion"></div><dl class="heads" id="heads"></dl><section class="card attn" id="attn" aria-label="Missing and overdue items"></section><aside class="panel" id="panel" role="dialog" aria-modal="false" hidden></aside>';
    renderHeads(); renderAttn(); renderView();
    var form = document.getElementById("fsf"), inp = document.getElementById("fsq"), sug = document.getElementById("fsug");
    inp.addEventListener("input", function () {
      var q = inp.value.trim(); if (!q) { sug.hidden = true; return; }
      var r = searchItems(q, "all").slice(0, 5);
      sug.innerHTML = r.length ? r.map(function (it) { return '<li><button type="button" class="sugb" data-pick="' + it.kind + ":" + it.id + '"><strong>' + esc(it.name) + "</strong>" + chip(it.st) + '<span class="small muted">' + esc(it.room) + "</span></button></li>"; }).join("") : '<li class="none">No match yet. Press Enter to search everything.</li>';
      sug.hidden = false;
    });
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { if (inp.value) { inp.value = ""; sug.hidden = true; ev.stopPropagation(); } else inp.blur(); } });
    form.addEventListener("submit", function (ev) { ev.preventDefault(); location.hash = "#/find" + (inp.value.trim() ? "?q=" + encodeURIComponent(inp.value.trim()) : ""); });
  }

  // ---- find page
  var FQ = { q: "", f: "all" };
  var FCHIPS = [["all", "All"], ["miss", "Missing"], ["out", "Checked out"], ["moved", "Moved"], ["in", "In place"]];
  function refreshFind() {
    var out = document.getElementById("fres"); if (!out) return;
    var res = searchItems(FQ.q, FQ.f), c = res.counts;
    document.getElementById("fchips").innerHTML = FCHIPS.map(function (x) { return '<button type="button" data-f="' + x[0] + '" aria-pressed="' + (FQ.f === x[0]) + '">' + x[1] + " (" + c[x[0]] + ")</button>"; }).join("");
    document.getElementById("fcount").textContent = res.length + (res.length === 1 ? " result" : " results") + (FQ.q ? ' for "' + FQ.q + '"' : "");
    out.innerHTML = res.length ? res.map(resultHTML).join("") : '<li class="empty">' + (FQ.q ? "Nothing matches \"" + esc(FQ.q) + "\"" + (FQ.f !== "all" ? " with this status" : "") + ". Try a shorter word such as pipette, a type such as centrifuge, or a room name." : "No items in this status.") + (FQ.q || FQ.f !== "all" ? ' <button type="button" class="btn sm" id="fclear">Clear search</button>' : "") + "</li>";
    var cl = document.getElementById("fclear"); if (cl) cl.addEventListener("click", function () { FQ.q = ""; FQ.f = "all"; var i = document.getElementById("fq"); if (i) { i.value = ""; i.focus(); } syncFindUrl(); refreshFind(); });
  }
  function syncFindUrl() {
    var p = []; if (FQ.q) p.push("q=" + encodeURIComponent(FQ.q)); if (FQ.f !== "all") p.push("f=" + FQ.f);
    try { history.replaceState(null, "", "#/find" + (p.length ? "?" + p.join("&") : "")); } catch (e) { /* ignore */ }
  }
  function findPage(q) {
    FQ.q = String(q.q || ""); FQ.f = FCHIPS.some(function (x) { return x[0] === q.f; }) ? q.f : "all";
    var n = getEA().length;
    $main.innerHTML = pageHead("Find", "Search " + D.order.length + " instruments and " + n + " portable items by name, type or room. Locations are room-level, from the BLE gateway that last heard each tag. They are not GPS.") +
      '<form role="search" class="sbox big" id="ff"><label class="vh" for="fq">Search instruments and portable gear</label><input id="fq" type="search" placeholder="Search pipette, centrifuge, Genomics" autocomplete="off" value="' + esc(FQ.q) + '"></form>' +
      '<div class="filters chips" id="fchips" role="group" aria-label="Filter by status"></div><p class="small muted" id="fcount" role="status" aria-live="polite"></p>' +
      '<ul class="results" id="fres"></ul><p class="small muted">Status rules: Missing means unheard for over 24 h, or outside its home room for over 6 h without a check-out. Actions like Mark found are simulated and saved only in this browser.</p>';
    refreshFind();
    var inp = document.getElementById("fq");
    inp.addEventListener("input", function () { FQ.q = inp.value; syncFindUrl(); refreshFind(); });
    inp.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { if (inp.value) { inp.value = ""; FQ.q = ""; syncFindUrl(); refreshFind(); ev.stopPropagation(); } else inp.blur(); } });
    document.getElementById("ff").addEventListener("submit", function (ev) { ev.preventDefault(); inp.blur(); });
    document.getElementById("fchips").addEventListener("click", function (ev) { var b = ev.target.closest("[data-f]"); if (!b) return; FQ.f = b.getAttribute("data-f"); syncFindUrl(); refreshFind(); var again = document.querySelector('#fchips [data-f="' + FQ.f + '"]'); if (again) again.focus(); });
    if (WANT_FOCUS) { WANT_FOCUS = false; inp.focus(); }
  }

  function kpi(l, v, n) { return '<div class="card kpi"><div class="l">' + l + '</div><div class="v">' + v + '</div><div class="n">' + n + "</div></div>"; }
  function heat() {
    var cw = 30, ch = 28, lx = 118, w = lx + 24 * cw + 6, h = 6 * ch + 40, max = 1;
    D.order.forEach(function (id) { D.u[id].hours.forEach(function (m) { if (m > max) max = m; }); });
    var s = '<svg viewBox="0 0 ' + w + " " + h + '" role="img" aria-label="Heatmap of measured run minutes by instrument and hour of day, UTC, over the week">';
    D.order.forEach(function (id, r) {
      s += '<text x="' + (lx - 8) + '" y="' + (r * ch + 18) + '" text-anchor="end">' + esc(iname(id)) + "</text>";
      D.u[id].hours.forEach(function (m, hr) {
        var op = m ? 0.18 + 0.82 * m / max : 0;
        s += '<rect x="' + (lx + hr * cw) + '" y="' + (r * ch + 2) + '" width="' + (cw - 2) + '" height="' + (ch - 3) + '" rx="3" fill="' + (m ? "var(--run)" : "var(--surface2)") + '" fill-opacity="' + (m ? op.toFixed(2) : 1) + '"><title>' + esc(iname(id)) + ", " + ("0" + hr).slice(-2) + ":00 UTC: " + Math.round(m) + " run min (week)</title></rect>";
      });
    });
    for (var hr = 0; hr < 24; hr += 3) s += '<text x="' + (lx + hr * cw + 2) + '" y="' + (6 * ch + 16) + '">' + ("0" + hr).slice(-2) + ":00</text>";
    return s + "</svg>";
  }
  // ---- billing page
  function billing() {
    var open = D.exc.filter(function (e) { return !getRev()[e.key]; }).length;
    var h = "<h1>Billing</h1><p class=\"lede\">Only time the sensors measured the instrument running is billed. Runs that need a person to decide are in the review queue below.</p>" +
      '<dl class="heads"><div><dt>Verified billed</dt><dd>' + fmtMoney(D.billed) + '<small> ' + D.sessions.length + " sessions</small></dd></div>" +
      "<div><dt>Booking-only would bill</dt><dd>" + fmtMoney(D.bookingOnly) + "</dd></div>" +
      "<div><dt>Waiting on review</dt><dd>" + fmtMoney(D.recoverable) + "</dd></div></dl>" +
      '<h2 id="queue">Review queue <span class="muted small">' + open + " of " + D.exc.length + " undecided</span></h2>" +
      '<div class="toolbar"><div class="filters" id="filters" role="group" aria-label="Filter by type"><button data-f="all" aria-pressed="true">All (' + D.exc.length + ")</button>" +
      Object.keys(TYPES).map(function (t) { return D.byType[t] ? '<button data-f="' + t + '" aria-pressed="false" title="' + esc(TYPES[t][1]) + '">' + TYPES[t][0] + " (" + D.byType[t].n + ")</button>" : ""; }).join("") + "</div></div>" +
      '<div class="card scroll"><table class="tbl" id="qt"><thead><tr><th>Type</th><th>Instrument</th><th>When (UTC)</th><th class="num">Run value</th><th>Decision</th></tr></thead><tbody></tbody></table></div>' +
      '<p class="small muted">Decisions are saved in this browser only and do not create a charge.</p>' +
      '<h2>Run minutes by hour of day</h2><div class="card">' + heat() + "</div>" +
      '<h2>Export</h2><div class="card"><button class="btn primary" id="csv">Download billing CSV</button> <a class="btn" href="data/billing.csv" download>Server CSV</a>' +
      '<p class="small muted" style="margin:10px 0 0">' + D.sessions.length + " verified sessions. Columns are a generic placeholder; no iLab or PPMS schema is validated.</p></div>";
    $main.innerHTML = h;
    var f = "all";
    function table() {
      var list = D.exc.filter(function (e) { return f === "all" || e.type === f; }).sort(function (a, b) { return a.start - b.start; });
      document.querySelector("#qt tbody").innerHTML = excRows(list, true);
    }
    table();
    $$("#filters button").forEach(function (b) { b.addEventListener("click", function () { f = b.getAttribute("data-f"); $$("#filters button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); table(); }); });
    bindReview(document.getElementById("qt"), function () { table(); document.querySelector("#queue .small").textContent = D.exc.filter(function (e) { return !getRev()[e.key]; }).length + " of " + D.exc.length + " undecided"; });
    document.getElementById("csv").addEventListener("click", downloadCsv);
  }
  function downloadCsv() {
    var cols = ["instrument", "user", "grant", "start_utc", "end_utc", "run_minutes", "booked_minutes", "billable_minutes", "rate_per_hour", "dollars", "confidence"];
    var q = function (v) { v = String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var rows = D.sessions.slice().sort(function (a, b) { return a.start - b.start; }).map(function (s) {
      return [s.instrument_id, uname(s.user_id), gname(s.account_id), new Date(s.start * 1000).toISOString(), new Date(s.end * 1000).toISOString(), s.run_minutes.toFixed(1), s.booked_minutes.toFixed(1), s.billable_minutes, D.inst[s.instrument_id].hourly_rate, s.dollars.toFixed(2), s.confidence].map(q).join(",");
    });
    var blob = new Blob([cols.join(",") + "\n" + rows.join("\n") + "\n"], { type: "text/csv" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "labmeter-billing-demo.csv";
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  // ---- instrument page
  function timeline(id) {
    var t = D.tl[id], days = {}, lo = 24, hi = 0;
    function dayKey(x) { return Math.floor(x / 86400); }
    function add(kind, o) {
      var s = o.start, e = o.end == null ? o.start : o.end;
      for (var d = dayKey(s); d <= dayKey(e - 1e-6); d++) {
        var a = Math.max(s, d * 86400), b = Math.min(e, d * 86400 + 86400);
        (days[d] || (days[d] = { m: [], c: [], b: [] }))[kind].push({ a: a - d * 86400, b: b - d * 86400, o: o });
        lo = Math.min(lo, (a - d * 86400) / 3600); hi = Math.max(hi, (b - d * 86400) / 3600);
      }
    }
    t.states.forEach(function (s) { if (s.state === "unknown" && s.end - s.start > 1800) return; if (s.end - s.start > 6 * 3600) return; add("m", s); });
    t.claims.forEach(function (c) { if (c.end != null) add("c", c); });
    t.bookings.forEach(function (b) { add("b", b); });
    lo = Math.max(0, Math.floor(lo) - 0); hi = Math.min(24, Math.ceil(hi) + 0);
    if (hi - lo < 2) { hi = lo + 2; }
    var span = (hi - lo) * 3600, lx = 78, W = 920, pw = W - lx - 8, lane = 15, gap = 4, blk = 3 * lane + 2 * gap + 18;
    var keys = Object.keys(days).sort(), H = keys.length * blk + 30;
    var x = function (sec) { return lx + (sec - lo * 3600) / span * pw; };
    var col = { run: "var(--run)", idle: "var(--idle)", off: "var(--off)", unknown: "url(#hatch)" };
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Week timeline for ' + esc(D.inst[id].name) + ': measured state, claims and bookings by day, UTC"><defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--surface)"/><rect width="3" height="6" fill="var(--unk)"/></pattern></defs>';
    for (var hr = Math.ceil(lo); hr <= hi; hr++) {
      s += '<line x1="' + x(hr * 3600) + '" x2="' + x(hr * 3600) + '" y1="0" y2="' + (H - 22) + '" stroke="var(--line)"/>';
      s += '<text x="' + x(hr * 3600) + '" y="' + (H - 6) + '" text-anchor="middle">' + ("0" + hr).slice(-2) + ":00</text>";
    }
    keys.forEach(function (k, r) {
      var y0 = r * blk + 4, d = days[k];
      s += '<text x="0" y="' + (y0 + 2 * lane) + '" style="fill:var(--text);font-weight:600">' + esc(fmtDay(k * 86400)) + "</text>";
      var lanes = [["m", y0], ["c", y0 + lane + gap], ["b", y0 + 2 * (lane + gap)]];
      lanes.forEach(function (L) {
        s += '<rect x="' + lx + '" y="' + L[1] + '" width="' + pw + '" height="' + lane + '" rx="3" fill="var(--surface2)"/>';
        d[L[0]].forEach(function (seg) {
          var o = seg.o, w = Math.max(2, x(seg.b) - x(seg.a)), tip;
          var f = L[0] === "m" ? col[o.state] : L[0] === "c" ? "var(--claim)" : "var(--book)";
          tip = L[0] === "m" ? o.state + " " + hhmm(o.start) + "-" + hhmm(o.end) : L[0] === "c" ? "Claim by " + uname(o.user_id) + " (" + gname(o.account_id) + ") " + hhmm(o.start) + "-" + hhmm(o.end) : "Booking, " + uname(o.user_id) + " " + hhmm(o.start) + "-" + hhmm(o.end);
          s += '<rect x="' + x(seg.a).toFixed(1) + '" y="' + L[1] + '" width="' + w.toFixed(1) + '" height="' + lane + '" rx="2" fill="' + f + '"' + (L[0] === "b" ? ' fill-opacity=".75"' : "") + "><title>" + esc(tip) + "</title></rect>";
        });
      });
    });
    return s + "</svg>";
  }
  function instrument(id) {
    var i = D.inst[id];
    if (!i) return notFound();
    var u = D.u[id], pct = u.obs ? u.run / u.obs * 100 : 0;
    var ss = D.sessions.filter(function (s) { return s.instrument_id === id; }).sort(function (a, b) { return a.start - b.start; });
    var ex = D.exc.filter(function (e) { return e.instrument_id === id; }).sort(function (a, b) { return a.start - b.start; });
    var bk = D.tl[id].bookings.length, $ = ss.reduce(function (a, s) { return a + s.dollars; }, 0);
    var h = '<div class="crumb"><a href="#/">Facility</a> / ' + esc(i.name) + "</div><h1>" + esc(i.name) + '</h1><p class="muted">' + fmtMoney(i.hourly_rate) + "/h · run threshold " + i.run_threshold_ma + " mA · idle baseline " + i.idle_baseline_ma + ' mA · <a href="#/t/' + id + '">Open NFC tap page</a></p>';
    h += '<div class="grid kpis">' + kpi("Utilization", pct.toFixed(0) + "%", "of monitored time") + kpi("Verified sessions", ss.length, fmtH(ss.reduce(function (a, s) { return a + s.billable_minutes; }, 0)) + " billable") + kpi("Billed", fmtMoney($), bk + " bookings this week") + kpi("Exceptions", ex.length, "in the review queue") + "</div>";
    h += '<h2>Week timeline (UTC)</h2><div class="card">' + timeline(id) +
      '<div class="legend"><span><i style="background:var(--run)"></i>Run</span><span><i style="background:var(--idle)"></i>Idle (on)</span><span><i style="background:var(--off)"></i>Off</span><span><i style="background:repeating-linear-gradient(45deg,var(--unk) 0 3px,var(--surface) 3px 6px)"></i>Data gap</span><span><i style="background:var(--claim)"></i>NFC claim</span><span><i style="background:var(--book);opacity:.75"></i>Booking</span></div>' +
      '<p class="small muted" style="margin:0">Each day has three lanes: measured state, claims, bookings. Blank areas have no sensor data in the simulation. Hover a bar for details.</p></div>';
    h += '<h2>Verified sessions</h2><div class="card scroll"><table class="tbl"><thead><tr><th>Start (UTC)</th><th>User</th><th>Grant</th><th class="num">Run</th><th class="num">Booked</th><th class="num">Billed</th><th class="num">$</th></tr></thead><tbody>' +
      (ss.length ? ss.map(function (s) { return "<tr><td>" + esc(fmtT(s.start)) + "</td><td>" + esc(uname(s.user_id)) + "</td><td>" + esc(gname(s.account_id)) + '</td><td class="num">' + s.run_minutes.toFixed(0) + ' min</td><td class="num">' + s.booked_minutes.toFixed(0) + ' min</td><td class="num">' + s.billable_minutes + ' min</td><td class="num">' + fmtMoney(s.dollars) + "</td></tr>"; }).join("") : '<tr><td colspan="7" class="muted">None</td></tr>') + "</tbody></table></div>";
    h += '<h2>Exceptions</h2><div class="card scroll"><table class="tbl" id="qt"><thead><tr><th>Type</th><th>When (UTC)</th><th class="num">Run value</th><th>Decision</th></tr></thead><tbody></tbody></table></div>';
    $main.innerHTML = h;
    function tb() { document.querySelector("#qt tbody").innerHTML = excRows(ex, false); }
    tb(); bindReview(document.getElementById("qt"), tb);
  }

  // ---- tap pages
  function tapIndex() {
    var gear = getEA();
    $main.innerHTML = pageHead("Tap demo", "Every instrument and portable item carries an NFC sticker. Tapping it with a phone opens a page like these. Pick one to simulate a tap.") +
      "<h2>Instruments: start a claim</h2>" +
      '<div class="grid icards">' + TAGS.map(function (t) { return '<a class="card icard" href="#/t/tag-' + t + '"><h3>' + esc(iname(t)) + '</h3><span class="muted small">Claim time to a grant</span></a>'; }).join("") + "</div>" +
      "<h2>Portable gear: check out or return</h2>" +
      (gear.length ? '<div class="grid icards">' + gear.map(function (e) { var st = statusOf(e); return '<a class="card icard" href="#/t/gear-' + e.id + '"><h3>' + esc(e.name) + "</h3>" + chip(st) + ' <span class="muted small">' + esc(st.k === "out" ? "Return it" : "Check it out") + "</span></a>"; }).join("") + "</div>" : '<p class="empty">No portable gear in the demo data.</p>');
  }
  function tap(tag) {
    var id = String(tag).replace(/^tag-/, "");
    if (!D.inst[id]) return notFound("Unknown tag: " + tag);
    var i = D.inst[id], S = { step: 0, user: "", grant: "", t0: 0, sec: 0 };
    var users = []; for (var n = 1; n <= 12; n++) users.push("user-" + n);
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    function fmtClock(s) { return ("0" + Math.floor(s / 3600)).slice(-2) + ":" + ("0" + Math.floor(s % 3600 / 60)).slice(-2) + ":" + ("0" + s % 60).slice(-2); }
    function draw() {
      var b = '<div class="crumb"><a href="#/t">All tags</a></div><div class="phone"><div class="sim"><strong>Simulation.</strong> Nothing here is sent to a server or saved. The real flow runs on a phone after an NFC tap.</div>' +
        '<div class="muted small">Tapped ' + "/t/tag-" + id + "</div><h1 style=\"font-size:1.5rem\">" + esc(i.name) + '</h1><p class="muted small" style="margin-top:0">' + fmtMoney(i.hourly_rate) + "/h · sensor state: idle</p>";
      if (S.step === 0) {
        b += '<h3>Who are you?</h3><label class="small muted" for="u">Demo user (the real app asks for email and PIN)</label><select id="u"><option value="">Choose a researcher</option>' + users.map(function (u) { return '<option value="' + u + '"' + (S.user === u ? " selected" : "") + ">" + uname(u) + "</option>"; }).join("") + '</select><button class="btn primary" id="n0" ' + (S.user ? "" : "disabled") + ">Continue</button>";
      } else if (S.step === 1) {
        b += "<h3>Which grant pays?</h3><div role=\"radiogroup\" aria-label=\"Grant\">" + [1, 2, 3, 4, 5].map(function (g) { var gid = "grant-" + g; return '<button class="opt" role="radio" aria-checked="' + (S.grant === gid) + '" data-g="' + gid + '">' + gname(gid) + "</button>"; }).join("") + '</div><button class="btn primary" id="n1" ' + (S.grant ? "" : "disabled") + ">Start using " + esc(i.name) + '</button><button class="btn" id="b0">Back</button>';
      } else if (S.step === 2) {
        b += '<p><span class="pulse"></span><strong>Claim active</strong></p><p class="small muted">' + esc(uname(S.user)) + " · " + esc(gname(S.grant)) + '</p><div class="timer" id="clk" aria-live="off">' + fmtClock(S.sec) + '</div><p class="small muted">The claim only records who is responsible. Billing uses the time the sensor measures the instrument running. A claim also auto-closes 15 min after the instrument goes idle.</p><button class="btn primary" id="stop">Stop claim</button>';
      } else {
        b += "<h3>Claim closed</h3><p>" + esc(uname(S.user)) + " · " + esc(gname(S.grant)) + " · claimed " + fmtClock(S.sec) + '.</p><p class="small muted">In the real system this claim is matched against measured runs overnight or on demand. If the instrument ran during the claim, that run time is billed to this grant; otherwise it appears in the review queue.</p><button class="btn primary" id="again">Start over</button><a class="btn" href="#/i/' + id + '">See ' + esc(i.name) + " timeline</a>";
      }
      $main.innerHTML = b + "</div>";
      var g = function (s) { return document.getElementById(s); };
      if (g("u")) g("u").addEventListener("change", function (e) { S.user = e.target.value; g("n0").disabled = !S.user; });
      if (g("n0")) g("n0").addEventListener("click", function () { S.step = 1; draw(); });
      $$(".opt").forEach(function (o) { o.addEventListener("click", function () { S.grant = o.getAttribute("data-g"); draw(); }); });
      if (g("b0")) g("b0").addEventListener("click", function () { S.step = 0; draw(); });
      if (g("n1")) g("n1").addEventListener("click", function () { S.step = 2; S.sec = 0; draw(); stop(); timer = setInterval(function () { S.sec++; var c = g("clk"); if (c) c.textContent = fmtClock(S.sec); else stop(); }, 1000); });
      if (g("stop")) g("stop").addEventListener("click", function () { stop(); S.step = 3; draw(); });
      if (g("again")) g("again").addEventListener("click", function () { S = { step: 0, user: "", grant: "", sec: 0 }; draw(); });
    }
    draw();
  }

  function tapGear(gid) {
    var id = String(gid).replace(/^gear-/, ""), e0 = getEA().filter(function (x) { return x.id === id; })[0];
    if (!e0) return notFound("Unknown portable item: " + gid);
    var S = { step: 0, user: "", due: 0, mode: e0.checked_out_by ? "return" : "out" };
    var users = []; for (var n = 1; n <= 12; n++) users.push("user-" + n);
    var DUES = [[2, "In 2 hours"], [8, "In 8 hours"], [24, "Tomorrow (24 hours)"], [72, "In 3 days"]];
    function e() { return getEA().filter(function (x) { return x.id === id; })[0]; }
    function draw() {
      var cur = e(), st = statusOf(cur), co = cur.checked_out_by;
      var b = '<div class="crumb"><a href="#/t">All tags</a></div><div class="phone"><div class="sim"><strong>Simulation.</strong> In the real flow an NFC tap opens this page on your phone. Here, the result is saved only in this browser and shows up in Find.</div>' +
        '<div class="muted small">Tapped /t/gear-' + esc(id) + '</div><h1 style="font-size:1.5rem">' + esc(cur.name) + '</h1><p style="margin:0 0 6px">' + chip(st) + '</p><p class="muted small" style="margin-top:0">Home: ' + esc(roomName(cur.home_room)) + ". Last seen " + esc(roomName(cur.room)) + ", " + esc(ago(NOW() - cur.last_seen)) + ".</p>";
      if (S.step === 0 && S.mode === "return") {
        b += "<h3>Return this item</h3><p class=\"small muted\">Checked out to " + esc(personName(co ? co.user : "")) + ", " + esc(co ? dueText(co) : "") + '. Returning puts it back in ' + esc(roomName(cur.home_room)) + '.</p><label class="small muted" for="u">Who is returning it?</label><select id="u"><option value="">Choose a researcher</option>' + users.map(function (u) { return '<option value="' + u + '"' + (S.user === u ? " selected" : "") + ">" + uname(u) + "</option>"; }).join("") + '</select><button class="btn primary" id="doret" ' + (S.user ? "" : "disabled") + ">Return to " + esc(roomName(cur.home_room)) + "</button>";
      } else if (S.step === 0) {
        b += '<h3>Who is taking it?</h3><label class="small muted" for="u">Demo user (the real app asks for email and PIN)</label><select id="u"><option value="">Choose a researcher</option>' + users.map(function (u) { return '<option value="' + u + '"' + (S.user === u ? " selected" : "") + ">" + uname(u) + "</option>"; }).join("") + '</select><button class="btn primary" id="n0" ' + (S.user ? "" : "disabled") + ">Continue</button>";
      } else if (S.step === 1) {
        b += '<h3>When will it be back?</h3><div role="radiogroup" aria-label="Due time">' + DUES.map(function (d) { return '<button class="opt" role="radio" aria-checked="' + (S.due === d[0]) + '" data-d="' + d[0] + '">' + d[1] + '<br><span class="small muted">due ' + esc(fmtT(NOW() + d[0] * HOUR)) + " UTC</span></button>"; }).join("") + '</div><button class="btn primary" id="doout" ' + (S.due ? "" : "disabled") + ">Check out</button><button class=\"btn\" id=\"b0\">Back</button>";
      } else if (S.step === 2) {
        b += '<h3>Checked out</h3><p>' + esc(personName(S.user)) + " has " + esc(cur.name) + ", due " + esc(fmtT(NOW() + S.due * HOUR)) + ' UTC.</p><p class="small muted">Until it is returned, Find lists it as Checked out. If it is not back by the due time, it appears under Missing &amp; overdue.</p><a class="btn primary" href="#/find?q=' + encodeURIComponent(cur.name) + '">See it in Find</a><button class="btn" id="again">Start over</button>';
      } else {
        b += "<h3>Returned</h3><p>" + esc(cur.name) + " is back in " + esc(roomName(cur.home_room)) + '.</p><a class="btn primary" href="#/find?q=' + encodeURIComponent(cur.name) + '">See it in Find</a><button class="btn" id="again">Start over</button>';
      }
      $main.innerHTML = b + "</div>";
      var g = function (s) { return document.getElementById(s); };
      if (g("u")) g("u").addEventListener("change", function (ev) { S.user = ev.target.value; var bt = g("n0") || g("doret"); if (bt) bt.disabled = !S.user; });
      if (g("n0")) g("n0").addEventListener("click", function () { S.step = 1; draw(); });
      if (g("b0")) g("b0").addEventListener("click", function () { S.step = 0; draw(); });
      $$(".opt").forEach(function (o) { o.addEventListener("click", function () { S.due = Number(o.getAttribute("data-d")); draw(); var again = document.querySelector('.opt[data-d="' + S.due + '"]'); if (again) again.focus(); }); });
      if (g("doout")) g("doout").addEventListener("click", function () {
        var o = ovFor(id); o.missing = false; o.co = { user: S.user, since: NOW(), due: NOW() + S.due * HOUR }; o.hist.push({ t: NOW(), room: cur.room, by: S.user, note: "Checked out by NFC tap" });
        saveAov(); nav("t"); S.step = 2; draw();
      });
      if (g("doret")) g("doret").addEventListener("click", function () {
        var o = ovFor(id); o.missing = false; o.co = null; o.hist.push({ t: NOW(), room: cur.home_room, by: S.user, note: "Returned by NFC tap" });
        saveAov(); nav("t"); S.step = 3; draw();
      });
      if (g("again")) g("again").addEventListener("click", function () { S = { step: 0, user: "", due: 0, mode: e().checked_out_by ? "return" : "out" }; draw(); });
    }
    draw();
  }

  function notFound(msg) { document.title = "Not found · LabMeter"; $main.innerHTML = "<h1>Page not found</h1><p>" + esc(msg || "That page does not exist.") + '</p><a class="btn primary" href="#/">Back to Facility</a> <a class="btn" href="#/find">Find an item</a>'; }

  // ---- router
  var TITLES = { home: "Facility", find: "Find", billing: "Billing", t: "Tap demo" };
  function parseHash() {
    var hash = location.hash || "#/", qi = hash.indexOf("?"), q = {};
    if (qi >= 0) { try { new URLSearchParams(hash.slice(qi + 1)).forEach(function (v, k) { q[k] = v; }); } catch (e) { q = {}; } }
    return { p: (qi >= 0 ? hash.slice(0, qi) : hash).replace(/^#\/?/, "").split("/").filter(Boolean), q: q };
  }
  function nav(route) {
    CUR = route;
    var n = D ? attention().length : 0;
    var items = [["#/", "Facility", "home"], ["#/find", "Find", "find"], ["#/billing", "Billing", "billing"], ["#/t", "Tap demo", "t"]];
    document.getElementById("nav").innerHTML = items.map(function (x) {
      return '<a href="' + x[0] + '"' + (route === x[2] ? ' aria-current="page"' : "") + ">" + x[1] + (x[2] === "find" && n ? '<span class="nb">' + n + '<span class="vh"> items need attention</span></span>' : "") + "</a>";
    }).join("");
  }
  function route(ev) {
    if (timer) { clearInterval(timer); timer = null; }
    destroyScene(); SEL = null; OPENER = null; REPLAY = false;
    var h = parseHash(), p = h.p, q = h.q;
    V = VIEWS.indexOf(q.view) >= 0 ? q.view : (storedView() || "map"); VEFF = V;
    var r = p[0] || "home";
    if (["home", "find", "billing", "t", "i"].indexOf(r) < 0) r = "404";
    T = D ? D.tLast : T;
    nav(r === "i" ? "home" : r);
    $main.innerHTML = "";
    document.title = (TITLES[r === "i" ? "home" : r] || "Not found") + " · LabMeter";
    if (!D) { syncToggle(); return; }
    $main.removeAttribute("aria-busy");
    try {
      if (r === "i") { instrument(p[1]); if (D.inst[p[1]]) document.title = D.inst[p[1]].name + " · LabMeter"; }
      else if (r === "t") { if (!p[1]) tapIndex(); else { var tg = decodeURIComponent(p[1]); if (/^gear-/.test(tg)) tapGear(tg); else tap(tg); if (document.title.indexOf("Not found") !== 0) document.title = "Tap " + tg.replace(/^(tag|gear)-/, "") + " · LabMeter"; } }
      else if (r === "billing") billing();
      else if (r === "find") findPage(q);
      else if (r === "404") notFound("There is no page at " + (location.hash || "#/") + ".");
      else {
        facility();
        var m = /^(inst|asset):(.+)$/.exec(q.sel || "");
        if (m && ((m[1] === "inst" && D.inst[m[2]]) || (m[1] === "asset" && getEA().some(function (x) { return x.id === m[2]; })))) showPanel(m[1], m[2]);
        else if (q.sel) toast("That item was not found, so nothing is selected.");
      }
    } catch (e) { $main.innerHTML = "<h1>Something went wrong</h1><p>This page could not be drawn. Reload to try again.</p><pre>" + esc(e.message) + "</pre>"; }
    syncToggle();
    if (ev && !WANT_FOCUS) { window.scrollTo(0, 0); if (!SEL) $main.focus({ preventScroll: true }); }
  }
  function goFind() {
    if (CUR === "find") { var i = document.getElementById("fq"); if (i) { i.focus(); i.select(); return; } }
    WANT_FOCUS = true;
    if ((location.hash || "").split("?")[0] === "#/find") route(null); else location.hash = "#/find";
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape") { if (SEL) { ev.preventDefault(); hidePanel(); } return; }
    if (ev.key === "/" && !ev.ctrlKey && !ev.metaKey && !ev.altKey && D) {
      var t = ev.target, tag = t && t.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
      ev.preventDefault(); goFind();
    }
  });
  document.addEventListener("click", function (ev) {
    var pk = ev.target.closest && ev.target.closest("[data-pick]");
    if (pk && panelEl()) {
      var q = pk.getAttribute("data-pick").split(":"); showPanel(q[0], q[1]);
      var sg = document.getElementById("fsug"); if (sg && sg.contains(pk)) { sg.hidden = true; var fi = document.getElementById("fsq"); if (fi) fi.value = ""; }
      var st = document.getElementById("stage"); if (st && st.scrollIntoView) st.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }
    var ac = ev.target.closest && ev.target.closest("[data-act][data-id]");
    if (ac && ac.closest("#panel")) doAct(ac.getAttribute("data-act"), ac.getAttribute("data-id"));
    else if (ev.target.closest && ev.target.closest("#pclose")) hidePanel();
  });
  $$("#viewsw button").forEach(function (b) { b.addEventListener("click", function () { setView(b.getAttribute("data-v")); }); });
  nav("home");
  function boot() {
    load().then(function () { route(null); }).catch(function (e) {
      $main.removeAttribute("aria-busy");
      $main.innerHTML = '<h1>Could not load demo data</h1><p role="alert">' + esc(e.message) + '. Serve this folder over HTTP (for example <code>python3 -m http.server</code>) instead of opening the file directly, or check your connection.</p><button type="button" class="btn primary" id="retry">Try again</button>';
      document.getElementById("retry").addEventListener("click", function () { $main.innerHTML = '<p class="muted" role="status">Loading demo data</p>'; $main.setAttribute("aria-busy", "true"); boot(); });
    });
  }
  boot();
})();
