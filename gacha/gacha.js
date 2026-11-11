// =====================================================================
// 召魂の儀 試作 — 「魔王が鎖を"引く"」ガチャ
//   ワールド 320×180（ドット）＋ UI 640×360 を1枚のキャンバスに合成（録画可）
//   エフェクト：PixelFX（MIT）を実時間で使用し、レア度ごとにパレットを差し替え
// =====================================================================
import { createFrame, clearFrame, createFx, composite } from '../vendor/pixelfx/src/core/index.js';
import * as implosion from '../vendor/pixelfx/src/fx/explosions/implosion.js';
import * as sunburst from '../vendor/pixelfx/src/fx/holy/sunburst.js';
import * as firework from '../vendor/pixelfx/src/fx/explosions/firework-burst.js';
import * as collect from '../vendor/pixelfx/src/fx/pickups/collect-burst.js';
import * as portal from '../vendor/pixelfx/src/fx/spawn/spawn-portal.js';
import { rollRarities } from './lottery.js';
import { createSound } from './sfx.js';
const snd = createSound();
// 本体に埋め込むとき（?embed=1）：抽選と魂晶の消費は本体が行い、ここは演出だけを担当する
const EMBED = new URLSearchParams(location.search).has('embed');
let EM = null;
if (EMBED) document.documentElement.classList.add('embed');
// ガチャ試遊版（GitHub Pages で公開する単独版。index.html で window.GACHA_DEMO = true）
//   ・無制限試遊モード：魂晶の所持数で制限しない・減らさない（本編の魂晶の消費ルールは変えない。EMBED のときは使わない）
//   ・開発用の機能（レア度の強制・魂晶を増やす・録画・テストの窓）は出さない
//   ・召魂の記録だけを localStorage に保存する（外部には送らない）
const DEMO = !EMBED && !!window.GACHA_DEMO;
if (DEMO) document.documentElement.classList.add('demo');
const SAVE_KEY = 'dopagaki-gacha-demo-v1';

const VW = 320, VH = 180, UW = 640, UH = 360;
// 4:3：舞台（320×180）の上に空を 60 ドット足して 320×240 にする（演出の座標はそのまま）。UI は 640×480
const SKY = 60, OH = VH + SKY;
const rand = (a, b) => a + Math.random() * (b - a), pick = a => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const ease = t => 1 - Math.pow(1 - t, 3);

/* ---------------- レア度 ---------------- */
const ORDER = ['N', 'R', 'SR', 'SSR', 'UR'];
const RANK = r => ORDER.indexOf(r);
const RAR = {
  N:   { name: '下級魔族', col: '#a3acc0', rate: .52, ramp: ['#0b0d14', '#1c2230', '#2f3a50', '#4d5a78', '#7d8aa8', '#b8c2d8', '#ffffff'], chain: ['#1a1a22', '#4a4a58', '#8a8a9a'], pull: .7, size: 34 },
  R:   { name: '中級魔族', col: '#55aaff', rate: .30, ramp: ['#06101e', '#0c2444', '#14407a', '#2a6cc0', '#5aa0f0', '#a8d4ff', '#ffffff'], chain: ['#0c1a30', '#2a5a9a', '#7ab8ff'], pull: .9, size: 38 },
  SR:  { name: '上級魔族', col: '#bb77ff', rate: .13, ramp: ['#140a24', '#2c1250', '#4b1d86', '#7330c0', '#a050f0', '#c890ff', '#ffffff'], chain: ['#1e0c38', '#6a2ab0', '#d0a0ff'], pull: 1.4, size: 46 },
  SSR: { name: '魔将', col: '#ffc94d', rate: .045, ramp: ['#2a1404', '#5a3008', '#8a5410', '#c88a1c', '#f0c040', '#ffe890', '#ffffff'], chain: ['#3a2006', '#c88a1c', '#fff0a0'], pull: 2.1, size: 58 },
  UR:  { name: '災厄級', col: '#ff3d6a', rate: .005, ramp: ['#1a0206', '#40060e', '#780c1c', '#c01830', '#ff3d5a', '#ffa0b0', '#ffffff'], chain: ['#200006', '#c01830', '#ffb0c0'], pull: 2.8, size: 68 },
  UNK: { name: '？', col: '#a89ab8', ramp: ['#0c0a12', '#1c1826', '#2e2a3c', '#4a4460', '#7a7094', '#b8b0cc', '#ffffff'], chain: ['#1a1622', '#5a5070', '#b8b0cc'], pull: 1.2, size: 0 },
  SOUL: { name: '？？？', col: '#9fe4ff', ramp: ['#04121c', '#0a2a40', '#145070', '#2a88b0', '#5ec8f0', '#bfeeff', '#ffffff'], chain: ['#0a2a40', '#5ec8f0', '#ffffff'], pull: 3.4, size: 0 },
};
const PITY = 90;

/* ---------------- 状態 ---------------- */
const S = {
  shards: 60, pulls: 0, sinceSSR: 0, roster: {}, mood: 0, streakLow: 0, first: false, unlimited: DEMO, byRarity: { N: 0, R: 0, SR: 0, SSR: 0, UR: 0 }, lastKeys: [],
  force: '', mode: 'full', busy: false, skip: false, ff: false, view: 'stage',
};

/* ---------------- キャンバス ---------------- */
const world = mk(VW, VH), wc = world.getContext('2d');
const ui = mk(UW, UH), uc = ui.getContext('2d');
const fxBackCv = mk(VW, VH), fxFrontCv = mk(VW, VH);
const out = document.getElementById('out'), oc = out.getContext('2d');
const frameBack = createFrame(VW, VH), frameFront = createFrame(VW, VH);
const imgBack = new ImageData(VW, VH), imgFront = new ImageData(VW, VH);
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
let scale = 3;
const skyCv = mk(VW, SKY), topUI = mk(UW, SKY * 2), tuc = topUI.getContext('2d');
function layout() {
  // 4:3（320×240）。埋め込み時は本体の 4:3 の舞台いっぱいに描く（1024×768 なら 3.2 倍）。単独のときは整数倍
  if (DEMO) { const st = document.getElementById('stage'), aw = st ? st.clientWidth : innerWidth, ah = st ? st.clientHeight : innerHeight, k = Math.max(.5, Math.min(aw / VW, ah / OH)); scale = Math.min(4, Math.max(2, Math.ceil(k))); out.width = VW * scale; out.height = OH * scale; out.style.width = Math.floor(VW * k) + 'px'; out.style.height = Math.floor(OH * k) + 'px'; return; }
  const avW = innerWidth - (EMBED ? 0 : 8), avH = innerHeight - (EMBED ? 0 : 60);
  const k = Math.min(avW / VW, avH / OH);
  scale = EMBED ? Math.max(1, k) : Math.max(1, Math.floor(k));
  out.width = Math.round(VW * scale); out.height = Math.round(OH * scale);
}
addEventListener('resize', layout); layout();

/* ---------------- ドット：魔王（探索用スプライトを流用） ---------------- */
const PAL = {
  k: '#0d0812', n: '#9a8a7e', N: '#e6dcc8', h: '#1d0f26', H: '#4a2a5e', s: '#efe4f4', S: '#b8a6cc', E: '#ff2a4a',
  G: '#a07a32', g: '#e8c27a', D: '#2c1a3a', d: '#170c20', R: '#a01834', r: '#5a0f22', Y: '#ffd36b', W: '#ffffff', B: '#6fd0ff',
  V: '#b07cff', p: '#c0607a', q: '#24143a', Q: '#4a2a72', A: '#cbb8f2', a: '#8a74c8',
};
const MAOU = [
  '..N...................', '..nN..................', '...nN.............N...', '...nn............nN...', '....nn..kkkkkk..nn....',
  '.....nkkhhhhhhkkn.....', '.....khhhhhhhhhhk.....', '....khhHhhhhhhHhhk....', '....khhhhhhhhhhhhk....', '....khhshhhhhhshhk....',
  '....khhsshhhhsshhk....', '....khsssssssssshk....', '....khsEEssssEEshk....', '....khssssSSsssshk....', '.....khSssssssShk.....',
  '......kkSSSSSSkk......', '...kkGgDkSSSSkDgGkk...', '..kDDGgDDkSSkDDgGDDk..', '.kdDDGDDRrEErRDDGDDdk.', '.kdDDGDDRrrrrRDDGDDdk.',
  'kddDDGDDRrrrrRDDGDDddk', 'kddDDgDDRrrrrRDDgDDddk', 'kddDDDDRrrrrrrRDDDDddk', 'kddDDDDRrrrrrrRDDDDddk', 'kdddDDDRrrrrrrRDDDdddk',
  'kdddDDDRrrrrrrRDDDdddk', 'kdddDDRrrrrrrrrRDDdddk', 'kdddDDRrrrrrrrrRDDdddk', 'kddddDRrrrrrrrrRDddddk', 'kddddDRrrrrrrrrRDddddk',
  'kgddddRrrrrrrrrRddddgk', 'kGgggggRrrrrrrRgggggGk', '.kkkkkkkkkkkkkkkkkkkk.', '......kk......kk......',
];
// 表情：目(行12・列7-8/13-14)、眉(行11)、口(行13-14・列9-12)
const FACES = {
  normal: [],
  expect: [[12, 7, 'Y'], [12, 8, 'W'], [12, 13, 'Y'], [12, 14, 'W'], [13, 10, 'r'], [13, 11, 'r']],
  joy: [[12, 7, 'k'], [11, 8, 'k'], [12, 8, 's'], [12, 13, 's'], [11, 13, 'k'], [12, 14, 'k'], [13, 9, 'k'], [13, 10, 'R'], [13, 11, 'R'], [13, 12, 'k'], [14, 10, 'k'], [14, 11, 'k']],
  cocky: [[12, 7, 'k'], [12, 8, 'k'], [11, 7, 's'], [13, 10, 's'], [13, 11, 'k'], [13, 12, 'k'], [12, 12, 's'], [14, 12, 'W']],
  sad: [[12, 7, 'S'], [12, 8, 'k'], [12, 13, 'k'], [12, 14, 'S'], [11, 7, 'k'], [11, 14, 'k'], [13, 10, 'k'], [13, 11, 'k'], [14, 9, 'k'], [14, 12, 'k']],
  shock: [[11, 7, 'W'], [11, 8, 'E'], [11, 13, 'E'], [11, 14, 'W'], [13, 10, 'k'], [13, 11, 'k'], [14, 10, 'k'], [14, 11, 'k']],
  strain: [[12, 7, 'k'], [12, 8, 'E'], [12, 13, 'E'], [12, 14, 'k'], [13, 9, 'W'], [13, 10, 'W'], [13, 11, 'W'], [13, 12, 'W'], [14, 9, 'k'], [14, 12, 'k']],
};
function spriteFrom(rows, pal) {
  const w = Math.max(...rows.map(r => r.length)), c = mk(w, rows.length), x = c.getContext('2d');
  rows.forEach((row, y) => { const off = (w - row.length) >> 1; for (let i = 0; i < row.length; i++) { const col = pal[row[i]]; if (col) { x.fillStyle = col; x.fillRect(off + i, y, 1, 1); } } });
  return c;
}
const MAOU_SPR = {};
for (const f in FACES) {
  const rows = MAOU.map(r => r.split(''));
  FACES[f].forEach(([y, x, ch]) => { rows[y][x] = ch; });
  MAOU_SPR[f] = spriteFrom(rows.map(r => r.join('')), PAL);
}
const VERM = spriteFrom([
  '..gg..........gg..', '.g..g.kkkkkk.g..g.', '.g.gkkAAAAAAkkg.g.', '..gkAAAaaaaAAAkg..', '...kAAaaaaaaaAAk..', '..kAAassssssaAAk..',
  '..kAasssssssssaAk.', '..kAasVkssskVsaAk.', '..kAassssssssaAk..', '..kAAasssppsssaAAk', '..kAAAassssssaAAAk', '..kAAAkkSSSSkkAAAk',
  '.kAAAkqgSSSSgqkAAAk', '.kAAkqqqgYYgqqqkAAk', '.kAAkqQqqqqqqqQqkAAk', '.kAkqQqqqqqqqqqQqkAk', '.kakqQqqqqqqqqqQqkak', '..kkqQqqqqqqqqqQqkk.',
  '..kqQqqqqqqqqqqqQqk.', '..kqQqqqqqqqqqqqQqk.', '.kqQqqqqqqqqqqqqqQqk', '.kqQqqqqqqqqqqqqqQqk', 'kqQqqqqqqqqqqqqqqqQqk', 'kqQqqqqqqqqqqqqqqqQqk',
  'kgggggggggggggggggggk', '.kkkkkkkkkkkkkkkkkkk.',
], PAL);

/* ---------------- ドット：魔族（v0.1のベクター→自動ドット化） ----------------
   旧試作のベクター描画を高解像度で描き、ボックス縮小・共通パレット化・1px外線で
   ドットに変換する。サイズ（レア度ほど大きい）を変えて何度でも生成できる。 */
