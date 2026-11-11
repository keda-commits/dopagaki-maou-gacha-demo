'use strict';
/* =========================================================
   描画ヘルパー：キャラ（全てベクター手描き）・粒子・魔法陣・魔核
   画像素材なしで「シルエット＋発光リム」の統一スタイル
   ========================================================= */
window.FX = (() => {
const TAU = Math.PI * 2;
const U = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a, b) => a + Math.random() * (b - a),
  pick: arr => arr[(Math.random() * arr.length) | 0],
  dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
  ease: t => 1 - Math.pow(1 - t, 3),
  easeIO: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  rgba(hex, a) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  },
  seeded(seed) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; },
  fmt(n) { return Math.round(n).toLocaleString('en-US'); },
  mmss(sec) { sec = Math.max(0, sec | 0); return String((sec / 60) | 0).padStart(2, '0') + ':' + String(sec % 60).padStart(2, '0'); },
};

/* ---------- 共通描画 ---------- */
let F = null; // 現在の描画オプション
function P(fill, rim, lw, glow) {
  const c = F.c;
  c.fillStyle = F.flash > 0 ? '#ffffff' : fill;
  c.fill();
  if (rim) {
    c.strokeStyle = rim; c.lineWidth = lw || 2;
    if (!F.cheap) { c.shadowColor = rim; c.shadowBlur = glow == null ? 9 : glow; }
    c.stroke(); c.shadowBlur = 0;
  }
}
function glowDot(x, y, r, col) {
  const c = F.c;
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(x, y, 0, x, y, r * 3.2);
  g.addColorStop(0, '#fff'); g.addColorStop(0.25, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 3.2, 0, TAU); c.fill();
  c.restore();
}
function B() { F.c.beginPath(); }

