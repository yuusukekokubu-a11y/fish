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
 * @property {number} bossHpRatio ヌシの体力 = 強い魚 × これ
 * @property {number} timeLimitMs 強い魚の制限時間(g=1)
 * @property {number} timeLimitGrowthMs g=timeLimitLogBase で増える時間(log で伸びる)
 * @property {number} bossTimeLimitMs ヌシの制限時間(g=1)
 * @property {number} bossTimeLimitGrowthMs
 * @property {number} timeLimitLogBase
 * @property {number} bossTimeLimitHitsRatio ヌシの制限時間 = 目標の命中回数 × 印が 1 回通る時間 × これ(D-366)
 * @property {number} bossTimeLimitMinMs ヌシの制限時間の下限(D-366)
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
 * @property {number} referenceDrawsFirst 基準の回数 N(g) = referenceDrawsFirst × g^referenceDrawsExponent(D-254)
 * @property {number} referenceDrawsExponent
 * @property {number} baitPriceRatio 餌の価格 = 強い魚 1 匹のウロコイン × これ(D-265)
 * @property {number} defenseStartStage 防御を持ち始める通し番号(それより前は 0%:D-237)
 * @property {number} defensePenPerLevel 防御の式が前提にする、貫通の 1 レベルの量(スキルの表の貫通と同じ値)
 * @property {number} defenseFloor 5 体目のヌシ(s=5)の防御の下限(1 以上=貫通なしでは実効防御 100% 以上)
 * @property {number} defenseMargin 5 体目のヌシの防御 = 最大レベルの貫通 + これ(最大の貫通で残る実効防御)
 * @property {readonly number[]} bossDefenseShare 位置 s ごとの、ヌシの防御の割合(5 体目に対する)
 * @property {number} strongDefenseShare 強い魚の防御 = 同じ g の s=1 のヌシの防御 × これ
 * @property {number} nonFinalDefenseMax 5 体目より前のヌシと強い魚の防御の上限(100% 未満)
 * @property {number} bossHitsFirst ヌシの命中回数の目標(s=1)
 * @property {number} bossHitsLast ヌシの命中回数の目標(s=5)
 * @property {{ levelRatio: number, penGap: number, penGapDraws: number, reelRatio: number, scale: number, growth: number, positionScale: readonly number[] }} bossReference
 *   ヌシの体力の基準の装備(育てた装備の目安:スキルのレベルは最大 × levelRatio、リールは最大 × reelRatio、
 *   貫通は最大レベルの貫通 −(penGap + penGapDraws ÷ N(g))。scale × g^growth を掛けて、シミュレーションの命中回数に合わせる)
 * @property {number} stagesPerGround 釣り場 1 つの段階の数(位置 s を数える:5。釣り場の表の段階の数と同じ:D-276)
 * @property {number} noPenTapsFactor 5 体目のヌシの体力の下限 = 押せる回数 × これ
 * @property {number} noPenBonusDraws 押せる回数を数えるときに足す、糸と粘りの最大の割合 = min(1, N(g) ÷ これ)(育てた装備の目安:D-260)
 * @property {number} [earlyBossHpMax] 序盤(防御を持つ前の g)のヌシの体力の上限(装備なしでも倒せるように:D-358)
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

