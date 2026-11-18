
// ===== HYPE CUT (appended to film.js by build-hype.sh) =====
// 31 s at 120 BPM: cold open, the problem, logo drop, five agents, one click, every campus, end card.
window.DURATION = 23.5;
window.prepare = () => Promise.resolve();
const HY = {}; window.ready = Promise.all([window.ready, ...['parity-mark-yellow', 'parity-mark-ink'].map(n => new Promise(r => { const im = new Image(512, 512); im.onload = () => { HY[n] = im; r() }; im.onerror = r; im.src = './' + n + '.svg' }))]);
const INK = '#17191c', YEL = '#F4C430', PAP = '#F6F5F0', RED = '#d6453d';
const F = (w, s) => `${w} ${s}px RobotoMono, monospace`;
function fill(c) { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H) }
// Text that slams in: overshoot scale, quick fade.
function slam(text, x, y, size, color, t0, t, o = {}) {
  const a = clamp((t - t0) / .14); if (a <= 0) return;
  const k = ease(a), s = mix(o.from || 1.6, 1, k);
  ctx.save(); ctx.globalAlpha = (o.alpha ?? 1) * Math.min(1, a * 2); ctx.translate(x, y); ctx.rotate((o.rot || 0) * Math.PI / 180); ctx.scale(s, s);
  ctx.font = F(o.w || 700, size); ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
  if (o.box) { const m = ctx.measureText(text).width, px = size * .35, bx = o.align === 'left' ? -px : -m / 2 - px; ctx.fillStyle = o.box; ctx.fillRect(bx, -size * .72, m + px * 2, size * 1.44) }
  ctx.fillStyle = color; ctx.fillText(text, 0, 0);
  if (o.strike) { const m = ctx.measureText(text).width, bx = o.align === 'left' ? 0 : -m / 2; ctx.fillRect(bx - 10, -size * .06, (m + 20) * ease(clamp((t - t0 - .2) / .2)), size * .12) }
  ctx.restore();
}
// Beat shake: a small kick on each downbeat.
function shake(t, amt = 10) { const m = t % .5; const k = Math.exp(-m * 30) * amt; ctx.translate(Math.sin(t * 91) * k, Math.cos(t * 73) * k) }
function grid(t, color) { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 2; const off = (t * 220) % 60; for (let y = -60 + off; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() } for (let x = 0; x < W; x += 240) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() } ctx.restore() }
function lab(t, pos, look, o = {}) {
  room.visible = !o.campus; campus.visible = !!o.campus; panels.forEach(p => p.visible = false); agents.forEach(a => a.visible = false);
  if (o.human) { const [x, z, ry, walking] = o.human; human.position.set(x, 0, z); human.rotation.y = ry; const w = walking ? Math.sin(t * 11) * .4 : 0; legs[0].rotation.x = w; legs[1].rotation.x = -w; arms[0].rotation.x = -w; arms[1].rotation.x = w + (walking ? 0 : -.7) }
  packets.forEach((p, i) => { p.visible = !!o.packets; if (!o.packets) return; const q = (t * .6 + i / 18) % 1, sx = [-4.8, 0, 4.6][i % 3]; p.position.set(mix(sx, 3.5, q), mix(2.6, 2.3, q) + Math.sin(q * Math.PI) * 1.6, mix(-3.2, 2.45, q)) });
  if (o.hubY != null) hub.position.y = o.hubY;
  fill(o.campus ? '#2a3242' : INK);
  cameraAt(pos, look); renderer.render(scene, camera); ctx.drawImage(renderer.domElement, 0, 0);
}
function orbit(a, r, h, c = [-1, 1.4, -1.5]) { return [c[0] + Math.cos(a) * r, h, c[2] + Math.sin(a) * r] }
function clock(cx, cy, r, hour) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = PAP; ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = INK; ctx.stroke(); for (const [ang, len, wd] of [[hour / 12 * Math.PI * 2, r * .5, 10], [(hour % 1) * Math.PI * 2, r * .75, 6]]) { ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len); ctx.stroke() } ctx.restore() }
function mark(name, cx, cy, size, alpha = 1) { if (!HY[name]) return; ctx.save(); ctx.globalAlpha = alpha; ctx.drawImage(HY[name], cx - size / 2, cy - size / 2, size, size); ctx.restore() }
const HSTEP = [
  { n: 'Find', sub: ['the scheduler:', 'FBS, iLab, PPMS'] },
  { n: 'Collect', sub: ['every booking,', 'every hour used'] },
  { n: 'Match', sub: ['booked time', 'against real use'] },
  { n: 'Price', sub: ['each session,', "the core's rules"] },
  { n: 'Flag', sub: ['no-shows, overruns,', 'unbooked use'] }
];