/* ---------- 魔族アーキタイプ（右向き・足元原点） ---------- */
const ARCH = {
  maou(c, o, t) {
    const col = o.col, w = Math.sin(t * 3) * 2;
    B(); c.moveTo(-24 + w, 0); c.quadraticCurveTo(-40, -34, -26, -72); c.lineTo(-10, -84); c.lineTo(12, -84); c.quadraticCurveTo(28, -50, 25 - w, 0); c.closePath(); P('#150914', col, 2);
    B(); c.moveTo(-12, 0); c.quadraticCurveTo(-17, -40, -6, -76); c.lineTo(8, -76); c.quadraticCurveTo(17, -40, 14, 0); c.closePath(); P('#3d0c1d');
    B(); c.ellipse(-2, -77, 19, 7, 0, 0, TAU); P('#241224', '#e8c27a', 1.4, 5);
    B(); c.moveTo(3, -66); c.lineTo(8, -60); c.lineTo(3, -54); c.lineTo(-2, -60); c.closePath(); P(col); glowDot(3, -60, 3, col);
    B(); c.moveTo(-9, -98); c.quadraticCurveTo(-20, -84, -13, -72); c.quadraticCurveTo(-8, -86, -5, -92); c.closePath(); P('#1a0b20');
    B(); c.arc(2, -92, 12, 0, TAU); P('#d8c9e6');
    B(); c.moveTo(-11, -91); c.quadraticCurveTo(-12, -109, 4, -107); c.quadraticCurveTo(17, -105, 14, -90); c.lineTo(10, -97); c.lineTo(6, -91); c.lineTo(2, -98); c.lineTo(-3, -91); c.lineTo(-7, -97); c.closePath(); P('#1a0b20', '#7a3a8a', 1, 4);
    B(); c.moveTo(-6, -103); c.quadraticCurveTo(-23, -113, -16, -131); c.quadraticCurveTo(-11, -115, 1, -105); c.closePath(); P('#2a1a2e', '#e8c27a', 1.2, 5);
    B(); c.moveTo(8, -104); c.quadraticCurveTo(18, -109, 18, -117); c.lineTo(15, -114); c.lineTo(16, -120); c.quadraticCurveTo(10, -111, 3, -105); c.closePath(); P('#2a1a2e', '#e8c27a', 1.2, 5);
    c.fillStyle = col; c.fillRect(6, -93, 4, 1.6); c.fillRect(11, -93, 3.5, 1.6); glowDot(8, -92, 1.6, col); glowDot(12.5, -92, 1.6, col);
  },
  lady(c, o, t) {
    const col = o.col, w = Math.sin(t * 2.4) * 2;
    B(); c.moveTo(-3, -82); c.quadraticCurveTo(-26 + w, -58, -18 + w, -18); c.quadraticCurveTo(-10, -32, -3, -44); c.closePath(); P('#b7a2e6', col, 1, 4);
    B(); c.moveTo(-22 + w, 0); c.quadraticCurveTo(-16, -34, -7, -56); c.lineTo(7, -56); c.quadraticCurveTo(16, -34, 24 - w, 0); c.closePath(); P('#1c0f26', col, 2);
    c.strokeStyle = U.rgba(col, .5); c.lineWidth = 1; B(); c.moveTo(-18, -8); c.quadraticCurveTo(0, -2, 20, -8); c.stroke();
    B(); c.moveTo(-7, -56); c.lineTo(-6, -67); c.lineTo(6, -67); c.lineTo(7, -56); c.closePath(); P('#2a173a');
    B(); c.arc(1, -75, 9, 0, TAU); P('#efe4f6');
    B(); c.moveTo(-9, -74); c.quadraticCurveTo(-11, -89, 2, -87); c.quadraticCurveTo(13, -87, 10, -72); c.quadraticCurveTo(6, -81, 0, -79); c.quadraticCurveTo(-4, -81, -9, -74); c.closePath(); P('#cbb8f2');
    c.strokeStyle = '#ffd36b'; c.lineWidth = 2; B(); c.arc(-6, -86, 5, Math.PI * .2, Math.PI * 1.7); c.stroke(); B(); c.arc(8, -86, 5, Math.PI * 1.3, Math.PI * 2.8); c.stroke();
    glowDot(5, -75, 1.3, col); glowDot(9, -75, 1.3, col);
    B(); c.moveTo(12, -48); c.lineTo(26, -60); c.arc(12, -48, 18, -Math.PI * .28, -Math.PI * .02); c.closePath(); P('#3a1050', '#ffd36b', 1, 4);
  },
  blob(c, o, t) {
    const col = o.col, w = 30 + Math.sin(t * 4) * 2.5, h = 28 - Math.sin(t * 4) * 2.5;
    B(); c.moveTo(-w, 0); c.bezierCurveTo(-w, -h * 1.35, w, -h * 1.35, w, 0); c.closePath(); P('#1d1638', col, 2.2);
    c.fillStyle = 'rgba(255,255,255,.18)'; B(); c.ellipse(-10, -h * 0.75, 7, 4, -0.4, 0, TAU); c.fill();
    c.fillStyle = '#fff'; B(); c.ellipse(4, -h * .55, 4, 5.5, 0, 0, TAU); c.ellipse(15, -h * .55, 4, 5.5, 0, 0, TAU); c.fill();
    c.fillStyle = col; B(); c.arc(5.5, -h * .52, 2.2, 0, TAU); c.arc(16.5, -h * .52, 2.2, 0, TAU); c.fill();
  },
  imp(c, o, t) {
    const col = o.col, f = Math.sin(t * 14) * 6;
    c.strokeStyle = '#22121a'; c.lineWidth = 3; B(); c.moveTo(-8, -14); c.quadraticCurveTo(-26, -14, -22, -32); c.stroke();
    B(); c.moveTo(-22, -32); c.lineTo(-27, -38); c.lineTo(-17, -36); c.closePath(); P('#22121a', col, 1);
    B(); c.moveTo(-4, -30); c.lineTo(-28, -46 - f); c.lineTo(-22, -36); c.lineTo(-32, -30 - f * .4); c.lineTo(-16, -24); c.closePath(); P('#2a1420', col, 1.2);
    c.fillStyle = '#22121a'; c.fillRect(-6, -10, 4, 10); c.fillRect(3, -10, 4, 10);
    B(); c.ellipse(0, -18, 10, 12, 0, 0, TAU); P('#22121a', col, 1.6);
    B(); c.arc(4, -37, 12, 0, TAU); P('#22121a', col, 1.8);
    B(); c.moveTo(-4, -46); c.lineTo(-6, -56); c.lineTo(1, -48); c.closePath(); c.moveTo(8, -48); c.lineTo(12, -58); c.lineTo(13, -46); c.closePath(); P('#3a1a24', col, 1);
    glowDot(8, -38, 2, '#ffd36b'); glowDot(13, -38, 2, '#ffd36b');
    c.strokeStyle = '#ffd36b'; c.lineWidth = 1; B(); c.moveTo(6, -31); c.quadraticCurveTo(10, -28, 14, -32); c.stroke();
  },
  wraith(c, o, t) {
    const col = o.col; c.translate(0, -10 + Math.sin(t * 2) * 4);
    const w = Math.sin(t * 5) * 3;
    B(); c.moveTo(-18, -4); c.lineTo(-12, 4 + w); c.lineTo(-6, -2); c.lineTo(0, 6 - w); c.lineTo(6, -2); c.lineTo(12, 4 + w); c.lineTo(18, -4);
    c.quadraticCurveTo(24, -40, 8, -66); c.quadraticCurveTo(-6, -76, -16, -56); c.quadraticCurveTo(-24, -30, -18, -4); c.closePath(); P('#121a2c', col, 2);
    B(); c.ellipse(6, -50, 8, 10, 0, 0, TAU); c.fillStyle = '#000'; c.fill();
    glowDot(3.5, -52, 1.8, col); glowDot(9.5, -52, 1.8, col);
    c.strokeStyle = U.rgba(col, .7); c.lineWidth = 1.5; B(); c.moveTo(14, -34); c.quadraticCurveTo(26, -30, 30, -22 + w); c.moveTo(14, -30); c.quadraticCurveTo(24, -24, 26, -16 - w); c.stroke();
  },
  wisp(c, o, t) {
    const col = o.col; c.translate(0, -14 + Math.sin(t * 2.6) * 5);
    const fl = Math.sin(t * 9) * 3;
    c.save(); c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(0, -30, 2, 0, -30, 34); g.addColorStop(0, '#ffffff'); g.addColorStop(.3, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = F.flash > 0 ? '#fff' : g; B(); c.moveTo(0, -60 + fl); c.bezierCurveTo(18, -42, 18, -14, 0, -8); c.bezierCurveTo(-18, -14, -18, -42, 0, -60 + fl); c.fill();
    c.restore();
    c.fillStyle = '#0a2a20'; B(); c.arc(-4, -28, 2, 0, TAU); c.arc(5, -28, 2, 0, TAU); c.fill();
    c.strokeStyle = '#0a2a20'; c.lineWidth = 1.2; B(); c.arc(0.5, -24, 3, 0.2, Math.PI - 0.2); c.stroke();
  },
  beast(c, o, t) {
    const col = o.col, s = Math.sin(t * 6) * 3;
    c.strokeStyle = '#1a1016'; c.lineWidth = 5; B(); c.moveTo(-26, -32); c.quadraticCurveTo(-40, -36, -44, -50 + s); c.stroke();
    c.fillStyle = F.flash > 0 ? '#fff' : '#140c10';
    [[-20, s], [-11, -s], [13, -s], [21, s]].forEach(([x, d]) => { c.save(); c.translate(x, -20); c.rotate(d * 0.04); c.fillRect(-3, 0, 6, 20); c.restore(); });
    B(); c.ellipse(-2, -30, 28, 14, 0, 0, TAU); P('#1a1016', col, 2);
    B(); for (let i = 0; i < 6; i++) { const x = -20 + i * 6; c.moveTo(x, -40); c.lineTo(x + 3, -52 - (i % 2) * 4); c.lineTo(x + 6, -40); } P('#1a1016', col, 1.2);
    B(); c.arc(26, -40, 11, 0, TAU); c.moveTo(30, -44); c.lineTo(44, -38); c.lineTo(42, -32); c.lineTo(28, -32); c.closePath(); P('#1a1016', col, 1.8);
    B(); c.moveTo(19, -48); c.lineTo(20, -60); c.lineTo(26, -50); c.moveTo(25, -50); c.lineTo(29, -61); c.lineTo(32, -48); P('#1a1016', col, 1.2);
    glowDot(32, -43, 2, col);
    c.fillStyle = '#fff'; B(); c.moveTo(38, -33); c.lineTo(39, -29); c.lineTo(40, -33); c.fill();
  },
  lich(c, o, t) {
    const col = o.col; c.translate(0, Math.sin(t * 2) * 2 - 4);
    B(); c.moveTo(-16, 0); c.lineTo(-10, -50); c.lineTo(10, -50); c.lineTo(18, 0); c.closePath(); P('#101a2a', col, 2);
    B(); c.moveTo(-10, -50); c.quadraticCurveTo(-8, -76, 4, -74); c.quadraticCurveTo(16, -72, 12, -50); c.closePath(); P('#16223a', col, 1.4);
    B(); c.arc(3, -60, 8, 0, TAU); P('#dcd6c6');
    c.fillStyle = '#000'; B(); c.arc(0, -61, 2.4, 0, TAU); c.arc(6, -61, 2.4, 0, TAU); c.fill();
    glowDot(0, -61, 1.2, col); glowDot(6, -61, 1.2, col);
    c.strokeStyle = '#5a4a3a'; c.lineWidth = 3; B(); c.moveTo(18, -2); c.lineTo(22, -78); c.stroke();
    glowDot(22, -83, 4, col);
    c.save(); c.translate(-22, -48 + Math.sin(t * 3) * 3); c.rotate(-0.3); B(); c.rect(-7, -5, 14, 10); P('#3a2a1a', col, 1); c.restore();
  },
  golem(c, o, t) {
    const col = o.col;
    B(); c.rect(-15, -24, 11, 24); c.rect(4, -24, 11, 24); P('#221e1a', col, 1.2);
    B(); c.roundRect ? c.roundRect(-21, -64, 42, 42, 6) : c.rect(-21, -64, 42, 42); P('#2a2420', col, 2);
    B(); c.rect(-32, -62, 11, 36); c.rect(21, -62, 11, 36); P('#24201c', col, 1.4);
    B(); c.rect(-8, -80, 18, 16); P('#2a2420', col, 1.4);
    c.fillStyle = col; c.fillRect(-2, -74, 10, 2.5); glowDot(3, -73, 2, col);
    glowDot(0, -44, 5 + Math.sin(t * 3), col);
    c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 1.2; B(); c.moveTo(-14, -58); c.lineTo(-6, -50); c.lineTo(-10, -40); c.moveTo(12, -30); c.lineTo(6, -38); c.stroke();
  },
  harpy(c, o, t) {
    const col = o.col, f = Math.sin(t * 10) * 10; c.translate(0, -12 + Math.sin(t * 3) * 5);
    B(); c.moveTo(-4, -44); c.lineTo(-40, -72 + f); c.lineTo(-33, -58 + f * .6); c.lineTo(-46, -54 + f * .5); c.lineTo(-31, -46); c.lineTo(-40, -36); c.lineTo(-10, -32); c.closePath(); P('#24142e', col, 1.5);
    c.strokeStyle = '#24142e'; c.lineWidth = 2; B(); c.moveTo(-2, -22); c.lineTo(-4, -6); c.moveTo(3, -22); c.lineTo(5, -6); c.stroke();
    B(); c.ellipse(0, -34, 8, 14, 0, 0, TAU); P('#24142e', col, 1.5);
    B(); c.moveTo(-6, -60); c.lineTo(-22, -66); c.lineTo(-8, -54); c.closePath(); P(col);
    B(); c.arc(3, -55, 8, 0, TAU); P('#e9d9f2');
    glowDot(7, -56, 1.4, col);
    B(); c.moveTo(4, -42); c.lineTo(26, -60 - f * .6); c.lineTo(22, -48); c.lineTo(30, -44); c.lineTo(10, -34); c.closePath(); P('#3a2048', col, 1.2);
  },
  dragon(c, o, t) {
    const col = o.col, f = Math.sin(t * 6) * 8;
    B(); c.moveTo(-18, -22); c.quadraticCurveTo(-44, -8, -52, -30); c.lineTo(-46, -26); c.quadraticCurveTo(-40, -16, -16, -30); c.closePath(); P('#2a0f0a', col, 1.5);
    B(); c.moveTo(-6, -42); c.lineTo(-30, -86 + f); c.lineTo(-22, -66 + f * .5); c.lineTo(-40, -66 + f * .5); c.lineTo(-20, -52); c.lineTo(-30, -44); c.closePath(); P('#3a1410', col, 1.5);
    c.fillStyle = F.flash > 0 ? '#fff' : '#2a0f0a'; c.fillRect(-12, -16, 7, 16); c.fillRect(6, -16, 7, 16);
    B(); c.ellipse(-2, -28, 22, 16, 0, 0, TAU); P('#2a0f0a', col, 2);
    c.fillStyle = U.rgba(col, .35); B(); c.ellipse(4, -24, 12, 9, 0, 0, TAU); c.fill();
    B(); c.moveTo(8, -38); c.quadraticCurveTo(16, -58, 26, -60); c.lineTo(30, -52); c.quadraticCurveTo(20, -46, 18, -32); c.closePath(); P('#2a0f0a', col, 1.5);
    B(); c.ellipse(32, -58, 12, 8, 0.15, 0, TAU); P('#2a0f0a', col, 1.6);
    B(); c.moveTo(26, -64); c.lineTo(18, -78); c.lineTo(31, -65); c.closePath(); P('#4a1a10', '#ffcf4d', 1);
    glowDot(35, -60, 2, '#ffd36b');
    if (Math.sin(t * 2) > 0.6) glowDot(46, -54, 3, col);
  },
  dknight(c, o, t) {
    const col = o.col, w = Math.sin(t * 3) * 2;
    B(); c.moveTo(-6, -64); c.quadraticCurveTo(-28 + w, -30, -22 + w, 0); c.lineTo(0, 0); c.closePath(); P('#14182e', col, 1.5);
    B(); c.rect(-10, -30, 8, 30); c.rect(3, -30, 8, 30); P('#1a1e34', col, 1);
    B(); c.moveTo(-13, -64); c.lineTo(13, -64); c.lineTo(10, -30); c.lineTo(-10, -30); c.closePath(); P('#1e2238', col, 1.8);
    B(); c.ellipse(-12, -62, 8, 5, -0.3, 0, TAU); c.ellipse(12, -62, 8, 5, 0.3, 0, TAU); P('#2a2f4a', col, 1.2);
    B(); c.rect(-7, -82, 16, 18); P('#1e2238', col, 1.6);
    c.fillStyle = col; c.fillRect(-1, -75, 10, 2.4); glowDot(4, -74, 2, col);
    c.strokeStyle = col; c.lineWidth = 2.4; B(); c.moveTo(0, -82); c.quadraticCurveTo(-14, -96, -22, -84); c.stroke();
    c.save(); c.strokeStyle = '#c8d0ff'; c.lineWidth = 5; if (!F.cheap) { c.shadowColor = col; c.shadowBlur = 12; }
    B(); c.moveTo(14, -36); c.lineTo(38, -96); c.stroke(); c.restore();
    c.strokeStyle = '#e8c27a'; c.lineWidth = 3; B(); c.moveTo(8, -40); c.lineTo(20, -34); c.stroke();
  },
  eye(c, o, t) {
    const col = o.col; c.translate(0, -8 + Math.sin(t * 2) * 4);
    c.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * (0.15 + i * 0.14), sw = Math.sin(t * 3 + i) * 8;
      c.strokeStyle = '#13261c'; c.lineWidth = 5; B(); c.moveTo(0, -30); c.quadraticCurveTo(Math.cos(a) * 24 + sw, -10, Math.cos(a) * 30 - sw, 6); c.stroke();
      c.strokeStyle = U.rgba(col, .6); c.lineWidth = 1; c.stroke();
    }
    B(); c.arc(0, -46, 24, 0, TAU); P('#e8f2ea', col, 2.2);
    const look = Math.sin(t * 0.8) * 3;
    B(); c.arc(6 + look, -46, 11, 0, TAU); P(col);
    c.fillStyle = '#000'; B(); c.ellipse(8 + look, -46, 3, 9, 0, 0, TAU); c.fill();
    for (let i = 0; i < 4; i++) {
      const a = t * 0.6 + i * TAU / 4, x = Math.cos(a) * 36, y = -46 + Math.sin(a) * 30;
      B(); c.arc(x, y, 5, 0, TAU); P('#e8f2ea', col, 1); c.fillStyle = col; B(); c.arc(x + 1, y, 2.4, 0, TAU); c.fill();
    }
  },
  general(c, o, t) {
    const col = o.col, w = Math.sin(t * 2.5) * 3;
    c.scale(1.15, 1.15);
    B(); c.moveTo(-10, -72); c.quadraticCurveTo(-38 + w, -36, -30 + w, 0); c.lineTo(4, 0); c.closePath(); P('#1a1208', col, 1.5);
    B(); c.rect(-13, -34, 11, 34); c.rect(4, -34, 11, 34); P('#2a2012', col, 1.2);
    B(); c.moveTo(-17, -74); c.lineTo(17, -74); c.lineTo(13, -34); c.lineTo(-13, -34); c.closePath(); P('#2a2012', col, 2);
    c.strokeStyle = U.rgba(col, .6); c.lineWidth = 1.2; B(); c.moveTo(-12, -60); c.lineTo(12, -60); c.moveTo(-10, -48); c.lineTo(10, -48); c.stroke();
    B(); c.ellipse(-16, -72, 11, 7, -0.3, 0, TAU); c.ellipse(16, -72, 11, 7, 0.3, 0, TAU); P('#3a2c18', col, 1.4);
    B(); c.rect(-9, -94, 20, 21); P('#2a2012', col, 1.6);
    B(); c.moveTo(-8, -90); c.quadraticCurveTo(-24, -96, -22, -114); c.quadraticCurveTo(-16, -100, -4, -94); c.closePath();
    c.moveTo(10, -90); c.quadraticCurveTo(26, -96, 24, -114); c.quadraticCurveTo(18, -100, 6, -94); c.closePath(); P('#3a2c18', '#e8c27a', 1.2);
    glowDot(2, -85, 2, col); glowDot(8, -85, 2, col);
    c.strokeStyle = '#4a3a22'; c.lineWidth = 4; B(); c.moveTo(18, -8); c.lineTo(30, -118); c.stroke();
    B(); c.moveTo(28, -112); c.quadraticCurveTo(56, -108, 52, -80); c.quadraticCurveTo(44, -94, 25, -90); c.closePath(); P('#d8c088', col, 1.6, 14);
  },
  siren(c, o, t) {
    const col = o.col; c.translate(0, -10 + Math.sin(t * 2.2) * 5);
    const w = Math.sin(t * 3) * 5;
    B(); c.moveTo(0, -72); c.quadraticCurveTo(-30, -60 + w, -34 + w, -24); c.quadraticCurveTo(-18, -40, -4, -46); c.closePath(); P(U.rgba(col, .75), col, 1);
    B(); c.moveTo(-6, -34); c.quadraticCurveTo(-12, -10, -2 + w * .4, 2); c.lineTo(-14, 8); c.lineTo(-6, 0); c.lineTo(6, 8); c.lineTo(2 + w * .4, -4); c.quadraticCurveTo(10, -14, 8, -34); c.closePath(); P('#3a1430', col, 1.6);
    B(); c.moveTo(-7, -34); c.lineTo(-6, -54); c.lineTo(7, -54); c.lineTo(8, -34); c.closePath(); P('#3a1430', col, 1.2);
    B(); c.arc(2, -62, 9, 0, TAU); P('#f4e4f0');
    B(); c.moveTo(-8, -62); c.quadraticCurveTo(-6, -76, 4, -74); c.quadraticCurveTo(14, -72, 11, -60); c.quadraticCurveTo(4, -68, -8, -62); c.closePath(); P(col);
    glowDot(6, -62, 1.3, '#fff');
    for (let i = 0; i < 3; i++) {
      const a = t * 1.4 + i * 2.1, x = Math.cos(a) * 30, y = -50 + Math.sin(a * 1.3) * 22;
      c.fillStyle = col; B(); c.ellipse(x, y, 3, 2.3, -0.4, 0, TAU); c.fill(); c.strokeStyle = col; c.lineWidth = 1.2; B(); c.moveTo(x + 2.6, y); c.lineTo(x + 2.6, y - 10); c.lineTo(x + 6, y - 8); c.stroke();
    }
  },
  void(c, o, t) {
    const col = o.col; c.translate(0, -6 + Math.sin(t * 1.5) * 4); c.scale(1.2, 1.2);
    c.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU + t * 0.3, sw = Math.sin(t * 2 + i) * 10;
      c.strokeStyle = '#120006'; c.lineWidth = 6; B(); c.moveTo(0, -50); c.quadraticCurveTo(Math.cos(a) * 40 + sw, -50 + Math.sin(a) * 40, Math.cos(a) * 58, -50 + Math.sin(a) * 52 + sw); c.stroke();
      c.strokeStyle = U.rgba(col, .5); c.lineWidth = 1; c.stroke();
    }
    c.save(); c.setLineDash([6, 8]); c.lineDashOffset = -t * 30; c.strokeStyle = U.rgba(col, .45); c.lineWidth = 1.5; B(); c.arc(0, -50, 46, 0, TAU); c.stroke(); c.restore();
    const g = c.createRadialGradient(-6, -58, 2, 0, -50, 32); g.addColorStop(0, '#3a0012'); g.addColorStop(1, '#050002');
    B(); c.arc(0, -50, 30, 0, TAU); c.fillStyle = F.flash > 0 ? '#fff' : g; c.fill(); c.strokeStyle = col; c.lineWidth = 2; if (!F.cheap) { c.shadowColor = col; c.shadowBlur = 16; } c.stroke(); c.shadowBlur = 0;
    B(); c.ellipse(4, -54, 15, 8 * (0.6 + 0.4 * Math.abs(Math.sin(t * 0.7))), 0, 0, TAU); P(col);
    c.fillStyle = '#000'; B(); c.ellipse(6, -54, 2.5, 7, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,230,235,.8)'; B(); for (let i = 0; i < 6; i++) { const x = -12 + i * 5; c.moveTo(x, -38); c.lineTo(x + 2.5, -33); c.lineTo(x + 5, -38); } c.fill();
  },
};

