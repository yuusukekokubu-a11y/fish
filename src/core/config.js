// ゲームの数値(D-048・D-078・D-087・D-096)。魚と段階の設定表は fish.js にある。時間の単位はミリ秒、位置と幅はゲージ全体を 1 とした割合。
// 魚ごとの数値(報酬・ミニゲームの重さ)は fish.js の設定表にある。

export const DEFAULT_CONFIG = Object.freeze({
  // 掛かるまでの待ち時間の幅(一様な乱数。平均は 2 つの真ん中の 4.5 秒)。竿の段階では変えない(D-033)。
  waitMinMs: 1500,
  waitMaxMs: 7500,
  // 強い魚が掛かる確率の合計(D-096)。竿の段階では変えない(D-033)。将来のスキル(大物狙い)で上げられる。
  strongChance: 0.1,
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
    missBonusDamage: 0, // 外したあと、次の当たり 1 回に足すダメージ(ルアー:D-127・D-145)
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
    // クリティカルの確率と倍率は、計算が壊れない範囲の安全上限だけ(D-169)。確率 20 は 2000%(必ず 20 段)。
    maxCritChance: 20,
    maxCritStages: 20,
    maxCritTotalMultiplier: 1000000,
    maxHitDamage: 1000000000,
    minCritMultiplier: 1,
    maxCritMultiplier: 100,
    minMissHeal: 0,
    minTimeLimitMs: 1000,
    // 計算が壊れないための安全上限だけ(ゲームデザイン上の上限ではない:D-145)。
    maxDamage: 1000000,
    maxMissHeal: 1000000,
    maxMissBonusDamage: 1000000,
    maxTimeLimitBonusMs: 3600000,
    // 合わせの輪の下限(スマホで反応できる範囲と、連打を通用させないための早すぎの区間)。
    minHookRingMs: 1000,
    minHookSuccessMs: 250,
    minHookJustMs: 100,
    minHookEarlyMs: 300,
    maxJustMultiplier: 5,
  }),
  // スキル(D-166〜D-168・D-174)。表は skills.js にある。
  skills: Object.freeze({
    pointsPerLevel: 4, // 1 レベルに要るポイント
    growthMaxBase: 2, // 成長型の最大レベル = 2 + 竿の段階
    growthMaxPerStage: 1,
    cappedMax: 3, // 頭打ち型の最大レベル
    pointsBase: Object.freeze({ min: 2, max: 4 }), // グレード 1・レアのポイントの範囲
    pointsGradeGrowth: 0.35, // グレードが 1 上がるごとに増える割合(基本効果と同じ)
    pointsRarityMultiplier: Object.freeze({ normal: 1, rare: 1, epic: 1.25, legend: 1.5 }),
    minWaitMs: 1000, // 俊敏で短くしても、待ち時間は 1 秒より短くしない
  }),
  // クレートガチャ(D-140・D-146・D-147・D-149)。
  gacha: Object.freeze({
    targetSeconds: 120, // クレート 1 回分が貯まる目標の時間
    secondsPerCast: 8.6, // 1 回投げて結果が出るまでの平均の時間(上手に遊んだときの測定:Issue 14)
    gradeGrowth: 0.35, // グレードが 1 上がるごとに、基本効果の範囲が増える割合
    inventoryMax: 100, // 持ち物の上限
    pullMax: 10, // 1 回に引ける最大(10 連)
  }),
});
