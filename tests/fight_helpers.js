// 戦闘のテストで共通に使う道具(テストではない)。

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { createGame, currentMarker, PHASES, tap, update } from "../src/core/fishing.js";

export const NO_CRIT = Object.freeze({ ...DEFAULT_CONFIG.combat, critChance: 0 });

/** 魚 fishId と合わせて、ミニゲームが始まった瞬間まで進める。 */
export function untilFight(fishId, { seed = 1, combat = NO_CRIT, critRules } = {}) {
  const game = createGame(seed, { progress: { coins: 0, material: 0, rodStage: 5, seen: [] }, combat, critRules });
  for (let i = 0; i < 2000000; i++) {
    update(game, 5);
    if (game.phase === PHASES.BITE && game.cast.fish.id === fishId) {
      tap(game);
      return game;
    }
    if (game.phase === PHASES.RESTING) tap(game);
  }
  throw new Error(`${fishId} が掛からない`);
}

/** 印が当たり範囲の真ん中に来るまで、少しずつ時間を進める。 */
export function waitForCenter(game) {
  for (let i = 0; i < 10000 && game.phase === PHASES.MINIGAME; i++) {
    const z = game.fight.zone;
    if (Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.01) return true;
    update(game, 1);
  }
  return false;
}

/** 印が当たり範囲の外にあるところまで進める。 */
export function waitForOutside(game) {
  for (let i = 0; i < 10000 && game.phase === PHASES.MINIGAME; i++) {
    const z = game.fight.zone;
    const p = currentMarker(game);
    if (p < z.start - 0.02 || p > z.end + 0.02) return true;
    update(game, 1);
  }
  return false;
}