/* ---------- 人間（敵）共通 ---------- */
const HUMAN = {
  soldier: { armor: '#9aa6b8', cloth: '#35578a', helm: 'kettle', weapon: 'spear', shield: true },
  archer:  { armor: '#6e7a5a', cloth: '#3e5a32', helm: 'hood', weapon: 'bow' },
  knight:  { armor: '#dfe4ee', cloth: '#e8d28a', helm: 'plume', weapon: 'sword', shield: true },
  priest:  { armor: '#e8e4da', cloth: '#c9b26a', helm: 'halo', weapon: 'staff', robe: true },
  mage:    { armor: '#3a4a8a', cloth: '#2a3470', helm: 'hat', weapon: 'orb', robe: true },
  hunter:  { armor: '#6a5040', cloth: '#3a2a20', helm: 'band', weapon: 'crossbow' },
  captain: { armor: '#c8ccd8', cloth: '#a02030', helm: 'plume', weapon: 'sword', shield: true, cape: '#8a1a2a', s: 1.25 },
  gatekeeper: { armor: '#e8e0c8', cloth: '#d8b050', helm: 'great', weapon: 'greatsword', cape: '#c89a3a', s: 1.65 },
};
function human(c, o, t, p) {
  const rim = '#fff1c8', s = Math.sin(t * 4) * 1.5;
  if (p.s) c.scale(p.s, p.s);
  if (p.cape) { B(); c.moveTo(-6, -56); c.quadraticCurveTo(-24, -30, -18 + s, 0); c.lineTo(4, 0); c.closePath(); P(p.cape, rim, 1, 4); }
  if (p.robe) { B(); c.moveTo(-14, 0); c.lineTo(-9, -56); c.lineTo(9, -56); c.lineTo(15, 0); c.closePath(); P(p.cloth, rim, 1.4, 4); }
  else { c.fillStyle = F.flash > 0 ? '#fff' : '#3a3a44'; c.fillRect(-9, -28, 7, 28 + s); c.fillRect(3, -28, 7, 28 - s); }
  B(); c.moveTo(-10, -58); c.lineTo(10, -58); c.lineTo(9, -28); c.lineTo(-9, -28); c.closePath(); P(p.robe ? p.cloth : p.armor, rim, 1.4, 4);
  if (!p.robe) { c.fillStyle = p.cloth; c.fillRect(-9, -44, 18, 14); }
  B(); c.arc(2, -66, 8, 0, TAU); P('#e8cdb0');
  switch (p.helm) {
    case 'kettle': B(); c.arc(2, -68, 9, Math.PI, 0); c.lineTo(13, -67); c.lineTo(-9, -67); c.closePath(); P(p.armor, rim, 1); break;
    case 'hood': B(); c.moveTo(-8, -60); c.quadraticCurveTo(-10, -78, 2, -77); c.quadraticCurveTo(12, -76, 11, -66); c.lineTo(6, -70); c.quadraticCurveTo(0, -72, -2, -60); c.closePath(); P(p.cloth, rim, 1); break;
    case 'plume': B(); c.arc(2, -67, 9.5, 0, TAU); P(p.armor, rim, 1.2); c.fillStyle = '#222'; c.fillRect(3, -68, 9, 2.2);
      c.strokeStyle = p.cloth; c.lineWidth = 3; B(); c.moveTo(0, -76); c.quadraticCurveTo(-12, -86, -18, -74); c.stroke(); break;
    case 'halo': c.fillStyle = '#e8d8a8'; B(); c.arc(1, -69, 8, Math.PI, 0); c.fill();
      c.strokeStyle = '#ffe08a'; c.lineWidth = 1.6; if (!F.cheap) { c.shadowColor = '#ffe08a'; c.shadowBlur = 10; } B(); c.ellipse(2, -82, 9, 2.6, 0, 0, TAU); c.stroke(); c.shadowBlur = 0; break;
    case 'hat': B(); c.moveTo(-10, -68); c.lineTo(16, -68); c.lineTo(4, -96); c.lineTo(-4, -82); c.closePath(); P(p.cloth, rim, 1); break;
    case 'band': c.fillStyle = '#a02030'; c.fillRect(-6, -71, 16, 3); break;
    case 'great': B(); c.rect(-8, -80, 20, 20); P(p.armor, rim, 1.4); c.fillStyle = '#ffe08a'; c.fillRect(2, -72, 10, 2.5); glowDot(7, -71, 2, '#ffe08a'); break;
  }
  c.lineCap = 'round';
  switch (p.weapon) {
    case 'spear': c.strokeStyle = '#7a5a3a'; c.lineWidth = 2.4; B(); c.moveTo(10, -20); c.lineTo(22, -92); c.stroke(); B(); c.moveTo(20, -90); c.lineTo(23, -102); c.lineTo(26, -89); c.closePath(); P('#e8eef8', rim, 1, 4); break;
    case 'bow': c.strokeStyle = '#7a5a3a'; c.lineWidth = 2.4; B(); c.arc(10, -46, 16, -1.2, 1.2); c.stroke(); c.strokeStyle = '#ddd'; c.lineWidth = .8; B(); c.moveTo(10 + Math.cos(-1.2) * 16, -46 + Math.sin(-1.2) * 16); c.lineTo(10 + Math.cos(1.2) * 16, -46 + Math.sin(1.2) * 16); c.stroke(); break;
    case 'sword': c.save(); c.strokeStyle = '#f0f4ff'; c.lineWidth = 3; if (!F.cheap) { c.shadowColor = '#fff6c8'; c.shadowBlur = 8; } B(); c.moveTo(12, -42); c.lineTo(30, -76); c.stroke(); c.restore(); c.strokeStyle = '#c9a24a'; c.lineWidth = 2.4; B(); c.moveTo(8, -44); c.lineTo(16, -38); c.stroke(); break;
    case 'staff': c.strokeStyle = '#c9b26a'; c.lineWidth = 2.4; B(); c.moveTo(14, -6); c.lineTo(16, -84); c.stroke(); glowDot(16, -86, 3, '#ffe08a'); break;
    case 'orb': glowDot(16, -48, 4, '#7ab0ff'); break;
    case 'crossbow': c.strokeStyle = '#5a3a22'; c.lineWidth = 3; B(); c.moveTo(6, -44); c.lineTo(24, -46); c.stroke(); c.lineWidth = 2; B(); c.moveTo(20, -54); c.quadraticCurveTo(26, -46, 20, -38); c.stroke(); break;
    case 'greatsword': c.save(); c.strokeStyle = '#fff8e0'; c.lineWidth = 7; if (!F.cheap) { c.shadowColor = '#ffe08a'; c.shadowBlur = 14; } B(); c.moveTo(12, -36); c.lineTo(44, -112); c.stroke(); c.restore(); c.strokeStyle = '#c9a24a'; c.lineWidth = 3; B(); c.moveTo(6, -40); c.lineTo(20, -32); c.stroke(); break;
  }
  if (p.shield) {
    B(); c.moveTo(8, -50); c.lineTo(22, -50); c.lineTo(22, -34); c.quadraticCurveTo(15, -24, 8, -34); c.closePath(); P(p.armor, rim, 1.2, 5);
    c.strokeStyle = '#c9a24a'; c.lineWidth = 1.4; B(); c.arc(15, -40, 3.5, 0, TAU); c.stroke();
  }
}
Object.keys(HUMAN).forEach(k => { ARCH[k] = (c, o, t) => human(c, o, t, HUMAN[k]); });

