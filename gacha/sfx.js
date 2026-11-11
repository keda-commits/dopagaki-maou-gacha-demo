// =====================================================================
// 召魂の儀 — 効果音（WebAudio 合成のみ・素材ファイルなし）
//   同じ音の定義を「ライブ再生（AudioContext）」と
//   「録画用のオフライン描画（OfflineAudioContext）」の両方で使う。
//   録画中は play() が {時刻, 音名, 引数} を記録するだけになり、
//   最後に render() で映像と完全に同期した音声を作る。
//   Godot 版では、ここで作った音を WAV に書き出して AudioStreamPlayer で鳴らす想定。
// =====================================================================
const RK = { N: 0, R: 1, SR: 2, SSR: 3, UR: 4, SOUL: 3 };
const mf = m => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------------- 音の部品 ---------------- */
function impulse(ctx, dur, decay) {
  const n = Math.floor(ctx.sampleRate * dur), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return b;
}
function newBus(A, t) {
  if (A.bus) { for (const g of [A.bus.dry, A.bus.wet]) { g.gain.setValueAtTime(1, t); g.gain.linearRampToValueAtTime(0, t + .09); } }
  const dry = A.ctx.createGain(), wet = A.ctx.createGain();
  dry.connect(A.master); wet.connect(A.rev);
  A.bus = { dry, wet };
}
function route(A, node, wet = .2, pan = 0) {
  let n = node;
  if (pan) { const p = A.ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); n.connect(p); n = p; }
  n.connect(A.bus.dry);
  if (wet > 0) { const g = A.ctx.createGain(); g.gain.value = wet; n.connect(g); g.connect(A.bus.wet); }
}
function envGain(A, t, vol, att, dur) {
  const g = A.ctx.createGain();
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(.0002, vol), t + Math.max(.001, att));
  g.gain.exponentialRampToValueAtTime(.0001, t + Math.max(att + .01, dur));
  return g;
}
// 発振器：f→f2 へスライド、任意でフィルタ・ビブラート
function osc(A, t, o) {
  const c = A.ctx, s = c.createOscillator(), dur = o.dur || .2;
  s.type = o.type || 'sine';
  s.frequency.setValueAtTime(o.f, t);
  if (o.f2) s.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + (o.slide || dur));
  if (o.detune) s.detune.value = o.detune;
  if (o.vib) { const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = o.vib; lg.gain.value = o.vibAmt || 12; l.connect(lg); lg.connect(s.detune); l.start(t); l.stop(t + dur + .1); }
  let n = s;
  if (o.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(o.lp, t); if (o.lp2) f.frequency.exponentialRampToValueAtTime(o.lp2, t + dur * .8); f.Q.value = o.q || .7; n.connect(f); n = f; }
  if (o.bp) { const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.bp; f.Q.value = o.q || 2; n.connect(f); n = f; }
  const g = envGain(A, t, o.vol == null ? .1 : o.vol, o.att || .004, dur);
  n.connect(g); route(A, g, o.wet ?? .15, o.pan || 0);
  s.start(t); s.stop(t + dur + .05);
}
// ノイズ：フィルタの種類と周波数スイープ
function nz(A, t, o) {
  const c = A.ctx, s = c.createBufferSource(), dur = o.dur || .2;
  s.buffer = A.nb; s.loop = true; s.playbackRate.value = o.rate || 1;
  const f = c.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); f.Q.value = o.q || .8;
  if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + dur);
  const g = envGain(A, t, o.vol || .1, o.att || .003, dur);
  s.connect(f); f.connect(g); route(A, g, o.wet ?? .2, o.pan || 0);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + .05);
}
// 金属（鎖）：非整数倍音の短い減衰
function metal(A, t, f, vol, dec, wet = .25, pan = 0) {
  [1, 2.76, 5.4, 8.93, 13.34].forEach((m, i) => osc(A, t, { f: f * m, dur: dec / (1 + i * .7), vol: vol / (1 + i * .9), att: .0015, wet, pan }));
  nz(A, t, { ft: 'highpass', f: 5000, dur: .025, vol: vol * .6, wet: wet * .5, pan });
}
// 鐘・きらめき
function bell(A, t, f, vol, dec = 1.2, wet = .45, pan = 0) {
  [[1, 1], [2, .5], [3, .32], [4.16, .2], [5.43, .14]].forEach(([m, v], i) => osc(A, t, { f: f * m, dur: dec / (1 + i * .5), vol: vol * v, att: .002, wet, pan }));
}
// 和音のパッド（鋸波を少しずらして重ね、フィルタを開く）
function pad(A, t, notes, dur, vol, o = {}) {
  notes.forEach((m, i) => [-7, 7].forEach(d => osc(A, t + (o.strum || 0) * i, { type: o.type || 'sawtooth', f: mf(m), detune: d, dur, vol: vol / 2, att: o.att || .08, lp: o.lp || 1400, lp2: o.lp2, wet: o.wet ?? .4, pan: (i / Math.max(1, notes.length - 1) - .5) * .6 })));
}
// 合唱っぽい母音（鋸波 → 2つのバンドパス）
function choir(A, t, notes, dur, vol) {
  notes.forEach((m, i) => [700, 1150].forEach((fm, j) => osc(A, t, { type: 'sawtooth', f: mf(m), detune: (i - 1) * 6, dur, vol: vol * (j ? .6 : 1), att: dur * .35, bp: fm, q: 5, vib: 5.2, vibAmt: 9, wet: .7 })));
}
function boom(A, t, f = 62, vol = .5, dur = .9) {
  osc(A, t, { f, f2: f * .55, dur, vol, att: .004, wet: .3 });
  nz(A, t, { ft: 'lowpass', f: 220, dur: dur * .7, vol: vol * .5, wet: .3 });
}
function crash(A, t, vol = .12, dur = 1.6) { nz(A, t, { ft: 'highpass', f: 4200, f2: 2500, dur, vol, wet: .6, q: .5 }); }

