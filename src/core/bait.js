// @ts-check
// 餌(D-263〜D-265)。ウロコインで買い、使うと、その投が「現在の段階の強い魚」になる。
// - 所持数は 1 種類(上限 config.bait.max)。買えるのは現在の段階の餌だけ。価格は通し番号 g の式(formula.js の baitPrice)。
// - 餌を使う投も、魚の乱数は使わないときと同じ数・順番で引き、結果だけを置き換える(fishing.js:D-264)。
// - 竿の進化で段階が進んだら、残りの餌を、買った段階(進化の前の段階)の価格で払い戻す。
// - 進み具合の中では、餌の所持数 `bait` は 1 個以上のときだけ、スイッチ `useBait` は入っているときだけ持つ
//   (ないときは欄を持たない。保存の往復で同じ形になり、前の版のデータの形も変わらない:D-269)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { DEFAULT_CONFIG } from "./config.js";
import { baitPrice } from "./formula.js";

/**
 * 餌に関わる進み具合の部分。
 * @typedef {{ coins: number, rodStage: number, bait?: number, useBait?: boolean }} BaitProgress
 */

/** 餌の数値(config.bait)。 @typedef {{ max: number }} BaitConfig */

/** 餌の所持数。 @param {BaitProgress} progress */
export function baitCount(progress) {
  return progress.bait ?? 0;
}

/** 餌の所持数を n にする(0 なら欄を消す)。 @param {BaitProgress} progress @param {number} n */
export function setBait(progress, n) {
  if (n > 0) progress.bait = n;
  else delete progress.bait;
}

/** 「餌を使う」のスイッチ(切ったら欄を消す)。 @param {BaitProgress} progress @param {boolean} on */
export function setUseBait(progress, on) {
  if (on) progress.useBait = true;
  else delete progress.useBait;
}

/** 次の投で餌を使うか(スイッチが入っていて、餌が 1 個以上)。 @param {BaitProgress} progress */
export function willUseBait(progress) {
  return Boolean(progress.useBait) && baitCount(progress) > 0;
}

/** 現在の段階の餌の 1 個の価格。 @param {BaitProgress} progress @param {any} [formula] */
export function currentBaitPrice(progress, formula = DEFAULT_CONFIG.formula) {
  return baitPrice(progress.rodStage, formula);
}

/**
 * 買えない理由。count 個買えるなら null。"count"(数がおかしい)・"max"(上限をこえる)・"coins"(ウロコインが足りない)。
 * @param {BaitProgress} progress @param {number} count @param {{ bait: BaitConfig, formula?: any }} config
 */
export function baitBlocker(progress, count, config) {
  if (!Number.isInteger(count) || count < 1) return "count";
  if (baitCount(progress) + count > config.bait.max) return "max";
  if (progress.coins < count * currentBaitPrice(progress, config.formula)) return "coins";
  return null;
}

/**
 * いま買える最大の数(上限とウロコインの両方から)。0 なら買えない。
 * @param {BaitProgress} progress @param {{ bait: BaitConfig, formula?: any }} config
 */
export function maxBuyable(progress, config) {
  const room = config.bait.max - baitCount(progress);
  const price = currentBaitPrice(progress, config.formula);
  return Math.max(0, Math.min(room, Math.floor(progress.coins / price)));
}

/**
 * 餌を count 個買う。買えなければ何も変えない。
 * @param {BaitProgress} progress @param {number} count @param {{ bait: BaitConfig, formula?: any }} config
 * @returns {{ ok: true, count: number, cost: number } | { ok: false, reason: string }}
 */
export function buyBait(progress, count, config) {
  const reason = baitBlocker(progress, count, config);
  if (reason) return { ok: false, reason };
  const cost = count * currentBaitPrice(progress, config.formula);
  progress.coins -= cost;
  setBait(progress, baitCount(progress) + count);
  return { ok: true, count, cost };
}

/**
 * 残りの餌を、買った段階 fromStage の価格で払い戻す(竿の進化・デバッグで段階を変えたとき)。{ count, coins }。
 * @param {BaitProgress} progress @param {number} fromStage @param {number} coinMax @param {any} [formula]
 */
export function refundBait(progress, fromStage, coinMax, formula = DEFAULT_CONFIG.formula) {
  const count = baitCount(progress);
  if (count === 0) return { count: 0, coins: 0 };
  const coins = count * baitPrice(fromStage, formula);
  progress.coins = Math.min(coinMax, progress.coins + coins);
  setBait(progress, 0);
  return { count, coins };
}

/**
 * 餌で出る魚:段階 stage の強い魚(段階の表の、製作に使う鱗の魚)。
 * @param {{ stages: readonly { stage: number, craft: { scale: string } }[], byId: Map<string, any> }} content @param {number} stage
 */
export function baitFish(content, stage) {
  const row = content.stages.find((s) => s.stage === stage);
  return row ? (content.byId.get(row.craft.scale) ?? null) : null;
}