/**
 * キャラ描画
 * o: { col, face(1|-1), t, flash, alpha, seed, cheap(影なし), shadow(bool) }
 */
const sprCache = {};
function spriteOf(key) {
  if (sprCache[key] !== undefined) return sprCache[key];
  const d = window.DEMON_SPRITES && window.DEMON_SPRITES[key];
  if (!d || !d.rows) return (sprCache[key] = null);
  const h = d.rows.length, w = Math.max(...d.rows.map(r => r.length));
  const mk = () => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };
  const img = mk(), white = mk(), a = img.getContext('2d'), b = white.getContext('2d');
  d.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const col = d.pal[row[x]]; if (col) { a.fillStyle = col; a.fillRect(x, y, 1, 1); b.fillStyle = '#ffffff'; b.fillRect(x, y, 1, 1); } } });
  return (sprCache[key] = { img, white, w, h });
}
function drawUnit(c, arch, x, y, s, o) {
  o = o || {};
  F = { c, flash: o.flash || 0, cheap: !!o.cheap };
  c.save();
  c.translate(x, y);
  c.globalAlpha = o.alpha == null ? 1 : o.alpha;
  if (o.shadow !== false) {
    c.fillStyle = 'rgba(0,0,0,.42)'; c.beginPath(); c.ellipse(0, 0, 26 * s, 7 * s, 0, 0, TAU); c.fill();
  }
  c.scale(s * (o.face || 1), s);
  // 採用済みの一般魔族：ドット絵（js/demon_sprites.js）を整数倍で描く
  const spr = spriteOf(arch);
  if (spr) {
    const k = 3, bob = Math.round(Math.sin(((o.t || 0) + (o.seed || 0)) * 3) * 1) * k, img = F.flash > 0 ? spr.white : spr.img;
    c.imageSmoothingEnabled = false;
    c.drawImage(img, Math.round(-spr.w * k / 2), -spr.h * k + bob, spr.w * k, spr.h * k);
    c.restore(); return;
  }
  const fn = ARCH[arch] || ARCH.blob;
  fn(c, { col: o.col || '#ff2a4a' }, (o.t || 0) + (o.seed || 0));
  c.restore();
}

