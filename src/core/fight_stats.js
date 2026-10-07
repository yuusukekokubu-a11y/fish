// @ts-check
// 戦闘の命中 1 回の数値(条件発動型を含む:D-184・D-191・D-197)。fishing.js から分けた(ファイルを 800 行以内にするため)。
// 画面に関係しない計算だけを置く。乱数は使わない。

import { isHit } from "./minigame.js";

/**
 * 命中範囲の中の帯(D-197)。中心からの距離(中心 0、端 1)で決める。芯:coreRatio 以下(ちょうどを含む)、
 * 縁:edgeRatio 以上(ちょうどを含む)、その間は通常。範囲の外は null(ミス)。乱数は使わない。
 * @param {number} position @param {{ start: number, end: number }} zone @param {{ coreRatio: number, edgeRatio: number }} rules
 * @returns {"core" | "normal" | "edge" | null}
 */
export function zoneBand(position, zone, rules) {
  if (!isHit(position, zone)) return null;
  const half = (zone.end - zone.start) / 2;
  const d = half > 0 ? Math.abs(position - (zone.start + zone.end) / 2) / half : 0;
  // 浮動小数の誤差で境目がずれないよう、小さい桁でそろえる。
  const dist = Math.round(d * 1e9) / 1e9;
  if (dist <= rules.coreRatio) return "core";
  if (dist >= rules.edgeRatio) return "edge";
  return "normal";
}

/**
 * 命中 1 回の、条件発動型を含めた数値(D-184・D-191)。順は
 * 基本のダメージ(表 + 連撃・攻 × 段数 + 先手)→(1 + とどめ + 縁)を掛けて四捨五入 → (クリティカルの段数を掛ける → ジャスト倍率を掛ける)。
 * 会心率は 表 + 連撃・心 × 段数 + 勢い + 先制 + 芯。position は命中した位置(芯・縁を決める。なければ芯・縁は見ない)。条件発動型がなければ、表のままの値(前と同じ結果)。
 * 返り値の active は、この命中で効いた条件の名前(画面の小さな表示に使う)。
 * @param {any} game @param {number | null} [position]
 */
export function triggeredStats(game, position = null) {
  const { fight, combat, config } = game;
  const t = game.triggers ?? {};
  const limits = config.combatLimits;
  const stages = Math.min(fight.combo, config.skills.comboMax);
  // いま満たしている条件と、その効果と、掛ける数(連撃は段数、ほかは 1)。
  /** @type {[string, Record<string, number> | null | undefined, number][]} */
  const met = [];
  if (stages > 0) met.push(["combo", t.combo, stages]);
  // 「最初の命中」「クリティカルの次」などは、戦闘中の一時的な上乗せに積んである(D-186)。
  for (const b of fight.boosts) if (b.when) met.push([b.when, b.effects, 1]);
  // 先制:体力が満タンで、その戦闘の最初の命中まで(ミスで満タンに戻しても、もう効かない:D-192)。
  if (fight.hp >= fight.maxHp && fight.hits === 0) met.push(["fullHp", t.fullHp, 1]);
  if (fight.hp <= fight.maxHp * config.skills.lowHpRatio) met.push(["lowHp", t.lowHp, 1]);
  // 芯・縁:命中した位置の帯で効く(D-197)。
  const band = position === null ? null : zoneBand(position, fight.zone, config.skills);
  if (band === "core" || band === "edge") met.push([band, t[band], 1]);
  /** @type {string[]} */
  const active = [];
  let damageAdd = 0;
  let critAdd = 0;
  let pct = 0;
  let penAdd = 0;
  for (const [when, effects, k] of met) {
    if (!effects) continue;
    const add = (effects.damage ?? 0) * k;
    const crit = (effects.critChance ?? 0) * k;
    const p = (effects.damagePct ?? 0) * k;
    const pen = (effects.penetration ?? 0) * k;
    if (add === 0 && crit === 0 && p === 0 && pen === 0) continue;
    damageAdd += add;
    critAdd += crit;
    pct += p;
    penAdd += pen;
    active.push(when);
  }
  if (damageAdd === 0 && critAdd === 0 && pct === 0 && penAdd === 0) return { stats: combat, active };
  const damage = Math.min(limits.maxDamage, Math.max(limits.minDamage, Math.round((combat.damage + damageAdd) * (1 + pct))));
  const critChance = Math.min(limits.maxCritChance, Math.max(0, combat.critChance + critAdd));
  const penetration = Math.min(limits.maxPenetration ?? Infinity, (combat.penetration ?? 0) + penAdd);
  return { stats: { ...combat, damage, critChance, penetration }, active };
}
