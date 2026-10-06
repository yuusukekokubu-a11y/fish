// 戦闘のテストで共通に使う道具(テストではない)。

import { areaOfStage } from "../src/core/areas.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { createGame, currentMarker, PHASES, tap, update } from "../src/core/fishing.js";
import { hookGood, hookJust, progressAt } from "./helpers.js";

export const NO_CRIT = Object.freeze({ ...DEFAULT_CONFIG.combat, critChance: 0 });

/** 魚 fishId のいる釣り場の、最後の段階(その釣り場の全部の魚が出る竿の段階)。 */
export function areaEndFor(fishId) {
  const stage = DEFAULT_CONTENT.byId.get(fishId)?.stage ?? 1;
  const area = areaOfStage(DEFAULT_CONTENT, stage);
  return area.firstStage + area.stages - 1;
}

/** 魚 fishId と合わせて、ミニゲームが始まった瞬間まで進める。 */
export function untilFight(fishId, { seed = 1, combat = NO_CRIT, critRules, grade = "good" } = {}) {
  const game = createGame(seed, { progress: progressAt(areaEndFor(fishId)), combat, critRules });
  for (let i = 0; i < 2000000; i++) {
    update(game, 5);
    // 成功帯に入った直後(ジャストでない)で合わせる。ジャストの上乗せなしで戦闘の数値を確かめるため。
    if (game.phase === PHASES.BITE && game.cast.fish.id === fishId && hookGood(game)) {
      const r = tap(game);
      if (grade === "just") throw new Error("ジャストは untilJustFight を使う");
      if (r.grade !== "good") throw new Error(`合わせが ${r.grade}`);
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

/** 魚 fishId とジャストで合わせて、ミニゲームが始まった瞬間まで進める。 */
export function untilJustFight(fishId, { seed = 1, combat = NO_CRIT } = {}) {
  const game = createGame(seed, { progress: progressAt(5), combat });
  for (let i = 0; i < 2000000; i++) {
    update(game, 5);
    if (game.phase === PHASES.BITE && game.cast.fish.id === fishId && hookJust(game)) {
      const r = tap(game);
      if (r.grade !== "just") throw new Error(`合わせが ${r.grade}`);
      return game;
    }
    if (game.phase === PHASES.RESTING) tap(game);
  }
  throw new Error(`${fishId} が掛からない`);
}