/* ---------- 粒子 ---------- */
class Particles {
  constructor() { this.list = []; }
  add(p) {
    p.life = p.life || 1; p.age = 0; p.size = p.size || 3; p.vx = p.vx || 0; p.vy = p.vy || 0;
    p.drag = p.drag == null ? 0.96 : p.drag; p.g = p.g || 0; p.type = p.type || 'dot'; p.rot = p.rot || 0; p.vr = p.vr || 0;
    this.list.push(p); return p;
  }
  burst(x, y, n, col, opt) {
    opt = opt || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = U.rand(opt.min || 60, opt.max || 260);
      this.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 0), col, size: U.rand(opt.smin || 1.5, opt.smax || 4), life: U.rand(.35, opt.life || .9), type: opt.type || 'spark', g: opt.g || 0, drag: opt.drag });
    }
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]; p.age += dt;
      if (p.age >= p.life) { L.splice(i, 1); continue; }
      const d = Math.pow(p.drag, dt * 60);
      p.vx *= d; p.vy = p.vy * d + p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.tx != null) { p.x += (p.tx - p.x) * Math.min(1, dt * p.pull); p.y += (p.ty - p.y) * Math.min(1, dt * p.pull); }
    }
  }
  draw(c) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      const k = 1 - p.age / p.life;
      c.globalAlpha = Math.min(1, k * 1.4) * (p.a == null ? 1 : p.a);
      if (p.type === 'spark') {
        c.strokeStyle = p.col; c.lineWidth = p.size * k; c.lineCap = 'round';
        c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); c.stroke();
      } else if (p.type === 'ring') {
        const r = p.size + (p.grow || 140) * (p.age / p.life);
        c.strokeStyle = p.col; c.lineWidth = (p.lw || 3) * k; c.beginPath(); c.arc(p.x, p.y, r, 0, TAU); c.stroke();
      } else if (p.type === 'shard') {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.col; c.beginPath(); c.moveTo(0, -p.size * 1.6); c.lineTo(p.size * .7, 0); c.lineTo(0, p.size * 1.6); c.lineTo(-p.size * .7, 0); c.closePath(); c.fill(); c.restore();
      } else {
        const r = p.size * (p.shrink === false ? 1 : (0.4 + 0.6 * k));
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2.5);
        g.addColorStop(0, '#fff'); g.addColorStop(0.3, p.col); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, r * 2.5, 0, TAU); c.fill();
      }
    }
    c.restore();
  }
}

