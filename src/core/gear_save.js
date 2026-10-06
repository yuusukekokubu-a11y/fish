// @ts-check
// 保存の、装備とガチャのまとまりの変換と点検(D-143・D-188・D-208・D-199)。
// 版 7 の形(短い配列。表の番号で書く。版 5・6 と同じ形で、スキルの数がポイントではなくレベル):
//   { items: [[個体の番号, 種類の番号, レア度の番号, グレード, 基本効果の値, [スキルの番号, レベル, …]], …],
//     equipped: [[種類の番号, 個体の番号], …], draws, seed, nextId }
//   番号は表(装備の種類・レア度・スキル)の並びの順(0 から)。表の行は、あとから並べ替えない(足すのは最後に)。
// 版 5 まで、ルアーの値は「外したあとの次の当たり +n」だった。版 6 では「命中範囲 +n%」(D-181)。
// 版 6 まで、スキルの数はポイントで、スキルの表に目利きがあった(番号は LEGACY_SKILL_IDS)。版 7 でレベルにした(D-195・D-196)。
// 版 4 の形(オブジェクト):{ items: [{ id, kind, rarity, grade, value, skills: [] }], equipped: { 種類の id: 番号 }, … }
// 壊れた・範囲外・表にない種類やレア度やスキル・同じ装備に同じスキル・ポイントが範囲外・持ち物にない装着の番号を
// 含むときは null を返す(読み込みを拒否する)。
// このファイルは JSDoc で型を書き、`npm run typecheck` で確かめる(D-144)。

import { effectRange, emptyGear, kindById, RARITY_ROWS, rarityById } from "./gear.js";
import { levelRange } from "./skills.js";

/** @typedef {import("./gear.js").Gear} Gear */
/** @typedef {import("./gear.js").Item} Item */
/** @typedef {import("./gear.js").EquipKind} EquipKind */

/**
 * 点検に使う表と数値。
 * @typedef {object} GearRules
 * @property {readonly EquipKind[]} equipKinds 装備の種類の表
 * @property {number} maxStage 段階の数(グレードの上限)
 * @property {number} inventoryMax 持ち物の上限
 * @property {number} gradeGrowth グレードごとの基本効果の伸び
 * @property {readonly { id: string }[]} skills スキルの表(番号の並び)
 * @property {(rarityId: string, grade: number) => { min: number, max: number }} skillRange 装備 1 個のスキルの数(レベル。版 6 まではポイント)の範囲
 */

const MAX_COUNT = Number.MAX_SAFE_INTEGER;
const SEED_MAX = 4294967295;

/** @param {unknown} v @returns {v is number} */
function isCount(v) {
  return Number.isSafeInteger(v) && /** @type {number} */ (v) >= 0 && /** @type {number} */ (v) <= MAX_COUNT;
}

/** @param {unknown} v @returns {v is Record<string, unknown>} */
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * 版 4 の装備 1 個を点検する。正しければ複製を返す(スキルは空だけ:版 4 にはスキルがない)。
 * @param {unknown} raw @param {GearRules} rules @returns {Item | null}
 */
function readItem(raw, rules) {
  if (!isPlainObject(raw)) return null;
  const { id, kind, rarity, grade, value, skills } = raw;
  if (!isCount(id) || id < 1) return null;
  if (typeof kind !== "string" || typeof rarity !== "string") return null;
  const kindRow = kindById(kind, rules.equipKinds);
  const rarityRow = rarityById(rarity, RARITY_ROWS);
  if (!kindRow || !rarityRow) return null;
  if (!Number.isSafeInteger(grade) || /** @type {number} */ (grade) < 1 || /** @type {number} */ (grade) > rules.maxStage) {
    return null;
  }
  const range = effectRange(kindRow, rarityRow, /** @type {number} */ (grade), rules.gradeGrowth);
  if (!Number.isSafeInteger(value) || /** @type {number} */ (value) < range.min || /** @type {number} */ (value) > range.max) {
    return null;
  }
  // スキルは ②-4b から。今は空の一覧だけを受け付ける。
  if (!Array.isArray(skills) || skills.length !== 0) return null;
  return { id, kind, rarity, grade: /** @type {number} */ (grade), value: /** @type {number} */ (value), skills: [] };
}

