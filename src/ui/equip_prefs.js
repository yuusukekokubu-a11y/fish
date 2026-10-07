// @ts-check
// 装備の画面の並べ替えと絞り込みを覚える(D-304)。ブラウザの中の別の保存場所に書く。
// ゲームの保存データとセーブコードには入れない。本番とデバッグで保存場所を分ける。
// 画面に触らない。JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { RARITY_ROWS } from "../core/gear.js";
import { SORT_CHOICES } from "./gear_view.js";

export const EQUIP_VIEW_KEY = "tsuri:equip-view";
export const DEBUG_EQUIP_VIEW_KEY = "tsuri:debug-equip-view";

/**
 * 並べ替えと絞り込み。null はすべて。
 * @typedef {object} EquipPrefs
 * @property {import("./gear_view.js").SortId} sort
 * @property {string | null} kind
 * @property {string | null} rarity
 * @property {import("./gear_view.js").LockFilter} lock
 */

/** 初めの値(レア度順・すべて)。 @returns {EquipPrefs} */
export function defaultPrefs() {
  return { sort: "rarity", kind: null, rarity: null, lock: null };
}

/** 保存場所(本番とデバッグで別)。 @param {{ debug: boolean }} options */
export function equipViewKeyFor(options) {
  return options.debug ? DEBUG_EQUIP_VIEW_KEY : EQUIP_VIEW_KEY;
}

/**
 * 読んだ値を点検する。知らない値は初めの値にする(種類がなくなった、など)。
 * @param {unknown} raw @param {readonly { id: string }[]} kinds @returns {EquipPrefs}
 */
export function cleanPrefs(raw, kinds) {
  const p = defaultPrefs();
  if (!raw || typeof raw !== "object") return p;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const sort = SORT_CHOICES.find((s) => s.id === r.sort);
  if (sort) p.sort = sort.id;
  if (typeof r.kind === "string" && kinds.some((k) => k.id === r.kind)) p.kind = r.kind;
  if (typeof r.rarity === "string" && RARITY_ROWS.some((x) => x.id === r.rarity)) p.rarity = r.rarity;
  if (r.lock === "locked" || r.lock === "unlocked") p.lock = r.lock;
  return p;
}

/**
 * 保存場所から読む(なければ・壊れていれば初めの値)。
 * @param {{ getItem: (k: string) => string | null }} storage @param {string} key @param {readonly { id: string }[]} kinds
 */
export function loadPrefs(storage, key, kinds) {
  try {
    const text = storage.getItem(key);
    return cleanPrefs(text ? JSON.parse(text) : null, kinds);
  } catch {
    return defaultPrefs();
  }
}

/**
 * 保存場所に書く(書けなくても、その回は使う)。
 * @param {{ setItem: (k: string, v: string) => void }} storage @param {string} key @param {EquipPrefs} prefs
 */
export function savePrefs(storage, key, prefs) {
  try {
    storage.setItem(key, JSON.stringify(prefs));
  } catch {
    // 書けなくてもよい。
  }
}