// ---- chaos opening ----
const rnd = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) };
const redMat = mat(0xd6453d, .45);
const errPk = []; for (let k = 0; k < 54; k++) { const p = box(room, 0, 0, 0, .17, .17, .17, k % 4 ? redMat : yellow, .04); p.visible = false; errPk.push(p) }
const crowd = [0, 1].map(() => { const h = human.clone(true); h.visible = false; room.add(h); return h });
const SPOTS = [[-4.8, 3.0, -3.2], [0, 3.0, -3.2], [4.6, 2.3, -3.2], [3.5, 3.0, 2.45], [-5.5, 1.6, 2.5], [1.5, 1.6, .5]];
function limbs(h, w) { const c = h.children; c[3].rotation.x = w; c[5].rotation.x = -w; c[4].rotation.x = -w; c[6].rotation.x = w }
function chaos(t, heat) {
  // two more researchers: one walks to the microscope with no booking, one paces in and out
  const [A, B] = crowd; A.visible = B.visible = true;
  const qa = clamp(t / 2.2); A.position.set(mix(5.5, .4, ease(qa)), 0, mix(3.5, -1.9, ease(qa))); A.rotation.y = qa < 1 ? Math.atan2(-5.1, -5.4) : Math.PI; limbs(A, qa < 1 ? Math.sin(t * 11) * .4 : 0);
  const pb = Math.sin(t * 1.9); B.position.set(mix(2.4, 5.4, (pb + 1) / 2), 0, -1.3); B.rotation.y = Math.cos(t * 1.9) > 0 ? Math.PI / 2 : -Math.PI / 2; limbs(B, Math.sin(t * 11) * .4);
  // data sprays out of every machine and lands anywhere but the bill
  const srcs = [[-4.8, 2.4, -3.2], [0, 2.4, -3.2], [4.6, 2.2, -3.2]];
  errPk.forEach((p, k) => {
    const per = .9 + rnd(k) * .9, ph = t / per + rnd(k + 9), cyc = Math.floor(ph), q = ph - cyc;
    const show = k < 12 + heat * 42; p.visible = show; if (!show) return;
    const s = srcs[(k + cyc) % 3], tx = mix(-7, 7, rnd(k * 7 + cyc)), tz = mix(-5, 5, rnd(k * 13 + cyc * 3)), ty = rnd(k + cyc * 5) < .5 ? .1 : mix(1, 4, rnd(k * 3 + cyc));
    p.position.set(mix(s[0], tx, q), mix(s[1], ty, q) + Math.sin(q * Math.PI) * mix(1.2, 3.2, rnd(k * 5)), mix(s[2], tz, q)); p.rotation.set(q * 6 + k, q * 4, 0);
  });
  if (screen) { const f = Math.floor(t * 8) % 2 ? 1 : 1 - .7 * heat; screen.material.color.setRGB(1, f, f) }
}
function errorBadge(x, y, r, a) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = RED; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * .95, y + r * .7); ctx.lineTo(x - r * .95, y + r * .7); ctx.closePath(); ctx.fill(); ctx.fillStyle = PAP; ctx.fillRect(x - r * .09, y - r * .45, r * .18, r * .65); ctx.fillRect(x - r * .09, y + r * .32, r * .18, r * .18); ctx.restore() }
function errorOverlay(t, heat) {
  // pulsing alarm rings and warning triangles on every spot, faster as it heats up
  SPOTS.forEach(([x, y, z], k) => {
    if (t < k * .35) return; const [px, py] = project(x, y, z), rate = mix(3, 9, heat), on = (Math.floor(t * rate + k * .5) % 2) === 0;
    const ring = (t * 1.6 + k * .3) % 1; ctx.save(); ctx.strokeStyle = RED; ctx.lineWidth = 6; ctx.globalAlpha = (1 - ring) * .8; ctx.beginPath(); ctx.arc(px, py, 30 + ring * 110, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    errorBadge(px, py, 42, on ? 1 : .35);
  });
  // stray red error chips flicker in at random places
  for (let k = 0; k < Math.floor(heat * 14); k++) { const c = Math.floor(t * 6), x = rnd(k * 31 + c) * W, y = rnd(k * 17 + c * 2) * H * .9; errorBadge(x, y, 18 + rnd(k + c) * 22, .9) }
  // red vignette pumping on the beat
  const beat = Math.exp(-(t % .5) * 8), g = ctx.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * .95);
  g.addColorStop(0, 'rgba(214,69,61,0)'); g.addColorStop(1, `rgba(214,69,61,${(.25 + .5 * heat) * (.5 + .5 * beat)})`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (heat > .6 && Math.floor(t * 10) % 3 === 0) { ctx.fillStyle = `rgba(214,69,61,${.15 * heat})`; ctx.fillRect(0, 0, W, H) }
}
function glitch(t) { const out = ctx.canvas; for (let k = 0; k < 14; k++) { const y = rnd(k + Math.floor(t * 30)) * H, h = 20 + rnd(k * 3) * 90, dx = (rnd(k * 7 + Math.floor(t * 30)) - .5) * 260; ctx.drawImage(out, 0, y, W, h, dx, y, W, h) } ctx.fillStyle = `rgba(214,69,61,${clamp((t - 3.45) / .55) * .5})`; ctx.fillRect(0, 0, W, H) }
function hype(T) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  // A · 0–4 cold open
  if (T < 4) {
    fill(INK); grid(T, 'rgba(246,245,240,.04)'); ctx.save(); shake(T, 6);
    if (T < 2) { slam('Every university', W / 2, 430, 110, PAP, 0, T); slam('shares $1M machines.', W / 2, 590, 110, YEL, .5, T) }
    else { slam('And bills them', W / 2, 400, 110, PAP, 2, T); slam('wrong.', W / 2, 600, 260, RED, 2.5, T, { rot: -4, from: 2.4 }) }
    ctx.restore(); return;
  }
  // B · 4–8 the lab in chaos: no text. Errors flash on every machine, data sprays everywhere and misses.
  if (T < 8) {
    const t = T - 4, heat = clamp(t / 3.6), a = mix(1.0, .35, ease(t / 4));
    const walk = clamp(t / 1.6), hx = walk < .6 ? mix(1, -4.2, ease(walk / .6)) : -4.2, hz = walk < .6 ? mix(1.2, -.4, ease(walk / .6)) : mix(-.4, -2.15, ease((walk - .6) / .4));
    chaos(t, heat);
    lab(T, orbit(a, mix(13, 10.5, ease(t / 4)), mix(9.5, 7, ease(t / 4))), [-1, 1.3, -1.6], { human: [hx, hz, walk < .6 ? Math.atan2(-5.2, -1.6) : Math.PI, walk < 1], packets: false });
    errorOverlay(t, heat);
    if (t > 3.45) glitch(t);
    return;
  }
  // C · 8–11.5 what it costs
  if (T < 11.5) {
    fill(INK); grid(T, 'rgba(244,196,48,.06)'); ctx.save(); shake(T, 8);
    if (T < 9.5) { slam('$43K', W / 2, 470, 340, YEL, 8, T, { from: 2 }); slam('lost per core, every year.', W / 2, 720, 64, PAP, 8.5, T) }
    else if (T < 11) { slam('15–30 hours', W / 2, 470, 220, PAP, 9.5, T); slam('a month, matched by hand.', W / 2, 680, 64, YEL, 10, T) }
    ctx.restore();
    if (T >= 11) fill('#000');
    return;
  }
  // D · 11.5–14 logo drop
  if (T < 14) {
    const t = T - 11.5; fill(YEL); ctx.save(); shake(T, 12);
    const k = ease(clamp(t / .35)), over = 1 + Math.sin(clamp(t / .5) * Math.PI) * .12;
    mark('parity-mark-ink', W / 2, mix(470, 330, ease(clamp((t - .6) / .4))), mix(900, 280, k) * over, Math.min(1, t * 6));
    const letters = 'Parity'.split(''); ctx.font = F(700, 190); const total = ctx.measureText('Parity').width; let x = W / 2 - total / 2;
    letters.forEach((c, i) => { const a = clamp((t - .7 - i * .07) / .15); if (a > 0) { ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(c, x, mix(700, 600, ease(a))); ctx.restore() } x += ctx.measureText(c).width });
    slam('Five agents. Every bill right.', W / 2, 790, 60, INK, 1.6 + 11.5, T, { from: 1.2 });
    ctx.restore(); return;
  }
  // E · 14–21.5 the five agents, 1.5 s each
  if (T < 21.5) {
    const st = T - 14, i = Math.min(4, Math.floor(st / 1.5)), lt = st - i * 1.5, s = steps[i];
    fill(INK); grid(T, 'rgba(246,245,240,.03)');
    // progress rail across the top
    for (let j = 0; j < 5; j++) { const x = 120 + j * 360, on = j <= i; ctx.fillStyle = j < i ? YEL : (j === i ? YEL : 'rgba(246,245,240,.18)'); ctx.fillRect(x, 70, j === i ? 330 * ease(clamp(lt / 1.4)) : (on ? 330 : 330), 10); if (j > i) { ctx.fillStyle = 'rgba(246,245,240,.18)'; ctx.fillRect(x, 70, 330, 10) } ctx.font = F(700, 30); ctx.textAlign = 'left'; ctx.fillStyle = on ? YEL : 'rgba(246,245,240,.35)'; ctx.fillText(`${j + 1} ${HSTEP[j].n}`, x, 120) }
    ctx.save(); shake(T, 7);
    slam(String(i + 1), 230, 470, 400, YEL, 14 + i * 1.5, T, { from: 1.8 });
    slam(HSTEP[i].n, 120, 760, 150, PAP, 14 + i * 1.5 + .12, T, { align: 'left', from: 1.3 });
    ctx.restore();
    ctx.save(); ctx.font = F(500, 36); ctx.fillStyle = 'rgba(246,245,240,.8)'; ctx.textAlign = 'left'; ctx.globalAlpha = ease(clamp((lt - .3) / .3)); HSTEP[i].sub.forEach((l, k) => ctx.fillText(l, 124, 870 + k * 48)); ctx.restore();
    const slide = i === 0 ? ease(clamp(lt / .35)) : 1, X = mix(W, 760, slide), Y = 240, FW = 1100, FH = FW * 1906 / 3200;
    appCrop(images[s.img], s.r, .55 * ease(clamp((lt - .1) / .7)), ease(clamp((lt - .45) / .25)), 1, X, Y, FW, FH);
    if (lt < .08) { ctx.fillStyle = 'rgba(244,196,48,.35)'; ctx.fillRect(0, 0, W, H) }
    return;
  }
  // F · 21.5–25 one click
  if (T < 25) {
    const t = T - 21.5; fill(PAP); grid(T, 'rgba(23,25,28,.05)');
    ctx.save(); shake(T, 5); slam('One click to approve.', W / 2, 300, 96, INK, 21.6, T); ctx.restore();
    const press = t > 1.6 && t < 1.8, bw = 520, bh = 170, bx = W / 2 - bw / 2, by = 520 + (press ? 8 : 0), done = t >= 1.7;
    ctx.save(); ctx.fillStyle = INK; ctx.fillRect(bx + (press ? 4 : 14), by + (press ? 4 : 14), bw, bh); ctx.fillStyle = done ? INK : YEL; ctx.fillRect(bx, by, bw, bh); ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeRect(bx, by, bw, bh);
    ctx.font = F(700, 72); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = done ? YEL : INK; ctx.fillText(done ? 'Approved ✓' : 'Approve', W / 2, by + bh / 2); ctx.restore();
    // cursor glides in and clicks
    const c = ease(clamp((t - .4) / 1.1)), cx = mix(1500, W / 2 + 120, c), cy = mix(980, by + bh / 2 + 20, c);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(press ? 1.6 : 1.8, press ? 1.6 : 1.8); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 34); ctx.lineTo(9, 26); ctx.lineTo(16, 40); ctx.lineTo(22, 37); ctx.lineTo(15, 23); ctx.lineTo(26, 23); ctx.closePath(); ctx.fillStyle = INK; ctx.fill(); ctx.strokeStyle = PAP; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    if (done) { const b = clamp((t - 1.7) / .6); for (let k = 0; k < 14; k++) { const ang = k / 14 * Math.PI * 2, r = mix(150, 420, ease(b)); ctx.save(); ctx.globalAlpha = 1 - b; ctx.fillStyle = k % 2 ? YEL : INK; ctx.fillRect(W / 2 + Math.cos(ang) * r * 1.4 - 10, by + bh / 2 + Math.sin(ang) * r - 10, 20, 20); ctx.restore() } slam('A month closed in minutes.', W / 2, 860, 64, INK, 23.4, T) }
    return;
  }
  // G · 25–28 every core, every campus
  if (T < 28) {
    const t = T - 25, q = ease(t / 3);
    lab(T, [mix(10, 30, q), mix(16, 36, q), mix(14, 38, q)], [0, 0, 0], { campus: true, hubY: ease(clamp(t / .8)) * 1.5 });
    const [hx, hy] = project(0, hub.position.y + 2.6, 0); mark('parity-mark-yellow', hx, hy - 30, mix(0, 130, ease(clamp((t - .3) / .4))));
    ctx.save(); shake(T, 5); slam('Every core.', W / 2, 860, 110, PAP, 25.5, T, { box: 'rgba(23,25,28,.85)' }); slam('Every campus.', W / 2, 990, 70, YEL, 26.5, T, { box: 'rgba(23,25,28,.85)' }); ctx.restore(); return;
  }
  // H · 28–31 end card
  { const t = T - 28; fill(YEL); const m = ease(clamp(t / .5)); mark('parity-mark-ink', W / 2, mix(420, 300, m), mix(160, 230, m), m);
    ctx.save(); ctx.globalAlpha = ease(clamp((t - .3) / .4)); ctx.fillStyle = INK; ctx.font = F(700, 160); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Parity', W / 2, 560); ctx.restore();
    ctx.save(); ctx.globalAlpha = ease(clamp((t - .8) / .4)); ctx.fillStyle = INK; ctx.font = F(500, 52); ctx.textAlign = 'center'; ctx.fillText('You run the science. Parity runs the lab.', W / 2, 700); ctx.restore();
    ctx.save(); ctx.globalAlpha = ease(clamp((t - 1.4) / .4)); ctx.fillStyle = INK; ctx.font = F(600, 38); ctx.textAlign = 'center';  ctx.restore(); }
}
// v2: no opening text or number cards. Open in the lab (old 4–8), skip old 0–4 and 8–11.5.
const remap = T => T < 4 ? T + 4 : T + 7.5;
window.renderAt = T => hype(remap(clamp(Number(T) || 0, 0, window.DURATION)));
window.selfTest = () => { [0, 2, 5, 8, 12, 15, 18, 22].forEach(window.renderAt); return true };

