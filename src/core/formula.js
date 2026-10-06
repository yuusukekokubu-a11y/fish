// @ts-check
// 通し番号 g(段階 1, 2, 3…)から魚と段階の数値を決める式(D-225〜D-227・D-230)。
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
 * @property {number} bossHpRatio ヌシの体力 = 強い魚 × これ
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

/** 1 匹が落とす鱗の数(弱い魚は 0)。 @param {"weak" | "strong" | "boss"} kind @param {number} _g @param {FormulaConfig} [f] */
export function fishScales(kind, _g, f) {
  return kind === "weak" ? 0 : conf(f).scalesPerCatch;
}

/** 体力(強い魚は 1 次式、ヌシはその倍率)。 @param {"strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f] */
export function fishHp(kind, g, f) {
  const c = conf(f);
  const hp = c.hpBase + c.hpPerStage * stageNumber(g);
  return kind === "boss" ? Math.round(hp * c.bossHpRatio) : hp;
}

/** 制限時間(log で伸びる。0.1 秒に丸める)。 @param {"strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f] */
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
  };
}

/**
 * 竿の製作に要る鱗の数。g=1 で craftMin、段が進むと craftMax に近づく(3・4・4・5・6 … 10)。
 * @param {number} g @param {FormulaConfig} [f]
 */
export function craftCount(g, f) {
  const c = conf(f);
  return Math.round(c.craftMin + (c.craftMax - c.craftMin) * (1 - Math.exp(-(stageNumber(g) - 1) / c.craftDecay)));
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
