// 釣りの 1 サイクル:投げる → 待つ → 掛かる(合わせのタップ)→
// (普通の魚は巻き上げ/強い魚は体力制のミニゲーム)→ 結果。
// 画面に関係しない計算だけを置く(D-028)。時間は update に渡したぶんだけ進む。
// プレイヤーの操作がなければ、釣果は増えない(D-053)。

import { DEFAULT_CONFIG } from "./config.js";
import { availableFish, effectiveMinigame, FISH_KINDS, pickWeighted } from "./fish.js";
import { drawZone, isHit, markerPosition, zoneAt } from "./minigame.js";
import { createRng, normalizeSeed } from "./rng.js";
import { canUpgrade, upgradeCost, upgradeRod } from "./rod.js";
import { initialProgress } from "./save.js";

export { FISH_KINDS };

export const PHASES = Object.freeze({
  CASTING: "casting", // 投げる
  WAITING: "waiting", // 待つ
  BITE: "bite", // 掛かった:合わせのタップを待つ
  REELING: "reeling", // 合わせたあと、普通の魚を巻き上げる
  MINIGAME: "minigame", // 強い魚との体力制のミニゲーム
  RESULT: "result", // 結果を見せる
  RESTING: "resting", // 合わせを続けて逃したので休む(タップで再開)
});

export const OUTCOMES = Object.freeze({ CAUGHT: "caught", ESCAPED: "escaped" });

// 結果の理由。
export const REASONS = Object.freeze({
  NO_HOOK: "no-hook", // 合わせのタップがなかった
  HOOKED: "hooked", // 普通の魚を合わせで釣り上げた
  HP_ZERO: "hp-zero", // 強い魚の体力をゼロにした
  TIMEOUT: "timeout", // 強い魚との制限時間が切れた
});

/**
 * 「魚の系統」の乱数で、竿の段階 rodStage の 1 回の投げを決める(D-046・D-064)。
 * 引く順番は固定:待ち時間 → 魚 →(強い魚なら)ミニゲームの種。引く回数は Issue #6 と同じ。
 * ミニゲームの種から、最初の当たり範囲と「ミニゲームの系統」の乱数を作る。
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
  if (!minigame) return { waitMs, kind, fish, minigame: null, zone: null, minigameSeed: null };
  const seedValue = rng();
  const zone = zoneAt(seedValue, { zoneWidth: minigame.zoneWidth, zoneMargin: config.minigame.zoneMargin });
  return { waitMs, kind, fish, minigame, zone, minigameSeed: Math.floor(seedValue * 4294967296) };
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
    fight: null,
    missStreak: 0,
    counts: { normal: 0, strong: 0, escaped: 0 },
    results: [],
    lastResult: null,
  };
}

/** 今の魚の、合わせの受付時間(ミリ秒)。 */
export function hookWindowMs(game) {
  const { hook } = game.config;
  return game.cast.kind === FISH_KINDS.STRONG ? hook.strongMs : hook.normalMs;
}

/** 今の場面の長さ(ミリ秒)。休みは終わりがない(タップで再開)。 */
export function phaseDuration(game) {
  const c = game.config;
  switch (game.phase) {
    case PHASES.CASTING:
      return c.castMs;
    case PHASES.WAITING:
      return game.cast.waitMs;
    case PHASES.BITE:
      return hookWindowMs(game);
    case PHASES.REELING:
      return c.reelMs;
    case PHASES.MINIGAME:
      return game.cast.minigame.timeLimitMs;
    case PHASES.RESULT:
      return c.resultMs;
    case PHASES.RESTING:
      return Infinity;
    default:
      throw new Error(`知らない場面:${game.phase}`);
  }
}

function enter(game, phase) {
  game.phase = phase;
  game.phaseMs = 0;
}

function nextCast(game) {
  game.cast = drawCast(game.rng, game.config, game.progress.rodStage);
  game.castCount += 1;
  game.fight = null;
  enter(game, PHASES.CASTING);
}

const NO_REWARD = Object.freeze({ coins: 0, material: 0 });

function finish(game, outcome, reason) {
  const { fish, kind } = game.cast;
  const caught = outcome === OUTCOMES.CAUGHT;
  const reward = caught ? fish.reward : NO_REWARD;
  const firstCatch = caught && !game.progress.seen.includes(fish.id);
  const result = { fishId: fish.id, kind, outcome, reason, reward, firstCatch };
  if (game.fight) {
    result.hits = game.fight.hits;
    result.misses = game.fight.misses;
  }
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
  game.missStreak = reason === REASONS.NO_HOOK ? game.missStreak + 1 : 0;
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
      return finish(game, OUTCOMES.ESCAPED, REASONS.NO_HOOK);
    case PHASES.REELING:
      return finish(game, OUTCOMES.CAUGHT, REASONS.HOOKED);
    case PHASES.MINIGAME:
      return finish(game, OUTCOMES.ESCAPED, REASONS.TIMEOUT);
    case PHASES.RESULT:
      // 合わせを続けて逃したら休む。次の魚は、再開のときに引く(並びは変わらない)。
      if (game.missStreak >= game.config.missStreakLimit) return enter(game, PHASES.RESTING);
      return nextCast(game);
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

function startFight(game) {
  const { minigame, zone, minigameSeed } = game.cast;
  game.fight = {
    hp: minigame.hp,
    maxHp: minigame.hp,
    zone,
    // 「ミニゲームの系統」の乱数。魚の系統とは別なので、ここで何回引いても魚の並びは変わらない(D-064)。
    rng: createRng(minigameSeed),
    hits: 0,
    misses: 0,
  };
  enter(game, PHASES.MINIGAME);
}

function fightTap(game) {
  const { fight, config } = game;
  const position = currentMarker(game);
  if (isHit(position, fight.zone)) {
    fight.hp = Math.max(0, fight.hp - config.minigame.damagePerHit);
    fight.hits += 1;
    if (fight.hp === 0) {
      finish(game, OUTCOMES.CAUGHT, REASONS.HP_ZERO);
      return { action: "hit", hp: 0, position, caught: true };
    }
    // 当たったら、当たり範囲の位置が変わる(D-063)。
    fight.zone = drawZone(fight.rng, {
      zoneWidth: game.cast.minigame.zoneWidth,
      zoneMargin: config.minigame.zoneMargin,
    });
    return { action: "hit", hp: fight.hp, position, caught: false };
  }
  fight.hp = Math.min(fight.maxHp, fight.hp + config.minigame.missHeal);
  fight.misses += 1;
  return { action: "miss", hp: fight.hp, position };
}

/**
 * タップしたときの処理。場面ごとに意味がちがう。
 * - 掛かった:合わせ。普通の魚は巻き上げへ、強い魚は体力制のミニゲームへ。
 * - ミニゲーム:印が当たり範囲の中なら体力が減り、外なら回復する。
 * - 休み:再開して、次の魚を投げる。
 * それ以外の場面では何もせず null を返す。
 */
export function tap(game) {
  switch (game.phase) {
    case PHASES.BITE:
      if (game.cast.kind === FISH_KINDS.STRONG) startFight(game);
      else enter(game, PHASES.REELING);
      return { action: "hook" };
    case PHASES.MINIGAME:
      return fightTap(game);
    case PHASES.RESTING:
      game.missStreak = 0;
      nextCast(game);
      return { action: "resume" };
    default:
      return null;
  }
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
