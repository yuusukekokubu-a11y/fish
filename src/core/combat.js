// 戦闘の数値の表と、クリティカルの判定(D-068〜D-071・D-078〜D-080)。
// 表の形:{ damage, critChance, critMultiplier, missHeal, timeLimitBonusMs }
// - damage:当たり 1 回で減る体力(通常ダメージ)
// - critChance:クリティカルの確率(0〜1)
// - critMultiplier:クリティカルのときの倍率
// - missHeal:外したときに回復する体力
// - timeLimitBonusMs:魚ごとの制限時間に足す時間(装備の糸などで増える)
// ②-4 では、装備がこの表を書き換えて createGame に渡す。

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * 表を点検して、戦闘で使える値に直す。数でない値は base(基本の表)の値に戻し、
 * 範囲の外の値は limits の境目に直す。ダメージと回復は整数にする(四捨五入)。
 */
export function normalizeCombat(stats, base, limits) {
  const s = stats ?? {};
  return {
    damage: Math.max(limits.minDamage, Math.round(finiteOr(s.damage, base.damage))),
    critChance: clamp(finiteOr(s.critChance, base.critChance), 0, limits.maxCritChance),
    critMultiplier: clamp(
      finiteOr(s.critMultiplier, base.critMultiplier),
      limits.minCritMultiplier,
      limits.maxCritMultiplier,
    ),
    missHeal: Math.max(limits.minMissHeal, Math.round(finiteOr(s.missHeal, base.missHeal))),
    timeLimitBonusMs: finiteOr(s.timeLimitBonusMs, base.timeLimitBonusMs),
  };
}

/** 魚ごとの制限時間に、表の増減を足す。下限より短くしない。 */
export function fightTimeLimit(fishTimeLimitMs, stats, limits) {
  return Math.max(limits.minTimeLimitMs, fishTimeLimitMs + stats.timeLimitBonusMs);
}

/**
 * クリティカルの規則:確率で出る。
 * 規則は、当たりのたびに次の値を受け取り、クリティカルなら true を返す関数。
 * { roll: 0 以上 1 未満の乱数, stats: 戦闘の数値の表, position: 印の位置, zone: 当たり範囲 }
 */
export function chanceRule({ roll, stats }) {
  return roll < stats.critChance;
}

/** 規則の一覧の基本。腕前型(当たり範囲の中心の帯)などは、ここに規則を足す(D-070・D-080)。 */
export const DEFAULT_CRIT_RULES = Object.freeze([chanceRule]);

/** 規則の一覧のどれか 1 つでも当てはまれば、クリティカル。 */
export function isCritical(context, rules = DEFAULT_CRIT_RULES) {
  return rules.some((rule) => rule(context));
}

/** 当たり 1 回のダメージ。クリティカルは「通常ダメージ × 倍率」を四捨五入(通常ダメージより小さくしない)。 */
export function hitDamage(stats, critical) {
  if (!critical) return stats.damage;
  return Math.max(stats.damage, Math.round(stats.damage * stats.critMultiplier));
}

/** ミニゲームの種から、クリティカル専用の小さな系統の種を作る(D-079)。 */
export function critSeed(minigameSeed) {
  return (Math.imul(minigameSeed ^ 0x9e3779b9, 0x85ebca6b) ^ 0x5bd1e995) >>> 0;
}