/**
 * 版 4 の形の、装備とガチャのまとまりを点検する(版 4 → 5 の読み替えで使う)。正しければ複製を、おかしければ null。
 * 版 3 以前から読み替えたデータは、ガチャの種が null(画面がデータを読んだときに決める)。
 * @param {unknown} raw @param {GearRules} rules @returns {Gear | null}
 */
export function readGearV4(raw, rules) {
  if (!isPlainObject(raw)) return null;
  const { items, equipped, draws, seed, nextId } = raw;
  if (!Array.isArray(items) || items.length > rules.inventoryMax) return null;
  /** @type {Item[]} */
  const own = [];
  const ids = new Set();
  for (const r of items) {
    const item = readItem(r, rules);
    if (!item || ids.has(item.id)) return null;
    ids.add(item.id);
    own.push(item);
  }
  if (!isCount(nextId) || nextId < 1 || own.some((it) => it.id >= nextId)) return null;
  if (!isCount(draws)) return null;
  if (seed !== null && (!Number.isSafeInteger(seed) || /** @type {number} */ (seed) < 0 || /** @type {number} */ (seed) > SEED_MAX)) {
    return null;
  }
  if (!isPlainObject(equipped)) return null;
  /** @type {Record<string, number>} */
  const ownEquipped = {};
  for (const [slot, id] of Object.entries(equipped)) {
    if (!kindById(slot, rules.equipKinds)) return null;
    const item = own.find((it) => it.id === id);
    // 装着の番号は持ち物にあり、枠と種類がそろっていること。
    if (!item || item.kind !== slot) return null;
    ownEquipped[slot] = item.id;
  }
  return {
    items: own,
    equipped: ownEquipped,
    draws,
    seed: /** @type {number | null} */ (seed),
    nextId,
  };
}

/** 版 3 から版 4 への読み替えで足す、空のまとまり(ガチャの種はまだ決めない)。 @returns {Gear} */
export function migratedGear() {
  return emptyGear();
}

/**
 * 保存する形(版 5 の短い配列)にする。
 * @param {Gear} gear @param {{ equipKinds: readonly { id: string }[], skills: readonly { id: string }[] }} tables
 */
export function packGear(gear, tables) {
  const kindIndex = (/** @type {string} */ id) => tables.equipKinds.findIndex((k) => k.id === id);
  const rarityIndex = (/** @type {string} */ id) => RARITY_ROWS.findIndex((r) => r.id === id);
  const skillIndex = (/** @type {string} */ id) => tables.skills.findIndex((s) => s.id === id);
  return {
    items: gear.items.map((it) => [
      it.id,
      kindIndex(it.kind),
      rarityIndex(it.rarity),
      it.grade,
      it.value,
      it.skills.flatMap((s) => [skillIndex(s.id), s.level]),
    ]),
    equipped: Object.entries(gear.equipped).map(([kind, id]) => [kindIndex(kind), id]),
    draws: gear.draws,
    seed: gear.seed,
    nextId: gear.nextId,
  };
}

/** 0 以上 n 未満の整数か。 @param {unknown} v @param {number} n @returns {v is number} */
function isIndex(v, n) {
  return Number.isSafeInteger(v) && /** @type {number} */ (v) >= 0 && /** @type {number} */ (v) < n;
}

/**
 * 版 5 の装備 1 個(配列)を点検して、中の形にする。
 * @param {unknown} raw @param {GearRules} rules @returns {Item | null}
 */
