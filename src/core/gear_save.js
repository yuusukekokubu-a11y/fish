// @ts-check
// 保存の、装備とガチャのまとまりの変換と点検(D-143・D-171・D-178)。
// 版 5 の形(短い配列。表の番号で書く):
//   { items: [[個体の番号, 種類の番号, レア度の番号, グレード, 基本効果の値, [スキルの番号, ポイント, …]], …],
//     equipped: [[種類の番号, 個体の番号], …], draws, seed, nextId }
//   番号は表(装備の種類・レア度・スキル)の並びの順(0 から)。表の行は、あとから並べ替えない(足すのは最後に)。
// 版 4 の形(オブジェクト):{ items: [{ id, kind, rarity, grade, value, skills: [] }], equipped: { 種類の id: 番号 }, … }
// 壊れた・範囲外・表にない種類やレア度やスキル・同じ装備に同じスキル・ポイントが範囲外・持ち物にない装着の番号を
// 含むときは null を返す(読み込みを拒否する)。
// このファイルは JSDoc で型を書き、`npm run typecheck` で確かめる(D-144)。

import { effectRange, emptyGear, kindById, RARITY_ROWS, rarityById } from "./gear.js";
import { pointsRange } from "./skills.js";

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
 * @property {readonly import("./skills.js").SkillRow[]} skills スキルの表
 * @property {import("./skills.js").SkillConfig} skillConfig スキルの数値
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
      it.skills.flatMap((s) => [skillIndex(s.id), s.points]),
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
  // スキル:[番号, ポイント] の組の並び。数はレア度の数まで(旧装備は 0:D-172)、同じスキルは 1 回だけ、ポイントは範囲の中。
  if (!Array.isArray(skillPairs) || skillPairs.length % 2 !== 0) return null;
  if (skillPairs.length / 2 > (rarity.skillCount ?? 0)) return null;
  const pr = pointsRange(rarity.id, g, rules.skillConfig);
  /** @type {import("./skills.js").ItemSkill[]} */
  const skills = [];
  for (let i = 0; i < skillPairs.length; i += 2) {
    const si = skillPairs[i];
    const points = skillPairs[i + 1];
    if (!isIndex(si, rules.skills.length)) return null;
    const sid = rules.skills[si].id;
    if (skills.some((s) => s.id === sid)) return null;
    if (!Number.isSafeInteger(points) || points < pr.min || points > pr.max) return null;
    skills.push({ id: sid, points });
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
