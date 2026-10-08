// @ts-check
// 通し番号 g(段階 1, 2, 3…)から魚と段階の数値を決める式(D-225・D-226・D-230)。
// 式の形はここ、式の数(係数)は config.js の `formula`(と、装備の `gacha.gradeGrowth`、スキルの `skills`)にある。
// 魚の表(fish.js)は名前・区分・段階・id・見た目だけを持ち、数値はここから作る。
// - 伸び方は緩やか:報酬は 1 段ごとの伸び率がだんだん下がる形(g=100 でも安全な整数の範囲に収まる)。
//   体力は 1 次式、制限時間は log、印の速さと命中範囲の幅は限界で止まる 1 次式、製作の必要数は上限に近づく形。
// - g=1〜5 は ②-4b4 の手書きの値から ±15% 以内(報告に一覧)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { DEFAULT_CONFIG } from "./config.js";

/**
 * 式の数(config.formula)。
 * @typedef {object} FormulaConfig
 * @property {number} coinGrowth 報酬の 1 段目の伸び(e を底にした指数。1.1 で約 3 倍)
 * @property {number} coinGrowthDecay 伸びが下がる速さ(段 k の伸び = coinGrowth × decay ÷ (decay + k − 1))
 * @property {number} weakCoins 段階 1 の弱い魚のウロコイン
 * @property {number} strongCoinRatio 強い魚のウロコイン = 弱い魚 × これ
 * @property {number} bossCoinRatio ヌシのウロコイン = 強い魚 × これ
 * @property {number} scalesPerCatch 強い魚とヌシが落とす鱗の数
 * @property {number} hpBase 強い魚の体力 = hpBase + hpPerStage × g
 * @property {number} hpPerStage
 * @property {number} timeLimitMs 強い魚の制限時間(g=1)
 * @property {number} timeLimitGrowthMs g=timeLimitLogBase で増える時間(log で伸びる)
 * @property {number} bossTimeLimitMs ヌシの制限時間(g=1)
 * @property {number} bossTimeLimitGrowthMs
 * @property {number} timeLimitLogBase
 * @property {number} sweepMs 強い魚の印の速さ(端から端、g=0 の値。1 段ごとに sweepStepMs ずつ速く。限界で止まる)
 * @property {number} sweepStepMs
 * @property {number} zoneWidth 強い魚の命中範囲の幅(g=0 の値。1 段ごとに zoneStep ずつ狭く。限界で止まる)
 * @property {number} zoneStep
 * @property {number} bossStageOffset ヌシの印の速さと幅は、強い魚のこの段だけ先の値
 * @property {number} craftMin 製作の必要数(g=1)
 * @property {number} craftMax 製作の必要数の行き着く先
 * @property {number} craftDecay 近づく速さ(段の数)
 * @property {number} evolveCount 進化に使うヌシの鱗の数
 * @property {{ knee: number, soft: number }} critChanceCurve 会心率の合計の逓減(knee までは そのまま、こえた分は log で緩やかに:D-255)
 * @property {{ knee: number, soft: number }} critMultiplierCurve 会心の倍率の合計の逓減
 * @property {{ knee: number, soft: number }} penetrationCurve 貫通の合計の逓減(D-260)
 * @property {{ knee: number, soft: number }} justMultiplierCurve ジャスト倍率の合計の逓減(D-257)
 * @property {number} targetPullsFirst 目安の引く回数 P(g) = targetPullsFirst × targetPullsGrowth^(g − 1)(D-379)
 * @property {number} targetPullsGrowth
 * @property {number} baitPriceRatio 餌の価格 = 強い魚 1 匹のウロコイン × これ(D-265)
 * @property {number} bossHpBase ヌシの体力 = bossHpBase × g^bossHpPower × bossHpGrowth^g(D-380。シミュレーションで合わせた)
 * @property {number} bossHpPower
 * @property {number} bossHpGrowth
 * @property {number} stagesPerGround 釣り場 1 つの段階の数(位置 s を数える:5。釣り場の表の段階の数と同じ:D-276)
 * @property {number} earlyStages 序盤(装備なしでも勝てる)の段階の数(g=1〜2:D-358)
 * @property {number} earlyBossHpMax 序盤のヌシの体力の上限(装備なしでも倒せるように:D-358)
 */

/** @param {FormulaConfig} [f] */
const conf = (f) => f ?? /** @type {FormulaConfig} */ (DEFAULT_CONFIG.formula);

/** 1 より小さくしない整数の通し番号。 @param {number} g */
function stageNumber(g) {
  if (!Number.isSafeInteger(g) || g < 1) throw new Error(`通し番号がおかしい:${g}`);
  return g;
}