const QPAL = ['#0d0812', '#1d0f26', '#2c1a3a', '#4a2a5e', '#24143a', '#4a2a72', '#7a4ab0', '#b07cff', '#e0c8ff', '#5a0f22', '#a01834', '#ff2a4a', '#ff8a9c',
  '#3a2006', '#a07a32', '#e8c27a', '#ffe890', '#7a3a10', '#ff6a2a', '#ffb070', '#0c1a30', '#2a5a9a', '#55aaff', '#bfe9ff', '#0a2a28', '#1f5a4a', '#2ac4a0', '#6dffc8',
  '#e9fff8', '#1a1a22', '#3a3a48', '#6a6a7a', '#a3acc0', '#d8dce8', '#ffffff', '#3a2a22', '#6e4630', '#c9b8a0', '#efe4f4', '#b8a6cc'].map(h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
function nearest(r, g, b) { let bi = 0, bd = 1e9; for (let i = 0; i < QPAL.length; i++) { const p = QPAL[i], d = (p[0] - r) ** 2 * .3 + (p[1] - g) ** 2 * .59 + (p[2] - b) ** 2 * .11; if (d < bd) { bd = d; bi = i; } } return QPAL[bi]; }
const pixCache = {};
function pixelize(key, H) {
  const id = key + ':' + H; if (pixCache[id]) return pixCache[id];
  const ds = window.DEMON_SPRITES && window.DEMON_SPRITES[key];
  if (ds && ds.rows) {
    const h0 = ds.rows.length, w0 = Math.max(...ds.rows.map(r => r.length)), k = Math.max(1, Math.round(H / h0));
    const c = mk(w0 * k, h0 * k), cx = c.getContext('2d');
    ds.rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const col = ds.pal[row[x]]; if (col) { cx.fillStyle = col; cx.fillRect(x * k, y * k, k, k); } } });
    const sil = mk(c.width, c.height), sx = sil.getContext('2d'); sx.drawImage(c, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#0d0812'; sx.fillRect(0, 0, c.width, c.height);
    return (pixCache[id] = { img: c, sil, w: c.width, h: c.height });
  }
  const def = D.DEMONS[key], big = mk(420, 420), b = big.getContext('2d');
  FX.drawUnit(b, def.arch, 210, 380, 2.2, { col: def.col, t: .6, shadow: false, face: 1, cheap: true });
  const src = b.getImageData(0, 0, 420, 420).data;
  let x0 = 420, y0 = 420, x1 = 0, y1 = 0;
  for (let y = 0; y < 420; y++) for (let x = 0; x < 420; x++) if (src[(y * 420 + x) * 4 + 3] > 60) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const k = (y1 - y0 + 1) / (H - 2), W = Math.ceil((x1 - x0 + 1) / k) + 2;
  const c = mk(W, H), cx = c.getContext('2d'), img = cx.createImageData(W, H), dd = img.data;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    let r = 0, g = 0, bl = 0, a = 0, n = 0;
    const sx0 = x0 + (x - 1) * k, sy0 = y0 + (y - 1) * k;
    for (let sy = Math.floor(sy0); sy < sy0 + k; sy++) for (let sx = Math.floor(sx0); sx < sx0 + k; sx++) {
      if (sx < 0 || sy < 0 || sx >= 420 || sy >= 420) continue;
      const i = (sy * 420 + sx) * 4, al = src[i + 3]; r += src[i] * al; g += src[i + 1] * al; bl += src[i + 2] * al; a += al; n++;
    }
    if (!n || a / (255 * n) < .45) continue;
    const q = nearest(r / a, g / a, bl / a), j = (y * W + x) * 4;
    dd[j] = q[0]; dd[j + 1] = q[1]; dd[j + 2] = q[2]; dd[j + 3] = 255;
  }
  // 外線
  const op = i => dd[i * 4 + 3] === 255 && !(dd[i * 4] === 13 && dd[i * 4 + 1] === 8);
  const ol = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (dd[i * 4 + 3]) continue; if ((x > 0 && op(i - 1)) || (x < W - 1 && op(i + 1)) || (y > 0 && op(i - W)) || (y < H - 1 && op(i + W))) ol.push(i); }
  ol.forEach(i => { dd[i * 4] = 13; dd[i * 4 + 1] = 8; dd[i * 4 + 2] = 18; dd[i * 4 + 3] = 255; });
  cx.putImageData(img, 0, 0);
  const sil = mk(W, H), sx = sil.getContext('2d'); sx.drawImage(c, 0, 0); sx.globalCompositeOperation = 'source-in'; sx.fillStyle = '#0d0812'; sx.fillRect(0, 0, W, H);
  return (pixCache[id] = { img: c, sil, w: W, h: H, data: dd });
}

/* ---------------- 背景（事前描画） ---------------- */
const PX = 196, PY = 126, PRX = 60, PRY = 18;   // 召魂の淵
const MX = 84, MY = 156;                         // 魔王の立ち位置（足元）
const bg = mk(VW, VH);
(function buildBg() {
  // 場所を特定しない「召魂の間合い」：戦場から暗転して入る、儀式のための空間（玉座の間・室内には見せない）
  const c = bg.getContext('2d');
  const R = (() => { let s = 9; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  // 虚空：上から下へ、段階的な色帯をディザでつなぐ
  const bands = ['#05030a', '#0a0612', '#100a1c', '#160d26', '#1c1030', '#22123a', '#1a0e2c', '#120a20'];
  const bandAt = y => Math.min(bands.length - 1, Math.floor(y / VH * bands.length * 1.15));
  for (let y = 0; y < VH; y++) {
    const f = (y / VH * bands.length * 1.15) % 1, i = bandAt(y), j = Math.min(bands.length - 1, i + 1);
    for (let x = 0; x < VW; x++) px(x, y, 1, 1, BAY[(y % 4) * 4 + (x % 4)] / 16 < f ? bands[j] : bands[i]);
  }
  // 遠い魂の光（星のような点。色は紫と青と金をわずかに）
  for (let i = 0; i < 90; i++) { const x = (R() * VW) | 0, y = (R() * 96) | 0, k = R(); px(x, y, 1, 1, k < .6 ? '#3a2a5a' : k < .85 ? '#5a4a8a' : k < .95 ? '#8a7ac8' : '#e8c27a'); }
  // 空に浮かぶ、大きな魔法円の残光（淵の真上・欠けた円とルーン）
  const cx0 = PX, cy0 = 40, Rr = 58;
  for (let a = 0; a < Math.PI * 2; a += .012) { if (Math.sin(a * 3) > .82) continue; const x = cx0 + Math.cos(a) * Rr, y = cy0 + Math.sin(a) * Rr * .34; px(Math.round(x), Math.round(y), 1, 1, '#2e1f4a'); }
  for (let a = 0; a < Math.PI * 2; a += .018) { const x = cx0 + Math.cos(a) * (Rr - 9), y = cy0 + Math.sin(a) * (Rr - 9) * .34; px(Math.round(x), Math.round(y), 1, 1, '#24183c'); }
  for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2, x = Math.round(cx0 + Math.cos(a) * (Rr - 4.5)), y = Math.round(cy0 + Math.sin(a) * (Rr - 4.5) * .34); px(x - 1, y - 1, 3, 1, '#3a2a5e'); px(x, y - 1, 1, 3, '#3a2a5e'); if (k % 3 === 0) px(x - 1, y + 1, 3, 1, '#4a3a72'); }
  // 浮かぶ岩のかけら（遠くは小さく暗く、近くは大きく）
  const rock = (x, y, w, h, near) => { const d = near ? '#2a1f38' : '#1a1228', l = near ? '#4a3e5c' : '#2a2038', o = '#0a0610'; px(x - 1, y - 1, w + 2, h + 2, o); px(x, y, w, h, d); px(x, y, w, 1, l); px(x + 1, y + h, Math.max(1, w - 2), 1, o); for (let i = 0; i < w; i += 3) px(x + i, y + h + 1 + (i % 2), 1, 1, near ? '#1a1228' : '#120c1c'); };
  [[18, 30, 9, 4, 0], [64, 18, 5, 3, 0], [262, 26, 8, 4, 0], [296, 52, 6, 3, 0], [120, 62, 4, 2, 0], [236, 70, 5, 3, 0], [8, 74, 14, 6, 1], [290, 86, 16, 7, 1]].forEach(([x, y, w, h, n]) => rock(x, y, w, h, n));
  // 霧の層（地平）
  for (let y = 84; y < 104; y++) for (let x = 0; x < VW; x++) { const k = 1 - Math.abs(y - 94) / 10; if (BAY[(y % 4) * 4 + (x % 4)] / 16 < k * .55) px(x, y, 1, 1, '#2a1a3e'); }
  // 足場：虚空に浮く、円い石の舞台（縁は霧に溶ける）
  const SX = 160, SY = 150, SRX = 168, SRY = 42;
  for (let y = 100; y < VH; y++) for (let x = 0; x < VW; x++) {
    const e = ((x - SX) / SRX) ** 2 + ((y - SY) / SRY) ** 2;
    if (e > 1.15) continue;
    const t = BAY[(y % 4) * 4 + (x % 4)] / 16;
    if (e > 1) { if (t < (1.15 - e) * 4) px(x, y, 1, 1, '#140e20'); continue; }
    px(x, y, 1, 1, e > .82 ? (t < .5 ? '#161022' : '#1a1328') : ((Math.floor(x / 12) + Math.floor(y / 6)) % 2 ? '#1c1528' : '#1f172c'));
  }
  // 石の継ぎ目（同心円の溝）
  for (let rr = .45; rr <= .9; rr += .22) for (let a = 0; a < Math.PI * 2; a += .02) { const x = SX + Math.cos(a) * SRX * rr, y = SY + Math.sin(a) * SRY * rr; if (y > 104) px(Math.round(x), Math.round(y), 1, 1, '#120c1c'); }
  for (let i = 0; i < 26; i++) { const x = (R() * VW) | 0, y = 120 + (R() * 56) | 0; if (((x - SX) / SRX) ** 2 + ((y - SY) / SRY) ** 2 < .9) { px(x, y, 2, 1, '#0a0610'); px(x, y - 1, 1, 1, '#2a2038'); } }
  // 淵の縁石と魔法陣の溝
  for (let a = 0; a < Math.PI * 2; a += .06) { const x = PX + Math.cos(a) * (PRX + 22), y = PY + Math.sin(a) * (PRY + 8); px(Math.round(x), Math.round(y), 1, 1, '#2a1f38'); }
  for (let a = 0; a < Math.PI * 2; a += .09) {
    const x = PX + Math.cos(a) * (PRX + 4), y = PY + Math.sin(a) * (PRY + 2);
    px(Math.round(x) - 2, Math.round(y) - 1, 5, 3, '#0a0610'); px(Math.round(x) - 1, Math.round(y) - 1, 3, 2, a > Math.PI ? '#3a3048' : '#4a3e5c');
  }
  // 淵の中
  for (let y = -PRY; y <= PRY; y++) { const w = Math.sqrt(1 - (y / PRY) ** 2) * PRX; px(Math.round(PX - w), PY + y, Math.round(w * 2), 1, y < -PRY * .3 ? '#05020a' : '#08040e'); }
})();

// 4:3 の上の空（舞台の虚空の続き：上ほど暗く、遠い光の点と、淵の真上の大きな円の残光）
(function buildSky() {
  const c = skyCv.getContext('2d');
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x, y, w, h); };
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  const bands = ['#020106', '#030208', '#04020a', '#05030a'];
  for (let y = 0; y < SKY; y++) { const f = y / SKY * bands.length, i = Math.min(bands.length - 1, f | 0), j = Math.min(bands.length - 1, i + 1); for (let x = 0; x < VW; x++) px(x, y, 1, 1, BAY[(y % 4) * 4 + (x % 4)] / 16 < f % 1 ? bands[j] : bands[i]); }
  let sd = 21; const R = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 70; i++) { const x = (R() * VW) | 0, y = (R() * SKY) | 0, k = R(); px(x, y, 1, 1, k < .65 ? '#2a1e44' : k < .9 ? '#4a3a7a' : k < .97 ? '#7a6ab8' : '#c8a860'); }
  for (let a = 0; a < Math.PI * 2; a += .01) { if (Math.sin(a * 5) > .7) continue; const x = PX + Math.cos(a) * 96, y = SKY + 12 + Math.sin(a) * 30; if (y < SKY) px(Math.round(x), Math.round(y), 1, 1, '#1e1532'); }
})();

/* ---------------- 演出オブジェクト ---------------- */
let T = 0;
const fxs = [];                  // { fx, layer }
const parts = [];                // ピクセル粒子
const shards = [];               // 投げ込む魂晶
let chains = [];                 // { tier, rise, ax, ay, glow }
let souls = [];                  // 飛ぶ魂
let shake = 0, flashA = 0, flashCol = '#ffffff', pitGlow = 0, pitCol = RAR.N.ramp[4], omen = null;
const M = { pose: 'idle', face: 'normal', lean: 0, jump: 0, x: MX, drag: 0, gray: 0 };
let bubble = null;               // { who, text, t, life }
let reveal = null;               // { key, r, t, phase, res }
let banner = null;
let grid = null;                 // 10連のカード
let single = null;               // 単発の結果
let fuseList = [];

function addFx(mod, o, layer = 'front') { const f = createFx(mod, o); fxs.push({ f, layer }); return f; }
function burstPx(x, y, n, cols, sp = 60, life = .7, g = 60) { for (let i = 0; i < n; i++) { const a = rand(0, 6.28), v = rand(sp * .3, sp); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - sp * .3, life, age: 0, col: pick(cols), g }); } }
function say(who, text, face, life) { const plain = text.replace(/\[\/?\w\]/g, ''); if (DEMO) { const el = document.getElementById('line'); if (el) el.innerHTML = `<b>${who === 'verm' ? 'ヴァルメリア' : '魔王'}</b>${plain.replace(/[<>&]/g, '')}`; } bubble = { who, text, plain, len: plain.length, shown: 0, t: 0, life: (life || 2.6 + text.length * .06) + plain.length / 30 * .5 }; if (face && who === 'maou') M.face = face; }

