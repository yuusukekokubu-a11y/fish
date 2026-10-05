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
 * 遊ぶ関数を作る。play は時間を少しずつ進め、policy はミニゲームの毎こまで呼ばれ、true を返すとタップする。
 * actions は { atMs: 実行する時刻, run(game) } の一覧で、その時刻を過ぎたこまで 1 回だけ実行する。
 */
export function makePlayer({ update, tap, PHASES }) {
  return function play(game, totalMs, { stepMs = 16, policy = () => false, actions = [] } = {}) {
    const pending = [...actions].sort((a, b) => a.atMs - b.atMs);
    for (let t = 0; t < totalMs; t += stepMs) {
      update(game, stepMs);
      while (pending.length > 0 && pending[0].atMs <= t) pending.shift().run(game);
      if (game.phase === PHASES.MINIGAME && policy(game)) tap(game);
    }
    return game;
  };
}

/** 印が当たり範囲の真ん中付近に来たらタップする遊び方。 */
export function makeAimCenter(currentMarker) {
  return (game) => {
    const z = game.cast.zone;
    return Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.02;
  };
}