// ===== v4: extended product demo — connectors, scheduling agent, column mapper, collector, MCP =====
const SH = {}; window.ready = Promise.all([window.ready, ...['08-agent-run', '09-agent-mapping', '10-mcp'].map(n => new Promise(r => { const im = new Image(); im.onload = () => { SH[n] = im; r() }; im.onerror = r; im.src = './stills/' + n + '.png' }))]);
const EV = [[550,332,1524,485],[550,485,1524,638],[550,638,1524,752],[550,752,1524,866],[550,866,1524,980],[550,980,1524,1094],[550,1094,1524,1208],[550,1208,1524,1322],[550,1322,1524,1475],[550,1475,1524,1628],[550,1628,1524,1742]];
const MAPROWS = [648,721,794,867,940,1013,1086,1159,1232,1305,1377];
// Draw part of a screenshot into a frame; returns a mapper from image to screen coordinates.
function view(img, cx, cy, cw, X, Y, FW, FH, alpha = 1) {
  const ch = cw * FH / FW, k = FW / cw;
  ctx.save(); ctx.globalAlpha = alpha; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; ctx.fillStyle = PAP; ctx.fillRect(X, Y, FW, FH); ctx.shadowColor = 'transparent';
  ctx.beginPath(); ctx.rect(X, Y, FW, FH); ctx.clip(); if (img) ctx.drawImage(img, cx, cy, cw, ch, X, Y, FW, FH); ctx.restore();
  return (x, y) => [X + (x - cx) * k, Y + (y - cy) * k];
}
function hlBox(m, r, color, a, fillA = .18) { const [x0, y0] = m(r[0], r[1]), [x1, y1] = m(r[2], r[3]); ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = color; ctx.globalAlpha = a * fillA; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.globalAlpha = a; ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.beginPath(); ctx.roundRect(x0 - 4, y0 - 2, x1 - x0 + 8, y1 - y0 + 4, 8); ctx.stroke(); ctx.restore() }
function ftitle(name, subs, t, x = 110, y = 300) { ctx.save(); shake(t + 100, 5); slam(name, x, y, 74, PAP, 0, t, { align: 'left', from: 1.3 }); ctx.restore(); subs.forEach((s, i) => { const a = ease(clamp((t - .35 - i * .35) / .3)); if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.font = F(500, 34); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = i === subs.length - 1 && subs.length > 1 ? YEL : 'rgba(246,245,240,.85)'; ctx.fillText(s, x + 4 + (1 - a) * 30, y + 110 + i * 56); ctx.restore() }) }
function stat(label, value, x, y, a, color = YEL) { if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = F(700, 72); ctx.fillStyle = color; ctx.fillText(value, x, y); const w = ctx.measureText(value).width; ctx.font = F(500, 30); ctx.fillStyle = 'rgba(246,245,240,.75)'; ctx.fillText(label, x + w + 18, y - 8); ctx.restore() }
function chipBox(text, x, y, w, h, a, on) { if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; const s = mix(1.3, 1, ease(a)); ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s); ctx.translate(-(x + w / 2), -(y + h / 2)); ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 8; ctx.fillStyle = on ? YEL : PAP; ctx.fillRect(x, y, w, h); ctx.shadowColor = 'transparent'; ctx.fillStyle = INK; ctx.font = F(700, 36); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + w / 2, y + h / 2 + 2); ctx.restore() }
function flow(x0, y0, x1, y1, t, a, n = 3) { ctx.save(); ctx.globalAlpha = a * .5; ctx.strokeStyle = YEL; ctx.lineWidth = 3; ctx.setLineDash([12, 12]); ctx.lineDashOffset = -t * 60; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = a; ctx.fillStyle = YEL; for (let k = 0; k < n; k++) { const q = (t * .9 + k / n) % 1; ctx.fillRect(mix(x0, x1, q) - 9, mix(y0, y1, q) - 9, 18, 18) } ctx.restore() }

