"use strict";
/* LabMeter 3D facility scene. Needs window.THREE (three.js r128). Exposes window.LabScene.create(host, model, cb).
   model: { vb:[w,h], rooms:[{id,name,x,y,w,h,kind}], pins:{id:{room,x,y}}, instruments:[{id,name}],
            assets:[{id,name,history:[{t,room}]}], stateAt(id,t)->run|idle|off|gap, stateText(s),
            assetNote(asset, ev, t)->string }
   cb: { onPick(kind,id) } */
(function () {
  var S = 50; // viewBox units per world unit
  var KIND = { lab: 0x6f7dff, dark: 0xa86bff, hall: 0x3fa8dc, office: 0x6078a8 };
  var C_RUN = 0x4df2c8, C_IDLE = 0xe8b04a, C_OFF = 0x62708a, C_GAP = 0xa9b6e8, C_ASSET = 0xff6f9c;

  function tex(draw) {
    var c = document.createElement("canvas"); c.width = c.height = 64;
    var g = c.getContext("2d"); draw(g);
    var t = new THREE.CanvasTexture(c); return t;
  }
  function glowTex() { return tex(function (g) { var r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.25, "rgba(255,255,255,.45)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }); }
  function dotTex() { return tex(function (g) { var r = g.createRadialGradient(32, 32, 0, 32, 32, 30); r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.55, "rgba(255,255,255,.95)"); r.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }); }
  function ringTex() { return tex(function (g) { g.strokeStyle = "#fff"; g.lineWidth = 6; g.setLineDash([9, 7]); g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.stroke(); }); }

  var BUBBLE_VS = "varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }";
  var BUBBLE_FS = "uniform vec3 uColor; uniform float uBoost; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); float a = 0.05 + f * (0.85 + uBoost); gl_FragColor = vec4(uColor * (0.55 + f * 1.1 + uBoost * 0.6), a); }";

  function create(host, model, cb) {
    var reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduced = false; }
    var renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    if (!renderer.getContext()) throw new Error("WebGL unavailable");
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x060912, 1);
    var canvas = renderer.domElement; canvas.className = "scene-canvas"; canvas.setAttribute("aria-hidden", "true");
    host.appendChild(canvas);
    var labels = document.createElement("div"); labels.className = "labels"; host.appendChild(labels);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    var target = new THREE.Vector3(0, 1.1, 0.2);
    var cam = { th: 0.55, ph: 1.0, r: 18 }, goal = { th: 0.55, ph: 1.0, r: 18 };
    var auto = !reduced, dirty = true, W = 1, H = 1;

    var tGlow = glowTex(), tDot = dotTex(), tRing = ringTex();

    // ---- floor: dotted grid
    var gp = [], gx, gz;
    for (gx = -9; gx <= 9; gx += 0.6) for (gz = -7; gz <= 7; gz += 0.6) gp.push(gx, 0, gz);
    var gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.Float32BufferAttribute(gp, 3));
    scene.add(new THREE.Points(gg, new THREE.PointsMaterial({ size: 0.07, map: tDot, color: 0x5468b8, transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending })));

    // ---- rooms
    var rooms = {}, roomList = [];
    model.rooms.forEach(function (r) {
      var cx = (r.x + r.w / 2 - model.vb[0] / 2) / S, cz = (r.y + r.h / 2 - model.vb[1] / 2) / S;
      var sx = r.w / 100 * 0.78, sz = Math.max(0.75, r.h / 100 * 0.78), sy = Math.max(0.75, Math.min(sx, sz, 1.7));
      var cy = sy + 0.4, col = new THREE.Color(KIND[r.kind] || KIND.lab);
      var mat = new THREE.ShaderMaterial({ uniforms: { uColor: { value: col }, uBoost: { value: 0 } }, vertexShader: BUBBLE_VS, fragmentShader: BUBBLE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      var m = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), mat);
      m.scale.set(sx, sy, sz); m.position.set(cx, cy, cz); scene.add(m);
      var rp = []; for (var k = 0; k < 56; k++) { var a = k / 56 * Math.PI * 2; rp.push(cx + Math.cos(a) * sx, 0.01, cz + Math.sin(a) * sz); }
      var rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.Float32BufferAttribute(rp, 3));
      scene.add(new THREE.Points(rg, new THREE.PointsMaterial({ size: 0.11, map: tDot, color: col, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })));
      var el = document.createElement("div"); el.className = "lbl lbl-room"; el.textContent = r.name; labels.appendChild(el);
      var o = { id: r.id, name: r.name, c: new THREE.Vector3(cx, cy, cz), s: new THREE.Vector3(sx, sy, sz), mat: mat, boost: 0, want: 0, label: el, anchor: new THREE.Vector3(cx, cy + sy + 0.1, cz), runs: 0 };
      rooms[r.id] = o; roomList.push(o);
    });

    // ---- sprites
    function sprite(map, color, op, add) {
      var s = new THREE.Sprite(new THREE.SpriteMaterial({ map: map, color: color, transparent: true, opacity: op, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending }));
      scene.add(s); return s;
    }
    function node(kind, id, name, color) {
      var n = { kind: kind, id: id, name: name, color: color, core: sprite(tDot, color, 1, true), halo: sprite(tGlow, color, 0.5, true), pos: new THREE.Vector3(), sel: false, state: "gap", ph: Math.random() * 6 };
      var b = document.createElement("button"); b.type = "button"; b.className = "lbl lbl-" + kind;
      b.innerHTML = '<span class="n"></span><span class="s"></span>'; b.firstChild.textContent = name;
      b.addEventListener("click", function (ev) { ev.stopPropagation(); cb.onPick(kind, id); });
      labels.appendChild(b); n.label = b; n.sub = b.lastChild; return n;
    }

    var inst = [];
    model.instruments.forEach(function (i) {
      var p = model.pins[i.id], rm = p && rooms[p.room]; if (!rm) return;
      var rr = model.rooms.filter(function (r) { return r.id === p.room; })[0];
      var n = node("inst", i.id, i.name, C_OFF);
      n.room = rm; n.base = new THREE.Vector3(rm.c.x + (p.x - 50) / 100 * rr.w / S * 0.6, rm.c.y - 0.15, rm.c.z + (p.y - 50) / 100 * rr.h / S * 0.6);
      n.pos.copy(n.base); inst.push(n);
    });

    // ---- assets and arcs
    var assets = [], arcs = {}, curveCache = {};
    function roomAnchor(id) { var r = rooms[id]; return r ? r.c : new THREE.Vector3(); }
    function curveFor(a, b) {
      var rev = a > b, k = rev ? b + "|" + a : a + "|" + b;
      if (!curveCache[k]) {
        var p0 = roomAnchor(rev ? b : a), p1 = roomAnchor(rev ? a : b), mid = p0.clone().add(p1).multiplyScalar(0.5);
        mid.y += 1.8 + p0.distanceTo(p1) * 0.22;
        curveCache[k] = new THREE.QuadraticBezierCurve3(p0.clone(), mid, p1.clone());
      }
      return { c: curveCache[k], rev: rev, key: k };
    }
    function arcFor(a, b) {
      var cf = curveFor(a, b);
      if (!arcs[cf.key]) {
        var pts = cf.c.getSpacedPoints(36), arr = [];
        pts.forEach(function (p) { arr.push(p.x, p.y, p.z); });
        var g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
        var dots = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.12, map: tDot, color: 0xff8fb3, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
        scene.add(dots);
        var fg = new THREE.BufferGeometry(), fp = new Float32Array(8 * 3); fg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
        var flow = new THREE.Points(fg, new THREE.PointsMaterial({ size: 0.3, map: tDot, color: 0xffd0e0, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
        flow.frustumCulled = false; flow.visible = false; scene.add(flow);
        arcs[cf.key] = { c: cf.c, dots: dots, flow: flow, fp: fp, moves: [], lvl: 0 };
      }
      return arcs[cf.key];
    }
    model.assets.forEach(function (a, idx) {
      var h = a.history.slice().sort(function (x, y) { return x.t - y.t; });
      var n = node("asset", a.id, a.name, C_ASSET);
      n.hist = h; n.idx = idx; n.roomId = null; n.tween = null; n.last = null;
      for (var k = 1; k < h.length; k++) if (rooms[h[k - 1].room] && rooms[h[k].room] && h[k - 1].room !== h[k].room) arcFor(h[k - 1].room, h[k].room).moves.push(h[k].t);
      assets.push(n);
    });
    function restPos(n, roomId, time, out) {
      var r = rooms[roomId]; if (!r) return out.set(0, 1, 0);
      var ang = n.idx * 1.9 + (reduced ? 0 : time * 0.35), rad = Math.min(r.s.x, r.s.z) * 0.62;
      return out.set(r.c.x + Math.cos(ang) * rad, r.c.y + r.s.y * 0.38 + (reduced ? 0 : Math.sin(time * 1.3 + n.idx) * 0.05), r.c.z + Math.sin(ang) * rad * 0.8);
    }

    // ---- state
    var T = null, sel = null, clock = 0, hoverId = null;
    function locAt(n, t) { var ev = n.hist[0]; for (var k = 0; k < n.hist.length; k++) if (n.hist[k].t <= t) ev = n.hist[k]; return ev; }

    function setTime(t) {
      var first = T == null; T = t;
      roomList.forEach(function (r) { r.runs = 0; });
      inst.forEach(function (n) {
        n.state = model.stateAt(n.id, t); if (n.state === "run") n.room.runs++;
        n.label.setAttribute("data-s", n.state); n.sub.textContent = model.stateText(n.state);
        n.label.setAttribute("aria-label", n.name + ", " + model.stateText(n.state));
        var c = n.state === "run" ? C_RUN : n.state === "idle" ? C_IDLE : n.state === "off" ? C_OFF : C_GAP;
        n.core.material.map = n.state === "gap" ? tRing : tDot; n.core.material.color.setHex(c); n.halo.material.color.setHex(c); n.core.material.needsUpdate = true;
        n.core.material.opacity = n.state === "off" ? 0.7 : 1;
      });
      assets.forEach(function (n) {
        var ev = locAt(n, t); n.last = ev;
        n.sub.textContent = model.assetNote(n, ev, t);
        n.label.setAttribute("aria-label", n.name + ". " + model.assetNote(n, ev, t));
        if (n.roomId == null) { n.roomId = ev.room; restPos(n, ev.room, clock, n.pos); }
        else if (ev.room !== n.roomId && rooms[ev.room]) {
          if (reduced || first) { n.roomId = ev.room; n.tween = null; restPos(n, ev.room, clock, n.pos); }
          else { var cf = curveFor(n.roomId, ev.room); n.tween = { cf: cf, t0: clock, dur: 1.7, to: ev.room }; n.roomId = ev.room;}
        }
      });
      Object.keys(arcs).forEach(function (k) {
        var a = arcs[k], past = -Infinity, fut = false;
        a.moves.forEach(function (m) { if (m <= t) { if (m > past) past = m; } else fut = true; });
        a.lvl = past === -Infinity ? 0.1 : (t - past < 8 * 3600 ? 2 : 1);
        a.dots.material.opacity = a.lvl === 2 ? 0.95 : a.lvl === 1 ? 0.4 : 0.14;
      });
      dirty = true;
    }

    function select(kind, id) {
      sel = id ? kind + ":" + id : null;
      inst.concat(assets).forEach(function (n) { n.sel = sel === n.kind + ":" + n.id; n.label.classList.toggle("sel", n.sel); });
      roomList.forEach(function (r) { r.want = 0; });
      inst.forEach(function (n) { if (n.sel) n.room.want = 0.5; });
      assets.forEach(function (n) { if (n.sel && rooms[n.roomId]) rooms[n.roomId].want = 0.5; });
      dirty = true;
    }

    // ---- camera + input
    function placeCamera() {
      var sp = Math.sin(cam.ph), v = camera.position;
      v.set(target.x + cam.r * sp * Math.sin(cam.th), target.y + cam.r * Math.cos(cam.ph), target.z + cam.r * sp * Math.cos(cam.th));
      camera.lookAt(target);
    }
    function fit() {
      var asp = W / Math.max(1, H), r = Math.max(13, Math.min(40, 21 / Math.max(0.35, Math.min(asp, 1.8)) * 0.95));
      goal.r = cam.r = r;
    }
    function clampG() { goal.ph = Math.max(0.35, Math.min(1.45, goal.ph)); goal.r = Math.max(7, Math.min(42, goal.r)); }
    var ptrs = {}, down = null, pinch = 0;
    function stopAuto() { auto = false; }
    function onDown(e) {
      host.setPointerCapture && host.setPointerCapture(e.pointerId);
      ptrs[e.pointerId] = { x: e.clientX, y: e.clientY }; down = { x: e.clientX, y: e.clientY, moved: 0 };
      var ids = Object.keys(ptrs); if (ids.length === 2) pinch = dist2();
    }
    function dist2() { var k = Object.keys(ptrs), a = ptrs[k[0]], b = ptrs[k[1]]; return Math.hypot(a.x - b.x, a.y - b.y); }
    function onMove(e) {
      var p = ptrs[e.pointerId];
      if (!p) { var h = nearest(e.clientX, e.clientY, 20); canvas.style.cursor = h ? "pointer" : "grab"; return; }
      var dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      var ids = Object.keys(ptrs);
      if (ids.length >= 2) { var d = dist2(); if (pinch > 0 && d > 0) { goal.r *= pinch / d; clampG(); } pinch = d; stopAuto(); dirty = true; if (down) down.moved = 99; return; }
      if (down) down.moved += Math.abs(dx) + Math.abs(dy);
      if (down && down.moved > 5) { stopAuto(); goal.th -= dx * 0.006; goal.ph -= dy * 0.005; clampG(); dirty = true; canvas.style.cursor = "grabbing"; }
    }
    function onUp(e) {
      var wasTap = down && down.moved <= 5 && Object.keys(ptrs).length === 1;
      delete ptrs[e.pointerId]; pinch = 0;
      if (wasTap) { var r = canvas.getBoundingClientRect(), n = nearest(e.clientX, e.clientY, 30); if (n) cb.onPick(n.kind, n.id); else cb.onPick(null, null); }
      if (!Object.keys(ptrs).length) down = null; canvas.style.cursor = "grab";
    }
    function onWheel(e) { e.preventDefault(); stopAuto(); goal.r *= Math.exp(e.deltaY * 0.0012); clampG(); dirty = true; }
    function onKey(e) {
      var k = e.key, used = true;
      if (k === "ArrowLeft") goal.th -= 0.12; else if (k === "ArrowRight") goal.th += 0.12; else if (k === "ArrowUp") goal.ph -= 0.08; else if (k === "ArrowDown") goal.ph += 0.08;
      else if (k === "+" || k === "=") goal.r *= 0.9; else if (k === "-") goal.r *= 1.1; else used = false;
      if (used) { e.preventDefault(); stopAuto(); clampG(); dirty = true; }
    }
    host.addEventListener("pointerdown", onDown); host.addEventListener("pointermove", onMove);
    host.addEventListener("pointerup", onUp); host.addEventListener("pointercancel", onUp);
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
      if (firstSize) fit(); dirty = true;
    }
    var ro = null;
    if (window.ResizeObserver) { ro = new ResizeObserver(resize); ro.observe(host); } else window.addEventListener("resize", resize);
    resize(); placeCamera();

    // ---- frame loop
    var raf = 0, last = 0, alive = true;
    function ease(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(0.1, (now - last) / 1000); last = now; if (!reduced) clock += dt;
      var moving = Math.abs(goal.th - cam.th) + Math.abs(goal.ph - cam.ph) + Math.abs(goal.r - cam.r) > 0.0008;
      if (auto && !reduced) { goal.th += dt * 0.07; cam.th = goal.th; dirty = true; }
      if (moving) { cam.th += (goal.th - cam.th) * 0.16; cam.ph += (goal.ph - cam.ph) * 0.16; cam.r += (goal.r - cam.r) * 0.16; dirty = true; }
      if (reduced && !dirty) return;
      placeCamera();
      var k;
      for (k = 0; k < roomList.length; k++) {
        var r = roomList[k], tgt = r.want + Math.min(0.45, r.runs * 0.18); r.boost += (tgt - r.boost) * 0.1; r.mat.uniforms.uBoost.value = r.boost;
      }
      inst.forEach(function (n) {
        n.pos.copy(n.base); if (!reduced) n.pos.y += Math.sin(clock * 1.1 + n.ph) * 0.05;
        n.core.position.copy(n.pos); n.halo.position.copy(n.pos);
        var run = n.state === "run", pulse = run && !reduced ? Math.sin(clock * 3.2 + n.ph) : 0;
        var cs = n.state === "gap" ? 0.34 : n.state === "run" ? 0.3 : 0.24; if (n.sel) cs *= 1.35;
        n.core.scale.set(cs, cs, 1);
        var hs = run ? 1.25 + pulse * 0.25 : n.state === "idle" ? 0.7 : 0.01; if (n.sel) hs += 0.5; n.halo.scale.set(hs, hs, 1);
        n.halo.material.opacity = run ? 0.75 + pulse * 0.2 : n.state === "idle" ? 0.28 : n.sel ? 0.4 : 0;
      });
      Object.keys(arcs).forEach(function (key) { arcs[key].flow.visible = false; });
      assets.forEach(function (n) {
        var tw = n.tween, moving2 = false;
        if (tw) {
          var p = (clock - tw.t0) / tw.dur;
          if (p >= 1) { n.tween = null; tw = null; }
          else { var u = ease(Math.max(0, p)); n.pos.copy(tw.cf.c.getPoint(tw.cf.rev ? 1 - u : u)); moving2 = true; }
        }
        if (!tw) restPos(n, n.roomId, clock, n.pos);
        n.core.position.copy(n.pos); n.halo.position.copy(n.pos);
        var cs = (moving2 ? 0.3 : 0.22) * (n.sel ? 1.4 : 1); n.core.scale.set(cs, cs, 1);
        var hs = moving2 ? 1.5 : n.sel ? 1.1 : 0.62; n.halo.scale.set(hs, hs, 1); n.halo.material.opacity = moving2 ? 0.95 : 0.5;
      });
      if (!reduced) Object.keys(arcs).forEach(function (key) {
        var a = arcs[key]; if (a.lvl < 2) return;
        a.flow.visible = true;
        for (var q = 0; q < 8; q++) { var u2 = (clock * 0.16 + q / 8) % 1, pt = a.c.getPoint(u2); a.fp[q * 3] = pt.x; a.fp[q * 3 + 1] = pt.y; a.fp[q * 3 + 2] = pt.z; }
        a.flow.geometry.attributes.position.needsUpdate = true;
      });
      renderer.render(scene, camera);
      project();
      dirty = reduced ? moving : false;
    }
    function put(el, x, y, vis) {
      if (!vis) { el.style.visibility = "hidden"; return; }
      el.style.visibility = ""; el.style.transform = "translate(" + x.toFixed(1) + "px," + y.toFixed(1) + "px)";
    }
    function project() {
      roomList.forEach(function (r) { tmp.copy(r.anchor).project(camera); put(r.label, (tmp.x * 0.5 + 0.5) * W, (-tmp.y * 0.5 + 0.5) * H, tmp.z < 1); });
      inst.concat(assets).forEach(function (n) { var s = screen(n); put(n.label, s.x, s.y, s.z < 1); });
    }
    function start() { if (!raf && alive) { last = performance.now(); dirty = true; raf = requestAnimationFrame(frame); } }
    function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
    function vis() { if (document.hidden) stop(); else start(); }
    document.addEventListener("visibilitychange", vis);
    start();

    return {
      setTime: setTime, select: select,
      destroy: function () {
        alive = false; stop(); document.removeEventListener("visibilitychange", vis);
        if (ro) ro.disconnect(); else window.removeEventListener("resize", resize);
        host.removeEventListener("pointerdown", onDown); host.removeEventListener("pointermove", onMove);
        host.removeEventListener("pointerup", onUp); host.removeEventListener("pointercancel", onUp);
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
