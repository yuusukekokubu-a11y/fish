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
    // ふつうの魚は、式の下限(formula.zoneMin 10%・sweepMinMs 0.45 秒)で止まる。ヌシのくせ(D-381)は、ここまで狭く・速くしてよい。
    minZoneWidth: 0.05, // 命中範囲の幅は、ゲージの 5% より狭くしない
    minSweepMs: 300, // 印は、端から端まで 0.3 秒より速く動かさない
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
    markerSlow: 0, // 印の動きを遅くする割合(版 7 まではおもり:D-320。版 8 からはお守りの「静め」で使う:D-392)。印の速さ ×(1 − これ)。基準の 50% より遅くしない
    hookWiden: 0, // 合わせの成功帯とジャスト帯を広げる割合(浮き:D-320)
    coinBonus: 0, // 獲得ウロコインを増やす割合(おもり:D-320・D-392。豊漁と足し算)
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
    // 糸・粘りなどで延びる制限時間の上限 = 魚の制限時間 × これ(D-380:元の制限時間まで。合計で最大 2 倍)。
    maxTimeBonusRatio: 1,
    // 計算が壊れないための安全上限だけ(ゲームデザイン上の上限ではない:D-181)。
    maxDamage: 1000000,
    maxMissHeal: 1000000,
    maxZoneWidthBonus: 1000000,
    maxPenetration: 1000000,
    // ルアーで広げた命中範囲の幅の上限(ゲージの 70%:D-181)。下限は minigame.minZoneWidth(5%)。
    maxZoneWidth: 0.7,
    maxTimeLimitBonusMs: 3600000,
    // 合わせの輪の下限(スマホで反応できる範囲と、連打を通用させないための早すぎの区間)。
    minHookRingMs: 1000,
    minHookSuccessMs: 250,
    minHookJustMs: 100,
    minHookEarlyMs: 300,
    maxJustMultiplier: 1000000, // ジャスト倍率の安全上限(計算が壊れない範囲だけ:D-256)
    // おもり・浮き(D-320):印の速さは基準の 50% より遅くしない。成功帯は輪の 60%、ジャスト帯は成功帯の 50% まで。
    maxMarkerSlow: 0.5,
    maxHookSuccessRatio: 0.6,
    maxHookJustRatio: 0.5,
    maxCoinBonus: 1000000, // おもりのウロコインの安全上限(計算が壊れない範囲だけ)
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
    // 体力:強い魚 10 + 10g(20・30・40 …)。
    hpBase: 10,
    hpPerStage: 10,
    // ヌシの体力 = 77 × g^0.77 × 1.14^g を上から 2 けた(D-380・D-381)。目安の引く回数 P(g) の装備で、ふつうの遊び方が 80% 勝つ体力に、
    // シミュレーションで合わせ、式との差(±2 割)を見込んで全体を 0.9 倍にした(g=1〜30。g=31 からは、釣り場を足すときに合わせ直す)。
    // 版 8 でガチャの枠が 6 → 5 になった(付けられるスキルが減る)ので、全体を 0.85 倍にした(75.4 → 64.1:D-395)。
    bossHpBase: 64.1,
    bossHpPower: 0.9323,
    bossHpGrowth: 1.1425,
    // 目安の引く回数 P(g) = 20 × 6^((g − 1) ÷ 29) を四捨五入(g=1 で 20 回、g=30 で 120 回:D-379)。
    targetPullsFirst: 20,
    targetPullsGrowth: 1.06375,
    // 制限時間:強い魚 8 秒 + 4 秒 × log5(g)、ヌシ 20 秒 + 2 秒 × log5(g)(D-260・D-380)。糸・粘りの延長は、元の制限時間まで(combatLimits)。
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
    zoneMin: 0.1,
    sweepMinMs: 450,
    bossStageOffset: 1,
    // ヌシのくせ(D-379・D-381):釣り場の番号 k(港 0・磯 1・川 2 …)ごとに 1 つ。その釣り場のヌシ全部に付き、4・5 体目は 1 つ前の釣り場のくせも重ねる。
    // narrow:命中範囲 × zoneScale(対策はルアー・芯と縁)。wall:防御 = max(floor, ふつうの貫通 + margin)(対策は貫通)。
    // ふつうの貫通 = 貫通 Lv min(2 + g, levelFirst + levelStep ×(g − levelAt))の値(目安の引く回数 P(g) の装備の中央値に合わせた)。
    // fast:印の速さ × sweepScale(対策はおもり)。regen:1 秒ごとに体力 × perSecRatio を回復(対策は短い時間の火力)。
    // short:制限時間 × timeScale(対策は糸・粘り。延びる上限は、くせの前の制限時間で数える:D-382)。
    // hpScale:くせのあるヌシの体力に掛ける数(合う装備で、ふつう + P 回が 8 割勝つように合わせた)。
    quirks: Object.freeze({
      byArea: Object.freeze(["", "narrow", "wall", "fast", "regen", "short"]),
      narrow: Object.freeze({ zoneScale: 0.6, hpScale: 0.52 }),
      wall: Object.freeze({ floor: 1.02, margin: 0.2, penPerLevel: 0.1, levelAt: 11, levelFirst: 9, levelStep: 2, hpScale: 0.46 }),
      fast: Object.freeze({ sweepScale: 0.66, hpScale: 1 }),
      regen: Object.freeze({ perSecRatio: 0.01, hpScale: 0.69 }),
      short: Object.freeze({ timeScale: 0.5, hpScale: 0.69 }),
    }),
    // 製作の鱗:3 + 7 ×(1 − e^(−(g−1)/8.7))を四捨五入(3・4・4・5・6 … 10)。進化はヌシの鱗 1。
    craftMin: 3,
    craftMax: 10,
    craftDecay: 8.7,
    evolveCount: 1,
    // 会心率・会心の倍率・貫通・ジャスト倍率の合計の逓減(D-255・D-257・D-260)。knee までは そのまま、こえた分は soft × ln(1 + こえた分 ÷ soft)。
    // knee は、会心率 Lv7(0.1 + 0.15 × 7)・会心威力 Lv7(1.3 + 0.05 × 7)・貫通 Lv7(0.1 × 7)・ジャスト・ブースト Lv7(3 + 0.3 × 7)の値。
    // soft は、1 レベルの増え方の約 3.3 レベル分(会心率 0.5・会心の倍率 0.25・貫通 0.25・ジャスト倍率 1)。
    critChanceCurve: Object.freeze({ knee: 1.15, soft: 0.5 }),
    critMultiplierCurve: Object.freeze({ knee: 1.65, soft: 0.25 }),
    justMultiplierCurve: Object.freeze({ knee: 5.1, soft: 1 }),
    // 餌の価格 = 強い魚 1 匹のウロコイン × 0.8(期待報酬の 7〜9 割:D-265)。
    baitPriceRatio: 0.8,
    penetrationCurve: Object.freeze({ knee: 0.7, soft: 0.25 }),
    stagesPerGround: 5,
    // 序盤(g=1〜2)のヌシの体力の上限。装備なしでも(少し外しても)倒せるように(D-358)。
    earlyStages: 2,
    earlyBossHpMax: 120,
  }),
  // セーブコード(D-324):署名なしの古い形式(TSURI1〜4)を、読み込みで受け付けるか。②-5a から false(拒否)。
  // ブラウザの中の保存データの読み出し(parseSave)は、この設定に関係なく読む。
  saveCode: Object.freeze({ acceptUnsigned: false }),
  // 降臨(D-396・D-397)。キャラの表は kourin.js、お守りの表は charms.js。
  kourin: Object.freeze({
    // ウロコパワー(D-403):釣り上げと鱗で貯め、ねらう相手に注入する。どれも段階(レベル)が 1 上がるごとに growth 倍。
    growth: 2,
    weakPower: 1, // 釣り上げ(弱い魚・餌の強い魚)× growth^(魚の段階 − 1)
    strongPower: 5, // 強い魚・ヌシ × growth^(魚の段階 − 1)
    scalePower: 10, // 強い魚の鱗 1 枚 × growth^(鱗の段階 − 1)
    need: 240, // レベル L の相手を呼ぶのに要る量 × growth^(L − 1)
    scaleShare: 0.5, // 要る量のうち、鱗で注入できる割合
    hpRatio: 6, // レベル n の体力 = 段階 n のヌシの体力(キャラのくせの補正つき)× これ
    hpRatioByChar: Object.freeze({ ebi: 5 }), // キャラごとの上書き(疾風の大エビは倒すまでの回数が多かったので軽く:D-404)
    steps: 10, // 区切りの数(10% ごと)
    coinFish: 5, // ウロコインの区切り = そのレベルの強い魚 × これ
    charmK: 15, // お守りの効果 = 上限 × L ÷(L + charmK)
  }),
  // 餌(D-263):所持数の上限。
  bait: Object.freeze({ max: 99 }),
  // グローブ(D-332〜D-334):保管の上限、釣れるクレートの出現率(弱い魚の投ごと。D-337 で決めた)、仕切り直しのストックが増える魚の数。
  glove: Object.freeze({ max: 20, crateChance: 0.005, retryEvery: 10, tailwindCapMs: 3000, minNormalBand: 0.2 }),
  // クレートガチャ(D-140・D-147・D-149・D-253)。
  gacha: Object.freeze({
    targetSeconds: 15, // クレート 1 回分が貯まる目標の時間(シミュレーション上。D-253:120 → 60、D-355:60 → 15)
    justRate: 0.7, // 価格の稼ぎを見積もるときの、ジャストの割合(「上手」:D-259)
    secondsPerCast: 8.6, // 1 回投げて結果が出るまでの平均の時間(上手に遊んだときの測定:Issue 14)
    gradeGrowth: 0.35, // グレードが 1 上がるごとに、基本効果の範囲が増える割合
    inventoryMax: 300, // 持ち物の上限(D-355:100 → 300)
    spaceWarnRatio: 0.1, // 満タン警告のしきい値 = 上限 × この割合(300 個なら残り 30 個:D-355)
    pullMax: 10, // 1 回に引ける最大(10 連)
  }),
});
