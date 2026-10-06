// ゲームの数値(D-048・D-078・D-087・D-096)。魚と段階の設定表は fish.js にある。時間の単位はミリ秒、位置と幅はゲージ全体を 1 とした割合。
// 魚ごとの数値(報酬・ミニゲームの重さ)は fish.js の設定表にある。

export const DEFAULT_CONFIG = Object.freeze({
  // 弱い魚をジャストで釣ったときの、ウロコインの倍率(D-258)。順番は 基本 × これ × 豊漁(四捨五入、最小 1)。
  weakJustCoins: 1.5,
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
    zoneMargin: 0.08, // 命中範囲をゲージの端から離す幅
    // 絶対に当たらない状態にしないための限界(D-036・D-048)。
    minZoneWidth: 0.1, // 命中範囲の幅は、ゲージの 10% より狭くしない
    minSweepMs: 450, // 印は、端から端まで 0.45 秒より速く動かさない
  }),
  // 装備なしの「戦闘の数値の表」(D-071・D-078・D-080)。装備はこれを書き換えて渡す。
  combat: Object.freeze({
    damage: 10, // 通常ダメージ
    critChance: 0.1, // クリティカルの確率
    critMultiplier: 1.3, // クリティカルの倍率(D-255:1.5 → 1.3)
    missHeal: 10, // ミスしたときの回復
    timeLimitBonusMs: 0, // 魚ごとの制限時間に足す時間
    zoneWidthBonus: 0, // 命中範囲の幅を広げる割合(%。ルアー:D-181)
    penetration: 0, // 貫通(魚の防御から引く割合。1 で 100%:D-235)
    justMultiplier: 3, // ジャスト倍率:強い魚のジャストの初撃 = 1 命中の基本のダメージ × これ(D-256)
    // 合わせの縮む輪(D-084・D-087)。「!」と同時に縮み始め、ringMs で通り過ぎる。
    // 成功帯は通り過ぎる直前の successMs、ジャスト帯は成功帯の真ん中の justMs。
    hook: Object.freeze({
      normal: Object.freeze({ ringMs: 1600, successMs: 600, justMs: 200 }),
      strong: Object.freeze({ ringMs: 1200, successMs: 400, justMs: 140 }),
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
    // 計算が壊れないための安全上限だけ(ゲームデザイン上の上限ではない:D-181)。
    maxDamage: 1000000,
    maxMissHeal: 1000000,
    maxZoneWidthBonus: 1000000,
    maxPenetration: 1000000,
    // ルアーで広げた命中範囲の幅の上限(ゲージの 70%:D-181)。下限は minigame.minZoneWidth(10%)。
    maxZoneWidth: 0.7,
    maxTimeLimitBonusMs: 3600000,
    // 合わせの輪の下限(スマホで反応できる範囲と、連打を通用させないための早すぎの区間)。
    minHookRingMs: 1000,
    minHookSuccessMs: 250,
    minHookJustMs: 100,
    minHookEarlyMs: 300,
    maxJustMultiplier: 1000000, // ジャスト倍率の安全上限(計算が壊れない範囲だけ:D-256)
  }),
  // スキル(D-167・D-195・D-197・D-207)。表は skills.js にある。
  skills: Object.freeze({
    growthMaxBase: 2, // 成長型の最大レベル = 2 + 竿の段階
    growthMaxPerStage: 1,
    cappedMax: 3, // 頭打ち型の最大レベル
    // 装備 1 個のスキルのレベルの範囲:上限 =(段階の最大 ÷ 3 枠)× レア度の倍率、下限 = 上限の半分(D-207)。
    levelSlots: 3,
    levelRarityMultiplier: Object.freeze({ normal: 0, rare: 0.7, epic: 1, legend: 1.5 }),
    levelMinRatio: 0.5,
    // ゲージ系の帯(命中範囲の中心からの距離。端が 1):芯は 0.3 以下、縁は 0.75 以上(D-197・D-207)。
    coreRatio: 0.3,
    edgeRatio: 0.75,
    minWaitMs: 1000, // 俊敏で短くしても、待ち時間は 1 秒より短くしない
    comboMax: 10, // 連撃の最大段数(D-185)
    lowHpRatio: 0.25, // 「とどめ」は魚の体力が最大の 25% 以下で効く(D-184)
  }),
  // 魚と段階の数値の式の数(D-225・D-230)。式の形は formula.js。g は通し番号(段階 1, 2, 3…)。
  formula: Object.freeze({
    // ウロコイン:弱い魚 1 → 3 → 8 → 20 → 48 …(1 段ごとの伸びがだんだん下がる)。強い魚は 5 倍、ヌシは強い魚の 10 倍。
    weakCoins: 1,
    coinGrowth: 1.1,
    coinGrowthDecay: 10,
    strongCoinRatio: 5,
    bossCoinRatio: 10,
    scalesPerCatch: 1, // 強い魚とヌシが落とす鱗の数
    // 体力:強い魚 10 + 10g(20・30・40 …)、ヌシは 3.5 倍(D-115)。
    hpBase: 10,
    hpPerStage: 10,
    bossHpRatio: 3.5,
    // 制限時間:強い魚 8 秒 + 4 秒 × log5(g)、ヌシ 20 秒 + 10 秒 × log5(g)(D-245 で 30 + 20 から短くした)。
    timeLimitMs: 8000,
    timeLimitGrowthMs: 4000,
    bossTimeLimitMs: 20000,
    bossTimeLimitGrowthMs: 2000,
    timeLimitLogBase: 5,
    // 印の速さ 1000 − 100g ミリ秒(限界 450)、命中範囲の幅 0.25 − 0.03g(限界 0.10)。ヌシは 1 段先の値。
    sweepMs: 1000,
    sweepStepMs: 100,
    zoneWidth: 0.25,
    zoneStep: 0.03,
    bossStageOffset: 1,
    // 製作の鱗:3 + 7 ×(1 − e^(−(g−1)/8.7))を四捨五入(3・4・4・5・6 … 10)。進化はヌシの鱗 1。
    craftMin: 3,
    craftMax: 10,
    craftDecay: 8.7,
    evolveCount: 1,
    // 会心率・会心の倍率・貫通・ジャスト倍率の合計の逓減(D-245・D-255・D-257)。knee までは そのまま、こえた分は soft × ln(1 + こえた分 ÷ soft)。
    // knee は、会心率 Lv7(0.1 + 0.15 × 7)・会心威力 Lv7(1.3 + 0.05 × 7)・貫通 Lv7(0.1 × 7)・ジャスト・ブースト Lv7(3 + 0.3 × 7)の値。
    // soft は、1 レベルの増え方の約 3.3 レベル分(会心率 0.5・会心の倍率 0.25・貫通 0.25・ジャスト倍率 1)。
    critChanceCurve: Object.freeze({ knee: 1.15, soft: 0.5 }),
    critMultiplierCurve: Object.freeze({ knee: 1.65, soft: 0.25 }),
    justMultiplierCurve: Object.freeze({ knee: 5.1, soft: 1 }),
    // 基準の回数 N(g) = 10 × g^0.5(N(1) = 10・N(100) = 100):育てた装備は、各枠で g のクレートを N(g) 個引いた中の最良(D-254)。
    referenceDrawsFirst: 10,
    referenceDrawsExponent: 0.5,
    penetrationCurve: Object.freeze({ knee: 0.7, soft: 0.25 }),
    // 防御(D-235・D-245):通し番号 3 から。5 体目のヌシ = max(1.02, 最大レベルの貫通 + 0.35)、ほかは割合(上限 0.9)。
    defenseStartStage: 3,
    defensePenPerLevel: 0.1,
    defenseFloor: 1.02,
    defenseMargin: 0.35,
    bossDefenseShare: Object.freeze([0.15, 0.3625, 0.575, 0.7875, 1]),
    strongDefenseShare: 0.5,
    nonFinalDefenseMax: 0.9,
    // ヌシの命中回数の目標(D-238)と、体力の基準の装備(育てた装備の目安。シミュレーションで合わせた)。
    bossHitsFirst: 5,
    bossHitsLast: 12,
    bossReference: Object.freeze({ levelRatio: 0.25, penGap: 0.05, penGapDraws: 17, reelRatio: 0.4, scale: 1, growth: 0.1, positionScale: Object.freeze([0.8, 0.97, 0.98, 1.1, 1.09]) }),
    stagesPerGround: 5,
    noPenTapsFactor: 1,
    noPenBonusDraws: 45,
  }),
  // クレートガチャ(D-140・D-146・D-147・D-149)。
  gacha: Object.freeze({
    targetSeconds: 60, // クレート 1 回分が貯まる目標の時間(D-253:120 → 60)
    justRate: 0.7, // 価格の稼ぎを見積もるときの、ジャストの割合(「上手」:D-259)
    secondsPerCast: 8.6, // 1 回投げて結果が出るまでの平均の時間(上手に遊んだときの測定:Issue 14)
    gradeGrowth: 0.35, // グレードが 1 上がるごとに、基本効果の範囲が増える割合
    inventoryMax: 100, // 持ち物の上限
    pullMax: 10, // 1 回に引ける最大(10 連)
  }),
});