/* ---------- 魔法陣（フォント非依存の手描きルーン） ---------- */
const GLYPHS = (() => {
  const r = U.seeded(77), out = [];
  for (let i = 0; i < 40; i++) {
    const strokes = [];
    const n = 2 + ((r() * 3) | 0);
    for (let k = 0; k < n; k++) strokes.push([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() * 2 - 1, r() < .3]);
    out.push(strokes);
  }
  return out;
})();
function glyph(c, idx, x, y, s, rot) {
  const g = GLYPHS[idx % GLYPHS.length];
  c.save(); c.translate(x, y); c.rotate(rot);
  c.beginPath();
  for (const [a, b, d, e, arc] of g) {
    if (arc) { c.moveTo(a * s + s * .5, b * s); c.arc(a * s, b * s, s * .5, 0, TAU); }
    else { c.moveTo(a * s, b * s); c.lineTo(d * s, e * s); }
  }
  c.stroke(); c.restore();
}
function magicCircle(c, x, y, R, t, col, k) {
  k = k == null ? 1 : k;
  c.save(); c.translate(x, y);
  c.globalCompositeOperation = 'lighter';
  c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = 14 * k;
  c.globalAlpha = 0.35 + 0.5 * k;
  c.lineWidth = 2; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
  c.lineWidth = 1; c.beginPath(); c.arc(0, 0, R * 0.93, 0, TAU); c.stroke();
  c.beginPath(); c.arc(0, 0, R * 0.74, 0, TAU); c.stroke();
  c.beginPath(); c.arc(0, 0, R * 0.36, 0, TAU); c.stroke();
  // ルーン帯
  c.lineWidth = 1.3;
  c.save(); c.rotate(t * 0.25);
  const n = 28;
  for (let i = 0; i < n; i++) { const a = i / n * TAU; glyph(c, i * 7 + 3, Math.cos(a) * R * 0.835, Math.sin(a) * R * 0.835, R * 0.035, a + Math.PI / 2); }
  c.restore();
  // 六芒
  for (let s = 0; s < 2; s++) {
    c.save(); c.rotate((s ? -1 : 1) * t * 0.15 + s * Math.PI / 3);
    c.beginPath();
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU - Math.PI / 2; const px = Math.cos(a) * R * 0.74, py = Math.sin(a) * R * 0.74; i ? c.lineTo(px, py) : c.moveTo(px, py); }
    c.closePath(); c.stroke(); c.restore();
  }
  // 小円
  c.save(); c.rotate(-t * 0.4);
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.beginPath(); c.arc(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, R * 0.06, 0, TAU); c.stroke(); }
  c.restore();
  // 内側ルーン
  c.save(); c.rotate(-t * 0.5);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; glyph(c, i * 3 + 1, Math.cos(a) * R * 0.3, Math.sin(a) * R * 0.3, R * 0.025, a); }
  c.restore();
  c.restore();
}

