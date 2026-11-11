// =====================================================================
// 召魂の抽選（表示と切り離した純粋な処理。ブラウザでも Node でも動く）
//   ・確率（試作値・本編の正式確率ではない）：N 52%／R 30%／SR 13%／SSR 4.5%／UR 0.5%
//   ・十連：SR 以上が 1 体もなければ、最後の 1 体を SR 以上にする（SR 90%・SSR 10%）
//   ・天井：SSR 以上が出ないまま 90 回目になったら、その回を SSR にする
//   ・天井の数え方：SSR 以上が出た回（十連の保証で SSR になった回も含む）で 0 に戻す
//     （2026-11-11：以前は十連の保証で SSR になったとき数え直していなかったのを直した）
//   ・重複した魔族もそのまま抽選する（自動で融合・強化しない）
//   state は保存できる普通のオブジェクト：{ pulls, sinceSSR, byRarity: {N,R,SR,SSR,UR} }
// =====================================================================
export const ORDER = ['N', 'R', 'SR', 'SSR', 'UR'];
export const RATES = { N: .52, R: .30, SR: .13, SSR: .045, UR: .005 };
export const PITY = 90;
export const rank = r => ORDER.indexOf(r);

export function newState() { return { pulls: 0, sinceSSR: 0, byRarity: { N: 0, R: 0, SR: 0, SSR: 0, UR: 0 } }; }

// 1 体ぶんのレア度（乱数 1 回）
export function rollRarity(rand = Math.random, rates = RATES) {
  const x = rand(); let a = 0;
  for (const k of ['UR', 'SSR', 'SR', 'R', 'N']) { a += rates[k]; if (x < a) return k; }
  return 'N';
}

// n 回ぶんのレア度を決め、state を進める。force（開発用：レア度の強制）は公開版では渡さない
export function rollRarities(state, n, { rand = Math.random, rates = RATES, pity = PITY, force = '' } = {}) {
  const rs = [];
  for (let i = 0; i < n; i++) {
    let r = rollRarity(rand, rates);
    if (state.sinceSSR + 1 >= pity && rank(r) < 3) r = 'SSR'; // 天井
    rs.push(r);
    state.sinceSSR = rank(r) >= 3 ? 0 : state.sinceSSR + 1;
  }
  // 十連の保証：SR 以上が 1 体もなければ、最後の 1 体を SR 以上に
  if (n >= 10 && !rs.some(r => rank(r) >= 2)) {
    rs[n - 1] = rand() < .9 ? 'SR' : 'SSR';
    if (rs[n - 1] === 'SSR') state.sinceSSR = 0;
  }
  if (force) { const i = n === 1 ? 0 : Math.floor(rand() * n); rs[i] = force; if (rank(force) >= 3) state.sinceSSR = 0; }
  state.pulls += n;
  rs.forEach(r => { state.byRarity[r] = (state.byRarity[r] || 0) + 1; });
  return rs;
}

// レア度 → 魔族（同じレア度の中から等しい確率で 1 体）
export function pickDemon(r, pool, rand = Math.random) {
  const keys = Object.keys(pool).filter(k => pool[k].r === r);
  return keys[Math.floor(rand() * keys.length)];
}
