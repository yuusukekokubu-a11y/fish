// ゲームの数値(D-047・D-048・D-062・D-078)。時間の単位はミリ秒、位置と幅はゲージ全体を 1 とした割合。
// 魚ごとの数値(報酬・ミニゲームの重さ)は fish.js の設定表にある。

export const DEFAULT_CONFIG = Object.freeze({
  // 掛かるまでの待ち時間の幅(一様な乱数。平均は 2 つの真ん中の 4.5 秒)。竿の段階では変えない(D-033)。
  waitMinMs: 1500,
  waitMaxMs: 7500,
  // 強い魚が掛かる確率の合計。竿の段階では変えない(D-033)。
  strongChance: 0.2,
  // 各場面の長さ。
  castMs: 700, // 投げる
  reelMs: 900, // 合わせたあと、普通の魚を巻き上げる
  resultMs: 1200, // 結果を見せる
  // 合わせの受付時間(D-062)。スマホで反応できるよう、どちらも 1.0 秒を下回らない。
  hook: Object.freeze({
    normalMs: 1500,
    strongMs: 1100,
  }),
  // 合わせをこの回数続けて逃すと、投げ直しを止めて休む(タップで再開)。
  missStreakLimit: 5,
  minigame: Object.freeze({
    zoneMargin: 0.08, // 当たり範囲をゲージの端から離す幅
    // 絶対に当たらない状態にしないための限界(D-036・D-048)。
    minZoneWidth: 0.1, // 当たり範囲の幅は、ゲージの 10% より狭くしない
    minSweepMs: 450, // 印は、端から端まで 0.45 秒より速く動かさない
  }),
  // 装備なしの「戦闘の数値の表」(D-071・D-078・D-080)。装備はこれを書き換えて渡す。
  combat: Object.freeze({
    damage: 10, // 通常ダメージ
    critChance: 0.1, // クリティカルの確率
    critMultiplier: 2, // クリティカルの倍率
    missHeal: 10, // 外したときの回復
    timeLimitBonusMs: 0, // 魚ごとの制限時間に足す時間
  }),
  // 戦闘の数値の表の上限と下限。装備で上げるときも、ここをこえない。
  combatLimits: Object.freeze({
    minDamage: 1,
    maxCritChance: 1,
    minCritMultiplier: 1,
    maxCritMultiplier: 10,
    minMissHeal: 0,
    minTimeLimitMs: 1000,
  }),
  rod: Object.freeze({
    maxStage: 5, // 竿の段階の上限
    // 段階 1→2、2→3、3→4、4→5 に必要な素材の数(D-047)。
    upgradeCosts: Object.freeze([10, 30, 80, 200]),
  }),
});
