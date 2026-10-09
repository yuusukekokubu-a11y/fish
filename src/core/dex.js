// @ts-check
// 魚の図鑑と、釣れた個体の大きさ(D-405)。
// - 釣れるたびに、その魚の「標準の大きさ(cm)× 倍率」を決める。倍率は 0.80〜1.25。
// - 冠(モンハンの王冠と同じ考え):金冠(最大級・約 1%)・銀冠(大きい・約 4%)・ミニ金冠(最小級・約 1%)。
// - 図鑑は魚ごとに「釣った数・最小の倍率・最大の倍率」を持つ(倍率は × 1000 の整数)。冠は最小・最大から出す。
// - 乱数は魚の系統を使わない(D-064)。シードと「その魚を釣った数」から作る(再読み込みしても、同じ回数目なら同じ大きさ)。
// 数は config.dex(D-071 と同じく、コードに数を直接書かない)。画面に関係しない計算だけを置く。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { drawSeed } from "./gear.js";
import { createRng } from "./rng.js";
import { addCount } from "./rod.js";

/**
 * 図鑑の 1 行(魚ごと)。min・max は倍率 × 1000 の整数。
 * @typedef {{ count: number, min: number, max: number }} DexEntry
 */

/** @typedef {Record<string, DexEntry>} Dex */

/** @typedef {typeof import("./config.js").DEFAULT_CONFIG.dex} DexConfig */

/** 大きさの乱数の種を、ほかの系統とずらすための数。 */
const SIZE_SALT = 0x3c6ef372;

/** 倍率(× 1000)のとりうる範囲(保存の点検に使う)。 */
export const DEX_MIN = 800;
export const DEX_MAX = 1250;

/** 冠の順(画面の並び)。 */
export const CROWNS = Object.freeze(["gold", "silver", "mini"]);

/**
 * 0〜1 の数 u から倍率(× 1000 の整数)を作る。区分けの直線(config.dex.bands)。
 * @param {number} u @param {DexConfig} c
 */
export function sizeRatio(u, c) {
  const bands = c.bands;
  for (let i = 0; i < bands.length; i++) {
    const b = bands[i];
    if (u < b.to || i === bands.length - 1) {
      const t = Math.min(1, Math.max(0, (u - b.from) / (b.to - b.from)));
      return Math.round(1000 * (b.min + (b.max - b.min) * t));
    }
  }
  return 1000;
}

/**
 * 倍率(× 1000)の冠。金冠・銀冠は大きい側、ミニ金冠は小さい側。どれでもなければ null。
 * @param {number} ratio @param {DexConfig} c @returns {"gold" | "silver" | "mini" | null}
 */
export function crownOf(ratio, c) {
  if (ratio >= c.gold * 1000) return "gold";
  if (ratio >= c.silver * 1000) return "silver";
  if (ratio <= c.mini * 1000) return "mini";
  return null;
}

/**
 * 図鑑の 1 行の冠(最大から金冠・銀冠、最小からミニ金冠)。
 * @param {DexEntry | undefined} e @param {DexConfig} c
 */
export function entryCrowns(e, c) {
  if (!e || e.count === 0) return { gold: false, silver: false, mini: false };
  const big = crownOf(e.max, c);
  return { gold: big === "gold", silver: big === "gold" || big === "silver", mini: crownOf(e.min, c) === "mini" };
}

/** 大きさ(cm。小数 1 けた)。 @param {number} baseCm @param {number} ratio */
export function sizeCm(baseCm, ratio) {
  return Math.round(baseCm * ratio / 100) / 10;
}

/**
 * index 番目の魚の、n 回目(0 から)に釣れた個体の倍率。
 * @param {number} seed @param {number} index 魚の表の番号 @param {number} n その魚を釣った数 @param {DexConfig} c
 */
export function catchRatio(seed, index, n, c) {
  const rng = createRng(drawSeed((seed ^ SIZE_SALT) >>> 0, index * 100003 + n));
  return sizeRatio(rng(), c);
}

/** 進み具合の図鑑(なければ空。変えない)。 @param {{ dex?: Dex }} progress @returns {Dex} */
export function dexOf(progress) {
  return progress.dex ?? {};
}

/**
 * 釣れた個体を図鑑に記録する。大きさの結果を返す:cm・冠・新しい最大か最小か(best)・新しく取った冠(newCrown)。
 * @param {{ dex?: Dex }} progress @param {{ id: string, cm: number }} fish @param {number} index 魚の表の番号
 * @param {number} seed @param {DexConfig} c
 */
export function recordCatch(progress, fish, index, seed, c) {
  const dex = progress.dex ?? (progress.dex = {});
  const before = dex[fish.id];
  const n = before?.count ?? 0;
  const ratio = catchRatio(seed, index, n, c);
  const had = entryCrowns(before, c);
  const first = !before || before.count === 0;
  const entry = { count: addCount(n, 1), min: first ? ratio : Math.min(before.min, ratio), max: first ? ratio : Math.max(before.max, ratio) };
  dex[fish.id] = entry;
  const now = entryCrowns(entry, c);
  const crown = crownOf(ratio, c);
  /** @type {"gold" | "silver" | "mini" | null} */
  const newCrown = now.gold && !had.gold ? "gold" : now.silver && !had.silver ? "silver" : now.mini && !had.mini ? "mini" : null;
  /** @type {"max" | "min" | null} */
  const best = first ? null : ratio > before.max ? "max" : ratio < before.min ? "min" : null;
  return { cm: sizeCm(fish.cm, ratio), ratio, crown, best, newCrown };
}

/** 複製。 @param {Dex} dex @returns {Dex} */
export function copyDex(dex) {
  return Object.fromEntries(Object.entries(dex).map(([id, e]) => [id, { ...e }]));
}
