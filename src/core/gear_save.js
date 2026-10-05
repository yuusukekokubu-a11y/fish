// @ts-check
// 保存の版 4 の、装備とガチャのまとまりの点検(D-143)。
// 形:{ items: [{ id, kind, rarity, grade, value, skills }], equipped: { 種類の id: 個体の番号 }, draws, seed, nextId }
// 壊れた・範囲外・表にない種類やレア度・持ち物にない装着の番号を含むときは null を返す(読み込みを拒否する)。
// このファイルは JSDoc で型を書き、`npm run typecheck` で確かめる(D-144)。

import { effectRange, emptyGear, kindById, RARITY_ROWS, rarityById } from "./gear.js";

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
 * 装備 1 個を点検する。正しければ複製を返す。
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
 * 装備とガチャのまとまりを点検する。正しければ複製を、おかしければ null を返す。
 * 版 3 以前から読み替えたデータは、ガチャの種が null(画面がデータを読んだときに決める)。
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

/** 保存する形にする(複製)。 @param {Gear} gear */
export function gearToSave(gear) {
  return {
    items: gear.items.map((it) => ({
      id: it.id,
      kind: it.kind,
      rarity: it.rarity,
      grade: it.grade,
      value: it.value,
      skills: [...it.skills],
    })),
    equipped: { ...gear.equipped },
    draws: gear.draws,
    seed: gear.seed,
    nextId: gear.nextId,
  };
}
