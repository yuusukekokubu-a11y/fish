// 確率 0% のとき、Issue #8 のときと結果が完全に一致するかのテスト(受け入れ条件 1)。
// 記録 tests/fixtures/issue8_plays.json は、Issue #8 の時点のコードで、同じ遊び方をして作った。

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame, currentMarker, PHASES, tap, update } from "../src/core/fishing.js";
import { createRng } from "../src/core/rng.js";
import { NO_CRIT } from "./fight_helpers.js";
import { readText } from "./helpers.js";

const FIXTURE = JSON.parse(readText("tests/fixtures/issue8_plays.json"));

/** 記録を作ったときと同じ遊び方(16 ミリ秒ずつ 5 分)。 */
function play(seed, stage, way, combat) {
  const g = createGame(seed, { progress: { coins: 0, material: 0, rodStage: stage, seen: [] }, combat });
  const r = createRng(999);
  const rows = [];
  let n = 0;
  for (let t = 0; t < 300000; t += 16) {
    update(g, 16);
    if (g.phase === PHASES.BITE) tap(g);
    else if (g.phase === PHASES.MINIGAME) {
      if (way === "aim") {
        const z = g.fight.zone;
        if (Math.abs(currentMarker(g) - (z.start + z.end) / 2) < 0.02) tap(g);
      } else if (r() < 0.08) tap(g);
    } else if (g.phase === PHASES.RESTING) tap(g);
    while (n < g.results.length) {
      const x = g.results[n++];
      rows.push([t, x.fishId, x.outcome, x.reason, x.hits ?? 0, x.misses ?? 0]);
    }
  }
  return { progress: g.progress, results: rows };
}

test("確率 0%:同じシードと同じ操作で、合わせ・体力が尽きる時刻・釣果の並びが Issue #8 と完全に一致", () => {
  for (const [key, expected] of Object.entries(FIXTURE.plays)) {
    const [stage, seed, way] = key.split("-");
    const actual = play(Number(seed), Number(stage), way, NO_CRIT);
    assert.deepEqual(actual, expected, key);
  }
});

test("確率 10%(基本の表)でも、同じシードと同じ操作なら毎回同じ結果になる", () => {
  for (const key of ["1-7-aim", "5-2024-rand"]) {
    const [stage, seed, way] = key.split("-");
    const a = play(Number(seed), Number(stage), way);
    const b = play(Number(seed), Number(stage), way);
    assert.deepEqual(a, b, key);
  }
  // 狙って当てる遊び方では、クリティカルで当たりの回数が減るので、記録とは変わる。
  const aimed = play(7, 1, "aim");
  assert.notDeepEqual(aimed.results, FIXTURE.plays["1-7-aim"].results);
  assert.ok(aimed.results.some((r) => r[3] === "hp-zero" && r[4] === 1), "クリティカル 1 回で釣れたクロダイがある");
});