function unpackItem(raw, rules) {
  if (!Array.isArray(raw) || raw.length !== 6) return null;
  const [id, k, r, grade, value, skillPairs] = raw;
  if (!isCount(id) || id < 1) return null;
  if (!isIndex(k, rules.equipKinds.length) || !isIndex(r, RARITY_ROWS.length)) return null;
  const kind = rules.equipKinds[k];
  const rarity = RARITY_ROWS[r];
  if (!Number.isSafeInteger(grade) || /** @type {number} */ (grade) < 1 || /** @type {number} */ (grade) > rules.maxStage) return null;
  const g = /** @type {number} */ (grade);
  const range = effectRange(kind, rarity, g, rules.gradeGrowth);
  if (!Number.isSafeInteger(value) || /** @type {number} */ (value) < range.min || /** @type {number} */ (value) > range.max) {
    return null;
  }
  // スキル:[番号, レベル] の組の並び。数はレア度の数まで(旧装備は 0:D-172)、同じスキルは 1 回だけ、レベルは範囲の中。
  // 版 6 までのデータを読むときは、レベルの代わりにポイント(範囲は rules.skillRange が決める)。
  if (!Array.isArray(skillPairs) || skillPairs.length % 2 !== 0) return null;
  if (skillPairs.length / 2 > (rarity.skillCount ?? 0)) return null;
  const pr = rules.skillRange(rarity.id, g);
  /** @type {import("./skills.js").ItemSkill[]} */
  const skills = [];
  for (let i = 0; i < skillPairs.length; i += 2) {
    const si = skillPairs[i];
    const level = skillPairs[i + 1];
    if (!isIndex(si, rules.skills.length)) return null;
    const sid = rules.skills[si].id;
    if (skills.some((s) => s.id === sid)) return null;
    if (!Number.isSafeInteger(level) || level < pr.min || level > pr.max) return null;
    skills.push({ id: sid, level });
  }
  return { id, kind: kind.id, rarity: rarity.id, grade: g, value: /** @type {number} */ (value), skills };
}

/**
 * 版 5 の、装備とガチャのまとまりを点検して、中の形にする。正しければ Gear を、おかしければ null。
 * @param {unknown} raw @param {GearRules} rules @returns {Gear | null}
 */
export function readGear(raw, rules) {
  if (!isPlainObject(raw)) return null;
  const { items, equipped, draws, seed, nextId } = raw;
  if (!Array.isArray(items) || items.length > rules.inventoryMax) return null;
  /** @type {Item[]} */
  const own = [];
  const ids = new Set();
  for (const r of items) {
    const item = unpackItem(r, rules);
    if (!item || ids.has(item.id)) return null;
    ids.add(item.id);
    own.push(item);
  }
  if (!isCount(nextId) || nextId < 1 || own.some((it) => it.id >= nextId)) return null;
  if (!isCount(draws)) return null;
  if (seed !== null && (!Number.isSafeInteger(seed) || /** @type {number} */ (seed) < 0 || /** @type {number} */ (seed) > SEED_MAX)) {
    return null;
  }
  if (!Array.isArray(equipped)) return null;
  /** @type {Record<string, number>} */
  const ownEquipped = {};
  for (const pair of equipped) {
    if (!Array.isArray(pair) || pair.length !== 2 || !isIndex(pair[0], rules.equipKinds.length)) return null;
    const slot = rules.equipKinds[pair[0]].id;
    const item = own.find((it) => it.id === pair[1]);
    // 装着の番号は持ち物にあり、枠と種類がそろい、同じ枠は 1 回だけ。
    if (!item || item.kind !== slot || slot in ownEquipped) return null;
    ownEquipped[slot] = item.id;
  }
  return { items: own, equipped: ownEquipped, draws, seed: /** @type {number | null} */ (seed), nextId };
}

/** 版 5 までのルアーの値の範囲(外したあとの次の当たり +n:基本 2〜4、1 刻み)。読み替えにだけ使う(D-188)。 */
export const LURE_V5 = Object.freeze({ base: Object.freeze({ min: 2, max: 4 }), step: 1 });

/**
 * 版 5 までの種類の表(ルアーの値の範囲だけ前のもの)。版 4・版 5 のデータの点検に使う。
 * @param {readonly EquipKind[]} kinds @returns {EquipKind[]}
 */