/* ---------------- 待機（速度・スキップ対応） ---------------- */
const waits = [], timers = [];
function later(s, fn) { timers.push({ s, fn }); }
function wait(s, tag) {
  return new Promise(res => waits.push({ s, res, tag }));
}
function tickWaits(dt) {
  for (let i = timers.length - 1; i >= 0; i--) { timers[i].s -= dt; if (timers[i].s <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
  const k = S.mode === 'fast' || S.ff ? 2.6 : 1;
  for (let i = waits.length - 1; i >= 0; i--) {
    const w = waits[i];
    if (w.tag === 'win') { w.s -= dt; if (w.s <= 0) { waits.splice(i, 1); w.res(); } continue; } // 止められる時間：スキップ・早送りで縮めない
    if (S.skip && w.tag !== 'hold') w.s = 0;
    if (S.skip && w.tag === 'hold') w.s = Math.min(w.s, .9);
    w.s -= dt * k;
    if (w.s <= 0) { waits.splice(i, 1); w.res(); }
  }
}

/* ---------------- 抽選 ---------------- */
function rollRarity() { const x = Math.random(); let a = 0; for (const k of ['UR', 'SSR', 'SR', 'R', 'N']) { a += RAR[k].rate; if (x < a) return k; } return 'N'; }
function keyOf(r) { return pick(Object.keys(D.DEMONS).filter(k => D.DEMONS[k].r === r)); }
function roll(n) {
  const st = { pulls: S.pulls, sinceSSR: S.sinceSSR, byRarity: S.byRarity };
  const rs = rollRarities(st, n, { force: DEMO ? '' : S.force }); // 試遊版ではレア度の強制はしない
  S.sinceSSR = st.sinceSSR; S.byRarity = st.byRarity; // 召魂の回数（S.pulls）は pull() が数える
  return rs.map(r => {
    // 重複は自動では強化しない。所持数が増え、「同種融合」（編成画面で行う別機能・仮）の素材になる
    const key = keyOf(r), have = S.roster[key];
    if (have) have.n++; else S.roster[key] = { n: 1, at: S.pulls };
    return { key, r, isNew: !have, count: S.roster[key].n };
  });
}
// 鎖の「見かけのレア度」：高レアは低く見せてから昇格させることがある
function hintOf(r) {
  const k = RANK(r);
  if (k === 4) return Math.random() < .7 ? 'SSR' : 'SR';
  if (k === 3) return Math.random() < .45 ? 'SR' : 'SSR';
  if (k === 2) return Math.random() < .25 ? 'R' : 'SR';
  return r;
}

/* ---------------- 魔王の台詞 ---------------- */
const LINE = {
  pre1: { 0: ['こい……こい……！', 'いくぞ。……ひくぞ。', '[g]魂晶[/g] ひとつ。いのりを こめて……'], up: ['ふはは！ きょうの われは もっておる！', 'みておれ、また でるぞ！'], down: ['……ひく。ひくしか ないのだ……', 'つぎこそ……つぎこそは……'] },
  pre10: { 0: ['[g]十連[/g]だ……！ こころして みよ！', 'いっきに ひきあげる！'], up: ['ふはははは！ ぜんぶ まとめて こい！'], down: ['じゅうれん……これで だめなら……'] },
  heavy: ['……む!? おもい……!?', 'な、なんだ この てごたえは……！', 'ぬ、ぬおおお……っ！'],
  N: [['……まあ、かずは ちからだ', 'sad'], ['うむ。……うむ。', 'normal'], ['したっぱも だいじな どうほうだ', 'normal']],
  R: [['わるくない。そだてれば ばける', 'normal'], ['ほう、なかなか', 'normal']],
  SR: [['ふはは！ じょうきゅう まぞくだ！', 'joy'], ['よいぞ よいぞ！', 'joy']],
  SSR: [['[r]ふはははは！[/r] みたか！ [g]魔将[/g]だぞ！', 'joy'], ['おまえの うん、ほんものだ！', 'joy']],
  UR: [['……な、な……[r]災厄級[/r]……!?', 'shock']],
  after: { up: ['もういっかい！ いまの われは とまらぬ！', 'ちょうしに のってきたぞ……！'], down: ['……ヴァルメリア、なにも いうな', 'つぎ……つぎで とりかえす……'] },
};
function moodKey() { return S.mood >= 2 ? 'up' : S.mood <= -2 ? 'down' : 0; }

/* ---------------- 入力 ---------------- */
const $ = id => document.getElementById(id);
$('b1').onclick = () => pull(1);
$('b10').onclick = () => pull(10);
function doSkip() { if (S.busy && !S.skip) { S.skip = true; snd.play('skip'); } }
$('bSkip').onclick = () => doSkip();
if ($('bFirst')) $('bFirst').onclick = () => firstSummon();
$('bRoster').onclick = () => openRoster();
$('rosterClose').onclick = () => $('roster').classList.remove('show');
if ($('tg')) $('tg').onclick = () => $('test').classList.toggle('hide');
out.addEventListener('pointerdown', () => { if (EMBED && !EM) return; snd.init(); if (S.busy) S.ff = true; });
out.addEventListener('pointerup', () => { S.ff = false; });
addEventListener('keydown', e => {
  // 埋め込み時、儀式が終わったあと（非表示）にキーが届いても音を起こさない（召魂の音が探索に残る不具合の原因だった）
  if (EMBED && !EM) return;
  snd.init();
  const k = e.key.toLowerCase();
  if (EMBED && (k === 't' || k === 'r')) return;
  if (DEMO && document.documentElement.classList.contains('title')) { if (k === ' ' || k === 'enter') { e.preventDefault(); startDemo(); } return; }
  if (DEMO && e.repeat && (k === ' ' || k === 'enter' || k === 'r')) { e.preventDefault(); return; }
  if (DEMO && k === 'escape' && $('roster').classList.contains('show')) { $('roster').classList.remove('show'); return; }
  if (decide) {
    const propose = document.documentElement.classList.contains('propose');
    if (propose) { if (k === ' ' || k === 'enter') { e.preventDefault(); decideBy('accept'); } else if (k === 'x' || k === 'backspace' || k === 'escape') decideBy('decline'); }
    else if (k === 'x' || k === ' ' || k === 'enter' || k === 'backspace' || k === 'escape') { e.preventDefault(); decideBy('stop'); } // 止める（見守るボタンはない：何もしなければ引いてしまう）
    return;
  }
  // 本体の儀式では、自分から引くボタン・キーは使わない（魔王が始める）
  if (EMBED && document.documentElement.classList.contains('ritual')) { if (k === ' ') { e.preventDefault(); if (S.busy) S.ff = true; else if (autoRet && autoRet.armed) autoHold(); } if (k === 's') doSkip(); if ((k === 'escape' || k === 'backspace' || k === 'enter') && !S.busy) exitStage(); return; } // Space：結果を見続ける／自動で戻る、Enter：探索へ戻る
  if (k === ' ') { e.preventDefault(); if (S.busy) S.ff = true; else pull(1); }
  if (k === 'enter') { if (!S.busy) pull(10); }
  if (k === 's') doSkip();
  if ((k === 'escape' || k === 'backspace') && EMBED) exitStage();
  if (k === 't' && !DEMO && $('test')) $('test').classList.toggle('hide');
  if (k === 'r') { $('roster').classList.contains('show') ? $('roster').classList.remove('show') : openRoster(); }
});
addEventListener('keyup', e => { if (e.key === ' ') S.ff = false; });
document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { S.shards += +b.dataset.add; snd.init(); snd.play('dupe'); });
document.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { S.force = b.dataset.f; document.querySelectorAll('[data-f]').forEach(x => x.classList.toggle('on', x === b)); });
document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => { S.mode = b.dataset.m; document.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b)); });
if ($('bReset')) $('bReset').onclick = () => { if (S.busy) return; S.roster = {}; S.shards = 60; S.pulls = 0; S.sinceSSR = 0; S.mood = 0; grid = null; single = null; banner = null; reveal = null; M.face = 'normal'; say('maou', 'さあ、しょうこんの ぎを はじめよう', 'normal'); };
function setButtons() {
  $('b1').disabled = S.busy || (EMBED && S.shards < 1); $('b10').disabled = S.busy || (EMBED && S.shards < 10); $('bSkip').disabled = !S.busy;
  if ($('bExit')) $('bExit').disabled = S.busy;
}
function exitStage() { if (!EM || S.busy) return; autoRet = null; showAuto(); snd.init(); snd.play('ui'); EM.exit(); }
if ($('bHold')) $('bHold').onclick = () => autoHold(true);
if ($('bResume')) $('bResume').onclick = () => autoHold(false);
if ($('bExit')) $('bExit').onclick = () => exitStage();
/* ---------------- 自発的な召魂（本体：戦闘に勝ったあと、魔王が勝手に始める） ----------------
   見守る → 本体が抽選・消費して、いつもの演出へ。止める → 抽選も消費もせず、魔王が渋々鎖を離す。
   止めた回数で反応が変わる。何度か止めると、魔王が十連を提案する（回数の判断は本体側） */
