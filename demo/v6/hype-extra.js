
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
function hype(T) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
  // A · 0–4 cold open
  if (T < 4) {
    fill(INK); grid(T, 'rgba(246,245,240,.04)'); ctx.save(); shake(T, 6);
    if (T < 2) { slam('Every university', W / 2, 430, 110, PAP, 0, T); slam('shares $1M machines.', W / 2, 590, 110, YEL, .5, T) }
    else { slam('And bills them', W / 2, 400, 110, PAP, 2, T); slam('wrong.', W / 2, 600, 260, RED, 2.5, T, { rot: -4, from: 2.4 }) }
    ctx.restore(); return;
  }
  // B · 4–8 the lab: John books 2 hours, uses 3.5
  if (T < 8) {
    const t = T - 4, walk = clamp(t / 1.6), a = mix(.95, .45, ease(t / 4));
    const hx = walk < .6 ? mix(1, -4.2, ease(walk / .6)) : -4.2, hz = walk < .6 ? mix(1.2, -.4, ease(walk / .6)) : mix(-.4, -2.15, ease((walk - .6) / .4));
    lab(T, orbit(a, 13, mix(9, 6.5, ease(t / 4))), [-2.5, 1.2, -2], { human: [hx, hz, walk < .6 ? Math.atan2(-5.2, -1.6) : Math.PI, walk < 1], packets: false });
    ctx.save(); ctx.fillStyle = 'rgba(23,25,28,.25)'; ctx.fillRect(0, 0, W, H); ctx.restore();
    clock(1640, 250, 130, 9 + 3.5 * ease(clamp((t - .4) / 3)));
    ctx.save(); shake(T, 5);
    slam('Booked: 2 h', 120, 720, 100, INK, 5, T, { align: 'left', box: PAP });
    slam('Used: 3.5 h', 120, 880, 100, INK, 6, T, { align: 'left', box: YEL });
    slam('BILLED 2 H', 1420, 760, 120, RED, 7, T, { rot: -8, from: 2.2, w: 700 });
    ctx.restore(); return;
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
    ctx.save(); ctx.globalAlpha = ease(clamp((t - 1.4) / .4)); ctx.fillStyle = INK; ctx.font = F(600, 38); ctx.textAlign = 'center'; ctx.fillText('bryanzhao08.github.io/parity', W / 2, 840); ctx.restore(); }
}
// v2: no opening text or number cards. Open in the lab (old 4–8), skip old 0–4 and 8–11.5.
const remap = T => T < 4 ? T + 4 : T + 7.5;
window.renderAt = T => hype(remap(clamp(Number(T) || 0, 0, window.DURATION)));
window.selfTest = () => { [0, 2, 5, 8, 12, 15, 18, 22].forEach(window.renderAt); return true };