export function legacyKinds(kinds) {
  return kinds.map((k) => (k.id === "lure" ? { ...k, base: LURE_V5.base, step: LURE_V5.step } : k));
}

/**
 * 旧ルアーの値を、同じレア度・グレードの範囲の中での相対的な位置を保って、新しい値に読み替える(D-188)。
 * 位置 =(値 − 前の最小)÷(前の最大 − 前の最小)。新しい値 = 新しい最小 + 位置 ×(新しい最大 − 新しい最小)を刻みに丸める。
 * @param {Gear} gear 版 5 の点検を通ったもの @param {readonly EquipKind[]} kinds 今の種類の表 @param {number} gradeGrowth
 * @returns {Gear}
 */
export function remapLures(gear, kinds, gradeGrowth) {
  const lure = kindById("lure", kinds);
  if (!lure) return gear;
  const old = legacyKinds([lure])[0];
  const items = gear.items.map((it) => {
    if (it.kind !== "lure") return it;
    const rarity = rarityById(it.rarity, RARITY_ROWS);
    if (!rarity) return it;
    const from = effectRange(old, rarity, it.grade, gradeGrowth);
    const to = effectRange(lure, rarity, it.grade, gradeGrowth);
    const t = from.max > from.min ? (it.value - from.min) / (from.max - from.min) : 0;
    const value = to.min + Math.round((t * (to.max - to.min)) / lure.step) * lure.step;
    return { ...it, value: Math.min(to.max, Math.max(to.min, value)) };
  });
  return { ...gear, items };
}

/** 版 6 までのスキルの表の並び(セーブコードの番号。目利きは 5 番:D-196)。読み替えにだけ使う。 */
export const LEGACY_SKILL_IDS = Object.freeze([
  "power", "crit-rate", "crit-power", "tenacity", "fortune", "appraisal", "agility", "insight", "mastery", "recovery",
  "combo-power", "combo-crit", "first-hit", "just-boost", "finisher", "momentum", "first-strike",
].map((id) => Object.freeze({ id })));

/** 版 6 までの、装備 1 個のスキルのポイントの範囲(グレード 1・レアで 2〜4、グレードごとに +35%、レア度の倍率)。 */
const LEGACY_POINTS = Object.freeze({ base: Object.freeze({ min: 2, max: 4 }), growth: 0.35, rarity: Object.freeze({ normal: 1, rare: 1, epic: 1.25, legend: 1.5 }) });

/** @param {string} rarityId @param {number} grade @returns {{ min: number, max: number }} */
export function legacyPointsRange(rarityId, grade) {
  const factor = (1 + LEGACY_POINTS.growth * (grade - 1)) * (LEGACY_POINTS.rarity[/** @type {keyof typeof LEGACY_POINTS.rarity} */ (rarityId)] ?? 1);
  const min = Math.max(1, Math.round(LEGACY_POINTS.base.min * factor));
  const max = Math.max(min, Math.round(LEGACY_POINTS.base.max * factor));
  return { min, max };
}

/**
 * 版 6 までのスキル(ポイント)を、版 7 のレベルに読み替える(D-195・D-196・D-208)。
 * レベル = ポイント ÷ 4 を四捨五入(最低 1)。新しい範囲の外になるときは、近いほうの端に収める。目利きは取り除く(装備は残す)。
 * @param {Gear} gear 版 6 の点検を通ったもの(skills の level にポイントが入っている) @param {readonly { id: string }[]} skills 今のスキルの表
 * @param {import("./skills.js").SkillConfig} config @returns {Gear}
 */
export function pointsToLevels(gear, skills, config) {
  const items = gear.items.map((it) => {
    const range = levelRange(it.rarity, it.grade, config);
    const kept = it.skills.filter((s) => skills.some((row) => row.id === s.id));
    return {
      ...it,
      skills: kept.map((s) => ({ id: s.id, level: Math.min(range.max, Math.max(range.min, Math.max(1, Math.round(s.level / 4)))) })),
    };
  });
  return { ...gear, items };
}
