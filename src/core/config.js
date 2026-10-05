// ゲームの数値(D-047・D-048・D-078・D-087)。時間の単位はミリ秒、位置と幅はゲージ全体を 1 とした割合。
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
    // 合わせの縮む輪(D-084・D-087)。「!」と同時に縮み始め、ringMs で通り過ぎる。
    // 成功帯は通り過ぎる直前の successMs、ジャスト帯は成功帯の真ん中の justMs。
    hook: Object.freeze({
      normal: Object.freeze({ ringMs: 1600, successMs: 600, justMs: 200 }),
      strong: Object.freeze({ ringMs: 1200, successMs: 400, justMs: 140 }),
      justMultiplier: 1.5, // ジャストのあとの強い魚への最初の一撃の倍率(D-089)
    }),
  }),
  // 戦闘の数値の表の上限と下限。装備で上げるときも、ここをこえない。
  combatLimits: Object.freeze({
    minDamage: 1,
    maxCritChance: 1,
    minCritMultiplier: 1,
    maxCritMultiplier: 10,
    minMissHeal: 0,
    minTimeLimitMs: 1000,
    // 合わせの輪の下限(スマホで反応できる範囲と、連打を通用させないための早すぎの区間)。
    minHookRingMs: 1000,
    minHookSuccessMs: 250,
    minHookJustMs: 100,
    minHookEarlyMs: 300,
    maxJustMultiplier: 5,
  }),
  rod: Object.freeze({
    maxStage: 5, // 竿の段階の上限
    // 段階 1→2、2→3、3→4、4→5 に必要な素材の数(D-047)。
    upgradeCosts: Object.freeze([10, 30, 80, 200]),
  }),
});