const RITUAL = {
  start: { single: ['……ふ、ふふ。かってに 手が……', 'たたかいの あとは、これに かぎる……！', 'ひとつだけ。ひとつだけだ……'], ten: ['十回ぶん、たまったぞ。……やくそくどおり、いまから 引く！'] },
  hold: { single: ['ぬ、ぬぬ……（ちらっ）', '……とめないよな？', 'もうすこし……もうすこしで……'], ten: ['とめるなよ……？ やくそく、したよな……？', 'ぬおお……十本は おもい……！'] },
  stop: [
    ['……ちっ。わかった、わかった……', 'sad'],
    ['……また とめるのか。おまえ、われの たのしみを なんだと……', 'sad'],
    ['（くさりを じっと みている）……つぎは、ぜったい だからな', 'sad'],
  ],
  stopTen: ['……！ やくそく、だったではないか……。……ふん', 'sad'],
};
let decide = null;
function showDecision(kind) {
  document.documentElement.classList.toggle('decide', kind === 'stop');
  document.documentElement.classList.toggle('propose', kind === 'propose');
}
function decideBy(choice) { if (decide) { const f = decide; decide = null; showDecision(null); f(choice); } }
if ($('bStop')) $('bStop').onclick = () => decideBy('stop');
if ($('bStop2')) $('bStop2').onclick = () => decideBy('stop');
if ($('bGo')) $('bGo').onclick = () => exitStage(); if ($('bGo2')) $('bGo2').onclick = () => exitStage();
if ($('bStay')) $('bStay').onclick = () => autoHold(true); if ($('bAuto2')) $('bAuto2').onclick = () => autoHold(false);
if ($('bAccept')) $('bAccept').onclick = () => decideBy('accept');
if ($('bDecline')) $('bDecline').onclick = () => decideBy('decline');
async function waitDecision(kind, holdLines) {
  showDecision(kind); snd.play('ui');
  let done = null; decide = c => { done = c; };
  let n = 0;
  while (!done) { // 急かさない：判断が出るまで踏ん張り続ける
    for (let i = 0; i < 16 && !done; i++) { if (kind === 'stop' && i % 4 === 0) snd.play('creak', 'UNK', .2, i % 8 === 0); await wait(.25); }
    if (!done && holdLines && n++ % 2 === 0) say('maou', pick(holdLines), n % 4 === 1 ? 'strain' : 'expect', 2.6);
  }
  return done;
}
// 止められる時間（魔王が鎖を引き切るまで）。何もしなければ、時間切れで召魂が成立する
let tension = null;
const URGE = { single: ['ぬ、ぬぬ……もうすこし……！', 'あと すこしで……ぬける……！'], ten: ['十本……ぜんぶ……あがって くる……！', 'あと すこしだ……とめるなよ……！'] };
async function pullWindow(kind) {
  const T0 = Math.max(.5, (EM && EM.stopWindow) || 3);
  let done = null;
  decide = c => { if (!done) done = c; };
  showDecision('stop'); snd.play('ui');
  tension = { t: 0, T: T0, kind };
  const key = kind === 'ten' ? 'ten' : 'single';
  let nextCreak = 0, urged = false;
  chains.forEach(ch => { ch.ay0 = ch.ay; });
  while (!done && tension.t < T0) {
    await wait(.05, 'win');
    const k = clamp(tension.t / T0, 0, 1);
    // 引いている：魔王が一歩ずつ下がり、鎖の先（淵の中の何か）が上がってくる。揺れと軋みがだんだん速く
    M.x = MX + k * 12; shake = Math.max(shake, .5 + k * 2.5); pitGlow = 1 + k * 1.6;
    chains.forEach(ch => { ch.ay = ch.ay0 - k * 16; });
    document.documentElement.style.setProperty('--tleft', String(1 - k));
    const sl = $('stopLeft'); if (sl) sl.textContent = `${Math.max(0, T0 - tension.t).toFixed(1)}`; // 残りは小さく
    if (tension.t >= nextCreak) { snd.play('creak', 'UNK', k * .6, k > .5); nextCreak = tension.t + (.42 - k * .3); }
    if (!urged && k > .62) { urged = true; say('maou', pick(URGE[key]), 'strain', 2); }
  }
  // ここで結果が決まる（止めた／時間切れ）。以後のクリックは受け付けない
  const choice = done || 'timeout';
  decide = null; showDecision(null); tension = null;
  document.documentElement.style.setProperty('--tleft', '1');
  return choice;
}
function drawTension(c) {
  const k = clamp(tension.t / tension.T, 0, 1), x = 196, y = 22, w = 248;
  frameBox(c, x - 4, y - 4, w + 8, 30, k > .66 ? '#ff5a70' : '#e8c27a');
  T_(c, k > .66 ? 'もうすぐ 引き切る！' : '魔王が 引いている……', x + 6, y + 1, 12, k > .66 ? '#ffb0c0' : '#ffe3a6');
  c.fillStyle = '#0b0810'; c.fillRect(x + 6, y + 15, w - 12, 6);
  c.fillStyle = k > .66 ? (Math.sin(T * 30) > 0 ? '#ff5a70' : '#ffb0c0') : '#e8c27a'; c.fillRect(x + 7, y + 16, Math.round((w - 14) * k), 4);
}
async function ritual(kind) {
  S.busy = true; S.skip = false; S.ff = false; setButtons();
  grid = null; single = null; banner = null; fuseList = []; fxs.forEach(f => f.f.stop()); reveal = null;
  if (kind === 'propose') return proposeTen();
  const n = kind === 'ten' ? 10 : 1;
  // 予兆：魔王が自分から淵へ手を伸ばす
  M.gray = 0; M.pose = 'rub';
  say('maou', pick(RITUAL.start[kind === 'ten' ? 'ten' : 'single']), 'expect', 2.6);
  await wait(1.3);
  pitGlow = 1; snd.play('pitOpen', n >= 10);
  await wait(.4);
  const blanks = Array.from({ length: n }, () => ({ r: 'N' }));
  await raiseChains(blanks, false, true);
  M.pose = 'pull'; snd.play('grab');
  say('maou', pick(RITUAL.hold[kind === 'ten' ? 'ten' : 'single']), 'strain', 2.4);
  // 止められる時間：魔王はそのまま引き続ける。止めなければ、時間切れで召魂が成立する
  const choice = await pullWindow(kind);
  if (choice === 'stop') return stopped(kind, n);
  // 引き切った → ここで初めて抽選・消費（本体。1回だけ）
  snd.play('yank', 'N'); shake = Math.max(shake, 4);
  const c = EM.commit(n);
  if (!c) return stopped(kind, n, true);
  const res = c.results; S.shards = c.shards; S.pulls += n;
  // 魂晶を淵へ（消費の見せ方）→ 鎖に色が宿る
  M.pose = 'throw';
  for (let i = 0; i < Math.min(n, 10); i++) { shards.push({ x: MX + 8, y: MY - 30, vx: rand(60, 110), vy: rand(-110, -70), t: 0 }); snd.play('toss', i); await wait(.06); }
  await wait(.3);
  chains.forEach((ch, i) => { ch.real = res[i].r; ch.tier = hintOf(res[i].r); ch.flash = 1; });
  M.pose = 'pull'; M.face = 'strain';
  if (n === 1) await seqSingle(res[0], true); else await seqTen(res, true);
  const best = res.reduce((a, b) => (RANK(b.r) > RANK(a.r) ? b : a)), bk = RANK(best.r);
  if (bk >= 3) S.mood = Math.min(3, S.mood + 2); else if (bk === 2) S.mood = Math.min(3, S.mood + 1); else S.mood = Math.max(-3, S.mood - 1);
  finishRitual(readTime(n, res));
}
async function stopped(kind, n, failed) {
  // 止められた：鎖を渋々離す（抽選も消費もしない）
  const info = failed ? { count: 1 } : EM.stopped(kind, n) || { count: 1 };
  M.pose = 'slump'; M.face = 'sad';
  for (let k = 0; k < 12; k++) { chains.forEach(c => c.rise = Math.max(0, c.rise - .09)); if (k % 3 === 0) snd.play('creak', 'N', 0, false); await wait(.04); }
  chains = []; pitGlow = .25; shake = 2; snd.play('womp');
  M.gray = 1;
  const line = kind === 'ten' ? RITUAL.stopTen : RITUAL.stop[Math.min(RITUAL.stop.length - 1, info.count - 1)];
  say('maou', line[0], line[1], 3.4);
  if (info.count >= 2 && kind !== 'ten') later(2.8, () => say('verm', 'あらあら。とめられて ばかりですわね、魔王さま', null, 2.6));
  await wait(2.2);
  finishRitual();
  if (EM) later(2.4, () => exitStage()); // 止めたあとは、すねる顔を見せてから探索へ戻る
}
async function proposeTen() {
  // 何度も止められた魔王が、渋々ゆずる
  M.pose = 'slump'; M.face = 'sad'; M.gray = 0;
  say('maou', '……なあ。', 'sad', 1.6);
  await wait(1.6);
  const have10 = S.shards >= 10; // すでに十回分あるなら「今ある分で十連だけ」と持ちかける（台詞は仮）
  document.documentElement.classList.toggle('have10', have10);
  say('maou', have10 ? '……もう十回分あるではないか！ ならば十連だけ！ それならいいだろ？' : '……じゃあ、十回分たまったら引く。それならいいだろ？', 'sad', 99);
  await wait(1.6); // 言い終わってから選べるように
  const ans = await waitDecision('propose', null);
  const next = EM.proposal(ans) || {};
  if (ans === 'accept' && have10) {
    M.pose = 'joy'; M.jump = 1; snd.play('joy');
    say('maou', 'ふはは！ はなしが わかるではないか！ ……十連だけ、だからな', 'joy', 2.6);
    await wait(2.2);
    S.busy = false; return ritual('ten'); // その場で十連の儀へ（これも時間内なら止められる）
  }
  if (ans === 'accept') {
    M.pose = 'joy'; M.jump = 1; snd.play('joy');
    say('maou', 'ほ、ほんとうか！ ……やくそくだぞ。十回分 たまるまで……がまん、してやる', 'joy', 3.6);
    await wait(3);
    return finishRitual(4);
  }
  say('maou', '……ならば、いつもどおりだ！', 'cocky', 2);
  await wait(1.4);
  if (next.then) { S.busy = false; return ritual(next.then); }
  finishRitual();
}
function finishRitual(read) { S.busy = false; S.skip = false; S.ff = false; setButtons(); document.documentElement.classList.add('done'); if (EM) EM.pullEnded(); if (read) startAutoReturn(read); }
/* ---------- 結果のあと、自動で探索へ戻る ----------
   ・結果と魔王の反応が出そろってから数え始める（吹き出し・予約した台詞がなくなってから）
   ・読む時間：単発 5 秒・十連 8 秒（仮。本体の Gacha.CFG.autoReturn）。新しい魔族・SR 以上は少し長く
   ・「ここで止める」（Space／クリック）で止まる。止めている間は「自動で戻る」で再開、「探索へ戻る」ですぐ戻る
   ・マウスを動かしただけでは止まらない。ウィンドウから離れている間は数えない */
let autoRet = null;
function readTime(n, res) {
  const C = (EM && EM.autoReturn) || {}, base = n >= 10 ? (C.ten || 8) : (C.single || 5);
  const isNew = res.some(r => r.isNew), rare = res.some(r => RANK(r.r) >= (n >= 10 ? 3 : 2));
  return base + (isNew ? (C.extraNew || 1.5) : 0) + (rare ? (C.extraRare || 1.5) : 0);
}
function startAutoReturn(sec) { if (!EM) return; autoRet = { left: sec, total: sec, paused: false, armed: false }; showAuto(); }
function autoFocused() { if (document.visibilityState === 'hidden') return false; try { return document.hasFocus() || (parent !== window && parent.document.hasFocus()); } catch (e) { return document.hasFocus(); } }
function autoHold(on) { if (!autoRet) return; autoRet.paused = on == null ? !autoRet.paused : on; snd.play('ui'); showAuto(); }
function showAuto() {
  const h = document.documentElement;
  h.classList.toggle('autoret', !!autoRet && autoRet.armed); h.classList.toggle('autohold', !!autoRet && autoRet.paused);
  const m = $('autoMsg'); if (!m || !autoRet) return;
  m.textContent = autoRet.paused ? '止めています（ゆっくり見てください）' : !autoFocused() ? '画面から離れているあいだは待ちます' : `あと ${Math.max(1, Math.ceil(autoRet.left))} 秒で探索へ戻る`;
  const bar = $('autoBar'); if (bar) bar.style.width = (autoRet.left / autoRet.total * 100) + '%';
  // 中央の案内（埋め込み時）：自動で戻るまでの秒数
  const nm = $('nextMsg'); if (nm) nm.textContent = !autoFocused() ? '画面に戻ると 探索へ' : `${Math.max(1, Math.ceil(autoRet.left))} 秒で 探索へ`;
  const nb = $('nextBar'); if (nb) nb.style.width = (autoRet.left / autoRet.total * 100) + '%';
}
function tickAuto(dt) {
  if (!autoRet || S.busy) return;
  if (!autoRet.armed) { if (!bubble && !timers.length) { autoRet.armed = true; showAuto(); } return; } // 魔王の反応（吹き出し・予約した台詞）が終わるまで数えない
  if (!autoRet.paused && autoFocused()) autoRet.left -= dt;
  showAuto();
  if (autoRet.left <= 0) { autoRet = null; showAuto(); exitStage(); }
}
const GREET = {
  consult: ['……よし。ここからは、われと おまえだけの じかんだ', 'たたかいの [g]魂晶[/g]が、まだ あつい。いまだ'],
  self: ['まかされた！ ……だが、ゆびを うごかすのは おまえだ'],
  player: ['ひくのだな？ ふはは、はなしが はやい！'],
};
// 本体から呼ばれる：召魂の儀の開始／終了
function embedBegin(opts) {
  EM = opts;
  waits.length = 0; timers.length = 0;
  grid = null; single = null; banner = null; reveal = null; fuseList = []; chains = []; souls = []; omen = null;
  fxs.forEach(f => f.f.stop());
  S.shards = opts.shards; S.pulls = opts.totalPulls || 0; S.busy = false; S.skip = false; S.ff = false; S.force = '';
  M.pose = 'idle'; M.gray = 0; M.face = 'normal'; M.drag = 0;
  // 本体から自動で始まるので、ここで音を用意する（クリックを待たない）。消音は本体に合わせる
  snd.init(); snd.resume && snd.resume(); if (opts.muted != null && snd.muted !== !!opts.muted) snd.toggleMute(); snd.play('__begin');
  document.documentElement.classList.toggle('ritual', !!opts.ritual);
  document.documentElement.classList.remove('done', 'decide', 'propose', 'autoret', 'autohold'); autoRet = null;
  if (opts.ritual) { setButtons(); ritual(opts.ritual); return; }
  say('maou', opts.line || pick(GREET[opts.by] || GREET.player), 'expect', 3.4);
  setButtons();
}
// 召魂の儀の画面に入った最初の瞬間の反応（本体・ラボが開始音と同じコマで呼ぶ）：A 白い光／B 揺れと暗い赤／C 淵の緑の光
function startKick(kind) {
  if (kind === 'A') { flashCol = '#e8f4ff'; flashA = .5; pitGlow = Math.max(pitGlow, 1.8); }
  else if (kind === 'B') { flashCol = '#3a0010'; flashA = .55; shake = Math.max(shake, 7); pitGlow = Math.max(pitGlow, 1.2); }
  else { flashCol = '#9fffe0'; flashA = .3; pitGlow = Math.max(pitGlow, 2.2); }
}
function embedEnd() { EM = null; snd.play('__end'); snd.suspend && snd.suspend(); }

