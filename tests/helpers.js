// テストで共通に使う道具。

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function readText(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/** 平均。 */
export function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * 遊ぶ関数を作る。play は時間を stepMs ずつ進める。
 * - hook(game):掛かっている間の毎こまで呼ばれ、true を返すと合わせのタップをする。
 * - fight(game):ミニゲームの毎こまで呼ばれ、true を返すとタップする。
 * - resume:休みになったらタップして再開するか。
 * - actions:{ atMs: 実行する時刻, run(game) } の一覧。その時刻を過ぎたこまで 1 回だけ実行する。
 */
export function makePlayer({ update, tap, PHASES }) {
  return function play(
    game,
    totalMs,
    { stepMs = 16, hook = () => false, fight = () => false, resume = false, actions = [] } = {},
  ) {
    const pending = [...actions].sort((a, b) => a.atMs - b.atMs);
    for (let t = 0; t < totalMs; t += stepMs) {
      update(game, stepMs);
      while (pending.length > 0 && pending[0].atMs <= t) pending.shift().run(game);
      if (game.phase === PHASES.BITE && hook(game)) tap(game);
      else if (game.phase === PHASES.MINIGAME && fight(game)) tap(game);
      else if (game.phase === PHASES.RESTING && resume) tap(game);
    }
    return game;
  };
}

/** 掛かったらすぐ合わせる。 */
export const hookAlways = () => true;

/** 印が当たり範囲の真ん中付近に来たらタップする遊び方。 */
export function makeAimCenter(currentMarker) {
  return (game) => {
    const z = game.fight.zone;
    return Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.02;
  };
}
