// 釣りの 1 サイクルの数値(D-029)。時間の単位はミリ秒、位置と幅はゲージ全体を 1 とした割合。

export const DEFAULT_CONFIG = Object.freeze({
  // 掛かるまでの待ち時間の幅(一様な乱数。平均は 2 つの真ん中の 4.5 秒)。
  waitMinMs: 1500,
  waitMaxMs: 7500,
  // 強い魚が掛かる確率。
  strongChance: 0.2,
  // 各場面の長さ。
  castMs: 700, // 投げる
  biteMs: 500, // 掛かった合図
  reelMs: 900, // 普通の魚を巻き上げる
  resultMs: 1200, // 結果を見せる
  minigame: Object.freeze({
    sweepMs: 900, // 印がゲージの端から端まで動く時間
    zoneWidth: 0.22, // 当たり範囲の幅
    zoneMargin: 0.08, // 当たり範囲をゲージの端から離す幅
    timeoutMs: 5000, // この間タップしなければ逃げられる
  }),
});