/* ---------------- 召魂：共通 ---------------- */
async function pull(n) {
  if (S.busy) return;
  snd.init();
  if (!S.unlimited && S.shards < n) { say('maou', '……[g]魂晶[/g]が たりぬ。たたかって かせがねば', 'sad'); snd.play('ui'); return; }
  let res;
  if (EM) {
    const c = EM.commit(n); // 本体が抽選・消費・記録する（ここで二重には引けない）
    if (!c) { snd.play('ui'); return; }
    res = c.results; S.shards = c.shards; S.pulls += n;
  }
  snd.play('ui');
  S.busy = true; S.skip = S.mode === 'result'; setButtons();
  grid = null; single = null; banner = null; fuseList = []; fxs.forEach(f => f.f.stop()); reveal = null;
  if (!EM) { if (!S.unlimited) S.shards -= n; S.pulls += n; res = roll(n); if (DEMO) { S.lastKeys = res.map(r => r.key); saveDemo(); } }
  try { if (n === 1) await seqSingle(res[0]); else await seqTen(res); } catch (e) { console.error(e); }
  // 気分
  const best = res.reduce((a, b) => (RANK(b.r) > RANK(a.r) ? b : a));
  const bk = RANK(best.r);
  if (bk >= 3) S.mood = Math.min(3, S.mood + 2); else if (bk === 2) S.mood = Math.min(3, S.mood + 1); else S.mood = Math.max(-3, S.mood - 1);
  S.streakLow = bk <= 1 ? S.streakLow + 1 : 0;
  await wait(.4);
  if (S.mood >= 2) { M.pose = 'cocky'; snd.play('joy'); say('maou', pick(LINE.after.up), 'cocky'); }
  else if (S.mood <= -2) { M.pose = 'slump'; M.gray = 1; say('maou', pick(LINE.after.down), 'sad'); snd.play('womp'); if (S.streakLow >= 3) later(2.6, () => say('verm', 'したっぱばかり。[r]とかして[/r] しまえば？ ふふ', null, 3)); }
  S.busy = false; S.skip = false; S.ff = false; setButtons();
  if (DEMO) { showResult(res, n); const b = $('b1'); if (b) b.firstChild.textContent = 'もう一回'; }
  if (EM) EM.pullEnded();
}
async function prelude(n) {
  M.gray = 0; M.pose = 'rub';
  const mk_ = moodKey();
  say('maou', pick((n === 1 ? LINE.pre1 : LINE.pre10)[mk_]), mk_ === 'down' ? 'sad' : mk_ === 'up' ? 'cocky' : 'expect');
  await wait(n === 1 ? .8 : 1.1);
  // 魂晶を投げ込む
  M.pose = 'throw';
  for (let i = 0; i < Math.min(n, 10); i++) { shards.push({ x: MX + 8, y: MY - 30, vx: rand(60, 110), vy: rand(-110, -70), t: 0 }); snd.play('toss', i); await wait(.06); }
  await wait(.45);
  pitGlow = 1; snd.play('pitOpen', n >= 10);
  if (n >= 10 && S.mode === 'full') addFx(portal, { x: PX, y: PY + 4, palette: RAR.SR.ramp, seed: (Math.random() * 99) | 0 }, 'back');
}
async function pullChains(results, isSoul) { await raiseChains(results, isSoul); await heaveChains(results, isSoul); }
// 鎖が淵から上がり、魔王が掴む（unknown：まだ抽選していない。色の分からない鎖）
async function raiseChains(results, isSoul, unknown) {
  const n = results.length;
  chains = results.map((r, i) => {
    const off = n === 1 ? 0 : (i - (n - 1) / 2) * 9;
    const t = unknown ? 'UNK' : isSoul ? 'SOUL' : hintOf(r.r);
    return { tier: t, real: unknown ? 'UNK' : isSoul ? 'SOUL' : r.r, rise: 0, ax: PX + off, ay: PY - 2, up: false };
  });
  M.pose = 'grab'; M.face = 'strain';
  snd.play('rise', unknown ? 'N' : chains.reduce((a, c) => (RANK(c.tier) > RANK(a.tier) ? c : a)).tier, n);
  for (let k = 0; k < 14; k++) { chains.forEach(c => c.rise = Math.min(1, c.rise + .08)); await wait(.03); }
}
// 引き上げる（色の予兆 → 昇格 → 引き上げ）
async function heaveChains(results, isSoul) {
  const n = results.length;
  const top = isSoul ? RAR.SOUL : RAR[results.reduce((a, b) => (RANK(b.r) > RANK(a.r) ? b : a)).r];
  pitCol = RAR[chains.reduce((a, c) => (RANK(c.tier) > RANK(a.tier) ? c : a)).tier].ramp[4];
  // 引く
  M.pose = 'pull'; snd.play('grab');
  const dur = top.pull * (n > 1 ? .9 : 1);
  const strain = async (d, k0) => { const steps = Math.max(1, Math.round(d / .25)); for (let i = 0; i < steps; i++) { const ht = chains.reduce((a, c) => (RANK(c.tier) > RANK(a.tier) ? c : a)).tier; snd.play('creak', ht, k0 + i / steps * .5, i % 2 === 0); await wait(d / steps); } };
  await strain(dur * .5, 0);
  // 昇格（見かけより重い）
  const ups = chains.filter(c => c.tier !== c.real);
  if (ups.length) {
    if (RANK(ups.reduce((a, c) => (RANK(c.real) > RANK(a.real) ? c : a)).real) >= 3 || isSoul) say('maou', pick(LINE.heavy), 'shock', 1.6);
    for (const c of ups) { c.tier = c.real; c.flash = 1; burstPx(c.ax, c.ay - 6, 14, RAR[c.real].chain, 70); shake = Math.max(shake, RANK(c.real) * 2); snd.play('upgrade', c.real); await wait(.12); }
    pitCol = RAR[top === RAR.SOUL ? 'SOUL' : chains.reduce((a, c) => (RANK(c.tier) > RANK(a.tier) ? c : a)).tier].ramp[4];
    if (top === RAR.UR) { omen = { text: '災 厄', t: 0, col: RAR.UR.col }; flashA = .5; flashCol = '#ff2a4a'; shake = 10; snd.play('omen'); M.drag = 1; }
  }
  await strain(dur * .5, .5);
  // 引き上げ
  M.pose = 'yank'; shake = Math.max(shake, 4 + RANK(top === RAR.SOUL ? 'SSR' : chains[0].real)); snd.play('yank', top === RAR.SOUL ? 'SOUL' : results.reduce((a, b) => (RANK(b.r) > RANK(a.r) ? b : a)).r);
  chains.forEach(c => c.up = true);
}

/* ---------------- 単発 ---------------- */
async function seqSingle(r, held) {
  if (held) await heaveChains([r]); else { await prelude(1); await pullChains([r]); }
  await wait(.15);
  // 魂が飛び出す
  addFx(implosion, { x: PX, y: PY - 40, palette: RAR[r.r].ramp, seed: 3 }, 'front'); snd.play('soulPop', r.r);
  souls = [{ x: PX, y: PY - 2, tx: PX, ty: PY - 40, t: 0, r: r.r }];
  await wait(.55);
  chains = []; souls = [];
  await doReveal(r, true);
  single = r;
}
/* ---------------- 十連 ---------------- */
async function seqTen(res, held) {
  if (held) await heaveChains(res); else { await prelude(10); await pullChains(res); }
  await wait(.1);
  // 10の魂が一斉に飛び、上空の枠へ
  grid = { cards: res.map((r, i) => ({ r, open: 0, pop: 0, slot: i })), t: 0, show: 0 };
  souls = res.map((r, i) => { const p = slotPos(i); return { x: PX + (i - 4.5) * 6, y: PY - 2, tx: p.x / 2, ty: p.y / 2 + 14, t: -i * .03, r: r.r }; });
  chains.forEach(c => c.up = true); snd.play('souls');
  M.pose = 'joy'; M.face = 'expect';
  await wait(.55);
  chains = [];
  await wait(.3);
  souls = []; grid.show = 1;
  res.forEach((r, i) => { const p = slotPos(i); addFx(collect, { x: p.x / 2, y: p.y / 2 + 30, palette: RAR[r.r].ramp, seed: i }, 'front'); });
  snd.play('land');
  await wait(.5);
  // 順にめくる：N/Rは素早く、SR以上は溜めてから、SSR以上は全画面で見せる
  for (let i = 0; i < res.length; i++) {
    const c = grid.cards[i], k = RANK(c.r.r);
    if (k >= 2) { c.charge = 1; snd.play('cardCharge', k); await wait(k >= 3 ? .45 : .28); }
    c.open = 1; c.pop = 1; snd.play('flip', c.r.r);
    if (k >= 3) { await wait(.25); grid.dim = 1; await doReveal(c.r, false); grid.dim = 0; }
    else await wait(k === 2 ? .3 : .11);
  }
  // 反応
  const best = res.reduce((a, b) => (RANK(b.r) > RANK(a.r) ? b : a));
  reactTo(best.r);
  fuseList = res.filter(r => !r.isNew);
  grid.done = 1;
}
function slotPos(i) { const col = i % 5, row = (i / 5) | 0; return { x: 52 + col * 108, y: 52 + row * 128 }; } // UI座標（カード左上）

/* ---------------- 登場（全画面） ---------------- */
async function doReveal(r, isSingle) {
  const k = RANK(r.r), sp = pixelize(r.key, RAR[r.r].size);
  reveal = { r, sp, t: 0, phase: 'sil', k };
  M.pose = 'idle'; M.face = 'expect';
  if (k >= 3) {
    reveal.sun = addFx(sunburst, { x: PX, y: 96 - sp.h / 2, palette: RAR[r.r].ramp, rays: k === 4 ? 12 : 8, seed: 3 }, 'back');
    flashA = .8; flashCol = RAR[r.r].col; shake = 6;
  }
  snd.play('silhouette', r.r);
  await wait(k >= 3 ? .55 : k === 2 ? .35 : .18);
  reveal.phase = 'dissolve'; reveal.dt = 0;
  burstPx(PX, 96 - sp.h / 2, 18 + k * 10, RAR[r.r].ramp.slice(3), 90);
  snd.play('stinger', r.r);
  if (k === 4) { addFx(firework, { x: PX - 70, y: 150, palette: RAR.UR.ramp, seed: 5 }, 'back'); addFx(firework, { x: PX + 70, y: 150, palette: RAR.SSR.ramp, seed: 8 }, 'back'); }
  await wait(.3);
  banner = { r, t: 0 };
  if (isSingle) reactTo(r.r);
  await wait(k >= 3 ? 2.0 : k === 2 ? 1.1 : .7, k >= 3 ? 'hold' : undefined);
  if (!r.isNew) { banner.fuse = 1; snd.play('dupe'); await wait(.7); }
  if (reveal && reveal.sun) reveal.sun.stop();
  if (!isSingle) { reveal = null; banner = null; }
}
function reactTo(r) {
  const [text, face] = pick(LINE[r]);
  const k = RANK(r);
  M.pose = k >= 2 ? 'joy' : k === 0 ? 'slump' : 'idle';
  M.jump = k >= 2 ? 1 : 0;
  say('maou', text, face);
  if (k === 4) later(1.8, () => say('verm', '……あら。（ほんきの め）', null, 2.4));
  if (k >= 2) snd.play('joy');
}

/* ---------------- 初回：最初の同胞 ---------------- */
async function firstSummon() {
  if (S.busy) return;
  S.busy = true; S.skip = false; setButtons(); grid = null; single = null; banner = null; fxs.forEach(f => f.f.stop()); reveal = null;
  M.pose = 'rub'; say('maou', 'これで……ひゃくと さんどめ。……こたえよ', 'sad'); await wait(1.4);
  pitGlow = 1; pitCol = RAR.SOUL.ramp[4];
  await pullChains([{ r: 'SOUL' }], true);
  await wait(.2);
  flashA = 1; flashCol = '#ffffff'; snd.play('firstSoul');
  addFx(implosion, { x: PX, y: 70, palette: RAR.SOUL.ramp, seed: 7 }, 'front');
  souls = [{ x: PX, y: PY, tx: PX, ty: 70, t: 0, r: 'SOUL', big: 1 }];
  chains = [];
  await wait(1.0);
  M.pose = 'idle'; say('maou', '……せいこう、した……？ われの しょうこんが……！', 'shock', 2.4); await wait(2.4);
  M.pose = 'joy'; M.jump = 1; say('maou', 'ふ、ふはは！ [c]おまえ[/c]が はじめての……[r]さいしょの どうほう[/r]だ！', 'joy', 3); await wait(3);
  banner = { soul: 1, t: 0 }; await wait(2.5);
  souls = []; banner = null; S.first = true; S.busy = false; setButtons();
}

/* ---------------- 名簿 ---------------- */
function openRoster() {
  const keys = Object.keys(D.DEMONS).sort((a, b) => RANK(D.DEMONS[b].r) - RANK(D.DEMONS[a].r));
  if (DEMO) { const br = S.byRarity; $('rosterSub').innerHTML = `累計 召魂 <b>${S.pulls}</b> 回 ・ 所持 ${Object.keys(S.roster).length}/${keys.length} 種 ・ SSR 以上まで あと <b>${PITY - S.sinceSSR}</b> 回（天井）<br>${['UR', 'SSR', 'SR', 'R', 'N'].map(r => `<span style="color:${RAR[r].col}">${r} ${br[r] || 0}</span>`).join('　')}　<span class="newmark">NEW</span>＝さいごの召魂で はじめて引いた魔族`; } else
  $('rosterSub').textContent = `召魂 ${S.pulls}回 ・ 所持 ${Object.keys(S.roster).length}/${keys.length}種 ・ SSR天井まで あと ${PITY - S.sinceSSR} ・ ×N＝同じ魔族の所持数（同種融合の素材）`;
  const g = $('rosterGrid'); g.innerHTML = '';
  if (S.first) g.insertAdjacentHTML('beforeend', `<div class="c" style="--rc:#9fe4ff"><canvas width="48" height="48"></canvas><div style="color:#9fe4ff">最初の同胞</div><div>あなた（魔族）</div><div class="lv" style="color:#8acbe8">リセマラ・溶解の対象外</div></div>`);
  keys.forEach(k => {
    const d = D.DEMONS[k], have = S.roster[k], sp = pixelize(k, 40);
    const el = document.createElement('div'); el.className = 'c' + (have ? '' : ' none'); el.style.setProperty('--rc', RAR[d.r].col);
    const cv = mk(48, 48), c = cv.getContext('2d'); c.drawImage(have ? sp.img : sp.sil, (48 - sp.w) >> 1, 48 - sp.h);
    el.appendChild(cv);
    el.insertAdjacentHTML('beforeend', `<div style="color:${RAR[d.r].col}">${d.r}</div><div>${have ? d.name : '？？？'}</div><div class="lv">${have ? '×' + have.n : ''}${DEMO && have && S.lastKeys.includes(k) && have.n === S.lastKeys.filter(x => x === k).length ? ' <span class="newmark">NEW</span>' : ''}</div>`);
    g.appendChild(el);
  });
  $('roster').classList.add('show');
}

