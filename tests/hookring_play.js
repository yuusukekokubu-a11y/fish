// 縮む輪の合わせで、決まった遊び方をする(記録 hookring_plays.json を作るときと、確かめるときで共通)。
// - aim:輪がジャスト帯の真ん中で合わせ、印が当たり範囲の真ん中付近(±0.02)でタップ。
// - rand:輪が成功帯に入った直後に合わせ、ミニゲームでは 16 ミリ秒ごとに確率 0.08 ででたらめにタップ(別の乱数、シード 999)。
// 休みはすぐ再開。16 ミリ秒ずつ 5 分。戦闘の数値は基本の表(クリティカル 10%)。

import { createGame, currentMarker, PHASES, tap, update } from "../src/core/fishing.js";
import { createRng } from "../src/core/rng.js";
import { hookGood, hookJust, progressAt } from "./helpers.js";

export function playRecorded(seed, stage, way) {
  const g = createGame(seed, { progress: progressAt(stage) });
  const r = createRng(999);
  const rows = [];
  let n = 0;
  for (let t = 0; t < 300000; t += 16) {
    update(g, 16);
    if (g.phase === PHASES.BITE) {
      if (way === "aim" ? hookJust(g) : hookGood(g)) tap(g);
    } else if (g.phase === PHASES.MINIGAME) {
      if (way === "aim") {
        const z = g.fight.zone;
        if (Math.abs(currentMarker(g) - (z.start + z.end) / 2) < 0.02) tap(g);
      } else if (r() < 0.08) tap(g);
    } else if (g.phase === PHASES.RESTING) tap(g);
    while (n < g.results.length) {
      const x = g.results[n++];
      rows.push([t, x.fishId, x.outcome, x.reason, x.hook ?? "", x.hits ?? 0, x.misses ?? 0, x.crits ?? 0]);
    }
  }
  return { progress: g.progress, results: rows };
}