/**
 * 上から 2 けたの切りのよい数に丸める(例:47.6 → 48、238 → 240)。1 より小さくしない。
 * @param {number} n
 */
export function round2(n) {
  if (!(n > 0)) return 1;
  const digits = Math.floor(Math.log10(n));
  const unit = 10 ** Math.max(0, digits - 1);
  return Math.max(1, Math.round(n / unit) * unit);
}

/**
 * 報酬の倍率(g=1 で 1)。段 k → k+1 の伸び(指数)は coinGrowth × decay ÷ (decay + k − 1) で、段が進むほど下がる。
 * g=2〜5 で約 3・8・20・48 倍、g=100 で約 4.3 × 10^11 倍(1 段ごとの伸びは約 10%)。
 * @param {number} g @param {FormulaConfig} [f]
 */
export function coinScale(g, f) {
  const c = conf(f);
  let sum = 0;
  for (let k = 1; k < stageNumber(g); k++) sum += (c.coinGrowth * c.coinGrowthDecay) / (c.coinGrowthDecay + k - 1);
  return Math.exp(sum);
}

/**
 * 区分ごとの、1 匹のウロコイン(上から 2 けたに丸める)。
 * @param {"weak" | "strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f]
 */
export function fishCoins(kind, g, f) {
  const c = conf(f);
  const ratio = kind === "weak" ? 1 : kind === "strong" ? c.strongCoinRatio : c.strongCoinRatio * c.bossCoinRatio;
  return round2(c.weakCoins * ratio * coinScale(g, c));
}

/**
 * 餌の 1 個の価格(D-265):強い魚 1 匹のウロコイン × baitPriceRatio を、上から 2 けたに丸める(1 以上)。
 * 強い魚のウロコインはジャストで変わらないので、上手(ジャスト 70%)の期待報酬と同じ。
 * @param {number} g @param {FormulaConfig} [f]
 */
export function baitPrice(g, f) {
  const c = conf(f);
  return Math.max(1, round2(fishCoins("strong", g, c) * c.baitPriceRatio));
}

/** 1 匹が落とす鱗の数(弱い魚は 0)。 @param {"weak" | "strong" | "boss"} kind @param {number} _g @param {FormulaConfig} [f] */
export function fishScales(kind, _g, f) {
  return kind === "weak" ? 0 : conf(f).scalesPerCatch;
}

/**
 * 体力。強い魚は hpBase + hpPerStage × g(1 次式)。
 * ヌシ(D-380)は bossHpBase × g^bossHpPower × bossHpGrowth^g を上から 2 けたに丸める。係数は、目安の引く回数 P(g) の装備で、
 * ふつうの遊び方が 80% 勝つ体力にシミュレーションで合わせた(D-379)。序盤(g=1〜2)は、装備なしでも倒せるよう上限を置く(D-358)。
 * @param {"strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f]
 */
export function fishHp(kind, g, f) {
  const c = conf(f);
  const n = stageNumber(g);
  if (kind === "boss") {
    const hp = round2(c.bossHpBase * n ** c.bossHpPower * c.bossHpGrowth ** n);
    return n <= c.earlyStages ? Math.min(hp, c.earlyBossHpMax) : hp;
  }
  return c.hpBase + c.hpPerStage * n;
}

/**
 * 合計の逓減(D-255)。knee までは、そのまま。こえた分は knee + soft × ln(1 +(x − knee)÷ soft)。
 * 増え方は、こえるほど小さくなるが、合計は止まらずに増え続ける(上限なし)。knee で傾きが 1 のまま、なめらかにつながる。
 * @param {number} x @param {{ knee: number, soft: number }} curve
 */
export function softCurve(x, curve) {
  if (!(x > curve.knee)) return x;
  return curve.knee + curve.soft * Math.log(1 + (x - curve.knee) / curve.soft);
}

/**
 * 釣り場の中の位置 s(1〜5:D-276)。釣り場は 5 段階ずつ切れ目なく並ぶ(areas.js の checkAreas が確かめる)ので、
 * 釣り場の表の位置(areaPosition)と同じ値になる(tests/areas.test.js)。
 * @param {number} g @param {FormulaConfig} [f]
 */
export function stagePosition(g, f) {
  const n = conf(f).stagesPerGround;
  return ((stageNumber(g) - 1) % n) + 1;
}

/**
 * 防御(割合。1 で 100%)。いまは、どの魚も 0(D-380:防御はいったんなくし、川からの「防御の壁」のくせとして戻す)。
 * 戦闘の防御と貫通の仕組み(実効防御・逓減)は、そのまま残してある。
 * @param {"weak" | "strong" | "boss"} _kind @param {number} g @param {FormulaConfig} [_f]
 */