/* ---------------- 更新 ---------------- */
function update(dt) {
  T += dt;
  if (tension) tension.t += dt; // 止められる時間は早送りの影響を受けない
  tickAuto(dt);
  tickWaits(dt);
  for (let i = fxs.length - 1; i >= 0; i--) { fxs[i].f.update(dt); if (fxs[i].f.done()) fxs.splice(i, 1); }
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.age += dt; p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.age > p.life) parts.splice(i, 1); }
  for (let i = shards.length - 1; i >= 0; i--) { const s = shards[i]; s.t += dt; s.vy += 260 * dt; s.x += s.vx * dt; s.y += s.vy * dt; if (s.y > PY - 4 && s.vy > 0 && Math.abs(s.x - PX) < PRX) { shards.splice(i, 1); burstPx(s.x, PY - 2, 6, ['#6dffc8', '#e9fff8', '#2ac4a0'], 40, .4); pitGlow = 1; snd.play('plip'); } }
  souls.forEach(s => { s.t += dt; });
  shake = Math.max(0, shake - dt * 18); flashA = Math.max(0, flashA - dt * 1.6); pitGlow = Math.max(.25, pitGlow - dt * .5);
  if (omen) { omen.t += dt; if (omen.t > 1.6) omen = null; }
  if (bubble) {
    bubble.t += dt;
    const n = Math.min(bubble.len, Math.floor(bubble.t * (S.ff || S.mode === 'fast' ? 60 : 30)));
    if (n > bubble.shown) { for (let i = bubble.shown; i < n; i++) if (i % 2 === 0 && !/[\s。、…！？!?）（]/.test(bubble.plain[i])) { snd.play('blip', bubble.who); break; } bubble.shown = n; }
    if (bubble.t > bubble.life) bubble = null;
  }
  if (reveal) { reveal.t += dt; if (reveal.phase === 'dissolve') reveal.dt += dt; }
  if (banner) banner.t += dt;
  if (grid) { grid.t += dt; grid.cards.forEach(c => { c.pop = Math.max(0, (c.pop || 0) - dt * 3); if (c.charge) c.charge = Math.max(0, c.charge - dt * 2.5); }); }
  // 魔王の姿勢
  const tl = { idle: 0, rub: 0, throw: -1, grab: -1, pull: -2 - Math.abs(Math.sin(T * 9)) * 2, yank: -4, joy: 0, cocky: 1, slump: 1 }[M.pose] ?? 0;
  M.lean = lerp(M.lean, tl, Math.min(1, dt * 14));
  M.jump = Math.max(0, M.jump - dt * 1.4);
  if (M.drag) { M.x = lerp(M.x, MX + 10, dt * 2); M.drag = Math.max(0, M.drag - dt * .5); } else if (!tension) M.x = lerp(M.x, MX, dt * 3);
  if (M.pose !== 'slump') M.gray = Math.max(0, M.gray - dt);
}

/* ---------------- 描画：ワールド ---------------- */
function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
function line(c, x0, y0, x1, y1, col, w = 1) { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0; for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; px(c, x0 + (x1 - x0) * t - (w >> 1), y0 + (y1 - y0) * t - (w >> 1), w, w, col); } }
function handPose() {
  // 手の位置（魔王の足元基準）
  const s = Math.sin(T * 9), b = MY - 20;
  switch (M.pose) {
    case 'rub': return [[M.x - 2 + Math.sin(T * 14), b - 2], [M.x + 3 - Math.sin(T * 14), b - 2]];
    case 'throw': return [[M.x - 7, b + 4], [M.x + 12, b - 12]];
    case 'grab': case 'pull': return [[M.x + 10 + s, b + 1], [M.x + 13 + s, b - 1]];
    case 'yank': return [[M.x + 2, b - 8], [M.x + 5, b - 10]];
    case 'joy': return [[M.x - 10, b - 16 - Math.abs(Math.sin(T * 10)) * 2], [M.x + 10, b - 16 - Math.abs(Math.sin(T * 10 + 1)) * 2]];
    case 'cocky': return [[M.x - 9, b + 4], [M.x + 14, b - 8]];
    default: return null;
  }
}
function drawMaou(c) {
  const spr = MAOU_SPR[M.face] || MAOU_SPR.normal, w = spr.width, h = spr.height;
  const jy = -Math.round(Math.sin(Math.min(1, M.jump) * Math.PI) * 8 * (M.jump > 0 ? 1 : 0));
  const slump = M.pose === 'slump' ? 1 : 0;
  const x0 = Math.round(M.x - w / 2), y0 = MY - h + jy + slump;
  // 影
  px(c, M.x - 9, MY, 18, 2, 'rgba(0,0,0,.45)');
  // 体（行ごとにずらして傾ける）
  for (let y = 0; y < h; y++) { const off = Math.round(M.lean * (1 - y / h)); c.drawImage(spr, 0, y, w, 1, x0 + off, y0 + y, w, 1); }
  if (M.gray > 0) { c.save(); c.globalAlpha = .35 * M.gray; c.globalCompositeOperation = 'source-atop'; c.restore(); }
  // 腕
  const hp = handPose();
  if (hp) {
    const sh = [[x0 + 4 + Math.round(M.lean * .5), y0 + 18], [x0 + 18 + Math.round(M.lean * .5), y0 + 18]];
    hp.forEach(([hx, hy], i) => {
      hy += jy; const [sx, sy] = sh[i];
      const mx = (sx + hx) / 2 + (i ? 2 : -2), my = (sy + hy) / 2 + 2;
      line(c, sx, sy, mx, my, '#0d0812', 4); line(c, mx, my, hx, hy, '#0d0812', 4);
      line(c, sx, sy, mx, my, '#2c1a3a', 2); line(c, mx, my, hx, hy, '#2c1a3a', 2);
      px(c, hx - 2, hy - 2, 4, 4, '#0d0812'); px(c, hx - 1, hy - 1, 2, 2, '#efe4f4'); px(c, (mx + hx) / 2, (my + hy) / 2, 1, 1, '#e8c27a');
    });
  }
  // 落ち込みの雨雲
  if (M.pose === 'slump' && M.gray > .5) {
    const cx = M.x, cy = y0 - 10;
    px(c, cx - 6, cy, 12, 4, '#3a3a48'); px(c, cx - 4, cy - 2, 8, 2, '#4a4a58');
    for (let i = 0; i < 3; i++) px(c, cx - 4 + i * 4, cy + 5 + ((T * 20 + i * 3) % 6), 1, 2, '#6a8ab0');
  }
  // 汗（引くとき）
  if (M.pose === 'pull' && Math.sin(T * 6) > .3) px(c, x0 + 3, y0 + 8 + ((T * 30) % 6), 1, 2, '#9fe4ff');
}
function drawChain(c, ch) {
  // 手の位置（姿勢によっては片手しかないので、もう一方の手か体の前にする）
  const hp = handPose(), R = RAR[ch.tier], [hx, hy] = (hp && (hp[1] || hp[0])) || [M.x + 10, MY - 20];
  const ex = lerp(ch.ax, hx, ch.rise), ey = lerp(ch.ay, hy, ch.rise);
  const taut = M.pose === 'pull' || M.pose === 'yank';
  const sag = taut ? 2 : 10;
  const n = Math.max(6, Math.hypot(ex - ch.ax, ey - ch.ay) / 2.4) | 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = lerp(ch.ax, ex, t), y = lerp(ch.ay, ey, t) + Math.sin(t * Math.PI) * sag + (taut ? Math.sin(T * 40 + i) * .5 : 0);
    const odd = i % 2;
    px(c, x - 2, y - 2, odd ? 4 : 3, odd ? 3 : 4, '#07040c');
    px(c, x - 1, y - 1, odd ? 3 : 2, odd ? 2 : 3, ch.flash ? '#ffffff' : R.chain[1]);
    px(c, x - 1, y - 1, 1, 1, ch.flash ? '#ffffff' : R.chain[RANK(ch.tier) >= 2 && (i + ((T * 20) | 0)) % 5 === 0 ? 2 : 2]);
  }
  if (ch.flash) ch.flash = Math.max(0, ch.flash - .05);
  if (RANK(ch.tier) >= 3 && Math.random() < .3) parts.push({ x: lerp(ch.ax, ex, Math.random()), y: lerp(ch.ay, ey, Math.random()), vx: rand(-20, 20), vy: rand(-30, 0), life: .4, age: 0, col: R.chain[2], g: 40 });
}
function stepLight(c, x, y, r, a) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(.45, `rgba(0,0,0,${a})`); g.addColorStop(.46, `rgba(0,0,0,${a * .6})`); g.addColorStop(.72, `rgba(0,0,0,${a * .6})`);
  g.addColorStop(.73, `rgba(0,0,0,${a * .28})`); g.addColorStop(.99, `rgba(0,0,0,${a * .28})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
}
const lightCv = mk(VW, VH), lc = lightCv.getContext('2d');
function renderWorld() {
  const c = wc; c.imageSmoothingEnabled = false;
  c.drawImage(bg, 0, 0);
  // 淵の渦
  for (let i = 0; i < 70; i++) {
    const a = i * .9 + T * (1.2 + pitGlow * 2), rr = ((i * 37) % 100) / 100;
    const x = PX + Math.cos(a) * PRX * rr * .92, y = PY + Math.sin(a) * PRY * rr * .85;
    px(c, x, y, 1, 1, i % 4 === 0 ? pitCol : (i % 4 === 1 ? '#2a1450' : '#140a24'));
  }
  // 魔法陣の光
  for (let a = 0; a < 6.28; a += .045) { const on = ((a * 10 + T * 4) % 3) < (1 + pitGlow * 1.5); if (!on) continue; px(c, PX + Math.cos(a) * (PRX + 13), PY + Math.sin(a) * (PRY + 5), 1, 1, pitCol); }
  // 引いている間：淵の底から、まだ正体の分からない光が少しずつ上がってくる（時間切れで召魂が成立する）
  if (tension) { const k = clamp(tension.t / tension.T, 0, 1), h = Math.round(3 + k * 26), w = Math.round(6 + k * 10), R = RAR.UNK.ramp, fl = Math.sin(T * (10 + k * 30)) > 0;
    for (let y = 0; y < h; y++) { const ww = Math.round(w * (1 - y / h * .6)); px(c, PX - ww / 2, PY - 2 - y, ww, 1, y > h - 3 ? R[6] : (y + ((T * 18) | 0)) % 4 === 0 ? R[5] : R[fl ? 4 : 3]); }
    if (k > .66 && Math.random() < .5) parts.push({ x: PX + rand(-w, w), y: PY - rand(0, h), vx: rand(-20, 20), vy: rand(-40, -10), life: .4, age: 0, col: R[5], g: 20 }); }
  // エフェクト（奥）
  clearFrame(frameBack); fxs.filter(f => f.layer === 'back').forEach(f => f.f.draw(frameBack));
  composite(frameBack, imgBack.data, null); fxBackCv.getContext('2d').putImageData(imgBack, 0, 0); c.drawImage(fxBackCv, 0, 0);
  // ヴァルメリア
  px(c, 28, 142, 18, 2, 'rgba(0,0,0,.4)'); c.drawImage(VERM, 28, 142 - VERM.height + (Math.floor(T * 1.2) % 2));
  // 鎖（魔王の背後側）→ 魔王 → 魂
  chains.forEach(ch => drawChain(c, ch));
  drawMaou(c);
  // 投げ込む魂晶
  shards.forEach(s => { px(c, s.x - 1, s.y - 2, 3, 4, '#0d0812'); px(c, s.x, s.y - 1, 1, 2, '#6dffc8'); });
  // 登場する魔族
  if (reveal) drawReveal(c);
  // 魂
  souls.forEach(s => {
    const k = clamp(s.t / .5, 0, 1), e = ease(k), x = lerp(s.x, s.tx, e), y = lerp(s.y, s.ty, e) - Math.sin(k * Math.PI) * 20;
    const ramp = RAR[s.r].ramp, R = s.big ? 6 : 3;
    for (let yy = -R; yy <= R; yy++) for (let xx = -R; xx <= R; xx++) { const d = Math.hypot(xx, yy); if (d <= R) px(c, x + xx, y + yy, 1, 1, d < R * .4 ? '#ffffff' : d < R * .75 ? ramp[5] : ramp[3]); }
    if (Math.random() < .6) parts.push({ x, y, vx: rand(-10, 10), vy: rand(-10, 10), life: .35, age: 0, col: ramp[4], g: 0 });
  });
  parts.forEach(p => px(c, p.x, p.y, 1, 1, p.col));
  // 光
  lc.globalCompositeOperation = 'source-over'; lc.clearRect(0, 0, VW, VH); lc.fillStyle = 'rgba(6,3,16,.58)'; lc.fillRect(0, 0, VW, VH);
  lc.globalCompositeOperation = 'destination-out';
  stepLight(lc, PX, PY - 6, 70 + pitGlow * 30, .9);
  stepLight(lc, 48, 30, 40, .5); stepLight(lc, 280, 30, 40, .5);
  stepLight(lc, M.x, MY - 18, 30, .6);
  if (reveal) stepLight(lc, PX, 96 - reveal.sp.h / 2, 60 + reveal.k * 12, 1);
  c.drawImage(lightCv, 0, 0);
  c.save(); c.globalCompositeOperation = 'lighter';
  const glow = (x, y, r, col, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexA(col, a)); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2); };
  glow(PX, PY - 4, 60 + pitGlow * 20, pitCol, .18 + pitGlow * .15);
  chains.forEach(ch => { if (RANK(ch.tier) >= 2) glow((ch.ax + M.x) / 2, (ch.ay + MY - 20) / 2, 26, RAR[ch.tier].chain[2], .12); });
  c.restore();
  // エフェクト（手前）
  clearFrame(frameFront); fxs.filter(f => f.layer === 'front').forEach(f => f.f.draw(frameFront));
  composite(frameFront, imgFront.data, null); fxFrontCv.getContext('2d').putImageData(imgFront, 0, 0); c.drawImage(fxFrontCv, 0, 0);
  if (flashA > 0) { c.fillStyle = hexA(flashCol, flashA * .7); c.fillRect(0, 0, VW, VH); }
}
function hexA(h, a) { return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`; }
function drawReveal(c) {
  const rv = reveal, sp = rv.sp, x0 = Math.round(PX - sp.w / 2), base = 96, y0 = Math.round(base - sp.h + Math.sin(T * 2) * 1.5);
  // 光の台座
  for (let i = 0; i < 3; i++) { const w = 30 + rv.k * 8 - i * 8; px(c, PX - w / 2, base + 2 + i, w, 1, RAR[rv.r.r].ramp[5 - i]); }
  if (rv.phase === 'sil') { c.drawImage(sp.sil, x0, y0); const R = RAR[rv.r.r].ramp[5]; c.save(); c.globalAlpha = .6 + Math.sin(T * 30) * .3; c.drawImage(sp.sil, x0 - 1, y0); c.restore(); c.fillStyle = R; return; }
  // ディザで色が現れる
  const k = clamp(rv.dt / .3, 0, 1);
  if (k >= 1) { c.drawImage(sp.img, x0, y0); return; }
  c.drawImage(sp.sil, x0, y0);
  const ctx2 = mk(sp.w, sp.h).getContext('2d'); ctx2.drawImage(sp.img, 0, 0);
  const id = ctx2.getImageData(0, 0, sp.w, sp.h), d = id.data;
  const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < sp.h; y++) for (let x = 0; x < sp.w; x++) if (BAY[(y % 4) * 4 + (x % 4)] / 16 > k) d[(y * sp.w + x) * 4 + 3] = 0;
  ctx2.putImageData(id, 0, 0); c.drawImage(ctx2.canvas, x0, y0);
}

