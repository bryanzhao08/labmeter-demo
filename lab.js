/* LaBro lab simulator: one simulated month in a five-instrument shared core.
   Every session has three records: the booking (FBS), the computer login (SoftLock/Bookitlab)
   and the real instrument run (what a clamp sensor sees). Three billing methods are compared live:
     Today:    bill the booking (overruns and walk-ups are missed unless found by hand)
     Logins:   bill the computer login (data transfer and forgotten logouts get charged; no-PC instruments invisible)
     LaBro: bill the actual run with the core's rules (grace, penalties)
   All data is simulated. Assumptions are listed on the page. */
(function () {
  "use strict";
  var DAY = 1440, DAYS = 30;
  var INSTR = [
    { id: "lsm", name: "Zeiss LSM 880 confocal", short: "Confocal", rate: 45, pc: true },
    { id: "fortessa", name: "BD Fortessa flow cytometer", short: "Flow cytometer", rate: 60, pc: true },
    { id: "sp8", name: "Leica SP8 confocal", short: "Confocal 2", rate: 50, pc: true },
    { id: "ti2", name: "Nikon Ti2 widefield", short: "Widefield", rate: 30, pc: true },
    { id: "xpn", name: "Beckman XPN ultracentrifuge", short: "Ultracentrifuge", rate: 25, pc: false }
  ];
  var LABS = [
    { pi: "Chen", users: ["Maya", "Leo"] }, { pi: "Patel", users: ["Priya", "Arjun"] },
    { pi: "Okafor", users: ["Ada", "Tobi"] }, { pi: "Rivera", users: ["Sofia", "Diego"] },
    { pi: "Kim", users: ["Jordan", "Hana"] }, { pi: "Novak", users: ["Sam", "Elena"] }
  ];
  var P = { overrun: 25, walkup: 10, transfer: 25, grace: 60, mult: 2, speed: 3 };
  var S, clock = 0, playing = false, raf = 0, last = 0, tourOn = true, tourShown = {};
  var $ = function (id) { return document.getElementById(id); };
  var money = function (v) { return "$" + Math.round(v).toLocaleString("en-US"); };
  var hrs = function (m) { return (m / 60).toFixed(1) + " h"; };
  function hhmm(m) { m = ((m % DAY) + DAY) % DAY; var h = Math.floor(m / 60), mm = Math.round(m % 60); if (mm === 60) { h++; mm = 0; } return (h % 12 || 12) + ":" + (mm < 10 ? "0" : "") + mm + (h < 12 || h === 24 ? " am" : " pm"); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ---------- generate the month ----------
  function gen() {
    var R = rng(20261103), out = [];
    function pick(a) { return a[Math.floor(R() * a.length)]; }
    function person() { var l = pick(LABS); return { user: pick(l.users), pi: l.pi }; }
    // Day 1 is scripted so the guided tour has a story to tell.
    out.push(mk(0, "lsm", { user: "Maya", pi: "Chen" }, 9 * 60, 11 * 60, 9 * 60 + 10, 12 * 60 + 25, 35, "tour-maya"));
    out.push(mk(0, "ti2", { user: "Jordan", pi: "Kim" }, null, null, 13 * 60, 14 * 60 + 20, 10, "tour-jordan"));
    out.push(mk(0, "fortessa", { user: "Priya", pi: "Patel" }, 14 * 60, 16 * 60, null, null, 0, "tour-priya"));
    out.push(mk(0, "xpn", { user: "Sam", pi: "Novak" }, 15 * 60, 17 * 60, 15 * 60 + 5, 21 * 60 + 40, 0, "tour-sam"));
    out.push(mk(0, "sp8", { user: "Ada", pi: "Okafor" }, 10 * 60, 12 * 60, 10 * 60 + 5, 11 * 60 + 55, 15, null));
    out.push(mk(0, "lsm", { user: "Leo", pi: "Chen" }, 16 * 60, 18 * 60, 16 * 60 + 15, 17 * 60 + 50, 300, "tour-leo"));
    for (var d = 1; d < DAYS; d++) {
      var weekend = d % 7 === 5 || d % 7 === 6;
      INSTR.forEach(function (ins) {
        var t = 8 * 60 + Math.floor(R() * 4) * 15, n = weekend ? (R() < .35 ? 1 : 0) : 2 + Math.floor(R() * 3);
        for (var k = 0; k < n && t < 19 * 60; k++) {
          var len = ins.pc ? (60 + Math.floor(R() * 7) * 30) : (120 + Math.floor(R() * 5) * 60);
          var bs = t, be = t + len, who = person(), r = R();
          var rs = bs + Math.floor(R() * 20), re;
          if (r < .05) { rs = null; re = null; }                                    // no-show
          else if (r < .05 + P.overrun / 100 * .6) re = be + 10 + Math.floor(R() * (P.grace - 10)); // overrun within grace
          else if (r < .05 + P.overrun / 100) re = be + P.grace + 10 + Math.floor(R() * 120);       // overrun past grace
          else if (r < .05 + P.overrun / 100 + .12) re = be - 20 - Math.floor(R() * 40);           // finished early
          else re = be - Math.floor(R() * 15);                                       // on time
          if (!ins.pc && rs !== null && R() < .3) re = Math.max(re, be + 60 + Math.floor(R() * 150)); // long spins run past the slot
          var xfer = ins.pc && rs !== null ? (R() < P.transfer / 100 ? 20 + Math.floor(R() * 40) : 5) : 0;
          if (ins.pc && rs !== null && R() < .04) xfer = 180 + Math.floor(R() * 180);  // forgot to log out
          out.push(mk(d, ins.id, who, bs, be, rs, re, xfer, null));
          t = be + 15 + Math.floor(R() * 4) * 15;
        }
        var wk = weekend ? P.walkup / 100 * .6 : P.walkup / 100;
        if (R() < wk) {                                                             // unbooked walk-up, usually after hours
          var ws = (18 + Math.floor(R() * 4)) * 60 + Math.floor(R() * 4) * 15, wl = 45 + Math.floor(R() * 5) * 30;
          out.push(mk(d, ins.id, person(), null, null, ws, ws + wl, ins.pc ? 10 : 0, null));
        }
      });
    }
    return out.sort(function (a, b) { return a.start - b.start; });
  }
  function mk(day, iid, who, bs, be, rs, re, xfer, tag) {
    var o = day * DAY, ins = INSTR.find(function (i) { return i.id === iid; });
    var s = { day: day, ins: ins, user: who.user, pi: who.pi, tag: tag,
      bs: bs === null ? null : o + bs, be: be === null ? null : o + be,
      rs: rs === null ? null : o + rs, re: re === null ? null : o + re };
    s.ls = ins.pc && s.rs !== null ? s.rs - 3 : null;
    s.le = ins.pc && s.re !== null ? s.re + xfer : null;
    s.xfer = xfer;
    s.start = Math.min.apply(null, [s.bs, s.rs, s.ls].filter(function (x) { return x !== null; }));
    s.end = Math.max.apply(null, [s.be, s.re, s.le].filter(function (x) { return x !== null; }));
    return bill(s);
  }
  function bill(s) {
    var r = s.ins.rate / 60, booked = s.bs !== null ? s.be - s.bs : 0, ran = s.rs !== null ? s.re - s.rs : 0;
    var login = s.ls !== null ? s.le - s.ls : 0;
    // Today: the core bills the booking; no-shows billed in full (a common published policy); walk-ups and overruns are missed.
    s.today = booked * r;
    // Logins: bill the computer session; no-PC instruments fall back to the booking.
    s.login = s.ins.pc ? login * r : booked * r;
    if (s.ins.pc && s.rs === null) s.login = booked * r;
    // LaBro: bill what ran, apply the rules.
    var over = s.bs !== null && s.re !== null ? s.re - s.be : 0, pen = 0, kind = "ok";
    if (s.bs === null) { kind = "unbooked"; pen = ran * r * (P.mult - 1); }
    else if (s.rs === null) kind = "noshow";
    else if (over > P.grace) { kind = "pastgrace"; pen = (over - P.grace) * r * (P.mult - 1); }
    else if (over > 5) kind = "grace";
    else if (ran < booked - 15) kind = "early";
    s.lm = s.rs === null ? booked * r : Math.max(ran, 0) * r + pen;
    s.pen = pen; s.kind = kind; s.booked = booked; s.ran = ran; s.loginMin = login;
    s.flag = kind !== "ok" && kind !== "early";
    s.forgot = s.xfer >= 180; s.xferBilled = s.ins.pc && s.xfer > 5 ? s.xfer * r : 0;
    return s;
  }

  // ---------- totals up to the clock ----------
  function totals(upto) {
    var T = { today: 0, login: 0, lm: 0, missed: 0, overLogin: 0, invisible: 0, invisibleMin: 0, flagged: 0, sessions: 0,
      noshow: 0, unbooked: 0, unMin: 0, unUsd: 0, pens: 0, bookedMin: 0, pastgrace: 0, grace: 0, xfer: 0, forgot: 0, labs: {} };
    S.forEach(function (s) {
      if (s.end > upto) return;
      T.sessions++; T.today += s.today; T.login += s.login; T.lm += s.lm;
      if (s.flag) T.flagged++;
      if (s.kind in T) T[s.kind]++;
      if (s.xferBilled) T.xfer += s.xferBilled;
      var un = s.rs === null ? 0 : s.bs === null ? s.ran : Math.max(0, s.re - Math.max(s.rs, s.be)) - Math.max(0, s.bs - s.rs);
      T.unMin += Math.max(0, un); T.unUsd += Math.max(0, un) * s.ins.rate / 60; T.pens += s.pen; T.bookedMin += s.booked;
      if (s.forgot) T.forgot++;
      if (!s.ins.pc && s.rs !== null) { T.invisible++; T.invisibleMin += s.ran; }
      var L = T.labs[s.pi] || (T.labs[s.pi] = { today: 0, lm: 0, login: 0, hours: 0 });
      L.today += s.today; L.lm += s.lm; L.login += s.login; L.hours += s.ran / 60;
    });
    T.missed = Math.max(0, T.lm - T.today);
    T.overLogin = Math.max(0, T.login - T.lm + 0);
    // Manager time (assumption, shown on page): 2 min per session to compare by hand + 10 min per exception;
    // with LaBro: 1.5 min per flagged exception to approve.
    T.handMin = T.sessions * 2 + T.flagged * 10; T.lmMin = T.flagged * 1.5;
    return T;
  }

  // ---------- rendering ----------
  function bays() {
    var d = Math.min(Math.floor(clock / DAY), DAYS - 1), dayStart = d * DAY, nowPct = (clock - dayStart) / DAY * 100;
    $("bays").innerHTML = INSTR.map(function (ins) {
      var today = S.filter(function (s) { return s.ins === ins && s.end >= dayStart && s.start < dayStart + DAY; });
      var cur = today.find(function (s) { return clock >= s.start && clock < s.end; });
      var running = cur && cur.rs !== null && clock >= cur.rs && clock < cur.re;
      var loggedIn = cur && cur.ls !== null && clock >= cur.ls && clock < cur.le;
      var bookedNow = cur && cur.bs !== null && clock >= cur.bs && clock < cur.be;
      var st = running ? ["run", "Running"] : loggedIn ? ["pc", "PC on, instrument idle"] : bookedNow ? ["book", "Booked, nobody here"] : ["off", "Free"];
      function seg(a, b, cls) {
        if (a === null) return "";
        var x = Math.max(a, dayStart), y = Math.min(b, Math.min(clock, dayStart + DAY));
        if (y <= x) return "";
        return '<i class="' + cls + '" style="left:' + ((x - dayStart) / DAY * 100) + "%;width:" + ((y - x) / DAY * 100) + '%"></i>';
      }
      function bk(s) { return s.bs === null ? "" : '<i class="b" style="left:' + ((s.bs - dayStart) / DAY * 100) + "%;width:" + ((s.be - s.bs) / DAY * 100) + '%"></i>'; }
      return '<article class="bay ' + st[0] + '"><header><div><h3>' + esc(ins.short) + '</h3><p class="muted small">' + esc(ins.name) + " · $" + ins.rate + '/h' + (ins.pc ? "" : " · no computer") + '</p></div>' +
        '<span class="pill ' + st[0] + '">' + st[1] + "</span></header>" +
        '<div class="who">' + (cur ? '<b>' + esc(cur.user) + "</b> <span class=muted>" + esc(cur.pi) + " Lab</span>" + (cur.bs === null ? ' <em class="tag bad">no booking</em>' : "") : '<span class="muted">Empty</span>') + "</div>" +
        '<div class="rows"><div class="lrow"><span>Booking</span><div class="tl">' + today.map(bk).join("") + '<b class="now" style="left:' + nowPct + '%"></b></div></div>' +
        '<div class="lrow"><span>Login</span><div class="tl">' + (ins.pc ? today.map(function (s) { return seg(s.ls, s.le, "l"); }).join("") : '<em class="na">no computer, no login</em>') + '<b class="now" style="left:' + nowPct + '%"></b></div></div>' +
        '<div class="lrow"><span>Actually ran</span><div class="tl">' + today.map(function (s) { return seg(s.rs, s.re, "r"); }).join("") + '<b class="now" style="left:' + nowPct + '%"></b></div></div></div></article>';
    }).join("");
  }
  function meters(T) {
    var max = Math.max(T.today, T.login, T.lm, 1);
    function bar(label, v, cls, note) { return '<div class="meter"><div class="ml"><span>' + label + '</span><b>' + money(v) + '</b></div><div class="mb"><i class="' + cls + '" style="width:' + (v / max * 100) + '%"></i></div><p class="small muted">' + note + "</p></div>"; }
    $("meters").innerHTML =
      bar("Bill the booking (today)", T.today, "b", "What the core charges if nobody checks. Misses overruns and walk-ups.") +
      bar("Bill the computer login", T.login, "l", "Charges data transfer and forgotten logouts. Can't see the ultracentrifuge.") +
      bar("Bill what actually ran (LaBro)", T.lm, "r", "Actual run time plus the core's own penalties.");
    $("kpis").innerHTML = [
      [money(T.unUsd) + " · " + hrs(T.unMin), "of instrument use never billed", "plus " + money(T.pens) + " in penalties the core's own rules call for"],
      [money(T.xfer), "of data transfer billed as instrument time", T.forgot + " forgotten logouts this month"],
      [T.invisible + " runs · " + hrs(T.invisibleMin), "invisible to any login system", "ultracentrifuge has no computer"],
      [hrs(T.handMin) + " → " + hrs(T.lmMin), "manager time to audit", T.flagged + " of " + T.sessions + " sessions need a decision"]
    ].map(function (k) { return '<div class="kpi"><b>' + k[0] + "</b><span>" + k[1] + '</span><small class="muted">' + k[2] + "</small></div>"; }).join("");
    var labs = Object.keys(T.labs).sort();
    $("labs").innerHTML = labs.length ? '<table><thead><tr><th>Lab</th><th class="n">Hours run</th><th class="n">Billed today</th><th class="n">Login billing</th><th class="n">LaBro</th><th class="n">Today vs fair</th></tr></thead><tbody>' +
      labs.map(function (k) { var L = T.labs[k], d = L.today - L.lm; return "<tr><td>" + k + " Lab</td><td class=n>" + L.hours.toFixed(1) + "</td><td class=n>" + money(L.today) + "</td><td class=n>" + money(L.login) + "</td><td class=n>" + money(L.lm) + '</td><td class="n ' + (d > 0 ? "over" : d < 0 ? "under" : "") + '">' + (d > 0 ? "overcharged " + money(d) : d < 0 ? "undercharged " + money(-d) : "—") + "</td></tr>"; }).join("") + "</tbody></table>" : '<p class="muted">Statements fill in as sessions finish.</p>';
  }
  var fed = {};
  function feed() {
    var lines = [];
    S.forEach(function (s, i) {
      if (s.end > clock || fed[i]) return;
      var t = "Day " + (s.day + 1) + " " + hhmm(s.end), who = "<b>" + esc(s.user) + "</b> (" + esc(s.pi) + " Lab)", ins = esc(s.ins.short), m = null, cls = "";
      if (s.kind === "unbooked") { m = who + " used the " + ins + " for " + hrs(s.ran) + " with no booking. Billed today: $0."; cls = "bad"; }
      else if (s.kind === "noshow") { m = who + " booked the " + ins + " and never came. The slot sat empty."; cls = "warn"; }
      else if (s.kind === "pastgrace") { m = who + " ran " + hrs(s.re - s.be) + " past the booking on the " + ins + ". Today that's missed; LaBro bills it plus the penalty."; cls = "bad"; }
      else if (!s.ins.pc && s.re > s.be) { m = who + "'s ultracentrifuge spin ran " + hrs(s.re - s.be) + " past the slot. No login system saw it."; cls = "bad"; }
      else if (s.forgot) { m = who + " forgot to log out of the " + ins + ". Login billing charges " + hrs(s.xfer) + " of an idle machine."; cls = "warn"; }
      if (m) { fed[i] = 1; lines.push('<li class="' + cls + '"><time>' + t + "</time>" + m + "</li>"); }
    });
    if (lines.length) { var ul = $("feed"); ul.insertAdjacentHTML("afterbegin", lines.reverse().join("")); while (ul.children.length > 40) ul.removeChild(ul.lastChild); }
  }
  var TOUR = [
    { at: 9 * 60 + 15, text: "9:00 am. <b>Maya</b> from the Chen Lab books the confocal from 9 to 11. The booking lives in FBS. The login is on the microscope's computer. The real run is what the sensor on the power cord sees." },
    { at: 12 * 60 + 30, text: "12:25 pm. Maya's imaging ran <b>1 h 25 m past</b> her booking. That's past the 1-hour grace, so the core's rule says she owes extra. If the bill comes from the booking, nobody notices." },
    { at: 13 * 60 + 5, text: "12:55 pm. Maya is copying files off the PC. Her login keeps running. <b>Login-based billing charges her for 35 minutes the microscope wasn't imaging.</b>" },
    { at: 14 * 60 + 25, text: "1:00 pm. <b>Jordan</b> from the Kim Lab walks up to the widefield with no booking. Today that hour is free unless the manager catches it in the logs." },
    { at: 16 * 60 + 5, text: "2:00 pm. <b>Priya</b> booked the flow cytometer and didn't show. Two prime hours on a $60/h instrument, empty." },
    { at: 18 * 60 + 5, text: "6:00 pm. <b>Leo</b> finished on the confocal at 5:50 and forgot to log out. Login billing will charge his lab for the whole evening." },
    { at: 21 * 60 + 45, text: "9:40 pm. <b>Sam</b>'s ultracentrifuge spin ran almost 5 hours past the slot. It has no computer, so no login system ever saw it. Only a sensor can. <b>Now watch the rest of the month.</b>" }
  ];
  function tour() {
    if (!tourOn) return;
    for (var i = 0; i < TOUR.length; i++) {
      if (!tourShown[i] && clock >= TOUR[i].at) {
        tourShown[i] = 1; $("cap").innerHTML = TOUR[i].text; $("cap").hidden = false;
        if (i < TOUR.length - 1) { pause(); $("capnext").hidden = false; } else { $("capnext").hidden = true; P.speed = Math.max(P.speed, 6); $("speed").value = P.speed; }
        return;
      }
    }
  }
  function draw() {
    var d = Math.floor(clock / DAY);
    $("clock").textContent = "Day " + Math.min(d + 1, DAYS) + " of " + DAYS + " · " + hhmm(clock);
    $("prog").style.width = (clock / (DAYS * DAY) * 100) + "%";
    bays(); var T = totals(clock); meters(T); feed(); tour(); calcFromSim(T);
  }

  // ---------- playback ----------
  function speedMin() { return [0, 2, 6, 20, 60, 150, 400, 900][P.speed] || 20; } // sim minutes per real second... scaled below
  function frame(ts) {
    if (!playing) return;
    var dt = last ? Math.min(ts - last, 100) : 16; last = ts;
    var day0 = clock < DAY && tourOn;
    clock += dt / 1000 * speedMin() * (day0 ? 6 : 10);
    if (clock >= DAYS * DAY) { clock = DAYS * DAY; draw(); pause(); endCap(); $("play").textContent = "Replay month"; return; }
    draw(); raf = requestAnimationFrame(frame);
  }
  function play() { if (clock >= DAYS * DAY) reset(); playing = true; last = 0; $("play").textContent = "Pause"; $("capnext").hidden = true; raf = requestAnimationFrame(frame); }
  function pause() { playing = false; cancelAnimationFrame(raf); $("play").textContent = "Play"; }
  function reset() { pause(); S = gen(); clock = 7 * 60; fed = {}; tourShown = {}; $("feed").innerHTML = ""; $("cap").hidden = !tourOn; $("cap").innerHTML = "Press <b>Play</b> to follow one day in the core, then the whole month."; $("capnext").hidden = true; draw(); }
  function skip() { tourOn = false; clock = DAYS * DAY; draw(); pause(); endCap(); $("play").textContent = "Replay month"; }
  function endCap() { var T = totals(clock); $("cap").hidden = false; $("capnext").hidden = true; $("cap").innerHTML = "<b>One month, one core.</b> " + money(T.unUsd) + " of instrument use was never billed, logins overcharged labs " + money(T.xfer) + " for data transfer, and the manager would spend " + hrs(T.handMin) + " checking it by hand. LaBro: " + hrs(T.lmMin) + "."; }

  // ---------- first-principles calculator ----------
  var simLeak = null;
  function calcFromSim(T) {
    if (clock < DAYS * DAY || simLeak !== null) return;
    simLeak = T.bookedMin > 0 ? T.unMin / T.bookedMin * 100 : 0;
    $("c-sim").textContent = "This simulated month: " + simLeak.toFixed(1) + "% of instrument time ran outside any booking (before penalties). Real cores will differ; the calculator below uses a conservative 8%.";
  }
  function calc() {
    var v = function (id) { return parseFloat($(id).value) || 0; };
    var n = v("c-n"), rate = v("c-rate"), h = v("c-h"), leak = v("c-leak") / 100, adm = v("c-adm"), wage = v("c-wage");
    var billed = n * rate * h, lost = billed * leak, admin = adm * 12 * wage * .8, cost = (250 + 40 * n) * 12;
    $("c-out").innerHTML =
      "<div><span>Billed per year</span><b>" + money(billed) + "</b><small>" + n + " instruments × $" + rate + "/h × " + h.toLocaleString() + " h</small></div>" +
      "<div><span>Billed wrong per year</span><b>" + money(lost) + "</b><small>" + (leak * 100).toFixed(0) + "% of billed time, over or under</small></div>" +
      "<div><span>Manager time back</span><b>" + money(admin) + "</b><small>" + Math.round(adm * 12 * .8) + " h/yr at $" + wage + "/h (80% of " + adm + " h/mo)</small></div>" +
      "<div><span>LaBro costs</span><b>" + money(cost) + "</b><small>$250/mo + $40 per instrument/mo</small></div>" +
      '<div class="roi"><span>Return</span><b>' + (cost ? ((lost + admin) / cost).toFixed(1) : "0") + "×</b><small>" + money(lost + admin - cost) + " a year net</small></div>";
  }

  // ---------- wire up ----------
  function init() {
    S = gen(); reset();
    $("play").onclick = function () { playing ? pause() : play(); };
    $("reset").onclick = function () { tourOn = true; simLeak = null; reset(); };
    $("skip").onclick = skip;
    $("capnext").onclick = play;
    $("speed").oninput = function () { P.speed = +this.value; };
    ["overrun", "walkup", "transfer", "grace"].forEach(function (k) {
      var el = $("p-" + k); el.value = P[k]; $("v-" + k).textContent = P[k] + (k === "grace" ? " min" : "%");
      el.oninput = function () { P[k] = +el.value; $("v-" + k).textContent = P[k] + (k === "grace" ? " min" : "%"); };
      el.onchange = function () { var c = clock; simLeak = null; S = gen(); fed = {}; $("feed").innerHTML = ""; clock = c; draw(); };
    });
    ["c-n", "c-rate", "c-h", "c-leak", "c-adm", "c-wage"].forEach(function (id) { $(id).oninput = calc; });
    calc();
    if (/[?&]end\b/.test(location.search)) skip();
    document.addEventListener("keydown", function (e) { if (e.code === "Space" && e.target === document.body) { e.preventDefault(); playing ? pause() : play(); } });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