export function fishDefense(_kind, g, _f) {
  stageNumber(g);
  return 0;
}

/**
 * 制限時間(log で伸びる。0.1 秒に丸める)。強い魚 8 秒 + 4 秒 × log5(g)、ヌシ 20 秒 + 2 秒 × log5(g)(D-380)。
 * 糸・粘りの延長は、戦闘の中でこれに足す(元の制限時間まで:combat.js の fightTimeLimit)。
 * @param {"strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f]
 */
export function fishTimeLimitMs(kind, g, f) {
  const c = conf(f);
  const t = Math.log(stageNumber(g)) / Math.log(c.timeLimitLogBase);
  const ms = kind === "boss" ? c.bossTimeLimitMs + c.bossTimeLimitGrowthMs * t : c.timeLimitMs + c.timeLimitGrowthMs * t;
  return Math.round(ms / 100) * 100;
}

/**
 * 印の速さ(端から端までのミリ秒)。段が進むほど速くなり、限界(minSweepMs)で止まる。
 * @param {"strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f] @param {{ minSweepMs: number }} [limits]
 */
export function fishSweepMs(kind, g, f, limits = DEFAULT_CONFIG.minigame) {
  const c = conf(f);
  const n = stageNumber(g) + (kind === "boss" ? c.bossStageOffset : 0);
  return Math.max(limits.minSweepMs, c.sweepMs - c.sweepStepMs * n);
}

/**
 * 命中範囲の幅(ゲージ全体を 1)。段が進むほど狭くなり、限界(minZoneWidth)で止まる。千分率で計算して丸める。
 * @param {"strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f] @param {{ minZoneWidth: number }} [limits]
 */
export function fishZoneWidth(kind, g, f, limits = DEFAULT_CONFIG.minigame) {
  const c = conf(f);
  const n = stageNumber(g) + (kind === "boss" ? c.bossStageOffset : 0);
  const permille = Math.round(c.zoneWidth * 1000) - Math.round(c.zoneStep * 1000) * n;
  return Math.max(limits.minZoneWidth, permille / 1000);
}

/**
 * 強い魚とヌシのミニゲームの設定。
 * @param {"strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f]
 */
export function fishMinigame(kind, g, f) {
  return {
    sweepMs: fishSweepMs(kind, g, f),
    zoneWidth: fishZoneWidth(kind, g, f),
    hp: fishHp(kind, g, f),
    timeLimitMs: fishTimeLimitMs(kind, g, f),
    defense: fishDefense(kind, g, f),
  };
}

/**
 * 竿の製作に要る鱗の数。釣り場の中の位置 s で決める(どの釣り場も 3・4・4・5・6:D-282)。
 * 釣り場の最初の段階は、また 3 枚から(魚のプールが釣り場ごとに分かれるので、製作の時間も約 3 分に戻る)。
 * @param {number} g @param {FormulaConfig} [f]
 */
export function craftCount(g, f) {
  const c = conf(f);
  return Math.round(c.craftMin + (c.craftMax - c.craftMin) * (1 - Math.exp(-(stagePosition(g, c) - 1) / c.craftDecay)));
}

/** 進化に要るヌシの鱗の数。 @param {number} _g @param {FormulaConfig} [f] */
export function evolveCount(_g, f) {
  return conf(f).evolveCount;
}

/**
 * 装備の基本効果の、グレードによる倍率(1 次式:1 + gradeGrowth ×(グレード − 1))。
 * @param {number} grade @param {number} gradeGrowth
 */
export function gradeFactor(grade, gradeGrowth) {
  return 1 + gradeGrowth * (grade - 1);
}

/**
 * 成長型のスキルの最大レベル(2 + 通し番号)。
 * @param {number} g @param {{ growthMaxBase: number, growthMaxPerStage: number }} skills
 */
export function growthMaxLevel(g, skills) {
  return skills.growthMaxBase + skills.growthMaxPerStage * g;
}

/**
 * 目安の引く回数 P(g)(D-379):そのヌシまでに、段階 g のクレートを引く回数の目安(四捨五入。g=1 で 20、g=30 で 120)。
 * 前の段階で引いた装備も持っている前提で、P(g) の装備でふつうの遊び方が 80% 勝つように、ヌシの体力を合わせた。
 * @param {number} g @param {FormulaConfig} [f]
 */
export function targetPulls(g, f) {
  const c = conf(f);
  return Math.round(c.targetPullsFirst * c.targetPullsGrowth ** (stageNumber(g) - 1));
}
