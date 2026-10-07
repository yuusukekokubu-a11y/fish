// @ts-check
// 釣りの中のグローブ(D-333・D-334)。fishing.js から呼ぶ小さなフック。グローブがなければ、どれも何もしない(前と同じ結果)。
// - 釣れるクレート:投ごとに 1 回、グローブ用の系統から判定の乱数を引き、条件(1)〜(5)を満たせば弱い魚の投を置き換える。
// - 能力:装着中のグローブが、いまの魚・ヌシの段階に対応しているときだけ効く(対応段階 = グレード + 延長)。
// 画面に関係しない計算だけを置く。JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { inNewestArea } from "./areas.js";
import { FISH_KINDS } from "./fish.js";
import { copyGloves, emptyGloves, equippedGlove, gloveCovers, gloveValue, openCrate, rollCrate } from "./glove.js";

/** @typedef {import("./glove.js").GloveBag} GloveBag */
/** @typedef {import("./glove.js").Glove} Glove */

/** グローブの持ち物(なければ null。保存では既定のときは持たない)。 @param {any} progress @returns {GloveBag | null} */
export function gloveBag(progress) {
  return progress.gloves ?? null;
}

/** グローブの持ち物を、なければ作って返す。 @param {any} progress @returns {GloveBag} */
export function ensureGloveBag(progress) {
  if (!progress.gloves) progress.gloves = emptyGloves();
  return progress.gloves;
}

/** 進み具合を複製するときの、グローブの欄(あるときだけ写す)。 @param {any} from @param {any} to */
export function copyGloveField(from, to) {
  if (from.gloves) to.gloves = copyGloves(from.gloves);
}

/** 装着中のグローブ(なければ null)。 @param {any} game @returns {Glove | null} */
export function wornGlove(game) {
  return equippedGlove(gloveBag(game.progress) ?? undefined);
}

/**
 * いまの魚・ヌシに効く、その能力の値(効かなければ null)。
 * @param {any} game @param {string} abilityId
 */
export function gloveEffect(game, abilityId) {
  const glove = wornGlove(game);
  if (!glove || glove.ability !== abilityId) return null;
  const stage = game.cast?.fish?.stage;
  if (!Number.isFinite(stage) || !gloveCovers(glove, stage)) return null;
  return gloveValue(glove) ?? null;
}

/** 装着中のグローブが、いまの魚・ヌシの段階に対応していない(画面の「グローブ 対応外」)。 @param {any} game */
export function gloveOutOfRange(game) {
  const glove = wornGlove(game);
  const stage = game.cast?.fish?.stage;
  return Boolean(glove && Number.isFinite(stage) && !gloveCovers(glove, stage));
}

/** 自動合わせのグローブを付けているか(対応段階によらず、付けていれば釣れるクレートは出ない)。 @param {any} game */
function wearsAutoHook(game) {
  return wornGlove(game)?.ability === "auto-hook";
}

/** 釣れるクレートの出現率(?debug の上書きがあればそれ)。 @param {any} game */
export function crateChance(game) {
  return game.crateChance ?? game.config.glove.crateChance;
}

/**
 * 釣れるクレートの判定(投げ終わったとき、餌のあとに 1 回)。ガチャの種がまだないとき(データを作る前)は判定しない。
 * 同じ投で 2 回は引かない(ヌシ戦のあと、取っておいた投に戻ったときなど)。
 * 条件:(1) 保管に空き (2) いちばん新しい釣り場 (3) 餌を使っていない投 (4) 自動合わせを付けていない (5) 弱い魚の投。
 * @param {any} game
 */
export function rollGloveCrate(game) {
  const seed = game.progress.gear?.seed;
  if (seed === null || seed === undefined || game.cast.crateRolled) return;
  const bag = ensureGloveBag(game.progress);
  const conditions =
    bag.items.length < game.config.glove.max &&
    inNewestArea(game.progress, game.content) &&
    !game.cast.bait &&
    !wearsAutoHook(game) &&
    game.cast.kind === FISH_KINDS.WEAK;
  const crate = rollCrate(bag, seed, conditions, crateChance(game));
  game.cast = crate ? { ...game.cast, crateRolled: true, crate } : { ...game.cast, crateRolled: true };
}

/**
 * 釣れるクレートの合わせが成功したとき、グローブを持ち物に足す(グレード = いまの竿の段階)。足したグローブ(いっぱいなら null)。
 * @param {any} game
 */
export function takeCrateGlove(game) {
  const bag = ensureGloveBag(game.progress);
  return openCrate(bag, game.progress.gear.seed, game.cast.crate.index, game.progress.rodStage, game.config.glove.max);
}

/** 仕切り直しのストック(上限で丸めた値)。グローブが効かなければ 0。 @param {any} game */
export function retryStock(game) {
  const max = gloveEffect(game, "retry");
  if (!max) return 0;
  return game.retry.stock === null ? max : Math.min(game.retry.stock, max);
}

/** 装着中の仕切り直しのストックと上限(画面用。魚によらない)。付けていなければ null。 @param {any} game */
export function retryStockView(game) {
  const glove = wornGlove(game);
  if (!glove || glove.ability !== "retry") return null;
  const max = /** @type {number} */ (gloveValue(glove));
  return { stock: game.retry.stock === null ? max : Math.min(game.retry.stock, max), max };
}

/** 仕切り直しを使えたら、ストックを 1 減らして true。 @param {any} game */
export function useRetry(game) {
  const stock = retryStock(game);
  if (stock <= 0) return false;
  game.retry.stock = stock - 1;
  game.retryUsed = (game.retryUsed ?? 0) + 1;
  return true;
}

/**
 * 魚(弱い・強い)を 1 匹釣り上げたら数え、retryEvery 匹ごとにストックを 1 増やす(上限まで)。保存しない。
 * @param {any} game
 */
export function countCatchForRetry(game) {
  game.retry.fish += 1;
  if (game.retry.fish % game.config.glove.retryEvery !== 0 || game.retry.stock === null) return;
  const glove = wornGlove(game);
  const max = glove?.ability === "retry" ? /** @type {number} */ (gloveValue(glove)) : 0;
  game.retry.stock = Math.min(max, game.retry.stock + 1);
}

/**
 * かすりの帯(命中範囲の両側に、幅 × outer ずつ。ゲージの外には出ない)の中か。命中範囲の中は含めない。
 * @param {number} position @param {{ start: number, end: number }} zone @param {number} outer
 */
export function inGrazeBand(position, zone, outer) {
  const extra = (zone.end - zone.start) * outer;
  const lo = Math.max(0, zone.start - extra);
  const hi = Math.min(1, zone.end + extra);
  const inside = zone.start <= position && position <= zone.end;
  return !inside && lo <= position && position <= hi;
}