/* ---------------- 音の一覧 ---------------- */
const SND = {
  cut(A, t) { newBus(A, t); },
  ambient(A, t, dur) {
    const c = A.ctx;
    // 玉座の間の低いうなり
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 2;
    const g = c.createGain(); g.gain.value = .045; f.connect(g); g.connect(A.master);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = .06; lg.gain.value = 90; lfo.connect(lg); lg.connect(f.frequency); lfo.start(t); lfo.stop(t + dur);
    [41.2, 61.7, 82.4].forEach((fr, i) => { const o = c.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = fr; o.detune.value = (i - 1) * 6; o.connect(f); o.start(t); o.stop(t + dur); });
    // すきま風
    const s = c.createBufferSource(); s.buffer = A.nb; s.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = .7;
    const wl = c.createOscillator(), wlg = c.createGain(); wl.frequency.value = .11; wlg.gain.value = 260; wl.connect(wlg); wlg.connect(wf.frequency); wl.start(t); wl.stop(t + dur);
    const wg = c.createGain(); wg.gain.value = .022; s.connect(wf); wf.connect(wg); wg.connect(A.master); wg.connect(A.rev);
    s.start(t); s.stop(t + dur);
  },
  ui(A, t) { osc(A, t, { type: 'triangle', f: 1320, dur: .05, vol: .05, wet: .05 }); osc(A, t + .03, { type: 'triangle', f: 1980, dur: .05, vol: .035, wet: .05 }); },
  skip(A, t) { newBus(A, t); nz(A, t + .01, { ft: 'bandpass', f: 5000, f2: 1200, dur: .18, vol: .08, q: 1.2, wet: .1 }); },
  // 魂晶を投げる・淵に落ちる
  toss(A, t, i = 0) { metal(A, t, rnd(2500, 3200) + i * 40, .045, .22, .2, rnd(-.4, -.1)); nz(A, t, { ft: 'highpass', f: 3500, dur: .1, vol: .02 }); },
  plip(A, t) { osc(A, t, { f: rnd(820, 980), f2: 260, dur: .14, vol: .06, wet: .55 }); },
  pitOpen(A, t, big) {
    nz(A, t, { ft: 'lowpass', f: 110, f2: 700, dur: 1.1, vol: .3, att: .35, wet: .4 });
    osc(A, t, { f: 44, dur: 1.3, vol: .3, att: .25, wet: .2 });
    osc(A, t, { type: 'sawtooth', f: 88, f2: 140, dur: 1.0, vol: .05, att: .45, lp: 520 });
    if (big) { bell(A, t + .25, mf(45), .07, 2.6, .6); nz(A, t + .2, { ft: 'bandpass', f: 300, f2: 2400, dur: 1.2, vol: .07, att: .6, wet: .6 }); }
  },
  // 鎖が淵から上がる（じゃらじゃら）
  rise(A, t, tier, n = 1) {
    const base = { N: 1700, R: 2000, SR: 2300, SSR: 2650, UR: 1350, SOUL: 3400 }[tier] || 1800;
    const count = 9 + Math.min(n, 10) * 1.6;
    for (let i = 0; i < count; i++) metal(A, t + i * (.46 / count) + rnd(0, .02), base * rnd(.88, 1.12), .03 * rnd(.7, 1.3), .14, .25, rnd(-.5, .5));
    nz(A, t, { ft: 'lowpass', f: 380, dur: .5, vol: .06 });
  },
  grab(A, t) { metal(A, t, 520, .12, .5, .3); osc(A, t, { f: 120, f2: 60, dur: .12, vol: .18 }); },
  // 踏ん張り：0.25秒ごとに鳴らす（早送り・スキップと自然に同期する）
  creak(A, t, tier, k, beat) {
    const r = RK[tier] || 0;
    nz(A, t, { ft: 'bandpass', f: rnd(420, 760), q: 14, dur: .2, vol: .09, att: .04, wet: .15 });
    osc(A, t, { type: 'sawtooth', f: 52 + r * 4, dur: .22, vol: .045, lp: 300, att: .03 });
    if (Math.random() < .7) metal(A, t + rnd(.02, .12), rnd(1500, 2300), .018, .1, .2, rnd(-.4, .4));
    // 張りつめていく音（だんだん高く）
    osc(A, t, { f: mf(50 + r * 3) * (1 + k * .6), dur: .27, vol: .012 + r * .006, att: .05, wet: .3 });
    if (r >= 2 && beat) { osc(A, t, { f: 58, f2: 38, dur: .16, vol: .24 + r * .04, wet: .1 }); osc(A, t + .14, { f: 50, f2: 34, dur: .14, vol: .14 + r * .03, wet: .1 }); }
  },
  upgrade(A, t, tier) {
    const r = RK[tier] || 2;
    metal(A, t, 640, .22, 1.5, .55);
    crash(A, t, .07 + r * .02, 1.1);
    osc(A, t, { f: 70, f2: 38, dur: .5, vol: .32 });
    const ch = { SR: [62, 66, 69, 74], SSR: [64, 68, 71, 76], UR: [60, 63, 66, 72] }[tier] || [62, 66, 69];
    pad(A, t, ch, .7, .05, { att: .01, lp: 3200, lp2: 900 });
  },
  omen(A, t) {
    boom(A, t, 40, .6, 2.6);
    metal(A, t, 105, .22, 3.2, .8);
    [55, 58.3, 82.4, 87.3].forEach((f, i) => osc(A, t, { type: 'sawtooth', f, dur: 2.4, vol: .05, att: .25, lp: 260, lp2: 900, wet: .5, pan: (i - 1.5) * .3 }));
    choir(A, t + .05, [45, 48, 51], 2.6, .03);
    nz(A, t, { ft: 'lowpass', f: 160, dur: 2.2, vol: .25, wet: .4 });
  },
  yank(A, t, tier) {
    const r = RK[tier] || 0;
    nz(A, t, { ft: 'bandpass', f: 300, f2: 3600, dur: .36, vol: .18, q: 1.1, wet: .2 });
    osc(A, t + .05, { f: 120, f2: 36, dur: .45, vol: .42 });
    metal(A, t + .03, 1150, .12, .5, .3);
    if (r >= 3) crash(A, t + .05, .09, 1.2);
  },
  soulPop(A, t, tier) {
    const r = RK[tier] || 0;
    nz(A, t, { ft: 'bandpass', f: 3800, f2: 300, dur: .24, vol: .09, q: 2 });
    osc(A, t + .2, { f: 160, f2: 70, dur: .2, vol: .2 });
    const sc = [0, 2, 4, 7, 9, 12, 14, 16];
    for (let i = 0; i < 4 + r * 2; i++) bell(A, t + .22 + i * .045, mf(84 + sc[(Math.random() * sc.length) | 0]), .025, .8, .6, rnd(-.5, .5));
  },
  souls(A, t) {
    nz(A, t, { ft: 'bandpass', f: 700, f2: 4200, dur: .55, vol: .1, q: 1.4, wet: .3 });
    for (let i = 0; i < 10; i++) bell(A, t + .05 + i * .04, mf(rnd(86, 98)), .014, .5, .5, rnd(-.6, .6));
  },
  land(A, t) {
    for (let i = 0; i < 10; i++) { osc(A, t + i * .018, { f: 150, f2: 70, dur: .09, vol: .05, pan: (i % 5 - 2) * .2 }); }
    bell(A, t + .05, mf(91), .02, .6);
  },
  cardCharge(A, t, k) {
    const big = k >= 3;
    nz(A, t, { ft: 'highpass', f: 1800, f2: 7000, dur: big ? .45 : .3, vol: big ? .07 : .045, att: big ? .3 : .2 });
    osc(A, t, { f: big ? 500 : 650, f2: big ? 1400 : 1200, dur: big ? .45 : .3, vol: .035, att: .2, wet: .3 });
  },
  flip(A, t, tier) {
    const r = RK[tier] || 0;
    nz(A, t, { ft: 'highpass', f: 2600, dur: .05, vol: .07, wet: .05 });
    const arp = [[72], [76, 83], [74, 78, 81], [76, 80, 83, 88], [73, 76, 80, 85]][r];
    arp.forEach((m, i) => osc(A, t + i * .045, { type: 'triangle', f: mf(m), dur: .3 + r * .05, vol: r ? .05 : .035, wet: .25 }));
  },
  silhouette(A, t, tier) {
    const r = RK[tier] || 0;
    osc(A, t, { f: 80, f2: 55, dur: .5, vol: .1 + r * .05 });
    nz(A, t, { ft: 'bandpass', f: 250, f2: 3200, dur: .5, vol: .04 + r * .02, att: .4, wet: .4 });
    if (r >= 3) osc(A, t, { f: mf(88), dur: .5, vol: .02, vib: 14, vibAmt: 40, wet: .6 });
  },
  stinger(A, t, tier) {
    const r = RK[tier] || 0;
    if (r === 0) { [60, 64, 67].forEach((m, i) => osc(A, t + i * .03, { type: 'triangle', f: mf(m), dur: .5, vol: .04, wet: .3 })); return; }
    if (r === 1) { [67, 71, 74, 79].forEach((m, i) => osc(A, t + i * .06, { type: 'triangle', f: mf(m), dur: .6, vol: .05, wet: .35 })); bell(A, t + .25, mf(83), .03); return; }
    if (r === 2) {
      boom(A, t, 70, .25, .5);
      [62, 66, 69, 74, 78, 81].forEach((m, i) => osc(A, t + i * .05, { type: 'sawtooth', f: mf(m), dur: .5, vol: .03, lp: 2600, wet: .4 }));
      pad(A, t + .1, [62, 69, 74, 78], 1.6, .03, { att: .1 });
      bell(A, t + .3, mf(86), .04); bell(A, t + .42, mf(90), .035);
      return;
    }
    // SSR / UR：ティンパニ＋金管風の和音＋鐘の旋律＋合唱
    const ur = r === 4;
    boom(A, t, ur ? 52 : 65, .55, 1.0); if (ur) boom(A, t + .18, 48, .5, 1.2);
    crash(A, t, .12, 1.8);
    if (ur) metal(A, t, 98, .2, 2.6, .8);
    pad(A, t + .02, ur ? [49, 56, 61, 64, 68, 73] : [52, 59, 64, 68, 71, 76], 2.4, .055, { att: .06, lp: 700, lp2: 3400, wet: .45 });
    (ur ? [73, 76, 80, 85, 88] : [76, 80, 83, 88]).forEach((m, i) => bell(A, t + .25 + i * .12, mf(m), .055, 1.6, .55, (i - 2) * .2));
    choir(A, t + .1, ur ? [61, 64, 68] : [64, 71, 76], 2.6, .022);
    for (let i = 0; i < 12; i++) bell(A, t + .6 + i * .07, mf(rnd(88, 100)), .012, .6, .7, rnd(-.7, .7));
  },
  dupe(A, t) { bell(A, t, mf(88), .045, .7); bell(A, t + .09, mf(93), .04, .9); },
  blip(A, t, who) {
    if (who === 'verm') osc(A, t, { type: 'triangle', f: rnd(740, 800), dur: .05, vol: .035, lp: 3000, wet: .1, vib: 30, vibAmt: 30 });
    else osc(A, t, { type: 'square', f: rnd(400, 470), dur: .045, vol: .028, lp: 1700, wet: .05 });
  },
  womp(A, t) { [[196, .22], [185, .22], [174.6, .55]].reduce((tt, [f, d]) => { osc(A, tt, { type: 'sawtooth', f, dur: d, vol: .045, lp: 900, att: .02, vib: d > .3 ? 6 : 0, vibAmt: 25, wet: .2 }); return tt + d; }, t); },
  joy(A, t) { osc(A, t, { f: 300, f2: 720, dur: .14, vol: .05, slide: .1 }); bell(A, t + .08, mf(91), .02, .5); },
  firstSoul(A, t) {
    boom(A, t, 55, .4, 1.4);
    nz(A, t, { ft: 'highpass', f: 2500, f2: 9000, dur: 2.2, vol: .05, att: .9, wet: .8 });
    pad(A, t, [60, 67, 72, 76, 79], 4.2, .04, { type: 'sine', att: .8, lp: 4000, wet: .7 });
    [72, 76, 79, 84, 88, 91, 96].forEach((m, i) => bell(A, t + .15 + i * .14, mf(m), .045, 2.2, .7, (i - 3) * .15));
    choir(A, t + .3, [60, 67, 72], 3.6, .02);
  },
};