/* ---------- 魔核（砕けた結晶） ---------- */
function core(c, x, y, s, t, col, crack, pulse) {
  pulse = pulse || 0;
  const pts = [[0, -1.45], [0.72, -0.42], [0.52, 0.92], [0, 1.32], [-0.52, 0.92], [-0.72, -0.42]];
  const cx = 0, cy = -0.1;
  c.save(); c.translate(x, y); c.scale(s, s);
  // 外光
  c.save(); c.globalCompositeOperation = 'lighter';
  const g = c.createRadialGradient(0, 0, 0.1, 0, 0, 2.6 + pulse);
  g.addColorStop(0, U.rgba(col, .55 + pulse * .3)); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 2.6 + pulse, 0, TAU); c.fill(); c.restore();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const lum = 0.25 + 0.55 * ((Math.sin(i * 1.7 + t * 1.3) + 1) / 2);
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.closePath();
    c.fillStyle = `rgba(${40 + lum * 60},${10 + lum * 20},${30 + lum * 50},0.96)`; c.fill();
    c.fillStyle = U.rgba(col, 0.15 + lum * 0.35); c.fill();
  }
  c.strokeStyle = U.rgba(col, .9); c.lineWidth = 0.035; c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.stroke();
  if (crack > 0) {
    c.save(); c.globalCompositeOperation = 'lighter';
    c.strokeStyle = '#fff'; c.shadowColor = col; c.shadowBlur = 20; c.lineWidth = 0.03 + crack * 0.04;
    c.beginPath();
    c.moveTo(-0.1, -1.2); c.lineTo(0.08, -0.6); c.lineTo(-0.12, -0.2); c.lineTo(0.14, 0.3); c.lineTo(0.02, 0.9);
    c.moveTo(0.08, -0.6); c.lineTo(0.42, -0.35);
    c.moveTo(-0.12, -0.2); c.lineTo(-0.48, 0.1);
    if (crack > 0.5) { c.moveTo(0.14, 0.3); c.lineTo(0.42, 0.6); c.moveTo(-0.3, -0.7); c.lineTo(-0.1, -0.5); }
    c.stroke(); c.restore();
  }
  c.restore();
}