function secConnect(t) {
  fill(INK); grid(t, 'rgba(246,245,240,.03)');
  ctx.save(); shake(t + 40, 5); slam('Plugs into what your core already runs.', W / 2, 150, 58, PAP, 0, t, { from: 1.25 }); ctx.restore();
  const cx = W / 2, cy = 600, L = [['FBS', 410], ['iLab', 600], ['PPMS', 790]], R = [['Instrument PCs', 410], ['Price sheets', 600], ['Export folders', 790]];
  [...L.map(([n, y], i) => [n, 160, y, i]), ...R.map(([n, y], i) => [n, 1400, y, i + 3])].forEach(([n, x, y, i]) => { const a = clamp((t - .25 - i * .12) / .2); const w = 360, h = 110; flow(x < cx ? x + w : x, y, cx, cy, t + i * .3, ease(clamp((t - .6 - i * .12) / .3))); chipBox(n, x, y - h / 2, w, h, a, false) });
  const ring = (t * 1.2) % 1; ctx.save(); ctx.strokeStyle = YEL; ctx.lineWidth = 5; ctx.globalAlpha = 1 - ring; ctx.beginPath(); ctx.arc(cx, cy, 130 + ring * 120, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, 130, 0, Math.PI * 2); ctx.fillStyle = YEL; ctx.fill(); ctx.restore(); mark('parity-mark-ink', cx, cy - 4, 170);
}
function secAgent(t) {
  fill(INK); grid(t, 'rgba(246,245,240,.03)');
  const e = clamp(Math.floor((t - .5) / .38), -1, 10), img = SH['08-agent-run'];
  ftitle('Scheduling agent', ['Reads every report page.', 'Retries when the source pushes back.', 'Checks every booking.'], t);
  const pages = e >= 7 ? 4 : e >= 6 ? 3 : e >= 5 ? 2 : e >= 3 ? 1 : 0;
  stat('pages read', `${pages}/4`, 114, 720, ease(clamp((t - .6) / .3)));
  stat('bookings staged', e >= 9 ? '24' : '—', 114, 820, ease(clamp((t - .6) / .3)));
  stat('duplicate removed', e >= 9 ? '1' : '—', 114, 920, ease(clamp((t - .6) / .3)), e >= 9 ? RED : YEL);
  const focus = e < 0 ? 332 : EV[e][1], cy = clamp(mix(300, focus - 380, ease(clamp((t - .5) / 4.2))), 280, 720);
  const m = view(img, 520, cy, 1060, 1000, 110, 840, 860, ease(clamp(t / .35)));
  if (e >= 0) for (let k = 0; k <= e; k++) { const r = EV[k]; if (k === e) { const retry = k === 4, flash = retry && Math.floor(t * 10) % 2; hlBox(m, r, retry ? RED : YEL, 1, flash ? .35 : .2) } else { const [x0, y0] = m(r[0] - 6, r[1] + 20); ctx.save(); ctx.fillStyle = k === 4 ? RED : YEL; ctx.fillRect(x0 - 16, y0, 8, (r[3] - r[1] - 40) * 840 / 1060); ctx.restore() } }
}
function secMapping(t) {
  fill(INK); grid(t, 'rgba(246,245,240,.03)');
  ftitle('Column mapper', ['Any export layout.', 'Every column, mapped.'], t);
  const m = view(SH['09-agent-mapping'], 1610, 590, 1520, 1000, 200, 840, 680, ease(clamp(t / .3)));
  for (let i = 0; i < 10; i++) { const a = clamp((t - .35 - i * .17) / .15); if (a <= 0) continue; const cur = t - .35 - i * .17 < .3; hlBox(m, [1638, MAPROWS[i], 3102, MAPROWS[i + 1]], YEL, cur ? 1 : .55, cur ? .3 : .12) }
  stat('columns mapped', String(Math.min(10, Math.max(0, Math.floor((t - .35) / .17) + 1))), 114, 720, ease(clamp((t - .4) / .3)));
}
function secCollector(t) {
  fill(INK); grid(t, 'rgba(246,245,240,.03)');
  ftitle('Collector', ['Runs on each instrument PC.', 'Logs real use, minute by minute.'], t);
  const a = ease(clamp(t / .3)), X = 880, Y = 230, MW = 680, MH = 420;
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#2b3036'; ctx.beginPath(); ctx.roundRect(X - 20, Y - 20, MW + 40, MH + 40, 18); ctx.fill(); ctx.fillStyle = '#0f1214'; ctx.fillRect(X, Y, MW, MH); ctx.fillStyle = '#2b3036'; ctx.fillRect(X + MW / 2 - 40, Y + MH + 20, 80, 70); ctx.fillRect(X + MW / 2 - 160, Y + MH + 86, 320, 18);
  // session timeline: rows of usage bars growing in real time
  for (let r = 0; r < 5; r++) { const y = Y + 60 + r * 78, start = [.05, .3, .12, .55, .22][r], len = [.5, .35, .7, .3, .45][r], g = clamp((t - .3 - r * .15) / 1.1); ctx.fillStyle = 'rgba(246,245,240,.1)'; ctx.fillRect(X + 40, y, MW - 80, 34); ctx.fillStyle = r === 0 ? RED : YEL; ctx.fillRect(X + 40 + (MW - 80) * start, y, (MW - 80) * len * g, 34) }
  const sx = X + 40 + (MW - 80) * clamp((t - .3) / 1.4); ctx.fillStyle = PAP; ctx.fillRect(sx, Y + 40, 3, MH - 80); ctx.restore();
  const ma = ease(clamp((t - .5) / .3)); flow(X + MW + 24, Y + MH / 2, 1700, Y + MH / 2, t, ma, 2); ctx.save(); ctx.globalAlpha = ma; ctx.beginPath(); ctx.arc(1780, Y + MH / 2, 90, 0, Math.PI * 2); ctx.fillStyle = YEL; ctx.fill(); ctx.restore(); mark('parity-mark-ink', 1780, Y + MH / 2 - 3, 120, ma);
}
function secMcp(t) {
  fill(INK); grid(t, 'rgba(246,245,240,.03)');
  ctx.save(); shake(t + 70, 5); slam('MCP server', 90, 120, 84, PAP, 0, t, { align: 'left', from: 1.3 }); ctx.restore();
  ctx.save(); ctx.globalAlpha = ease(clamp((t - .3) / .3)); ctx.font = F(500, 38); ctx.fillStyle = YEL; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('Ask Claude or Codex about your month.', 94, 210); ctx.restore();
  const m = view(SH['10-mcp'], 520, 280, 1250, 90, 290, 840, 640, ease(clamp(t / .3)));
  if (t > .5) hlBox(m, [546, 405, 958, 465], YEL, ease(clamp((t - .5) / .2)), .25);
  if (t > 1.0) hlBox(m, [546, 1015, 1760, 1222], YEL, ease(clamp((t - 1) / .2)), .1);
  // chat panel: one question, Parity's tools run, one answer
  const PX = 1000, PY = 290, PW = 840, PH = 640, pa = ease(clamp((t - .9) / .3));
  ctx.save(); ctx.globalAlpha = pa; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14; ctx.fillStyle = PAP; ctx.fillRect(PX, PY, PW, PH); ctx.restore();
  const q = ease(clamp((t - 1.3) / .25)); if (q > 0) { ctx.save(); ctx.globalAlpha = q; ctx.font = F(600, 30); const txt = 'Check this month with Parity.', w = ctx.measureText(txt).width + 48; ctx.fillStyle = INK; ctx.beginPath(); ctx.roundRect(PX + PW - 40 - w, PY + 40, w, 70, 14); ctx.fill(); ctx.fillStyle = PAP; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(txt, PX + PW - 64, PY + 76); ctx.restore() }
  ['find_exports', 'read_prices', 'check_month', 'sessions_needing_review'].forEach((tool, i) => { const a = ease(clamp((t - 1.8 - i * .4) / .2)); if (a <= 0) return; const y = PY + 150 + i * 78, done = t > 2.05 + i * .4; ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(23,25,28,.06)'; ctx.fillRect(PX + 40, y, PW - 80, 62); ctx.fillStyle = YEL; ctx.fillRect(PX + 40, y, 10, 62); ctx.font = F(700, 22); ctx.fillStyle = '#6b6a62'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('parity', PX + 70, y + 31); ctx.font = F(600, 30); ctx.fillStyle = INK; ctx.fillText(tool, PX + 170, y + 31); ctx.font = F(700, 32); ctx.textAlign = 'right'; ctx.fillStyle = done ? '#2f7d4f' : '#9a988f'; ctx.fillText(done ? '✓' : '…', PX + PW - 64, y + 33); ctx.restore() });
  const r = ease(clamp((t - 3.6) / .3)); if (r > 0) { ctx.save(); ctx.globalAlpha = r; ctx.fillStyle = YEL; ctx.beginPath(); ctx.roundRect(PX + 40, PY + 480, PW - 80, 120, 14); ctx.fill(); ctx.fillStyle = INK; ctx.font = F(700, 36); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('144 sessions checked.', PX + 70, PY + 520); ctx.fillText('43 need a look.', PX + 70, PY + 566); ctx.restore() }
}
const SEGS = [[0, 4, 4], [4, 6.5, 11.5], [6.5, 9.5, secConnect], [9.5, 14.5, secAgent], [14.5, 17, secMapping], [17, 19, secCollector], [19, 26.5, 14], [26.5, 31.5, secMcp], [31.5, 41, 21.5]];
window.DURATION = 41;
window.renderAt = T => { T = clamp(Number(T) || 0, 0, window.DURATION); const s = SEGS.find(g => T < g[1]) || SEGS[SEGS.length - 1]; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; if (typeof s[2] === 'function') { s[2](T - s[0]); if (T - s[0] < .08) { ctx.fillStyle = 'rgba(244,196,48,.35)'; ctx.fillRect(0, 0, W, H) } } else hype(s[2] + (T - s[0])) };
window.selfTest = () => { [0, 5, 8, 12, 16, 18, 22, 29, 33, 40].forEach(window.renderAt); return true };

// ===== v5: the agent IS the 1–5 pipeline. Find and Collect show the agent's real work; MCP comes after as its own beat. =====
const PIPE = ['Find', 'Collect', 'Match', 'Price', 'Flag'];
function rail(i, frac) { for (let j = 0; j < 5; j++) { const x = 120 + j * 360; ctx.fillStyle = 'rgba(246,245,240,.18)'; ctx.fillRect(x, 70, 330, 10); ctx.fillStyle = YEL; if (j < i) ctx.fillRect(x, 70, 330, 10); else if (j === i) ctx.fillRect(x, 70, 330 * clamp(frac), 10); ctx.font = F(700, 30); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = j <= i ? YEL : 'rgba(246,245,240,.35)'; ctx.fillText(`${j + 1} ${PIPE[j]}`, x, 125) } }
function stepLeft(i, st, subs, subT) {
  ctx.save(); shake(st + 200 + i, 6); slam(String(i + 1), 210, 390, 330, YEL, 0, st, { from: 1.8 }); slam(PIPE[i], 110, 640, 130, PAP, .12, st, { align: 'left', from: 1.3 }); ctx.restore();
  subs.forEach((l, k) => { const a = ease(clamp((subT - .25 - k * .2) / .25)); if (a <= 0) return; ctx.save(); ctx.globalAlpha = a; ctx.font = F(500, 36); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = k === subs.length - 1 ? YEL : 'rgba(246,245,240,.85)'; ctx.fillText(l, 114 + (1 - a) * 24, 750 + k * 52); ctx.restore() });
}
function stepBg(t) { fill(INK); grid(t, 'rgba(246,245,240,.03)') }
// 1 Find: the agent locates the scheduler and everything around it.
function cFind(t) {
  const cx = 1380, cy = 590, L = [['FBS', 400], ['iLab', 590], ['PPMS', 780]], R = [['Instrument PCs', 400], ['Price sheets', 590], ['Exports', 780]];
  [...L.map(([n, y], i) => [n, 900, y, i]), ...R.map(([n, y], i) => [n, 1560, y, i + 3])].forEach(([n, x, y, i]) => { const a = clamp((t - .3 - i * .12) / .2), w = 300, h = 96; flow(x < cx ? x + w : x, y, cx, cy, t + i * .3, ease(clamp((t - .6 - i * .12) / .3))); ctx.save(); if (a > 0) { ctx.globalAlpha = a; ctx.fillStyle = PAP; ctx.fillRect(x, y - h / 2, w, h); ctx.fillStyle = INK; ctx.font = F(700, 30); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(n, x + w / 2, y + 2) } ctx.restore() });
  const ring = (t * 1.2) % 1; ctx.save(); ctx.strokeStyle = YEL; ctx.lineWidth = 5; ctx.globalAlpha = 1 - ring; ctx.beginPath(); ctx.arc(cx, cy, 105 + ring * 100, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(cx, cy, 105, 0, Math.PI * 2); ctx.fillStyle = YEL; ctx.fill(); ctx.restore(); mark('parity-mark-ink', cx, cy - 3, 140);
}
// 2a Collect: the agent's real run log — pages, the retry, mapping, checks.
function cAgentLog(t) {
  const e = clamp(3 + Math.floor((t - .2) / .42), 3, 10), m = view(SH['08-agent-run'], 520, clamp(mix(600, 900, ease(clamp(t / 3))), 280, 720), 1060, 960, 170, 880, 820, ease(clamp(t / .3)));
  for (let k = 0; k <= e; k++) { const r = EV[k]; if (k === e) hlBox(m, r, k === 4 ? RED : YEL, 1, k === 4 && Math.floor(t * 10) % 2 ? .35 : .2); else { const [x0, y0] = m(r[0] - 6, r[1] + 20); if (y0 < 175) continue; ctx.fillStyle = k === 4 ? RED : YEL; ctx.fillRect(x0 - 16, y0, 8, (r[3] - r[1] - 40) * 880 / 1060) } }
  const pages = e >= 7 ? 4 : e >= 6 ? 3 : e >= 5 ? 2 : 1; stat('pages', `${pages}/4`, 114, 950, 1); stat('bookings', e >= 9 ? '24' : '…', 520, 950, 1);
}
function cMapper(t) { const m = view(SH['09-agent-mapping'], 1610, 590, 1520, 960, 220, 880, 700, ease(clamp(t / .25))); for (let i = 0; i < 10; i++) { const a = clamp((t - .2 - i * .17) / .15); if (a <= 0) continue; const cur = t - .2 - i * .17 < .3; hlBox(m, [1638, MAPROWS[i], 3102, MAPROWS[i + 1]], YEL, cur ? 1 : .55, cur ? .3 : .12) } }
function cCollector(t) {
  const X = 940, Y = 250, MW = 620, MH = 400, a = ease(clamp(t / .25));
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#2b3036'; ctx.beginPath(); ctx.roundRect(X - 20, Y - 20, MW + 40, MH + 40, 18); ctx.fill(); ctx.fillStyle = '#0f1214'; ctx.fillRect(X, Y, MW, MH); ctx.fillStyle = '#2b3036'; ctx.fillRect(X + MW / 2 - 40, Y + MH + 20, 80, 70); ctx.fillRect(X + MW / 2 - 150, Y + MH + 86, 300, 18);
  for (let r = 0; r < 5; r++) { const y = Y + 50 + r * 72, s = [.05, .3, .12, .55, .22][r], len = [.5, .35, .7, .3, .45][r], g = clamp((t - .2 - r * .12) / 1); ctx.fillStyle = 'rgba(246,245,240,.1)'; ctx.fillRect(X + 36, y, MW - 72, 32); ctx.fillStyle = r === 0 ? RED : YEL; ctx.fillRect(X + 36 + (MW - 72) * s, y, (MW - 72) * len * g, 32) }
  ctx.fillStyle = PAP; ctx.fillRect(X + 36 + (MW - 72) * clamp((t - .2) / 1.3), Y + 32, 3, MH - 64); ctx.restore();
  const ma = ease(clamp((t - .4) / .3)); flow(X + MW + 24, Y + MH / 2, 1700, Y + MH / 2, t, ma, 2); ctx.save(); ctx.globalAlpha = ma; ctx.beginPath(); ctx.arc(1780, Y + MH / 2, 85, 0, Math.PI * 2); ctx.fillStyle = YEL; ctx.fill(); ctx.restore(); mark('parity-mark-ink', 1780, Y + MH / 2 - 3, 112, ma);
}
// 3–5: the real app screens with their highlight.
function cScreen(i, t) { const s = steps[i], prev = steps[i - 1], X = 900, Y = 230, FW = 960, FH = FW * 1906 / 3200, slide = ease(clamp(t / .3)); appCrop(images[s.img], s.r, .55 * ease(clamp((t - .1) / .7)) + .15 * ease(clamp((t - .9) / 2.4)), ease(clamp((t - .45) / .25)), slide, mix(W, X, slide), Y, FW, FH) }
// Step plan: [start, end, step index, content, subs]. Collect spans three beats.
const PLAN = [
  [0, 3, 0, cFind, ['The agent finds your scheduler,', 'instruments and prices.']],
  [3, 6.4, 1, cAgentLog, ['The agent reads every page', 'and retries when blocked.']],
  [6.4, 8.6, 1, cMapper, ['It maps any export layout', 'to the right fields.']],
  [8.6, 10.8, 1, cCollector, ['The Collector logs real use', 'on each instrument PC.']],
  [10.8, 15.3, 2, t => cScreen(2, t), ['Booked time against', 'real use.']],
  [15.3, 19.8, 3, t => cScreen(3, t), ['Each session, with', "the core's own rules."]],
  [19.8, 24.5, 4, t => cScreen(4, t), ['No-shows, overruns,', 'use nobody booked.']]
];
function secSteps(T) {
  stepBg(T); const p = PLAN.find(g => T < g[1]) || PLAN[PLAN.length - 1], i = p[2], first = PLAN.find(g => g[2] === i), last = [...PLAN].reverse().find(g => g[2] === i);
  const st = T - first[0], lt = T - p[0]; rail(i, (T - first[0]) / (last[1] - first[0]));
  p[3](lt); stepLeft(i, st, p[4], lt);
  if (lt < .08) { ctx.fillStyle = 'rgba(244,196,48,.3)'; ctx.fillRect(0, 0, W, H) }
}
function secMcp2(t) {
  secMcp(t);
  // relabel: the MCP server is how outside AI assistants use Parity's tools
  ctx.fillStyle = INK; ctx.fillRect(0, 170, 1000, 80);
  ctx.save(); ctx.globalAlpha = ease(clamp((t - .3) / .3)); ctx.font = F(500, 38); ctx.fillStyle = YEL; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('Claude or Codex can ask Parity too.', 94, 210); ctx.restore();
}
const SEGS2 = [[0, 4, 4], [4, 6.5, 11.5], [6.5, 31, T => secSteps(T)], [31, 36, secMcp2], [36, 45.5, 21.5]];
window.DURATION = 45.5;
window.renderAt = T => { T = clamp(Number(T) || 0, 0, window.DURATION); const s = SEGS2.find(g => T < g[1]) || SEGS2[SEGS2.length - 1]; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; if (typeof s[2] === 'function') { s[2](T - s[0]); if (T - s[0] < .08 && s[0] !== 6.5) { ctx.fillStyle = 'rgba(244,196,48,.35)'; ctx.fillRect(0, 0, W, H) } } else hype(s[2] + (T - s[0])) };
window.selfTest = () => { [0, 5, 8, 11, 14, 16, 18, 20, 23, 26, 33, 37].forEach(window.renderAt); return true };