/* ---------------- 本体 ---------------- */
export { osc, nz, metal, bell, pad, choir, boom, crash, mf, rnd };
// extra：ほかの実験（戦闘など）が自分の音を足すための表
export function createSound(extra = {}) {
  const SNDS = { ...SND, ...extra };
  let L = null, rec = null, vol = .9, muted = false;
  function build(ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = .003; comp.release.value = .25;
    comp.connect(ctx.destination);
    // 出力の大きさを測る（確認用）：実際にスピーカーへ出る直前の音
    if (ctx.createAnalyser && !(ctx instanceof OfflineAudioContext)) { const an = ctx.createAnalyser(); an.fftSize = 2048; comp.connect(an); ctx.__an = an; }
    const master = ctx.createGain(); master.gain.value = muted ? 0 : vol; master.connect(comp);
    const rev = ctx.createConvolver(); rev.buffer = impulse(ctx, 2.6, 2.6);
    const rg = ctx.createGain(); rg.gain.value = .5; rev.connect(rg); rg.connect(master);
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const A = { ctx, master, rev, nb, bus: null };
    newBus(A, 0);
    return A;
  }
  return {
    init() {
      if (L) { if (L.ctx.state === 'suspended') L.ctx.resume(); return; }
      try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); L = build(ctx); SND.ambient(L, ctx.currentTime, 3600 * 6); } catch (e) { L = null; }
    },
    play(name, ...args) {
      if (rec) { rec.ev.push({ t: rec.clock() - rec.t0, name, args }); return; }
      if (L && SNDS[name] && L.ctx.state === 'running') SNDS[name](L, L.ctx.currentTime + .005, ...args);
    },
    record(clock) { rec = { clock, t0: clock(), ev: [] }; },
    stopRecord() { const e = rec ? rec.ev : []; rec = null; return e; },
    get recording() { return !!rec; },
    async render(ev, dur, sr = 48000, ambient = null) {
      const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
      const A = build(ctx);
      // ambient：[開始, 終了]（秒）。演出が画面に出ている間だけ環境音を鳴らすとき
      if (ambient) SND.ambient(A, Math.max(0, ambient[0]), Math.max(0.1, ambient[1] - ambient[0])); else SND.ambient(A, 0, dur + 1);
      ev.forEach(e => SNDS[e.name] && SNDS[e.name](A, Math.max(0, e.t) + .001, ...e.args));
      return ctx.startRendering();
    },
    suspend() { if (L && L.ctx.state === 'running') L.ctx.suspend(); },
    resume() { if (L && L.ctx.state === 'suspended') L.ctx.resume(); },
    toggleMute() { muted = !muted; if (L) L.master.gain.value = muted ? 0 : vol; return muted; },
    setVolume(v) { vol = Math.max(0, Math.min(1, v)); if (L && !muted) L.master.gain.value = vol; return vol; }, // 試遊版の音量つまみ
    get volume() { return vol; },
    get muted() { return muted; },
    get state() { return L ? L.ctx.state : 'none'; }, // 確認用：AudioContext の状態（running なら鳴っている）
    // 確認用：いま出ている音の大きさ（RMS、0〜1）
    level() { const an = L && L.ctx.__an; if (!an || L.ctx.state !== 'running') return 0; const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length); },
  };
}