/** 体力(強い魚は 1 次式、ヌシはその倍率)。 @param {"strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f] */
export function fishHp(kind, g, f) {
  const c = conf(f);
  const base = c.hpBase + c.hpPerStage * stageNumber(g);
  if (kind === "boss") {
    // ヌシ:目標の命中回数 × 基準の装備の 1 命中のダメージ(防御で減らしたあと)× 位置 s ごとの補正(シミュレーションで合わせた)。
    const eff = bossReferenceDefense(g, c);
    const perHit = eff >= 1 ? 1 : bossReferenceDamage(g, c) * (1 - eff);
    const s = stagePosition(g, c);
    const hp = round2(bossHitTarget(g, c) * perHit * c.bossReference.positionScale[s - 1]);
    // 5 体目:貫通なし(1 命中 1 ダメージ)では、制限時間の中で押せる回数より多い体力にする(D-254 の貫通必須)。
    if (s === c.stagesPerGround) return Math.max(hp, noPenetrationFloor(g, c));
    // 序盤(防御を持つ前の g)は、装備なしでも倒せるよう上限を置く(D-358)。
    return stageNumber(g) < c.defenseStartStage ? Math.min(hp, c.earlyBossHpMax ?? hp) : hp;
  }
  // 強い魚:平均的な装備で時間の目標を保つよう、防御で減るぶん体力を下げる(防御なしなら 10 + 10g:D-254)。
  return Math.max(1, Math.round(base * (1 - fishDefense("strong", g, c))));
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
 * 最大レベル(2 + g)の貫通で、実効防御から引ける量(逓減のあと)。防御の式が前提にする値。
 * @param {number} g @param {FormulaConfig} [f]
 */
export function maxPenetration(g, f) {
  const c = conf(f);
  return softCurve(c.defensePenPerLevel * (2 + stageNumber(g)), c.penetrationCurve);
}

/**
 * 防御(割合。1 で 100%)。弱い魚は 0。強い魚とヌシは、通し番号 defenseStartStage から持つ(D-235・D-237)。
 * - 5 体目のヌシ(s=5):max(下限, 最大レベルの貫通 + 余り)。貫通なしでは 100% 以上、最大の貫通で余りだけ残る。
 * - ほかのヌシ:5 体目の防御 × 位置 s の割合。強い魚:同じ g の s=1 のヌシの防御 × 割合(いつもヌシより低く、100% 未満)。
 * 0.001 刻みに丸める。
 * @param {"weak" | "strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f]
 */
export function fishDefense(kind, g, f) {
  const c = conf(f);
  if (kind === "weak" || stageNumber(g) < c.defenseStartStage) return 0;
  const last = Math.max(c.defenseFloor, maxPenetration(g, c) + c.defenseMargin);
  const s = stagePosition(g, c);
  // 5 体目より前のヌシと強い魚は、貫通なしでも倒せるよう 100% 未満に収める(上限 nonFinalMax)。
  const value = kind === "boss" ? last * c.bossDefenseShare[s - 1] : last * c.bossDefenseShare[0] * c.strongDefenseShare;
  const capped = kind === "boss" && s === c.stagesPerGround ? value : Math.min(c.nonFinalDefenseMax, value);
  return Math.round(capped * 1000) / 1000;
}

/** ヌシの命中回数の目標(s=1 → s=5 で少しずつ伸びる)。 @param {number} g @param {FormulaConfig} [f] */
export function bossHitTarget(g, f) {
  const c = conf(f);
  return c.bossHitsFirst + ((c.bossHitsLast - c.bossHitsFirst) * (stagePosition(g, c) - 1)) / (c.stagesPerGround - 1);
}

/**
 * ヌシの体力の基準にする、1 命中の期待ダメージ(防御で減らす前)(D-254・D-260)。
 * 基準の装備:リールはレジェンド・グレード g の最大 × reelRatio、強打・会心率・会心威力・芯のレベルは最大 × levelRatio
 * (1 レベルの量は、強打 2・会心率 0.15・芯 0.1・会心威力 0.05:スキルの表と同じ値)。
 * 戦闘と同じ式(基本 + 強打、会心率と倍率の逓減、段数乗の期待値)で計算する。乱数は使わない。
 * @param {number} g @param {FormulaConfig} [f]
 */
export function bossReferenceDamage(g, f) {
  const c = conf(f);
  const r = c.bossReference;
  const level = r.levelRatio * (2 + stageNumber(g));
  const combat = DEFAULT_CONFIG.combat;
  // リールの基本効果:レジェンド(倍率 3.2)・グレード g の範囲の最大(基本 2)× reelRatio。
  const reel = 2 * 3.2 * gradeFactor(g, DEFAULT_CONFIG.gacha.gradeGrowth) * r.reelRatio;
  const base = combat.damage + reel + 2 * level;
  const chance = softCurve(combat.critChance + 0.15 * level + 0.1 * level, c.critChanceCurve);
  const mult = softCurve(combat.critMultiplier + 0.05 * level, c.critMultiplierCurve);
  const whole = Math.floor(chance);
  const frac = chance - whole;
  return base * mult ** whole * (1 - frac + frac * mult) * r.scale * stageNumber(g) ** r.growth;
}

/**
 * 5 体目のヌシの体力の下限:制限時間(糸と粘りの最大 × min(1, N(g) ÷ noPenBonusDraws) を足したもの)の中で、印が真ん中を通る回数 × noPenTapsFactor。
 * 貫通なしでは 1 命中 1 ダメージなので、これより少ない回数では倒せない(D-254)。
 * @param {number} g @param {FormulaConfig} [f]
 */
export function noPenetrationFloor(g, f) {
  const c = conf(f);
  // 糸(レジェンドの最大:基本 1 秒 × 3.2 × グレードの倍率)と粘り(1 秒 × 最大レベル)を足した、いちばん長い制限時間。
  // 育てた装備の糸と粘りは、引く数 N(g) が少ないほど最大から遠い(N(g) ÷ noPenBonusDraws の割合。最大で 1:D-260)。
  const ratio = Math.min(1, referenceDraws(g, c) / c.noPenBonusDraws);
  const bonus = ratio * (1000 * 3.2 * gradeFactor(g, DEFAULT_CONFIG.gacha.gradeGrowth) + 1000 * (2 + stageNumber(g)));
  // 制限時間は、これまでの値で数える(ヌシの制限時間を短くしても、体力を変えないため:D-366)。
  const taps = (baseTimeLimitMs("boss", g, c) + bonus) / fishSweepMs("boss", g, c);
  return Math.ceil(taps * c.noPenTapsFactor);
}

/**
 * ヌシの体力の基準にする実効防御。基準の装備の貫通 = 最大レベルの貫通 −(penGap + penGapDraws ÷ N(g))。
 * 引く数 N(g) が少ないほど、育てた装備の貫通は最大から遠い(D-254)。
 * @param {number} g @param {FormulaConfig} [f]
 */
export function bossReferenceDefense(g, f) {
  const c = conf(f);
  const r = c.bossReference;
  const pen = Math.max(0, maxPenetration(g, c) - r.penGap - r.penGapDraws / referenceDraws(g, c));
  return Math.max(0, fishDefense("boss", g, c) - pen);
}

/**
 * これまでの制限時間(log で伸びる。0.1 秒に丸める)。強い魚の制限時間は、これのまま。
 * ヌシでは、制限時間の上限と、5 体目のヌシの体力の下限(noPenetrationFloor)に使う(体力を変えないため:D-366)。
 * @param {"strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f]
 */
export function baseTimeLimitMs(kind, g, f) {
  const c = conf(f);
  const t = Math.log(stageNumber(g)) / Math.log(c.timeLimitLogBase);
  const ms = kind === "boss" ? c.bossTimeLimitMs + c.bossTimeLimitGrowthMs * t : c.timeLimitMs + c.timeLimitGrowthMs * t;
  return Math.round(ms / 100) * 100;
}

/**
 * 制限時間(0.1 秒に丸める)。強い魚は baseTimeLimitMs のまま。
 * ヌシ(D-366・D-368):目標の命中回数 × 印が 1 回通る時間(端から端)× bossTimeLimitHitsRatio。
 * 下限 bossTimeLimitMinMs、上限はこれまでの制限時間。糸・粘り・追い風などの延長は、戦闘の中でこれに足す。
 * 序盤(防御を持つ前の g=1〜2)は、装備なしでも勝てるよう、これまでの制限時間のまま(D-368)。
 * @param {"strong" | "boss"} kind @param {number} g @param {FormulaConfig} [f]
 */
export function fishTimeLimitMs(kind, g, f) {
  const c = conf(f);
  const cap = baseTimeLimitMs(kind, g, c);
  if (kind !== "boss" || stageNumber(g) < c.defenseStartStage) return cap;
  const ms = bossHitTarget(g, c) * fishSweepMs("boss", g, c) * c.bossTimeLimitHitsRatio;
  return Math.min(cap, Math.max(c.bossTimeLimitMinMs, Math.round(ms / 100) * 100));
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
 * 基準の回数 N(g)(D-254):育てた装備は、各枠で g のクレートを N(g) 個引いた中の最良。
 * N(g) = referenceDrawsFirst × g^referenceDrawsExponent を四捨五入(N(1) = 10・N(100) = 100)。
 * @param {number} g @param {{ referenceDrawsFirst: number, referenceDrawsExponent: number }} [f]
 */
export function referenceDraws(g, f = DEFAULT_CONFIG.formula) {
  return Math.round(f.referenceDrawsFirst * g ** f.referenceDrawsExponent);
}