/* ---------------- 描画：UI（640×360） ---------------- */
function T_(c, s, x, y, size, col, align = 'left', outline = true, limit = 1e9) {
  c.font = `${size}px DotGothic16`; c.textAlign = align; c.textBaseline = 'top';
  // [g]..[/g] の色分け
  const segs = []; let cls = '', buf = '';
  for (let i = 0; i < s.length; i++) { if (s[i] === '[') { const j = s.indexOf(']', i); if (buf) segs.push([buf, cls]); buf = ''; const tag = s.slice(i + 1, j); cls = tag[0] === '/' ? '' : tag; i = j; continue; } buf += s[i]; }
  if (buf) segs.push([buf, cls]);
  if (limit < 1e9) { let left = limit; for (const sg of segs) { if (sg[0].length > left) sg[0] = sg[0].slice(0, Math.max(0, left)); left -= sg[0].length; } }
  const total = segs.reduce((a, [t]) => a + c.measureText(t).width, 0);
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  c.textAlign = 'left';
  segs.forEach(([t, k]) => {
    const color = k === 'g' ? '#ffd36b' : k === 'r' ? '#ff5a70' : k === 'c' ? '#9fe4ff' : col;
    if (outline) { c.fillStyle = '#0b0810'; for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) c.fillText(t, cx + dx, y + dy); }
    c.fillStyle = color; c.fillText(t, cx, y); cx += c.measureText(t).width;
  });
}
// [g]..[/g] などの強調タグつき文を、幅 maxW で折り返す。行頭に句読点や閉じ括弧が来ないようにする
const NO_HEAD = '、。，．！？!?…）」』〉ー～ぁぃぅぇぉっゃゅょ';
function wrapTagged(c, s, maxW, size) {
  c.font = `${size}px DotGothic16`;
  const chars = []; let cls = '';
  for (let i = 0; i < s.length; i++) { if (s[i] === '[') { const j = s.indexOf(']', i); const tag = s.slice(i + 1, j); cls = tag[0] === '/' ? '' : tag; i = j; continue; } chars.push([s[i], cls]); }
  const W = arr => c.measureText(arr.map(x => x[0]).join('')).width;
  const lines = [[]];
  for (let i = 0; i < chars.length; i++) {
    const cur = lines[lines.length - 1];
    if (!cur.length && (chars[i][0] === ' ' || chars[i][0] === '　')) continue; // 行頭の空白は捨てる
    cur.push(chars[i]);
    if (W(cur) <= maxW || cur.length < 2) continue;
    // はみ出した：枠の中に収まる位置で折り返す。行頭に句読点・「…」・閉じ括弧が来ないよう、折り返し位置を前へずらす（追い出し）
    let k = cur.length - 1;
    while (k > 1 && NO_HEAD.includes(cur[k][0])) k--;
    // かな書きのセリフは空白で区切ってあるので、近くに空白があればそこで折る（語の途中で切らない）
    // 句読点の直後で折れるなら、そこで折る
    const txt = cur.slice(0, k + 1).map(x => x[0]);
    let sp = -1;
    for (let j = k; j > Math.max(0, k - 12); j--) if ((txt[j] === ' ' || '、。！？'.includes(txt[j - 1])) && !NO_HEAD.includes(txt[j] === ' ' ? (txt[j + 1] || cur[j + 1]?.[0] || '') : txt[j])) { sp = j; break; }
    if (sp > 0) k = sp;
    const carry = cur.splice(k);
    while (carry.length && (carry[0][0] === ' ' || carry[0][0] === '　')) carry.shift();
    lines.push(carry);
  }
  const width = Math.max(0, ...lines.map(W));
  return { lines, width, size };
}
function drawWrapped(c, L, x, y, lh, col, limit = 1e9) {
  c.font = `${L.size}px DotGothic16`; c.textAlign = 'left'; c.textBaseline = 'top';
  let left = limit;
  L.lines.forEach((ln, li) => {
    let cx = x;
    for (const [ch, k] of ln) {
      if (left-- <= 0) return;
      const color = k === 'g' ? '#ffd36b' : k === 'r' ? '#ff5a70' : k === 'c' ? '#9fe4ff' : col;
      c.fillStyle = '#0b0810'; for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) c.fillText(ch, cx + dx, y + li * lh + dy);
      c.fillStyle = color; c.fillText(ch, cx, y + li * lh); cx += c.measureText(ch).width;
    }
  });
}
function frameBox(c, x, y, w, h, col = '#e8c27a', fill = 'rgba(9,6,14,.94)') {
  c.fillStyle = '#0b0810'; c.fillRect(x - 2, y - 2, w + 4, h + 4);
  c.fillStyle = col; c.fillRect(x, y, w, h);
  c.fillStyle = fill; c.fillRect(x + 2, y + 2, w - 4, h - 4);
  c.fillStyle = '#6a1426'; c.fillRect(x + 3, y + 3, w - 6, 1); c.fillRect(x + 3, y + h - 4, w - 6, 1);
}
function drawUI() {
  const c = uc; c.clearRect(0, 0, UW, UH); c.imageSmoothingEnabled = false;
  // 魂晶と天井（4:3 の上の帯に置く）
  { const c = tuc; c.clearRect(0, 0, UW, SKY * 2); c.imageSmoothingEnabled = false;
    frameBox(c, 12, 12, 132, 30);
    c.fillStyle = '#2ac4a0'; c.fillRect(22, 20, 6, 14); c.fillStyle = '#6dffc8'; c.fillRect(24, 22, 2, 10);
    T_(c, S.unlimited ? '魂晶 ∞' : `魂晶 ${S.shards}`, 36, 18, 16, '#c9fff0');
    if (!EMBED) { T_(c, `SSR天井まで あと ${PITY - S.sinceSSR}`, UW - 12, 16, 12, '#a99bb8', 'right'); T_(c, `召魂 ${S.pulls}回`, UW - 12, 32, 12, '#6a5a74', 'right'); } // 本体には天井がないので出さない
    if (tension) drawTension(c); }
  // 予兆
  if (omen) { const a = clamp(omen.t < .2 ? omen.t / .2 : (1.6 - omen.t) / .4, 0, 1); c.globalAlpha = a; T_(c, omen.text, UW / 2, 70, 64, omen.col, 'center'); c.globalAlpha = 1; }
  // 十連の枠
  if (grid && grid.show) drawGrid(c);
  // 登場バナー
  if (banner) drawBanner(c);
  // 吹き出し
  if (bubble) drawBubble(c);
  // ヒント
  if (EMBED) { /* 埋め込み時はボタンにキーが書いてあるので、案内文は出さない */ }
  else if (S.busy) T_(c, 'Space/クリック：はやおくり　S：スキップ', UW / 2, UH - 16, 12, '#6a5a74', 'center');
  else if (!banner && !grid) T_(c, 'Space：単発　Enter：十連', UW / 2, UH - 16, 12, '#8a7a96', 'center');
}
function drawBubble(c) {
  const b = bubble, a = clamp(Math.min(b.t * 6, (b.life - b.t) * 4), 0, 1);
  const isV = b.who === 'verm';
  const inGrid = grid && grid.show && !grid.dim;
  const ax = inGrid ? 120 : isV ? 74 : M.x * 2 + 26, ay = inGrid ? 348 : isV ? 196 : (MY - 40) * 2 - 6;
  c.globalAlpha = a;
  const L = wrapTagged(c, b.text, inGrid ? 250 : 330, 16);
  const w = L.width + 66, h = Math.max(48, 16 + L.lines.length * 20); // 折り返しは wrapTagged が枠の幅に収める
  const x = clamp(ax - 30, 6, UW - w - 6), y = ay - h;
  frameBox(c, x, y, w, h, isV ? '#b07cff' : '#e8c27a');
  c.fillStyle = isV ? '#b07cff' : '#e8c27a'; for (let i = 0; i < 6; i++) c.fillRect(ax - 3 + i, y + h + i, 6 - i * 2 + 2, 1);
  // 顔（ワールドの2倍＝UIの4倍）
  const spr = isV ? VERM : (MAOU_SPR[M.face] || MAOU_SPR.normal);
  c.fillStyle = '#1a0a14'; c.fillRect(x + 6, y + 6, 40, 36);
  c.save(); c.beginPath(); c.rect(x + 6, y + 6, 40, 36); c.clip();
  c.drawImage(spr, isV ? 0 : 1, isV ? 2 : 4, 20, 18, x + 6, y + 6, 40, 36); c.restore();
  drawWrapped(c, L, x + 54, y + 13 + (h - 16 - L.lines.length * 20) / 2, 20, '#f1e8f8', b.shown);
  c.globalAlpha = 1;
}
function drawBanner(c) {
  const b = banner, k = ease(clamp(b.t / .25, 0, 1));
  if (b.soul) {
    c.globalAlpha = k; frameBox(c, 120, 252, 400, 76, '#9fe4ff');
    T_(c, '魔族 ？？？', 140, 262, 16, '#9fe4ff'); T_(c, '──── さいしょの どうほう', 140, 284, 24, '#ffffff');
    T_(c, 'まおうが はじめて しょうこんに せいこうした なかま ・ リセマラ／溶解の 対象外', 140, 312, 12, '#8acbe8'); c.globalAlpha = 1; return;
  }
  const r = b.r, R = RAR[r.r], d = D.DEMONS[r.key];
  const y = 248, x = lerp(-640, 0, k);
  c.fillStyle = 'rgba(8,4,12,.92)'; c.fillRect(x, y, UW, 86);
  c.fillStyle = R.col; c.fillRect(x, y, UW, 2); c.fillRect(x, y + 84, UW, 2);
  T_(c, r.r, x + 24, y + 10, 48, R.col);
  T_(c, R.name + '・' + d.role, x + 24, y + 62, 12, '#a99bb8');
  if (d.title) T_(c, d.title, x + 150, y + 4, 12, '#c9b8d8');
  T_(c, d.name, x + 150, y + (d.title ? 16 : 12), d.title ? 28 : 32, '#ffffff');
  T_(c, '「' + d.line + '」', x + 150, y + 54, 16, '#e8dcf2');
  // NEW / 融合
  if (r.isNew) { c.fillStyle = '#ff2a4a'; c.fillRect(UW - 110, y - 14, 96, 24); T_(c, 'NEW SOUL', UW - 62, y - 10, 16, '#ffffff', 'center', false); }
  else {
    const fk = b.fuse ? clamp((b.t - .3) * 3, 0, 1) : 0;
    frameBox(c, UW - 250, y - 30, 236, 34, '#ffd36b');
    T_(c, `所持 ×${fk > .5 ? r.count : r.count - 1}`, UW - 240, y - 24, 16, fk > .5 && fk < 1 ? '#ffffff' : '#ffe3a6');
    T_(c, '同種融合の そざい', UW - 24, y - 21, 12, '#c9b48a', 'right');
  }
}
function drawGrid(c) {
  if (grid.dim) return;
  const g = grid;
  c.fillStyle = 'rgba(4,2,8,.55)'; c.fillRect(0, 0, UW, UH);
  g.cards.forEach((card, i) => {
    const p = slotPos(i), r = card.r, R = RAR[r.r], w = 96, h = 120;
    const pop = card.pop || 0, ox = p.x - pop * 4, oy = p.y - pop * 6;
    if (!card.open) {
      frameBox(c, ox, oy, w, h, card.charge ? '#ffffff' : '#4a3a54', '#120a1c');
      // 裏面：魂の色だけ見える
      const cx = ox + w / 2, cy = oy + h / 2, rr = 14 + Math.sin(T * 6 + i) * 2;
      c.fillStyle = R.ramp[2]; c.fillRect(cx - rr, cy - 2, rr * 2, 4); c.fillRect(cx - 2, cy - rr, 4, rr * 2);
      c.fillStyle = R.ramp[5]; c.fillRect(cx - 4, cy - 4, 8, 8); c.fillStyle = '#fff'; c.fillRect(cx - 2, cy - 2, 4, 4);
      return;
    }
    frameBox(c, ox, oy, w, h, R.col, '#100a18');
    if (RANK(r.r) >= 3) { c.fillStyle = hexA(R.col, .14 + Math.sin(T * 5) * .06); c.fillRect(ox + 2, oy + 2, w - 4, h - 4); }
    const sp = pixelize(r.key, 28);
    const sc = sp.w * 2 <= w - 8 ? 2 : 1;
    c.drawImage(sp.img, Math.round(ox + w / 2 - sp.w * sc / 2), oy + 74 - sp.h * sc, sp.w * sc, sp.h * sc);
    T_(c, r.r, ox + 6, oy + 4, 16, R.col);
    c.font = '12px DotGothic16';
    const name = D.DEMONS[r.key].name; T_(c, name.length > 8 ? name.slice(0, 8) : name, ox + w / 2, oy + 80, 12, '#ffffff', 'center');
    if (r.isNew) { c.fillStyle = '#ff2a4a'; c.fillRect(ox + w - 34, oy + 4, 30, 14); T_(c, 'NEW', ox + w - 19, oy + 5, 12, '#fff', 'center', false); }
    else {
      c.fillStyle = '#5a4210'; c.fillRect(ox + w - 34, oy + 4, 30, 14); T_(c, `×${r.count}`, ox + w - 19, oy + 5, 12, '#ffe3a6', 'center', false);
      T_(c, '融合そざい', ox + w / 2, oy + 98, 12, '#c9b48a', 'center');
    }
  });
  if (g.done) {
    const ups = fuseList.length, news = g.cards.length - ups;
    T_(c, `あたらしい ${news}　かさなり ${ups}`, UW - 14, 306, 14, '#e8dcf2', 'right');
    if (ups) T_(c, 'かさなり＝同種融合の そざい', UW - 14, 324, 12, '#a99bb8', 'right');
  }
}

