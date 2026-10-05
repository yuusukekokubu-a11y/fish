// 釣りの 1 サイクル:投げる → 待つ → 掛かる → (普通の魚は自動で巻く/強い魚はミニゲーム)→ 結果。
// 画面に関係しない計算だけを置く(D-028)。時間は update に渡したぶんだけ進む。

import { DEFAULT_CONFIG } from "./config.js";
import { availableFish, effectiveMinigame, FISH_KINDS, pickWeighted } from "./fish.js";
import { drawZone, isHit, markerPosition } from "./minigame.js";
import { createRng, normalizeSeed } from "./rng.js";
import { canUpgrade, upgradeCost, upgradeRod } from "./rod.js";
import { initialProgress } from "./save.js";

export { FISH_KINDS };

export const PHASES = Object.freeze({
  CASTING: "casting", // 投げる
  WAITING: "waiting", // 待つ
  BITE: "bite", // 掛かった
  REELING: "reeling", // 普通の魚を自動で巻く
  MINIGAME: "minigame", // 強い魚とのミニゲーム
  RESULT: "result", // 結果を見せる
});

export const OUTCOMES = Object.freeze({ CAUGHT: "caught", ESCAPED: "escaped" });

/**
 * 竿の段階 rodStage で、1 回の投げに使う乱数をまとめて引く(D-046)。
 * 引く順番は固定(待ち時間 → 魚 → 当たり範囲)。魚は 1 回の乱数で「区分」と「種類」をまとめて決める。
 * こうすると、段階 1 の乱数の並びは Issue #4 のときと同じになる。
 */
export function drawCast(rng, config = DEFAULT_CONFIG, rodStage = 1) {
  const waitMs = config.waitMinMs + rng() * (config.waitMaxMs - config.waitMinMs);
  const u = rng();
  const strong = u < config.strongChance;
  const kind = strong ? FISH_KINDS.STRONG : FISH_KINDS.NORMAL;
  // 区分の中での位置を 0〜1 に引きのばし、その値で種類を選ぶ。
  const v = strong ? u / config.strongChance : (u - config.strongChance) / (1 - config.strongChance);
  const fish = pickWeighted(availableFish(rodStage, kind), v);
  const minigame = effectiveMinigame(fish, config.minigame);
  const zone = minigame ? drawZone(rng, { zoneWidth: minigame.zoneWidth, zoneMargin: config.minigame.zoneMargin }) : null;
  return { waitMs, kind, fish, minigame, zone };
}

/**
 * 新しいゲームの状態を作る。progress は保存から読んだ進み具合(なければ初めから)。
 * progress は複製して使う(呼んだ側のものは変えない)。
 */
export function createGame(seed, { config = DEFAULT_CONFIG, progress = initialProgress() } = {}) {
  const rng = createRng(seed);
  const own = { ...progress, seen: [...progress.seen] };
  return {
    seed: normalizeSeed(seed),
    config,
    rng,
    progress: own,
    phase: PHASES.CASTING,
    phaseMs: 0,
    cast: drawCast(rng, config, own.rodStage),
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

const NO_REWARD = Object.freeze({ coins: 0, material: 0 });

function finish(game, outcome, extra = {}) {
  const { fish, kind } = game.cast;
  const caught = outcome === OUTCOMES.CAUGHT;
  const reward = caught ? fish.reward : NO_REWARD;
  const firstCatch = caught && !game.progress.seen.includes(fish.id);
  const result = { fishId: fish.id, kind, outcome, ...extra, reward, firstCatch };
  game.results.push(result);
  game.lastResult = result;
  if (caught) {
    game.counts[kind] += 1;
    game.progress.coins += reward.coins;
    game.progress.material += reward.material;
    if (firstCatch) game.progress.seen.push(fish.id);
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
      // 次の魚は、この時点の竿の段階で決まる。
      game.cast = drawCast(game.rng, game.config, game.progress.rodStage);
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
  return markerPosition(game.phaseMs, game.cast.minigame.sweepMs);
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

/** 竿の強化に必要な素材の数(上限なら null)。 */
export function rodUpgradeCost(game) {
  return upgradeCost(game.progress.rodStage, game.config.rod);
}

/** 竿を強化できるか。 */
export function canUpgradeRod(game) {
  return canUpgrade(game.progress, game.config.rod);
}

/** 竿を強化する。新しい魚は、次に投げるときから一覧に加わる。 */
export function upgradeGameRod(game) {
  return upgradeRod(game.progress, game.config.rod);
}
