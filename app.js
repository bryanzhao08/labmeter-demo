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
  var M = { sel: null, pinned: false, hideT: null, bound: false, last: null };
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
  function uname(id) { return "Researcher " + String(id).replace("user-", ""); }
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
      [j("data/layout.json").catch(function () { return null; })]
    )).then(function (a) {
      var inst = {}, order = [];
      a[2].forEach(function (i) { inst[i.id] = i; order.push(i.id); });
      var tl = {};
      TAGS.forEach(function (t, k) { tl[t] = a[3 + k]; });
      D = { rec: a[0], util: a[1], inst: inst, order: order, tl: tl, layout: a[a.length - 1] };
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


  // ---- view toggle (Map | List)
  function storedView() { try { var v = localStorage.getItem(VSTORE); return VIEWS.indexOf(v) >= 0 ? v : null; } catch (e) { return null; } }
  function saveView(v) { try { localStorage.setItem(VSTORE, v); } catch (e) { /* storage unavailable */ } }
  function syncToggle() {
    $$("#viewsw button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-v") === V ? "true" : "false"); });
  }
  function setView(v) {
    V = v; saveView(v); syncToggle();
    var h = location.hash || "#/", path = h.split("?")[0];
    var onDash = !!document.getElementById("viewregion");
    if (onDash) { try { history.replaceState(null, "", path + "?view=" + v); } catch (e) { location.hash = path + "?view=" + v; } renderView(); }
    else location.hash = "#/?view=" + v;
  }
  function listHTML() {
    return '<h2>Instruments</h2><div class="grid icards">' + D.order.map(function (id) {
      var i = D.inst[id], u = D.u[id], pct = u.obs ? u.run / u.obs * 100 : 0;
      var ss = D.sessions.filter(function (s) { return s.instrument_id === id; });
      var ex = D.exc.filter(function (e) { return e.instrument_id === id; }).length;
      var $ = ss.reduce(function (a, s) { return a + s.dollars; }, 0);
      return '<a class="card icard" href="#/i/' + id + '"><h3><span>' + esc(i.name) + '</span><span class="muted small">' + fmtMoney(i.hourly_rate) + "/h</span></h3>" +
        '<div class="bar-track" role="img" aria-label="' + pct.toFixed(0) + ' percent utilization"><div class="bar-fill" style="width:' + pct.toFixed(0) + '%"></div></div>' +
        '<div class="row"><span>Util <b>' + pct.toFixed(0) + "%</b></span><span>Billed <b>" + fmtMoney($) + "</b></span><span>Exceptions <b>" + ex + "</b></span></div></a>";
    }).join("") + "</div>";
  }
  function renderView() {
    var el = document.getElementById("viewregion"); if (!el) return;
    M.sel = null; M.pinned = false;
    if (V === "map" && D.layout) { el.innerHTML = mapHTML(); bindMap(); updateMap(); }
    else el.innerHTML = listHTML();
  }

  // ---- facility map
  function stateAt(id, t) {
    var a = D.tl[id].states;
    for (var k = 0; k < a.length; k++) if (t >= a[k].start && t < a[k].end) return a[k].state === "unknown" ? "gap" : a[k].state;
    return "gap";
  }
  function lastKnown(id, t) {
    var a = D.tl[id].states, best = null;
    a.forEach(function (s) { if (s.state !== "unknown" && s.end <= t && (!best || s.end > best.end)) best = s; });
    return best;
  }
  function pending(id) { return D.exc.filter(function (e) { return e.instrument_id === id && !getRev()[e.key]; }).length; }
  function mapSVG() {
    var L = D.layout, W = L.viewBox[0], H = L.viewBox[1], R = {}, sd = L.sensor || { dx: 36, dy: -20 };
    L.rooms.forEach(function (r) { R[r.id] = r; });
    var hall = L.rooms.filter(function (r) { return r.kind === "hall"; })[0];
    var busY = hall ? hall.y + hall.h / 2 : H / 2;
    var at = function (r, p) { return [r.x + r.w * p.x / 100, r.y + r.h * p.y / 100]; };
    D.pos = {};
    var s = '<svg id="plan" class="plan" viewBox="0 0 ' + W + " " + H + '" role="group" aria-label="Floor plan of the core facility. Each instrument is a pin; use Tab to move between pins.">' +
      '<defs><pattern id="hatchGap" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" class="hg-bg"/><rect width="2.5" height="6" class="hg-fg"/></pattern></defs>';
    s += '<rect class="plan-bg" x="0" y="0" width="' + W + '" height="' + H + '"/>';
    L.rooms.forEach(function (r) {
      s += '<g class="room k-' + esc(r.kind) + '"><rect class="rm" x="' + r.x + '" y="' + r.y + '" width="' + r.w + '" height="' + r.h + '" rx="3"/>' +
        '<text class="rmname" x="' + (r.kind === "hall" ? r.x + r.w / 2 : r.x + 12) + '" y="' + (r.kind === "hall" ? r.y + r.h / 2 + 5 : r.y + 25) + '"' + (r.kind === "hall" ? ' text-anchor="middle"' : "") + ">" + esc(r.name) + "</text></g>";
    });
    // server + uplinks
    var sv = L.server && R[L.server.room] ? at(R[L.server.room], L.server) : null;
    if (sv) {
      L.rooms.forEach(function (r) {
        if (!r.gateway) return; var g = at(r, r.gateway);
        s += '<polyline class="uplink" points="' + g[0] + "," + g[1] + " " + g[0] + "," + busY + " " + sv[0] + "," + busY + " " + sv[0] + "," + (sv[1] - 14) + '"/>';
      });
    }
    // BLE links
    D.order.forEach(function (id) {
      var p = L.pins[id], r = p && R[p.room]; if (!r || !r.gateway) return;
      var c = at(r, p), g = at(r, r.gateway);
      D.pos[id] = { x: c[0], y: c[1], l: c[0] > W * 0.55, k: r.kind };
      s += '<line class="ble" x1="' + (c[0] + sd.dx) + '" y1="' + (c[1] + sd.dy) + '" x2="' + g[0] + '" y2="' + g[1] + '"/>';
    });
    L.rooms.forEach(function (r) {
      if (!r.gateway) return; var g = at(r, r.gateway);
      s += '<g class="gw" transform="translate(' + g[0] + "," + g[1] + ')"><title>Room gateway: collects sensor packets over BLE and uploads them</title><path class="gw-ant" d="M-6 -7 V-13 M6 -7 V-13"/><rect x="-13" y="-7" width="26" height="14" rx="3"/><circle cx="-6" cy="0" r="1.8"/><circle cx="0" cy="0" r="1.8"/><circle cx="6" cy="0" r="1.8"/></g>';
    });
    if (sv) {
      s += '<g class="srv" transform="translate(' + sv[0] + "," + sv[1] + ')"><title>LabMeter server: reconciles claims, bookings and measured runs</title><rect x="-18" y="-14" width="36" height="12" rx="3"/><rect x="-18" y="1" width="36" height="12" rx="3"/><circle cx="-11" cy="-8" r="1.8"/><circle cx="-11" cy="7" r="1.8"/></g>' +
        '<text class="srv-l" x="' + sv[0] + '" y="' + (sv[1] + 34) + '" text-anchor="middle">' + esc(L.server.label || "Server") + "</text>";
    }
    // sensors
    D.order.forEach(function (id) {
      var q = D.pos[id]; if (!q) return;
      s += '<g class="sn" transform="translate(' + (q.x + sd.dx) + "," + (q.y + sd.dy) + ')"><title>Clip-on sensor on ' + esc(iname(id)) + '</title><rect x="-8" y="-8" width="16" height="16" rx="4"/><path d="M-5 1 L-2.5 1 L-1 -4 L1 5 L2.5 1 L5 1"/></g>';
    });
    // pins
    D.order.forEach(function (id) {
      var q = D.pos[id]; if (!q) return;
      s += '<g class="pin st-gap' + (q.k === "dark" ? " rk-dark" : "") + '" data-id="' + id + '" tabindex="0" role="button" aria-haspopup="dialog" transform="translate(' + q.x + "," + q.y + ')">' +
        '<circle class="hit" r="34"/><circle class="focusring" r="29"/><circle class="ring" r="21"/><circle class="disc" r="21"/>' +
        '<g class="gl gl-run"><path d="M-5 -8 L9 0 L-5 8Z"/></g>' +
        '<g class="gl gl-idle"><rect x="-8" y="-8" width="5.5" height="16" rx="1"/><rect x="2.5" y="-8" width="5.5" height="16" rx="1"/></g>' +
        '<g class="gl gl-off"><path d="M-6 -5.5 A8.5 8.5 0 1 0 6 -5.5 M0 -10 V-1"/></g>' +
        '<g class="gl gl-gap"><circle r="9"/><text y="6" text-anchor="middle">?</text></g>' +
        '<g class="bdg zero" transform="translate(17,-17)"><circle r="10"/><text y="4" text-anchor="middle">0</text></g>' +
        '<text class="pinlabel" y="42" text-anchor="middle">' + esc(iname(id)) + "</text></g>";
    });
    return s + "</svg>";
  }
  function mapHTML() {
    return '<h2>Facility map</h2><p class="small muted maplede">Illustrative floor plan. Each pin is an instrument with a clip-on sensor; sensors talk to the room gateway over BLE and the gateways upload to the server. Pin colour is the sensor state at the time chosen below.</p>' +
      '<div class="maptools"><button type="button" class="btn sm" id="tprev" aria-label="Jump to previous data window">Earlier data</button>' +
      '<input type="range" id="tscrub" min="' + Math.floor(D.t0) + '" max="' + Math.floor(D.t1) + '" step="60" value="' + Math.floor(T) + '" aria-label="Time in the simulated week, UTC">' +
      '<button type="button" class="btn sm" id="tnext" aria-label="Jump to next data window">Later data</button></div>' +
      '<div class="readout"><strong id="tread"></strong> <span class="muted small" id="trep"></span></div>' +
      '<div class="legend maplegend" aria-label="Map legend"><span><i class="lg lg-run"></i>Running</span><span><i class="lg lg-idle"></i>Idle (on)</span><span><i class="lg lg-off"></i>Off</span><span><i class="lg lg-gap"></i>No sensor data (outline = last known state)</span>' +
      '<span><i class="lg lg-bdg">2</i>Pending exceptions</span><span><svg class="lgi" width="18" height="14" viewBox="-9 -7 18 14" aria-hidden="true"><g class="sn"><rect x="-8" y="-6" width="14" height="12" rx="3"/></g></svg>Sensor</span>' +
      '<span><svg class="lgi" width="22" height="14" viewBox="-13 -7 26 14" aria-hidden="true"><g class="gw"><rect x="-12" y="-6" width="24" height="12" rx="3"/></g></svg>Gateway</span><span><svg class="lgi" width="28" height="8" viewBox="0 0 28 8" aria-hidden="true"><line class="ble" x1="1" y1="4" x2="27" y2="4"/></svg>BLE link</span></div>' +
      '<div class="mapwrap" id="mapwrap">' + mapSVG() + '<div class="pcard" id="pcard" role="dialog" aria-modal="false" aria-labelledby="pc-title" hidden></div></div>' +
      '<p class="small muted">Positions are a made-up layout (edit <code>data/layout.json</code>). Hover, focus or tap a pin for details. Prefer a table? Switch to List.</p>';
  }
  function cardHTML(id) {
    var i = D.inst[id], u = D.u[id], pct = u.obs ? u.run / u.obs * 100 : 0, st = stateAt(id, T);
    var ss = D.sessions.filter(function (x) { return x.instrument_id === id && x.start <= T; }).sort(function (a, b) { return b.start - a.start; })[0];
    var ex = D.exc.filter(function (e) { return e.instrument_id === id; }), by = {}, pend = 0;
    ex.forEach(function (e) { var b = by[e.type] || (by[e.type] = { n: 0, p: 0 }); b.n++; if (!getRev()[e.key]) { b.p++; pend++; } });
    var exh = Object.keys(by).length ? Object.keys(TYPES).filter(function (t) { return by[t]; }).map(function (t) { return badge(t) + ' <span class="small">' + by[t].n + (by[t].p !== by[t].n ? " (" + by[t].p + " pending)" : "") + "</span>"; }).join(" ") : '<span class="muted">None</span>';
    return '<div class="pc-head"><div><h3 id="pc-title">' + esc(i.name) + '</h3><div class="muted small">' + esc(i["class"]) + " · " + fmtMoney(i.hourly_rate) + '/h</div></div><button type="button" class="pc-x" id="pcx" aria-label="Close details">&times;</button></div>' +
      '<div class="pc-state"><span class="chip st-' + st + '"><i></i>' + STATE_LABEL[st] + '</span> <span class="muted small">' + esc(fmtT(T)) + " UTC</span></div>" +
      (st === "gap" ? '<div class="muted small" style="margin-bottom:6px">' + (lastKnown(id, T) ? "Last known: " + STATE_LABEL[lastKnown(id, T).state].toLowerCase() + " until " + esc(fmtT(lastKnown(id, T).end)) + " UTC. The simulation only observes each instrument for about an hour a day." : "No sensor data before this time.") + "</div>" : "") +
      '<dl class="pc-dl"><dt>Run hours, week</dt><dd>' + (u.run / 3600).toFixed(1) + " h</dd><dt>Utilization</dt><dd>" + pct.toFixed(0) + '% <span class="muted small">of monitored time</span></dd>' +
      "<dt>Exceptions</dt><dd>" + exh + "</dd><dt>Last session</dt><dd>" + (ss ? esc(uname(ss.user_id)) + ", " + esc(gname(ss.account_id)) + '<br><span class="muted small">' + esc(fmtT(ss.start)) + " UTC</span>" : '<span class="muted">None yet at this time</span>') + "</dd></dl>" +
      '<div class="pc-act"><a class="btn sm primary" href="#/i/' + id + '">Timeline</a><a class="btn sm" href="#/t/tag-' + id + '">Tap sim</a></div>';
  }
  function updateMap() {
    var root = document.getElementById("plan"); if (!root) return;
    var live = 0;
    D.order.forEach(function (id) {
      var g = root.querySelector('.pin[data-id="' + id + '"]'); if (!g) return;
      var st = stateAt(id, T), n = pending(id); if (st !== "gap") live++;
      var lk = st === "gap" ? lastKnown(id, T) : null;
      g.setAttribute("class", "pin st-" + st + (lk ? " lk-" + lk.state : "") + (D.pos[id] && D.pos[id].k === "dark" ? " rk-dark" : "") + (M.sel === id ? " sel" : ""));
      g.setAttribute("aria-label", iname(id) + ", " + STATE_LABEL[st].toLowerCase() + (lk ? " (last known " + STATE_LABEL[lk.state].toLowerCase() + ")" : "") + ", " + n + " pending " + (n === 1 ? "exception" : "exceptions") + ". Press Enter for details.");
      var b = g.querySelector(".bdg"); b.setAttribute("class", "bdg" + (n ? "" : " zero"));
      b.querySelector("text").textContent = n > 99 ? "99+" : String(n);
    });
    var rd = document.getElementById("tread"); if (rd) rd.textContent = fmtT(T) + " UTC";
    var rp = document.getElementById("trep"); if (rp) rp.textContent = live + " of " + D.order.length + " sensors reporting";
    var sl = document.getElementById("tscrub");
    if (sl) { sl.value = String(Math.floor(T)); sl.setAttribute("aria-valuetext", fmtT(T) + " UTC"); }
    var card = document.getElementById("pcard");
    if (card && M.sel && !card.hidden) { card.innerHTML = cardHTML(M.sel); placeCard(M.sel); }
  }
  function placeCard(id) {
    var card = document.getElementById("pcard"), wrap = document.getElementById("mapwrap"), q = D.pos && D.pos[id]; if (!card || !wrap || !q) return;
    var W = D.layout.viewBox[0], H = D.layout.viewBox[1];
    card.classList.toggle("l", q.l);
    card.style.setProperty("--x", (q.x / W * 100) + "%");
    var wh = wrap.clientHeight, ch = card.offsetHeight;
    if (wh && ch) card.style.setProperty("--y", Math.max(4, Math.min(q.y / H * wh - ch / 2, wh - ch - 4)) + "px");
    else card.style.setProperty("--y", (q.y / H * 100) + "%");
  }
  function showCard(id) {
    var card = document.getElementById("pcard"); if (!card) return;
    clearTimeout(M.hideT); M.sel = id; card.innerHTML = cardHTML(id); card.hidden = false; placeCard(id); updateMap();
  }
  function hideCard(refocus) {
    var card = document.getElementById("pcard"); clearTimeout(M.hideT);
    var id = M.sel; M.sel = null; M.pinned = false;
    if (card) { card.hidden = true; card.innerHTML = ""; }
    updateMap();
    if (refocus && id) { var g = document.querySelector('.pin[data-id="' + id + '"]'); if (g && g.focus) g.focus(); }
  }
  function softHide() { clearTimeout(M.hideT); if (M.pinned) return; M.hideT = setTimeout(function () { if (!M.pinned) hideCard(false); }, 250); }
  function jump(dir) {
    var w = D.windows, k;
    if (dir < 0) { for (k = w.length - 1; k >= 0; k--) if (w[k][0] < T - 60) { T = w[k][0] + 1; break; } }
    else { for (k = 0; k < w.length; k++) if (w[k][0] > T + 60) { T = w[k][0] + 1; break; } }
    updateMap();
  }
  function bindMap() {
    var root = document.getElementById("plan"), card = document.getElementById("pcard"); if (!root || !card) return;
    $$(".pin", root).forEach(function (g) {
      var id = g.getAttribute("data-id");
      g.addEventListener("mouseenter", function () { if (!M.pinned) showCard(id); else clearTimeout(M.hideT); });
      g.addEventListener("mouseleave", softHide);
      g.addEventListener("focus", function () { if (!M.pinned) showCard(id); });
      g.addEventListener("blur", softHide);
      g.addEventListener("click", function (ev) { ev.stopPropagation(); M.pinned = true; showCard(id); });
      g.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault(); M.pinned = true; showCard(id);
          var f = card.querySelector("a,button"); if (f && f.focus) f.focus();
        }
      });
    });
    card.addEventListener("mouseenter", function () { clearTimeout(M.hideT); });
    card.addEventListener("mouseleave", softHide);
    card.addEventListener("click", function (ev) { if (ev.target.closest && ev.target.closest("#pcx")) hideCard(true); });
    root.addEventListener("click", function () { if (M.sel) hideCard(false); });
    var sl = document.getElementById("tscrub");
    sl.addEventListener("input", function () { T = +sl.value; updateMap(); });
    document.getElementById("tprev").addEventListener("click", function () { jump(-1); });
    document.getElementById("tnext").addEventListener("click", function () { jump(1); });
    if (!M.bound) {
      M.bound = true;
      document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && M.sel) hideCard(true); });
    }
  }

  // ---- dashboard
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
  function dashboard() {
    var open = D.exc.filter(function (e) { return !getRev()[e.key]; }).length;
    var h = '<section class="hero"><h1>Bill shared instruments for what actually ran.</h1>' +
      "<p>LabMeter clips a sensor onto each instrument, matches measured run time to NFC claims and bookings, bills verified time, and sends the awkward cases to a review queue instead of auto-billing them. Everything below is a week of simulated data.</p></section>";
    h += '<div class="grid kpis">' +
      kpi("Verified billable hours", (D.billMin / 60).toFixed(2) + " h", D.sessions.length + " sessions, " + (D.runMin / 60).toFixed(1) + " h measured run time, 15-min floor") +
      kpi("Billed (verified runs)", fmtMoney(D.billed), "Booking-only billing would be " + fmtMoney(D.bookingOnly)) +
      kpi("Pending review value", fmtMoney(D.recoverable), "Walk-ups and overruns the bookings missed; not billed until reviewed") +
      kpi("Utilization", D.utilPct.toFixed(0) + "%", "Run time as a share of monitored time (see note)") + "</div>";
    h += '<div class="card"><h3>Booking-only vs sensor-verified</h3><p class="small muted" style="margin:0 0 8px">Booking-only bills every booked slot, rounded down to 15 min. Verified billing charges measured run time that overlaps a claim.</p>' +
      '<div class="row"><span>Booking-only <b>' + fmtMoney(D.bookingOnly) + '</b></span><span>No-show bookings not billed <b>' + fmtMoney(D.noShowValue) + '</b></span><span>Verified billed <b>' + fmtMoney(D.billed) + '</b></span><span>Walk-up + overrun run time to review <b>' + fmtMoney(D.recoverable) + "</b></span></div></div>";
    h += '<div id="viewregion"></div>';
    h += "<h2>Run minutes by hour of day</h2><div class=\"card\">" + heat() + '<p class="small muted" style="margin:8px 0 0">Total measured run minutes over 7 days, UTC. The simulator emits one 65-minute observation window per instrument per day, so activity is concentrated and utilization is relative to monitored time, not to a full working day.</p></div>';
    h += '<h2 id="queue">Exceptions review queue <span class="muted small">(' + open + " of " + D.exc.length + " undecided)</span></h2>";
    h += '<div class="toolbar"><div class="filters" id="filters" role="group" aria-label="Filter by type"><button data-f="all" aria-pressed="true">All (' + D.exc.length + ")</button>" +
      Object.keys(TYPES).map(function (t) { return D.byType[t] ? '<button data-f="' + t + '" aria-pressed="false">' + TYPES[t][0] + " (" + D.byType[t].n + ")</button>" : ""; }).join("") + "</div></div>";
    h += '<div class="card scroll"><table class="tbl" id="qt"><thead><tr><th>Type</th><th>Instrument</th><th>When (UTC)</th><th class="num">Run value</th><th>Decision</th></tr></thead><tbody></tbody></table></div>' +
      '<p class="small muted">Approve/reject is saved in this browser only (localStorage). As in the backend, a decision records a review outcome and does not create a charge.</p>';
    h += '<h2>Billing export</h2><div class="card"><p style="margin-top:0">Provisional CSV of the ' + D.sessions.length + " verified sessions, generated in your browser from the JSON snapshot.</p>" +
      '<button class="btn primary" id="csv">Download billing CSV</button> <a class="btn" href="data/billing.csv" download>Original server CSV</a>' +
      '<p class="small muted" style="margin-bottom:0">No iLab or PPMS schema has been validated; columns are a generic placeholder.</p></div>';
    h += how();
    $main.innerHTML = h;
    renderView();
    var f = "all";
    function table() {
      var list = D.exc.filter(function (e) { return f === "all" || e.type === f; }).sort(function (a, b) { return a.start - b.start; });
      document.querySelector("#qt tbody").innerHTML = excRows(list, true);
    }
    table();
    $$("#filters button").forEach(function (b) { b.addEventListener("click", function () { f = b.getAttribute("data-f"); $$("#filters button").forEach(function (x) { x.setAttribute("aria-pressed", x === b); }); table(); }); });
    bindReview(document.getElementById("qt"), function () { table(); updateMap(); var n = D.exc.filter(function (e) { return !getRev()[e.key]; }).length; document.querySelector("#queue .small").textContent = "(" + n + " of " + D.exc.length + " undecided)"; });
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
  function how() {
    return '<h2 id="how">How it works</h2><div class="grid steps">' +
      '<div class="card step"><h3>Clip-on sensor</h3><p class="small muted">A current clamp and vibration sensor on the instrument power lead measures whether it is off, idle or running. No instrument integration needed.</p></div>' +
      '<div class="card step"><h3>BLE to gateway</h3><p class="small muted">The sensor advertises state every 2 s while running. A lab gateway collects the packets and posts batches to the server, deduplicating and buffering offline.</p></div>' +
      '<div class="card step"><h3>Reconcile</h3><p class="small muted">Researchers tap an NFC sticker to claim the instrument and pick a grant. The server compares bookings, claims and measured runs, and flags walk-ups, overruns, idle claims, no-shows and sensor gaps.</p></div>' +
      '<div class="card step"><h3>Billing export</h3><p class="small muted">Verified run time is billed per grant at the instrument rate, rounded down to 15 minutes. Exceptions wait for a human decision. Export as CSV.</p></div></div>' +
      '<div class="note"><strong>Demo on simulated data; no real instruments or hardware yet.</strong> Detection accuracy, billing rules and integrations have not been validated against real equipment.</div>';
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
    var h = '<div class="crumb"><a href="#/">Dashboard</a> / ' + esc(i.name) + "</div><h1>" + esc(i.name) + '</h1><p class="muted">' + fmtMoney(i.hourly_rate) + "/h · run threshold " + i.run_threshold_ma + " mA · idle baseline " + i.idle_baseline_ma + ' mA · <a href="#/t/' + id + '">Open NFC tap page</a></p>';
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

  // ---- tap page
  function tapIndex() {
    $main.innerHTML = '<h1>NFC tap pages</h1><p class="muted">Each instrument carries an NFC sticker that opens its tap page. Pick one to simulate a tap.</p><div class="grid icards">' +
      TAGS.map(function (t) { return '<a class="card icard" href="#/t/tag-' + t + '"><h3>' + esc(iname(t)) + '</h3><span class="muted small">/t/tag-' + t + "</span></a>"; }).join("") + "</div>";
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

  function notFound(msg) { $main.innerHTML = "<h1>Not found</h1><p>" + esc(msg || "That page does not exist.") + '</p><a class="btn" href="#/">Back to dashboard</a>'; }

  // ---- router
  function nav(route) {
    var items = [["#/", "Dashboard", "home"], ["#/t", "Tap demo", "t"], ["#/how", "How it works", "how"]];
    document.getElementById("nav").innerHTML = items.map(function (x) { return '<a href="' + x[0] + '"' + (route === x[2] ? ' aria-current="page"' : "") + ">" + x[1] + "</a>"; }).join("");
  }
  function route() {
    if (timer) { clearInterval(timer); timer = null; }
    var hash = location.hash || "#/", qi = hash.indexOf("?");
    var qv = null;
    if (qi >= 0) { try { qv = new URLSearchParams(hash.slice(qi + 1)).get("view"); } catch (e) { qv = null; } }
    V = VIEWS.indexOf(qv) >= 0 ? qv : (storedView() || "map");
    syncToggle();
    var p = (qi >= 0 ? hash.slice(0, qi) : hash).replace(/^#\/?/, "").split("/").filter(Boolean);
    var r = p[0] || "home";
    nav(r === "i" ? "home" : r);
    if (!D) return;
    try {
      if (r === "i") instrument(p[1]);
      else if (r === "t") p[1] ? tap(decodeURIComponent(p[1])) : tapIndex();
      else { dashboard(); if (r === "how") { var el = document.getElementById("how"); if (el) el.scrollIntoView(); } else window.scrollTo(0, 0); }
    } catch (e) { $main.innerHTML = "<h1>Something went wrong</h1><pre>" + esc(e.message) + "</pre>"; }
    if (r !== "how") window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  $$("#viewsw button").forEach(function (b) { b.addEventListener("click", function () { setView(b.getAttribute("data-v")); }); });
  nav("home");
  load().then(route).catch(function (e) {
    $main.innerHTML = "<h1>Could not load demo data</h1><p>" + esc(e.message) + '. Serve this folder over HTTP (for example <code>python3 -m http.server</code>) instead of opening the file directly.</p>';
  });
})();