/* ---------------- 合成・ループ ---------------- */
function present() {
  oc.imageSmoothingEnabled = false;
  const sx = (Math.random() - .5) * shake * scale, sy = (Math.random() - .5) * shake * scale;
  const W = out.width, top = Math.round(SKY * scale), H = out.height - top;
  oc.fillStyle = '#000'; oc.fillRect(0, 0, W, out.height);
  oc.drawImage(skyCv, Math.round(sx), Math.round(sy), W, top + 1);
  oc.drawImage(world, Math.round(sx), top + Math.round(sy), W, H);
  if (flashA > 0) { oc.fillStyle = hexA(flashCol, flashA * .7); oc.fillRect(0, 0, W, top); }
  if (grid && grid.show && !grid.dim) { oc.fillStyle = 'rgba(4,2,8,.55)'; oc.fillRect(0, 0, W, top); }
  oc.drawImage(topUI, 0, 0, W, top);
  oc.drawImage(ui, 0, top, W, H);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  // 埋め込み時は、本体のループが tick(dt) で時間を進める（時計を1つにする：一時停止・録画・テストと一致させる）
  if (!S.capturing && !EMBED) { update(dt); renderWorld(); drawUI(); }
  if (!EMBED) present();
  requestAnimationFrame(frame);
}
function tick(dt) { update(Math.min(.05, dt)); renderWorld(); drawUI(); present(); }
/* ---------------- 試遊版：保存・タイトル・結果の表示・リセット ---------------- */
function saveDemo() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, pulls: S.pulls, sinceSSR: S.sinceSSR, byRarity: S.byRarity, roster: S.roster, first: S.first, lastKeys: S.lastKeys, mood: S.mood })); } catch (e) { /* 保存できない環境（プライベートブラウズなど）でも遊べる */ }
}
function loadDemo() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (!d || d.v !== 1) return false;
    S.pulls = d.pulls | 0; S.sinceSSR = Math.min(PITY - 1, d.sinceSSR | 0); S.byRarity = Object.assign({ N: 0, R: 0, SR: 0, SSR: 0, UR: 0 }, d.byRarity);
    S.roster = {}; for (const [k, v] of Object.entries(d.roster || {})) if (D.DEMONS[k] && v && v.n > 0) S.roster[k] = { n: v.n | 0, at: v.at | 0 };
    S.first = !!d.first; S.lastKeys = (d.lastKeys || []).filter(k => D.DEMONS[k]); S.mood = Math.max(-3, Math.min(3, d.mood | 0));
    return true;
  } catch (e) { return false; }
}
function showResult(res, n) {
  const el = $('result'); if (!el) return;
  const nm = r => `<span style="color:${RAR[r.r].col}">${r.r} ${D.DEMONS[r.key].name}</span>${r.isNew ? '<span class="newmark">NEW</span>' : `<small>×${r.count}</small>`}`;
  el.innerHTML = n === 1 ? nm(res[0]) : res.map(nm).join(' ');
}
function demoReset() {
  if (S.busy) return false;
  if (!confirm('召魂の記録（魔王軍の名簿・累計・天井の数え）を すべて消します。よろしいですか？')) return false;
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* */ }
  S.roster = {}; S.pulls = 0; S.sinceSSR = 0; S.byRarity = { N: 0, R: 0, SR: 0, SSR: 0, UR: 0 }; S.mood = 0; S.lastKeys = []; S.first = false;
  grid = null; single = null; banner = null; reveal = null; M.face = 'normal'; M.gray = 0; M.pose = 'idle';
  $('roster').classList.remove('show'); if ($('result')) $('result').innerHTML = ''; const b = $('b1'); if (b) b.firstChild.textContent = '単発召魂';
  say('maou', '……きろくが まっさらに なった。さあ、もういちど はじめよう', 'normal', 3); saveDemo();
  return true;
}
let demoStarted = false;
async function startDemo() {
  if (demoStarted) return; demoStarted = true;
  snd.init(); document.documentElement.classList.remove('title');
  if (!S.first) { await firstSummon(); saveDemo(); }
  say('maou', S.pulls ? 'つづきだ。……もっと ひくぞ' : 'さあ、しょうこんの ぎを はじめよう。……なんどでも だ！', 'expect', 3.4);
  setButtons();
}
if (DEMO) {
  loadDemo();
  document.documentElement.classList.add('title');
  if ($('title')) $('title').addEventListener('click', () => startDemo());
  if ($('bReset2')) $('bReset2').onclick = () => demoReset();
  if ($('vol')) { const v = $('vol'); v.value = Math.round(snd.volume * 100); v.oninput = () => { snd.init(); snd.setVolume(v.value / 100); }; }
  if ($('bMute')) $('bMute').onclick = () => { snd.init(); const m = snd.toggleMute(); $('bMute').textContent = m ? '音を出す' : '音を消す'; $('bMute').setAttribute('aria-pressed', m); };
  addEventListener('resize', () => layout()); setTimeout(layout, 0);
}
document.fonts.load('16px DotGothic16').finally(() => {
  if (!DEMO) say('maou', 'さあ、しょうこんの ぎを はじめよう', 'normal', 3);
  setButtons();
  if ((innerWidth < VW * scale + 240 || DEMO) && $('test')) $('test').classList.add('hide');
  requestAnimationFrame(frame);
});

/* ---------------- 記録（スクショ・録画） ---------------- */
async function save(blob, name) {
  try { const r = await fetch(`http://127.0.0.1:${window.SAVE_PORT || 8766}/save?dir=gacha&name=${encodeURIComponent(name)}`, { method: 'PUT', body: blob }); if (r.ok) return true; } catch (e) { /* 保存サーバーなし */ }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); return false;
}
if ($('bShot')) $('bShot').onclick = () => out.toBlob(b => save(b, `shot_${Date.now()}.png`));
let rec = null, chunks = [];
if ($('bRecord')) $('bRecord').onclick = () => {
  if (rec) { rec.stop(); return; }
  const stream = out.captureStream(30); chunks = [];
  rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8e6 });
  rec.ondataavailable = e => chunks.push(e.data);
  rec.onstop = () => { save(new Blob(chunks, { type: 'video/webm' }), `gacha_${Date.now()}.webm`); rec = null; $('rec').style.display = 'none'; };
  rec.start(); $('rec').style.display = 'inline';
};
// 自動キャプチャ：時間を固定刻みで進めて 640×360 のGIFを作る（タブが裏でも正確）
async function capture(name, run, sec, fps = 15) {
  const cv = mk(UW, UH), cx = cv.getContext('2d'), frames = [];
  S.capturing = true;
  const p = run();
  for (let i = 0; i < sec * fps; i++) {
    for (let k = 0; k < 2; k++) { update(1 / (fps * 2)); await Promise.resolve(); await Promise.resolve(); }
    renderWorld(); drawUI();
    cx.imageSmoothingEnabled = false; cx.drawImage(world, 0, 0, UW, UH); cx.drawImage(ui, 0, 0);
    frames.push(cx.getImageData(0, 0, UW, UH).data);
  }
  S.capturing = false;
  await p;
  const { encodeGIF, buildPalette } = await import('../tools/gifenc.js');
  const gif = encodeGIF(UW, UH, frames, Math.round(100 / fps), buildPalette(frames));
  await save(new Blob([gif], { type: 'image/gif' }), name);
  return gif.length;
}
// 自動録画（WebM・効果音つき）：時間を固定刻みで進め、映像は WebCodecs、音は同じ効果音定義をオフライン描画して同期させる
//   run は async 関数（pull などを順に await する）。終わってから tail 秒だけ余韻を録る
async function captureAV(name, run, { fps = 30, tail = 1.5, max = 120, W = 1280, H = 720 } = {}) {
  const cv = mk(W, H), cx = cv.getContext('2d');
  const { createAVRecorder } = await import('../tools/avrec.js');
  const vr = await createAVRecorder(W, H, fps, { bitrate: 7e6 });
  S.capturing = true; snd.record(() => T);
  let done = false, err = null;
  Promise.resolve().then(run).catch(e => { err = e; }).finally(() => { done = true; });
  let i = 0, tt = 0;
  while (i < max * fps) {
    for (let k = 0; k < 2; k++) { update(1 / (fps * 2)); for (let m = 0; m < 4; m++) await Promise.resolve(); }
    renderWorld(); drawUI();
    const sx = (Math.random() - .5) * shake * 4, sy = (Math.random() - .5) * shake * 4;
    cx.imageSmoothingEnabled = false; cx.fillStyle = '#000'; cx.fillRect(0, 0, W, H);
    cx.drawImage(world, Math.round(sx), Math.round(sy), W, H); cx.drawImage(ui, 0, 0, W, H);
    await vr.addFrame(cv); i++;
    if (done) { tt += 1 / fps; if (tt >= tail) break; }
  }
  const ev = snd.stopRecord(); S.capturing = false;
  if (err) throw err;
  const dur = i / fps, ab = await snd.render(ev, dur);
  const blob = await vr.finish(ab);
  await save(blob, name);
  return { name, sec: +dur.toFixed(2), bytes: blob.size, codec: vr.codecId, sounds: ev.length };
}
// テスト・自動録画用
window.GACHA = { get demo() { return DEMO; }, simulate(n) { if (!DEMO || S.busy) return null; let out = []; for (let i = 0; i < n; i++) { S.pulls += 1; out = out.concat(roll(1)); } S.lastKeys = out.slice(-1).map(r => r.key); saveDemo(); return out.length; }, // 自動テスト用：演出なしで同じ抽選の道を通す
 demoReset, startDemo, get record() { try { return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); } catch (e) { return null; } }, startKick, decideBy, wrapTagged: (s, w) => wrapTagged(uc, s, w, 16), get deciding() { return decide ? (document.documentElement.classList.contains('propose') ? 'propose' : 'stop') : null; }, tick, embedBegin, embedEnd, get embedded() { return !!EM; }, say, captureAV, wait, doSkip, snd, M, set ff(v) { S.ff = v; }, capture, async step(sec, fps = 30) { S.capturing = true; for (let i = 0; i < sec * fps; i++) { update(1 / fps); await Promise.resolve(); await Promise.resolve(); } S.capturing = false; renderWorld(); drawUI(); present(); }, S, pull, firstSummon, save, out, setMode: m => { S.mode = m; }, setForce: f => { S.force = f; } };
