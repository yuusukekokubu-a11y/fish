// 戦闘の数値の表と、クリティカルの判定(D-068〜D-071・D-078〜D-080)。
// 表の形:{ damage, critChance, critMultiplier, missHeal, timeLimitBonusMs, zoneWidthBonus, hook }
// - damage:命中 1 回で減る体力(通常ダメージ)
// - critChance:クリティカルの確率(0〜1)
// - critMultiplier:クリティカルのときの倍率
// - missHeal:ミスしたときに回復する体力
// - timeLimitBonusMs:魚ごとの制限時間に足す時間(装備の糸などで増える)
// - zoneWidthBonus:命中範囲の幅を広げる割合(%。装備のルアー:D-181)。幅 ×(1 + n / 100)
// - hook:合わせの縮む輪 { normal: { ringMs, successMs, justMs }, strong: {...}, justMultiplier }(D-084・D-087)
// 装備は、基本の表に足し算した表を作り、ここで点検してから使う(gear.js の applyGear:D-181)。

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
    zoneWidthBonus: clamp(finiteOr(s.zoneWidthBonus, base.zoneWidthBonus ?? 0), 0, limits.maxZoneWidthBonus),
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
 * 戦闘中の一時的な上乗せ(D-089・D-186)。{ id, damageMultiplier?, when?, effects?, uses } の一覧。
 * - damageMultiplier:命中のダメージに掛ける倍率(ジャスト)。クリティカルのあとに掛けて四捨五入する。
 * - when・effects:条件発動型の「次の命中に効く」効果(先手・勢いなど)。fishing.js の triggeredStats が使う。
 */
export function boostedDamage(damage, boosts) {
  const multiplier = boosts.reduce((m, b) => m * (b.damageMultiplier ?? 1), 1);
  return Math.max(damage, Math.round(damage * multiplier));
}

/**
 * ルアーで広げた命中範囲の幅(D-181)。幅 ×(1 + n / 100)を、上限(ゲージの 70%)と下限(10%)の中にする。
 * 広げないとき(n が 0)は、元の幅をそのまま返す(前と同じ結果)。
 */
export function lureZoneWidth(width, stats, limits) {
  const bonus = stats.zoneWidthBonus ?? 0;
  if (!(bonus > 0)) return width;
  return clamp(width * (1 + bonus / 100), limits.minZoneWidth, Math.max(width, limits.maxZoneWidth));
}

/**
 * 命中範囲を、真ん中を保ったまま幅 width に広げる(D-181)。ゲージの端から margin 以上はなす。
 * 幅が同じなら、元の範囲をそのまま返す(乱数の引き方も、結果も変わらない)。
 */
export function widenZone(zone, width, margin) {
  if (width === zone.end - zone.start) return zone;
  const center = (zone.start + zone.end) / 2;
  const start = clamp(center - width / 2, margin, Math.max(margin, 1 - margin - width));
  return { start, end: start + width };
}

/** 命中したあと、上乗せの残り回数を 1 減らし、0 になったものを消す。 */
export function consumeBoosts(boosts) {
  return boosts.map((b) => ({ ...b, uses: b.uses - 1 })).filter((b) => b.uses > 0);
}

/** 魚ごとの制限時間に、表の増減を足す。下限より短くしない。 */
export function fightTimeLimit(fishTimeLimitMs, stats, limits) {
  return Math.max(limits.minTimeLimitMs, fishTimeLimitMs + stats.timeLimitBonusMs);
}

/**
 * クリティカルの規則:確率で出る。
 * 規則は、命中のたびに次の値を受け取り、クリティカルなら true を返す関数。
 * { roll: 0 以上 1 未満の乱数, stats: 戦闘の数値の表, position: 印の位置, zone: 命中範囲 }
 */
export function chanceRule({ roll, stats }) {
  return roll < stats.critChance;
}

/** 規則の一覧の基本。腕前型(命中範囲の中心の帯)などは、ここに規則を足す(D-070・D-080)。 */
export const DEFAULT_CRIT_RULES = Object.freeze([chanceRule]);

/** 規則の一覧のどれか 1 つでも当てはまれば、クリティカル。 */
export function isCritical(context, rules = DEFAULT_CRIT_RULES) {
  return rules.some((rule) => rule(context));
}

/**
 * クリティカルの段数(D-169)。会心率 c の整数部分は必ず起きる段数、小数部分は、もう 1 段増える確率。
 * 乱数 roll は命中のたびに 1 回だけ引いたもの。c が 1 以下なら、前と同じ(0 段か 1 段)。
 * 規則の一覧(腕前型など)のどれかに当てはまれば、少なくとも 1 段。段数は安全上限で止める。
 */
export function critStages(context, rules = DEFAULT_CRIT_RULES, maxStages = Infinity) {
  const c = context.stats.critChance;
  const whole = Math.floor(c);
  let stages = whole + (context.roll < c - whole ? 1 : 0);
  if (stages === 0 && rules.some((rule) => rule(context))) stages = 1;
  return Math.min(stages, maxStages);
}

/**
 * 命中 1 回のダメージ。クリティカルは「通常ダメージ × 倍率の段数乗」を四捨五入(通常ダメージより小さくしない)。
 * critical は段数(数)か、前の形の true/false(true は 1 段)。総倍率とダメージは安全上限で止める。
 */
export function hitDamage(stats, critical, limits = null) {
  const stages = critical === true ? 1 : critical === false ? 0 : critical;
  if (!stages) return stats.damage;
  const multiplier = Math.min(limits?.maxCritTotalMultiplier ?? Infinity, stats.critMultiplier ** stages);
  const damage = Math.max(stats.damage, Math.round(stats.damage * multiplier));
  return Math.min(limits?.maxHitDamage ?? Infinity, damage);
}

/** ミニゲームの種から、クリティカル専用の小さな系統の種を作る(D-079)。 */
export function critSeed(minigameSeed) {
  return (Math.imul(minigameSeed ^ 0x9e3779b9, 0x85ebca6b) ^ 0x5bd1e995) >>> 0;
}
