"use strict";
/* LabMeter 3D facility scene (quiet version). Needs window.THREE (three.js r128).
   Exposes window.LabScene.create(host, model, cb) -> { setTime, select, destroy }.
   model: { vb:[w,h], rooms:[{id,name,x,y,w,h,kind}], pins:{id:{room,x,y}}, instruments:[{id,name}],
            assets:[{id,name,history:[{t,room}]}], stateAt(id,t)->run|idle|off|gap, stateText(s),
            assetNote(asset, ev, t)->string, assetStatus(id,t)->''|miss|overdue|out, flagText, fmtShort }
   cb: { onPick(kind,id) }
   Visual rules: one accent (running), neutral for idle/off/gear, one warning (overdue), one danger (missing).
   Only room labels are always visible; item labels show on hover or selection. A short dotted arc is drawn
   only while an item moves (it fades afterwards) and for the selected item's recent path. */
(function () {
  var S = 50; // viewBox units per world unit
  var COL = { run: 0x2dd4bf, idle: 0x9aa7bd, off: 0x4b586e, gap: 0x66738a, asset: 0xd5dbe6, warn: 0xf5b94a, danger: 0xf87171, room: 0x8b9bb8, arc: 0xe6ebf5 };

  function tex(draw) {
    var c = document.createElement("canvas"); c.width = c.height = 64;
    var g = c.getContext("2d"); draw(g);
    return new THREE.CanvasTexture(c);
  }
  function dotTex() { return tex(function (g) { var r = g.createRadialGradient(32, 32, 0, 32, 32, 30); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.6, "rgba(255,255,255,.95)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }); }
  function glowTex() { return tex(function (g) { var r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,.55)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }); }
  function ringTex() { return tex(function (g) { g.strokeStyle = "#fff"; g.lineWidth = 7; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke(); }); }

  var ROOM_VS = "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }";
  var ROOM_FS = "uniform vec3 uColor; uniform vec3 uAcc; uniform float uMix; uniform float uSel; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2); vec3 c = mix(uColor, uAcc, uMix); gl_FragColor = vec4(c, 0.025 + f * (0.2 + uMix * 0.22 + uSel * 0.25)); }";

  function create(host, model, cb) {
    var reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduced = false; }
    var renderer = new THREE.WebGLRenderer({ antialias: true });
    if (!renderer.getContext()) throw new Error("WebGL unavailable");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x0b0f17, 1);
    var canvas = renderer.domElement; canvas.className = "scene-canvas"; canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    var labels = document.createElement("div"); labels.className = "labels"; labels.setAttribute("role", "group"); labels.setAttribute("aria-label", "Instruments and portable items in the 3D view"); host.appendChild(labels);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    var target = new THREE.Vector3(0, 0.7, 0.1);
    var TH0 = 0.3;
    var cam = { th: TH0, ph: 1.02, r: 18 }, goal = { th: TH0, ph: 1.02, r: 18 };
    var tgtGoal = target.clone(), tgtHome = target.clone(), fitR = 18, selNode = null, focusRoom = null;
    var auto = !reduced, W = 1, H = 1, autoT = 0;

    var tDot = dotTex(), tGlow = glowTex(), tRing = ringTex();

    // ---- floor: low-opacity line grid
    var gl = [], i;
    for (i = -9; i <= 9; i++) { gl.push(i, 0, -7, i, 0, 7); }
    for (i = -7; i <= 7; i++) { gl.push(-9, 0, i, 9, 0, i); }
    var gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(gl, 3));
    scene.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x2a3548, transparent: true, opacity: 0.35, depthWrite: false })));

    // ---- rooms: equal-size bubbles, a flat strip for the hallway
    var rooms = {}, roomList = [], R = 1.35;
    model.rooms.forEach(function (r) {
      var cx = (r.x + r.w / 2 - model.vb[0] / 2) / S, cz = (r.y + r.h / 2 - model.vb[1] / 2) / S;
      var hall = r.kind === "hall";
      var sx = hall ? 3.4 : R, sz = hall ? 0.42 : R, sy = hall ? 0.4 : R * 0.8, cy = sy + 0.05;
      var mat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(COL.room) }, uAcc: { value: new THREE.Color(COL.run) }, uMix: { value: 0 }, uSel: { value: 0 } }, vertexShader: ROOM_VS, fragmentShader: ROOM_FS, transparent: true, depthWrite: false });
      var m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 24), mat);
      m.scale.set(sx, sy, sz); m.position.set(cx, cy, cz); scene.add(m);
      var rp = []; for (var k = 0; k < 72; k++) { var a = k / 72 * Math.PI * 2; rp.push(cx + Math.cos(a) * sx, 0.01, cz + Math.sin(a) * sz); }
      var rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
      scene.add(new THREE.LineLoop(rg, new THREE.LineBasicMaterial({ color: COL.room, transparent: true, opacity: 0.35, depthWrite: false })));
      var el = document.createElement("div"); el.className = "lbl lbl-room"; el.textContent = r.name.replace(/ \(dark\)$/, ""); labels.appendChild(el);
      var o = { id: r.id, name: r.name, hall: hall, c: new THREE.Vector3(cx, cy, cz), s: new THREE.Vector3(sx, sy, sz), mat: mat, mix: 0, sel: 0, wantSel: 0, label: el, anchor: new THREE.Vector3(cx, cy + sy + 0.05, cz), runs: 0, pri: 1 };
      rooms[r.id] = o; roomList.push(o);
    });

    // ---- nodes (sprites + a label that only shows on hover or selection)
    function sprite(map, color, op) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: map, color: color, transparent: true, opacity: op, depthWrite: false }));
      scene.add(s); return s;
    }
    function node(kind, id, name, color) {
      var n = { kind: kind, id: id, name: name, core: sprite(tDot, color, 1), halo: sprite(tGlow, color, 0), pos: new THREE.Vector3(), sel: false, hover: false, state: "gap" };
      var b = document.createElement("button"); b.type = "button"; b.className = "lbl lbl-node lbl-" + kind;
      b.innerHTML = '<span class="n"></span><span class="s"></span>'; b.firstChild.textContent = name;
      b.addEventListener("click", function (ev) { ev.stopPropagation(); cb.onPick(kind, id); });
      labels.appendChild(b); n.label = b; n.sub = b.lastChild; n.pri = 0; n.w = 0;
      return n;
    }
    var inst = [];
    model.instruments.forEach(function (it) {
      var p = model.pins[it.id], rm = p && rooms[p.room]; if (!rm) return;
      var rr = model.rooms.filter(function (r) { return r.id === p.room; })[0];
      var n = node("inst", it.id, it.name, COL.off);
      n.room = rm; n.base = new THREE.Vector3(rm.c.x + (p.x - 50) / 100 * rr.w / S * 0.55, rm.c.y - rm.s.y * 0.3, rm.c.z + (p.y - 50) / 100 * rr.h / S * 0.55);
      n.pos.copy(n.base); inst.push(n);
    });

    // ---- portable gear and move arcs
    var assets = [], flashes = [], curveCache = {};
    function roomAnchor(id) { var r = rooms[id]; return r ? r.c : new THREE.Vector3(); }
    function curveFor(a, b) {
      var rev = a > b, k = rev ? b + "|" + a : a + "|" + b;
      if (!curveCache[k]) {
        var p0 = roomAnchor(rev ? b : a), p1 = roomAnchor(rev ? a : b), mid = p0.clone().add(p1).multiplyScalar(0.5);
        mid.y += 1.0 + p0.distanceTo(p1) * 0.16;
        curveCache[k] = new THREE.QuadraticBezierCurve3(p0.clone(), mid, p1.clone());
      }
      return { c: curveCache[k], rev: rev };
    }
    model.assets.forEach(function (a, idx) {
      var h = a.history.slice().sort(function (x, y) { return x.t - y.t; });
      var n = node("asset", a.id, a.name, COL.asset);
      n.hist = h; n.idx = idx; n.roomId = null; n.tween = null; n.st = "";
      assets.push(n);
    });
    function restPos(n, roomId, out) {
      var r = rooms[roomId]; if (!r) return out.set(0, 0.3, 0);
      var u = ((n.idx * 37) % 10) / 10;
      if (r.hall) return out.set(r.c.x + (u - 0.5) * r.s.x * 1.5, 0.22, r.c.z + (((n.idx * 7) % 3) - 1) * 0.12);
      var ang = n.idx * 2.4, rad = Math.min(r.s.x, r.s.z) * (0.3 + 0.4 * u);
      return out.set(r.c.x + Math.cos(ang) * rad, 0.22, r.c.z + Math.sin(ang) * rad * 0.85);
    }
    function startFlash(n, cf) {
      var pts = cf.c.getSpacedPoints(30); if (cf.rev) pts.reverse();
      var arr = []; pts.forEach(function (p) { arr.push(p.x, p.y, p.z); });
      var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      var p = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, map: tDot, color: COL.arc, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
      p.frustumCulled = false; scene.add(p);
      flashes.push({ obj: p, n: n, end: null });
    }

    // ---- state
    var T = null, clock = 0;
    function locAt(n, t) { var ev = n.hist[0]; for (var k = 0; k < n.hist.length; k++) if (n.hist[k].t <= t) ev = n.hist[k]; return ev; }
    function setText(n, txt) { if (n.sub.textContent !== txt) { n.sub.textContent = txt; n.w = 0; } }

    function setTime(t) {
      var first = T == null; T = t;
      roomList.forEach(function (r) { r.runs = 0; });
      inst.forEach(function (n) {
        n.state = model.stateAt(n.id, t); if (n.state === "run") n.room.runs++;
        n.label.setAttribute("data-s", n.state); setText(n, model.stateText(n.state));
        n.label.setAttribute("aria-label", n.name + ", " + model.stateText(n.state));
        var c = n.state === "run" ? COL.run : n.state === "idle" ? COL.idle : n.state === "off" ? COL.off : COL.gap;
        n.core.material.map = n.state === "gap" ? tRing : tDot; n.core.material.color.setHex(c); n.halo.material.color.setHex(c); n.core.material.needsUpdate = true;
      });
      assets.forEach(function (n) {
        var ev = locAt(n, t);
        var stt = model.assetStatus ? model.assetStatus(n.id, t) : "";
        n.st = stt; n.label.setAttribute("data-st", stt);
        var note = model.assetNote(n, ev, t); setText(n, note);
        n.label.setAttribute("aria-label", n.name + ". " + note);
        var ac = stt === "miss" ? COL.danger : stt === "overdue" ? COL.warn : COL.asset;
        n.core.material.map = stt === "out" ? tRing : tDot; n.core.material.needsUpdate = true;
        n.core.material.color.setHex(ac); n.halo.material.color.setHex(ac);
        if (n.roomId == null) { n.roomId = ev.room; restPos(n, ev.room, n.pos); }
        else if (ev.room !== n.roomId && rooms[ev.room]) {
          if (reduced || first || Math.abs(t - (n.lastT || t)) > 4 * 3600) { n.roomId = ev.room; n.tween = null; restPos(n, ev.room, n.pos); }
          else { var cf = curveFor(n.roomId, ev.room); n.tween = { cf: cf, t0: clock, dur: 1.6 }; n.roomId = ev.room; startFlash(n, cf); }
        }
        n.lastT = t;
      });
      if (selNode) { buildTrail(); if (selNode.kind === "asset" && selNode.roomId !== focusRoom) focusSel(); }
    }

    // ---- selection: focus, room outline, recent path and a 'last seen here' marker
    var trail = { pts: null, wps: null, pulse: null, flag: null };
    function clearTrail() {
      [trail.pts, trail.wps, trail.pulse].forEach(function (o) { if (o) { scene.remove(o); if (o.geometry) o.geometry.dispose(); o.material.dispose(); } });
      trail.pts = trail.wps = trail.pulse = null;
    }
    function buildTrail() {
      clearTrail();
      var n = selNode; if (!n || n.kind !== "asset") return;
      var wp = [];
      n.hist.forEach(function (e) {
        if (e.t > T || !rooms[e.room]) return;
        var l = wp[wp.length - 1];
        if (!l || l.room !== e.room) wp.push({ room: e.room, t: e.t });
      });
      wp = wp.slice(-5);
      var arr = [], k;
      for (k = 1; k < wp.length; k++) {
        var cf = curveFor(wp[k - 1].room, wp[k].room), pts = cf.c.getSpacedPoints(22);
        if (cf.rev) pts.reverse();
        pts.forEach(function (p) { arr.push(p.x, p.y, p.z); });
      }
      var col = n.st === "miss" ? COL.danger : n.st === "overdue" ? COL.warn : COL.arc;
      if (arr.length) {
        var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
        trail.pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.075, map: tDot, color: COL.arc, transparent: true, opacity: 0.6, depthWrite: false }));
        trail.pts.frustumCulled = false; scene.add(trail.pts);
      }
      var wa = []; wp.forEach(function (w) { var rc = rooms[w.room].c; wa.push(rc.x, 0.2, rc.z); });
      if (wa.length) {
        var g2 = new THREE.BufferGeometry(); g2.setAttribute("position", new THREE.Float32BufferAttribute(wa, 3));
        trail.wps = new THREE.Points(g2, new THREE.PointsMaterial({ size: 0.2, map: tDot, color: COL.arc, transparent: true, opacity: 0.7, depthWrite: false }));
        trail.wps.frustumCulled = false; scene.add(trail.wps);
      }
      trail.pulse = new THREE.Sprite(new THREE.SpriteMaterial({ map: tRing, color: col, transparent: true, opacity: 0.8, depthWrite: false }));
      trail.pulse.scale.set(0.5, 0.5, 1); scene.add(trail.pulse);
    }
    function focusSel() {
      if (!selNode) { tgtGoal.copy(tgtHome); goal.r = fitR; focusRoom = null; return; }
      var rm = selNode.kind === "inst" ? selNode.room : rooms[selNode.roomId]; if (!rm) return;
      focusRoom = selNode.kind === "asset" ? selNode.roomId : null;
      tgtGoal.set(rm.c.x, rm.c.y * 0.6, rm.c.z); goal.r = Math.max(9, Math.min(fitR, 7 + Math.max(rm.s.x, rm.s.z) * 1.6)); goal.ph = Math.min(goal.ph, 1.2);
      stopAuto();
    }
    function select(kind, id) {
      var s = id ? kind + ":" + id : null;
      inst.concat(assets).forEach(function (n) { n.sel = s === n.kind + ":" + n.id; n.label.classList.toggle("sel", n.sel); n.label.setAttribute("aria-pressed", n.sel ? "true" : "false"); });
      roomList.forEach(function (r) { r.wantSel = 0; });
      selNode = null; inst.concat(assets).forEach(function (n) { if (n.sel) selNode = n; });
      if (selNode) { var rr = selNode.kind === "inst" ? selNode.room : rooms[selNode.roomId]; if (rr) rr.wantSel = 1; }
      buildTrail(); focusSel();
    }

    // ---- camera + input
    function placeCamera() {
      var sp = Math.sin(cam.ph), v = camera.position;
      v.set(target.x + cam.r * sp * Math.sin(cam.th), target.y + cam.r * Math.cos(cam.ph), target.z + cam.r * sp * Math.cos(cam.th));
      camera.lookAt(target);
    }
    function fit() {
      var asp = W / Math.max(1, H), r = Math.max(13, Math.min(64, 24 / Math.max(0.3, Math.min(asp, 1.8))));
      goal.r = cam.r = fitR = r;
    }
    function clampG() { goal.ph = Math.max(0.35, Math.min(1.45, goal.ph)); goal.r = Math.max(7, Math.min(70, goal.r)); }
    var ptrs = {}, down = null, pinch = 0, hoverNode = null;
    function stopAuto() { auto = false; }
    function onDown(e) {
      if (host.setPointerCapture) { try { host.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } }
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; down = { x: e.clientX, y: e.clientY, moved: 0 };
      if (Object.keys(ptrs).length === 2) pinch = dist2();
    }
    function dist2() { var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y); }
    function setHover(n) { if (hoverNode === n) return; if (hoverNode) hoverNode.hover = false; hoverNode = n; if (n) n.hover = true; }
    function onMove(e) {
      var p = ptrs[e.pointerId];
      if (!p) { var h = nearest(e.clientX, e.clientY, 20); setHover(h); canvas.style.cursor = h ? "pointer" : "grab"; return; }
      var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (Object.keys(ptrs).length >= 2) { var d = dist2(); if (pinch > 0 && d > 0) { goal.r *= pinch / d; clampG(); } pinch = d; stopAuto(); if (down) down.moved = 99; return; }
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (down && down.moved > 5) { stopAuto(); goal.th -= dx * 0.006; goal.ph -= dy * 0.005; clampG(); canvas.style.cursor = "grabbing"; }
    }
    function onUp(e) {
      var wasTap = down && down.moved <= 5 && Object.keys(ptrs).length === 1;
      delete ptrs[e.pointerId]; pinch = 0;
      if (wasTap) { var n = nearest(e.clientX, e.clientY, 28); if (n) cb.onPick(n.kind, n.id); else cb.onPick(null, null); }
      if (!Object.keys(ptrs).length) down = null; canvas.style.cursor = "grab";
    }
    function onLeave() { setHover(null); }
    function onWheel(e) { e.preventDefault(); stopAuto(); goal.r *= Math.exp(e.deltaY * 0.0012); clampG(); }
    function onKey(e) {
      var k = e.key, used = true;
      if (k === "ArrowLeft") goal.th -= 0.12; else if (k === "ArrowRight") goal.th += 0.12; else if (k === "ArrowUp") goal.ph -= 0.08; else if (k === "ArrowDown") goal.ph += 0.08;
      else if (k === "+" || k === "=") goal.r *= 0.9; else if (k === "-") goal.r *= 1.1; else used = false;
      if (used) { e.preventDefault(); stopAuto(); clampG(); }
    }
    host.addEventListener("pointerdown", onDown); host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp); host.addEventListener("pointercancel", onUp); host.addEventListener("pointerleave", onLeave);
    host.addEventListener("wheel", onWheel, { passive: false }); host.addEventListener("keydown", onKey);

    var tmp = new THREE.Vector3();
    function screen(n) { tmp.copy(n.pos).project(camera); return { x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H, z: tmp.z }; }
    function nearest(cx, cy, maxd) {
      var rc = canvas.getBoundingClientRect(), x = cx - rc.left, y = cy - rc.top, best = null, bd = maxd;
      inst.concat(assets).forEach(function (n) { var s = screen(n); if (s.z > 1) return; var d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = n; } });
      return best;
    }

    function resize() {
      var w = host.clientWidth || 300, h = host.clientHeight || 300; if (w === W && h === H) return;
      var firstSize = W === 1; W = w; H = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
      if (firstSize) fit();
    }
    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); } else window.addEventListener("resize", resize);
    resize(); placeCamera();

    // ---- frame loop
    var raf = 0, last = 0, alive = true;
    function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
      if (auto && !reduced) { autoT += dt; goal.th = TH0 + Math.sin(autoT * 0.09) * 0.24; cam.th = goal.th; }
      cam.th += (goal.th - cam.th) * 0.16; cam.ph += (goal.ph - cam.ph) * 0.16; cam.r += (goal.r - cam.r) * 0.16; target.lerp(tgtGoal, 0.16);
      placeCamera();
      var k;
      for (k = 0; k < roomList.length; k++) {
        var r = roomList[k], wm = r.runs ? 1 : 0;
        r.mix += (wm - r.mix) * 0.08; r.sel += (r.wantSel - r.sel) * 0.12;
        r.mat.uniforms.uMix.value = r.mix * 0.8; r.mat.uniforms.uSel.value = r.sel;
      }
      inst.forEach(function (n) {
        n.core.position.copy(n.pos); n.halo.position.copy(n.pos);
        var run = n.state === "run";
        var cs = (n.state === "gap" ? 0.3 : 0.26) * (n.sel || n.hover ? 1.3 : 1); n.core.scale.set(cs, cs, 1);
        var hs = run ? 0.95 + (reduced ? 0 : Math.sin(clock * 1.6) * 0.06) : 0.01; n.halo.scale.set(hs, hs, 1);
        n.halo.material.opacity = run ? 0.4 : 0;
        n.core.material.opacity = n.state === "off" ? 0.75 : 1;
      });
      assets.forEach(function (n) {
        var tw = n.tween, moving = false;
        if (tw) {
          var p = (clock - tw.t0) / tw.dur;
          if (p >= 1) { n.tween = null; tw = null; }
          else { n.pos.copy(tw.cf.c.getPoint(tw.cf.rev ? 1 - ease(Math.max(0, p)) : ease(Math.max(0, p)))); moving = true; }
        }
        if (!tw) restPos(n, n.roomId, n.pos);
        n.core.position.copy(n.pos); n.halo.position.copy(n.pos);
        var cs = (moving ? 0.2 : 0.15) * (n.sel || n.hover ? 1.4 : 1); n.core.scale.set(cs, cs, 1);
        var hs = moving ? 0.7 : 0.01; n.halo.scale.set(hs, hs, 1); n.halo.material.opacity = moving ? 0.5 : 0;
        n.core.material.opacity = 0.95;
      });
      for (k = flashes.length - 1; k >= 0; k--) {
        var f = flashes[k], op;
        if (f.n.tween) op = 0.8; else { if (f.end == null) f.end = clock; op = 0.8 * (1 - (clock - f.end) / 2.2); }
        if (op <= 0.02) { scene.remove(f.obj); f.obj.geometry.dispose(); f.obj.material.dispose(); flashes.splice(k, 1); } else f.obj.material.opacity = op;
      }
      if (trail.pulse && selNode) {
        var pf = reduced ? 0.4 : (clock * 0.7) % 1;
        trail.pulse.position.copy(selNode.pos); trail.pulse.scale.setScalar(0.4 + pf * 0.9); trail.pulse.material.opacity = reduced ? 0.7 : 0.8 * (1 - pf);
      }
      renderer.render(scene, camera);
      project();
    }

    // ---- labels: rooms always; items on hover/selection; greedy collision avoidance
    function place(el, x, y, vis) {
      if (!vis) { el.style.visibility = "hidden"; return; }
      el.style.visibility = ""; el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
    }
    function overlaps(a, b) { return a.x0 < b.x1 + 4 && a.x1 > b.x0 - 4 && a.y0 < b.y1 + 4 && a.y1 > b.y0 - 4; }
    function project() {
      var cand = [], k;
      roomList.forEach(function (r) {
        tmp.copy(r.anchor).project(camera);
        if (tmp.z < 1) cand.push({ el: r.label, o: r, x: (tmp.x * 0.5 + 0.5) * W, y: (-tmp.y * 0.5 + 0.5) * H, pri: r.sel > 0.5 ? 2 : 1, up: true });
        else place(r.label, 0, 0, false);
      });
      inst.concat(assets).forEach(function (n) {
        var show = n.sel || n.hover;
        n.label.classList.toggle("show", !!show);
        if (!show) { place(n.label, 0, 0, false); return; }
        var s = screen(n); if (s.z < 1) cand.push({ el: n.label, o: n, x: s.x, y: s.y, pri: n.sel ? 4 : 3, up: false }); else place(n.label, 0, 0, false);
      });
      cand.sort(function (a, b) { return b.pri - a.pri; });
      var placed = [];
      cand.forEach(function (c) {
        if (!c.o.w) c.o.w = c.el.offsetWidth || 80;
        var h = c.o.h || (c.o.h = c.el.offsetHeight || 20), w = c.o.w;
        var oy = c.up ? -h - 2 : 14;
        var rect = { x0: c.x - w / 2, x1: c.x + w / 2, y0: c.y + oy, y1: c.y + oy + h };
        var hit = false;
        if (c.pri < 3) for (k = 0; k < placed.length; k++) if (overlaps(rect, placed[k])) { hit = true; break; }
        if (hit) place(c.el, 0, 0, false); else { placed.push(rect); place(c.el, c.x, c.y, true); }
      });
    }
    function start() { if (!raf && alive) { last = performance.now(); raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    function vis() { if (document.hidden) stop(); else start(); }
    document.addEventListener("visibilitychange", vis);
    start();

    return {
      setTime: setTime, select: select,
      destroy: function () {
        alive = false; stop(); clearTrail(); document.removeEventListener("visibilitychange", vis);
        if (ro) ro.disconnect(); else window.removeEventListener("resize", resize);
        host.removeEventListener("pointerdown", onDown); host.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerup", onUp); host.removeEventListener("pointercancel", onUp); host.removeEventListener("pointerleave", onLeave);
        host.removeEventListener("wheel", onWheel); host.removeEventListener("keydown", onKey);
        scene.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
        [tGlow, tDot, tRing].forEach(function (t) { t.dispose(); });
        renderer.dispose();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        if (labels.parentNode) labels.parentNode.removeChild(labels);
      }
    };
  }
  window.LabScene = { create: create };
})();
