// @ts-check
// 投げの中身を決める(魚の系統の乱数で引く投・ヌシ戦の投・餌の投)。fishing.js から分けた(800 行に余裕を持たせるため:D-342・D-344)。
// 画面に関係しない計算だけを置く。乱数の引き方は fishing.js にあったときと同じ。

import { critSeed } from "./combat.js";
import { AREA_ROWS, areaOfStage, makeAreas } from "./areas.js";
import { DEFAULT_CONFIG } from "./config.js";
import { availableFish, effectiveMinigame, FISH_KINDS, FISH_LIST, pickWeighted } from "./fish.js";
import { zoneAt } from "./minigame.js";
import { createRng } from "./rng.js";

/**
 * 「魚の系統」の乱数で、竿の段階 rodStage の 1 回の投げを決める(D-046・D-064)。
 * 引く順番は固定:待ち時間 → 魚 →(強い魚なら)ミニゲームの種。引く回数は Issue #6 から同じ。
 * 強い魚かどうかは魚の乱数だけで決まるので、釣り場(魚の候補)によらず、引く数は同じ(D-275)。
 * ミニゲームの種から、最初の命中範囲と「ミニゲームの系統」の乱数を作る。
 * options:{ fish: 魚の設定表, strongChance: 強い魚の出現率, range: 出る魚の段階の範囲 { min, max } }
 * (なければ基本の表・config の値・竿の段階が属する釣り場の最初の段階〜竿の段階)。
 * 引いた数は raw に残す(釣り場を移ったとき、引き直さずに魚だけ決め直す:resolveCast)。
 * @param {() => number} rng @param {any} [config] @param {number} [rodStage]
 * @param {{ fish?: readonly any[], strongChance?: number, range?: { min: number, max: number } }} [options]
 */
export function drawCast(rng, config = DEFAULT_CONFIG, rodStage = 1, options = {}) {
  const strongChance = options.strongChance ?? config.strongChance;
  const waitMs = config.waitMinMs + rng() * (config.waitMaxMs - config.waitMinMs);
  const u = rng();
  const seedValue = u < strongChance ? rng() : null;
  const range = options.range ?? { min: areaOfStage({ areas: makeAreas(AREA_ROWS, rodStage) }, rodStage).firstStage, max: rodStage };
  return resolveCast({ waitMs, u, seedValue, strongChance }, config, options.fish ?? FISH_LIST, range);
}

/**
 * 引いた数(raw)から、段階の範囲 range の中で魚を決める(乱数は引かない)。重みは範囲の最初の段階から数える(D-275)。
 * @param {{ waitMs: number, u: number, seedValue: number | null, strongChance: number }} raw
 * @param {any} config @param {readonly any[]} list @param {{ min: number, max: number }} range
 */
export function resolveCast(raw, config, list, range) {
  const { waitMs, u, seedValue, strongChance } = raw;
  const strong = seedValue !== null;
  const kind = strong ? FISH_KINDS.STRONG : FISH_KINDS.WEAK;
  // 区分の中での位置を 0〜1 に引きのばし、その値で種類を選ぶ。
  const v = strong ? u / strongChance : (u - strongChance) / (1 - strongChance);
  const fish = pickWeighted(availableFish(range.max, kind, list, range.min), v, range.min);
  const minigame = effectiveMinigame(fish, config.minigame);
  if (!minigame || seedValue === null) return { waitMs, kind, fish, minigame: null, zone: null, minigameSeed: null, raw };
  const zone = zoneAt(seedValue, { zoneWidth: minigame.zoneWidth, zoneMargin: config.minigame.zoneMargin });
  return { waitMs, kind, fish, minigame, zone, minigameSeed: Math.floor(seedValue * 4294967296), raw };
}

/**
 * ヌシ戦の 1 回ぶん。乱数は、シードと「何回目の挑戦か」から作る(魚の系統は使わない:D-115)。
 * @param {any} boss @param {any} config @param {number} seed @param {number} attempt
 */
export function makeBossCast(boss, config, seed, attempt) {
  const minigameSeed = bossSeed(seed, attempt);
  const minigame = /** @type {any} */ (effectiveMinigame(boss, config.minigame));
  const zone = zoneAt(createRng(minigameSeed ^ 0x2545f491)(), {
    zoneWidth: minigame.zoneWidth,
    zoneMargin: config.minigame.zoneMargin,
  });
  return { waitMs: 0, kind: FISH_KINDS.BOSS, fish: boss, minigame, zone, minigameSeed };
}

/** ヌシ戦の乱数の種。 @param {number} seed @param {number} attempt */
export function bossSeed(seed, attempt) {
  return critSeed((seed ^ Math.imul(attempt + 1, 0x9e3779b9)) >>> 0);
}

/**
 * 餌で出る強い魚の 1 回ぶん(D-264)。魚の系統は使わず、シードと何投目かから種を作る(ヌシ戦と同じ作り方)。
 * 待ち時間は、魚の系統から引いた元の投のものをそのまま使う。
 * @param {any} fish @param {any} config @param {number} seed @param {number} castCount @param {number} waitMs
 */
export function makeBaitCast(fish, config, seed, castCount, waitMs) {
  const minigameSeed = bossSeed((seed ^ BAIT_SEED_SALT) >>> 0, castCount);
  const minigame = /** @type {any} */ (effectiveMinigame(fish, config.minigame));
  const zone = zoneAt(createRng(minigameSeed ^ 0x2545f491)(), {
    zoneWidth: minigame.zoneWidth,
    zoneMargin: config.minigame.zoneMargin,
  });
  return { waitMs, kind: FISH_KINDS.STRONG, fish, minigame, zone, minigameSeed, bait: true };
}

/** 餌の投の種を、ヌシ戦の種とずらすための数。 */
const BAIT_SEED_SALT = 0x3c6ef372;
