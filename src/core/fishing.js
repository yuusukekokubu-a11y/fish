// 釣りの 1 サイクル:投げる → 待つ → 掛かる → (普通の魚は自動で巻く/強い魚はミニゲーム)→ 結果。
// 画面に関係しない計算だけを置く(D-028)。時間は update に渡したぶんだけ進む。

import { DEFAULT_CONFIG } from "./config.js";
import { drawZone, isHit, markerPosition } from "./minigame.js";
import { createRng, normalizeSeed } from "./rng.js";

export const PHASES = Object.freeze({
  CASTING: "casting", // 投げる
  WAITING: "waiting", // 待つ
  BITE: "bite", // 掛かった
  REELING: "reeling", // 普通の魚を自動で巻く
  MINIGAME: "minigame", // 強い魚とのミニゲーム
  RESULT: "result", // 結果を見せる
});

export const FISH_KINDS = Object.freeze({ NORMAL: "normal", STRONG: "strong" });
export const OUTCOMES = Object.freeze({ CAUGHT: "caught", ESCAPED: "escaped" });

/**
 * 1 回の投げで使う乱数をまとめて引く。引く順番は固定(待ち時間 → 魚の種類 → 当たり範囲)。
 * 引く順番を変えると、同じシードの結果が変わるので注意。
 */
export function drawCast(rng, config = DEFAULT_CONFIG) {
  const waitMs = config.waitMinMs + rng() * (config.waitMaxMs - config.waitMinMs);
  const kind = rng() < config.strongChance ? FISH_KINDS.STRONG : FISH_KINDS.NORMAL;
  const zone = kind === FISH_KINDS.STRONG ? drawZone(rng, config.minigame) : null;
  return { waitMs, kind, zone };
}

/** 新しいゲームの状態を作る。 */
export function createGame(seed, config = DEFAULT_CONFIG) {
  const rng = createRng(seed);
  return {
    seed: normalizeSeed(seed),
    config,
    rng,
    phase: PHASES.CASTING,
    phaseMs: 0,
    cast: drawCast(rng, config),
    castCount: 1,
    counts: { normal: 0, strong: 0, escaped: 0 },
    results: [],
    lastResult: null,
  };
}

/** 今の場面の長さ(ミリ秒)。 */
export function phaseDuration(game) {
  const c = game.config;
  switch (game.phase) {
    case PHASES.CASTING:
      return c.castMs;
    case PHASES.WAITING:
      return game.cast.waitMs;
    case PHASES.BITE:
      return c.biteMs;
    case PHASES.REELING:
      return c.reelMs;
    case PHASES.MINIGAME:
      return c.minigame.timeoutMs;
    case PHASES.RESULT:
      return c.resultMs;
    default:
      throw new Error(`知らない場面:${game.phase}`);
  }
}

function enter(game, phase) {
  game.phase = phase;
  game.phaseMs = 0;
}

function finish(game, outcome, extra = {}) {
  const result = { kind: game.cast.kind, outcome, ...extra };
  game.results.push(result);
  game.lastResult = result;
  if (outcome === OUTCOMES.CAUGHT) {
    game.counts[game.cast.kind] += 1;
  } else {
    game.counts.escaped += 1;
  }
  enter(game, PHASES.RESULT);
}

/** 場面が時間切れになったときに、次の場面へ進める。 */
function advance(game) {
  switch (game.phase) {
    case PHASES.CASTING:
      return enter(game, PHASES.WAITING);
    case PHASES.WAITING:
      return enter(game, PHASES.BITE);
    case PHASES.BITE:
      return enter(game, game.cast.kind === FISH_KINDS.STRONG ? PHASES.MINIGAME : PHASES.REELING);
    case PHASES.REELING:
      return finish(game, OUTCOMES.CAUGHT);
    case PHASES.MINIGAME:
      return finish(game, OUTCOMES.ESCAPED, { reason: "timeout" });
    case PHASES.RESULT:
      game.cast = drawCast(game.rng, game.config);
      game.castCount += 1;
      return enter(game, PHASES.CASTING);
    default:
      throw new Error(`知らない場面:${game.phase}`);
  }
}

/** 時間を dtMs だけ進める。場面をまたいでも、余った時間は次の場面に持ち越す。 */
export function update(game, dtMs) {
  let rest = Math.max(0, dtMs);
  while (rest > 0) {
    const remaining = phaseDuration(game) - game.phaseMs;
    if (rest < remaining) {
      game.phaseMs += rest;
      return game;
    }
    rest -= remaining;
    advance(game);
  }
  return game;
}

/** ミニゲーム中の印の位置(0〜1)。ミニゲーム中でなければ null。 */
export function currentMarker(game) {
  if (game.phase !== PHASES.MINIGAME) return null;
  return markerPosition(game.phaseMs, game.config.minigame.sweepMs);
}

/**
 * タップしたときの処理。ミニゲーム中なら、印の位置で成功か失敗かを決める。
 * ミニゲーム中でなければ何もせず null を返す。
 */
export function tap(game) {
  const position = currentMarker(game);
  if (position === null) return null;
  const hit = isHit(position, game.cast.zone);
  finish(game, hit ? OUTCOMES.CAUGHT : OUTCOMES.ESCAPED, { reason: hit ? "hit" : "miss", position });
  return { hit, position };
}