/* ---------- 吹き出し（ワールド） ---------- */
function bubble(c, x, y, text, alpha, col) {
  c.save(); c.globalAlpha = alpha;
  c.font = '600 13px "Zen Kaku Gothic New", "Yu Gothic UI", sans-serif';
  const maxW = 220, lines = [];
  let cur = '';
  for (const ch of text) { if (c.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch; }
  if (cur) lines.push(cur);
  const w = Math.min(maxW, Math.max(...lines.map(l => c.measureText(l).width))) + 22, h = lines.length * 18 + 14;
  const bx = x - w / 2, by = y - h - 12;
  c.fillStyle = 'rgba(14,8,20,.9)'; c.strokeStyle = col || 'rgba(232,194,122,.7)'; c.lineWidth = 1.2;
  c.beginPath(); c.roundRect ? c.roundRect(bx, by, w, h, 8) : c.rect(bx, by, w, h); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(x - 6, by + h); c.lineTo(x, by + h + 9); c.lineTo(x + 6, by + h); c.closePath(); c.fill();
  c.fillStyle = '#f2e8f8'; c.textBaseline = 'top';
  lines.forEach((l, i) => c.fillText(l, bx + 11, by + 8 + i * 18));
  c.restore();
}

return { U, TAU, drawUnit, spriteOf, Particles, magicCircle, core, bubble, glowDotOn(c, x, y, r, col) { F = { c, flash: 0 }; glowDot(x, y, r, col); }, ARCH };
})();
