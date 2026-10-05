// 戦闘の数値の表と、クリティカルの判定(D-068〜D-071・D-078〜D-080)。
// 表の形:{ damage, critChance, critMultiplier, missHeal, timeLimitBonusMs, missBonusDamage, hook }
// - damage:当たり 1 回で減る体力(通常ダメージ)
// - critChance:クリティカルの確率(0〜1)
// - critMultiplier:クリティカルのときの倍率
// - missHeal:外したときに回復する体力
// - timeLimitBonusMs:魚ごとの制限時間に足す時間(装備の糸などで増える)
// - missBonusDamage:外したあと、次の当たり 1 回に足すダメージ(装備のルアー。積み上げない:D-145)
// - hook:合わせの縮む輪 { normal: { ringMs, successMs, justMs }, strong: {...}, justMultiplier }(D-084・D-087)
// 装備は、基本の表に足し算した表を作り、ここで点検してから使う(gear.js の applyGear:D-145)。

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
    damage: clamp(Math.round(finiteOr(s.damage, base.damage)), limits.minDamage, limits.maxDamage),
    critChance: clamp(finiteOr(s.critChance, base.critChance), 0, limits.maxCritChance),
    critMultiplier: clamp(
      finiteOr(s.critMultiplier, base.critMultiplier),
      limits.minCritMultiplier,
      limits.maxCritMultiplier,
    ),
    missHeal: clamp(Math.round(finiteOr(s.missHeal, base.missHeal)), limits.minMissHeal, limits.maxMissHeal),
    timeLimitBonusMs: clamp(
      finiteOr(s.timeLimitBonusMs, base.timeLimitBonusMs),
      -limits.maxTimeLimitBonusMs,
      limits.maxTimeLimitBonusMs,
    ),
    missBonusDamage: clamp(Math.round(finiteOr(s.missBonusDamage, base.missBonusDamage ?? 0)), 0, limits.maxMissBonusDamage),
    hook: normalizeHook(s.hook, base.hook, limits),
  };
}

/** 輪 1 つぶん(普通か強い)を下限の中に直す。cap は「この幅をこえない」の上限(強い魚は普通の魚の帯まで)。 */
function normalizeRing(ring, baseRing, limits, cap) {
  const r = ring ?? {};
  const ringMs = Math.max(limits.minHookRingMs, finiteOr(r.ringMs, baseRing.ringMs));
  let successMs = finiteOr(r.successMs, baseRing.successMs);
  successMs = clamp(successMs, limits.minHookSuccessMs, ringMs - limits.minHookEarlyMs);
  if (cap) successMs = Math.min(successMs, cap.successMs);
  let justMs = clamp(finiteOr(r.justMs, baseRing.justMs), limits.minHookJustMs, successMs);
  if (cap) justMs = Math.min(justMs, cap.justMs);
  return { ringMs, successMs, justMs };
}

/**
 * 合わせの輪の数値を点検する(D-087)。輪は 1.0 秒以上、成功帯 0.25 秒以上、ジャスト帯 0.10 秒以上、
 * 早すぎの区間 0.3 秒以上。ジャスト帯は成功帯以下、強い魚の帯は普通の魚の帯以下にする。
 */
export function normalizeHook(hook, base, limits) {
  const h = hook ?? {};
  const normal = normalizeRing(h.normal, base.normal, limits, null);
  const strong = normalizeRing(h.strong, base.strong, limits, normal);
  const justMultiplier = clamp(finiteOr(h.justMultiplier, base.justMultiplier), 1, limits.maxJustMultiplier);
  return { normal, strong, justMultiplier };
}

/** 輪の時間の区切り(「!」からのミリ秒)。 */
export function hookTiming(ring) {
  const successStart = ring.ringMs - ring.successMs;
  const justStart = successStart + (ring.successMs - ring.justMs) / 2;
  return { ringMs: ring.ringMs, successStart, justStart, justEnd: justStart + ring.justMs };
}

export const HOOK_GRADES = Object.freeze({ EARLY: "early", GOOD: "good", JUST: "just" });

/**
 * 「!」からの経過時間 t で、合わせを判定する(D-088)。始まりを含み、終わりを含まない。
 * t が輪の時間に達したら遅すぎ(これは時間の進みで決まるので、ここでは扱わない)。
 */
export function judgeHook(timing, t) {
  if (t < timing.successStart) return HOOK_GRADES.EARLY;
  if (t >= timing.justStart && t < timing.justEnd) return HOOK_GRADES.JUST;
  return HOOK_GRADES.GOOD;
}

/**
 * 戦闘中の一時的な上乗せ(D-089・D-145)。{ id, damageMultiplier, damageBonus, uses } の一覧。
 * 当たりのダメージに、残っている上乗せの倍率を全部かけて四捨五入し、そのあと足し算の分(ルアー)を足す。
 */
export function boostedDamage(damage, boosts) {
  const multiplier = boosts.reduce((m, b) => m * (b.damageMultiplier ?? 1), 1);
  const bonus = boosts.reduce((sum, b) => sum + (b.damageBonus ?? 0), 0);
  return Math.max(damage, Math.round(damage * multiplier)) + bonus;
}

/** 当たったあと、上乗せの残り回数を 1 減らし、0 になったものを消す。 */
export function consumeBoosts(boosts) {
  return boosts.map((b) => ({ ...b, uses: b.uses - 1 })).filter((b) => b.uses > 0);
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
