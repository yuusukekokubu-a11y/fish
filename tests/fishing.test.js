// 釣りの 1 サイクルのテスト(受け入れ条件 2・3・5)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import {
  createGame,
  currentMarker,
  drawCast,
  FISH_KINDS,
  OUTCOMES,
  PHASES,
  tap,
  update,
} from "../src/core/fishing.js";
import { createRng } from "../src/core/rng.js";
import { makeAimCenter, makePlayer, mean } from "./helpers.js";

const play = makePlayer({ update, tap, PHASES });
const aimCenter = makeAimCenter(currentMarker);

/** 状態を進めながら、掛かるまでの待ち時間を n 回ぶん集める。 */
function collectWaits(seed, n) {
  const game = createGame(seed);
  const waits = [];
  while (waits.length < n) {
    if (game.phase === PHASES.WAITING && game.phaseMs === 0) waits.push(game.cast.waitMs);
    update(game, game.phase === PHASES.WAITING ? game.cast.waitMs : 1);
    if (game.phase === PHASES.MINIGAME) tap(game);
  }
  return waits;
}

test("普通の魚:掛かるまでの待ち時間の平均は 3〜6 秒(シード固定)", () => {
  for (const seed of [1, 2, 3, 12345]) {
    const avg = mean(collectWaits(seed, 200));
    assert.ok(avg >= 3000 && avg <= 6000, `seed ${seed}:平均 ${avg} ミリ秒`);
  }
});

test("待ち時間は決めた幅の中に収まる", () => {
  const rng = createRng(9);
  for (let i = 0; i < 1000; i++) {
    const { waitMs } = drawCast(rng);
    assert.ok(waitMs >= DEFAULT_CONFIG.waitMinMs && waitMs < DEFAULT_CONFIG.waitMaxMs);
  }
});

test("強い魚:100 回の試行で出現は 10〜30 回(シード固定)", () => {
  for (const seed of [1, 2, 3, 12345]) {
    const rng = createRng(seed);
    let strong = 0;
    for (let i = 0; i < 100; i++) {
      if (drawCast(rng).kind === FISH_KINDS.STRONG) strong += 1;
    }
    assert.ok(strong >= 10 && strong <= 30, `seed ${seed}:${strong} 回`);
  }
});

test("同じシードなら、釣果の並びが完全に一致する", () => {
  const a = play(createGame(777), 600000, { policy: aimCenter });
  const b = play(createGame(777), 600000, { policy: aimCenter });
  assert.ok(a.results.length > 50);
  assert.deepEqual(a.results, b.results);
  assert.deepEqual(a.counts, b.counts);
});

test("画面の更新の間隔がちがっても、放置なら釣果の並びは同じ", () => {
  const a = play(createGame(5), 300000, { stepMs: 16 });
  const b = play(createGame(5), 300000, { stepMs: 250 });
  assert.deepEqual(a.results, b.results);
});

test("ちがうシードなら釣果の並びも変わる", () => {
  const a = play(createGame(1), 300000);
  const b = play(createGame(2), 300000);
  assert.notDeepEqual(a.results, b.results);
});

test("放置すると、普通の魚は自動で釣れ、強い魚は時間切れで逃げる", () => {
  const game = play(createGame(4), 300000);
  assert.ok(game.counts.normal > 0);
  assert.equal(game.counts.strong, 0);
  for (const r of game.results) {
    if (r.kind === FISH_KINDS.NORMAL) {
      assert.equal(r.outcome, OUTCOMES.CAUGHT);
    } else {
      assert.equal(r.outcome, OUTCOMES.ESCAPED);
      assert.equal(r.reason, "timeout");
    }
  }
  assert.equal(game.counts.escaped, game.results.filter((r) => r.kind === FISH_KINDS.STRONG).length);
});

test("ミニゲームで当たり範囲を狙えば、強い魚が釣れる", () => {
  const game = play(createGame(4), 300000, { policy: aimCenter });
  assert.ok(game.counts.strong > 0);
  assert.equal(game.counts.escaped, 0);
});

/** 次の強い魚のミニゲームの始まりまで進める。 */
function untilMinigame(game) {
  while (game.phase !== PHASES.MINIGAME) update(game, 10);
  return game;
}

test("ミニゲームで当たり範囲の外をタップすると逃げられる", () => {
  const game = untilMinigame(createGame(4));
  // 始まった直後の印は 0 の位置で、当たり範囲(端から 0.08 以上はなれる)の外。
  const result = tap(game);
  assert.equal(result.hit, false);
  assert.equal(game.lastResult.outcome, OUTCOMES.ESCAPED);
  assert.equal(game.lastResult.reason, "miss");
  assert.equal(game.phase, PHASES.RESULT);
});

test("ミニゲームの外のタップは何もしない", () => {
  const game = createGame(4);
  assert.equal(tap(game), null);
  assert.equal(game.phase, PHASES.CASTING);
  assert.deepEqual(game.results, []);
});

test("場面は 投げる → 待つ → 掛かる → 巻く/ミニゲーム → 結果 → 投げる の順に進む", () => {
  const game = createGame(4);
  const seen = [game.phase];
  while (game.castCount < 30) {
    update(game, 5);
    if (seen.at(-1) !== game.phase) seen.push(game.phase);
  }
  const next = {
    [PHASES.CASTING]: [PHASES.WAITING],
    [PHASES.WAITING]: [PHASES.BITE],
    [PHASES.BITE]: [PHASES.REELING, PHASES.MINIGAME],
    [PHASES.REELING]: [PHASES.RESULT],
    [PHASES.MINIGAME]: [PHASES.RESULT],
    [PHASES.RESULT]: [PHASES.CASTING],
  };
  for (let i = 1; i < seen.length; i++) {
    assert.ok(next[seen[i - 1]].includes(seen[i]), `${seen[i - 1]} → ${seen[i]}`);
  }
  assert.ok(seen.includes(PHASES.MINIGAME) && seen.includes(PHASES.REELING));
});
