// 釣りの 1 サイクルのテスト:待ち時間・強い魚の割合・場面の進み方(受け入れ条件 2・6)。

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
  REASONS,
  tap,
  update,
} from "../src/core/fishing.js";
import { createRng } from "../src/core/rng.js";
import { hookGood, hookJust, makeAimCenter, makePlayer, mean } from "./helpers.js";

const play = makePlayer({ update, tap, PHASES });
const aimCenter = makeAimCenter(currentMarker);

/** 状態を進めながら、掛かるまでの待ち時間を n 回ぶん集める(合わせはしない)。 */
function collectWaits(seed, n) {
  const game = createGame(seed);
  const waits = [];
  while (waits.length < n) {
    if (game.phase === PHASES.WAITING && game.phaseMs === 0) waits.push(game.cast.waitMs);
    update(game, game.phase === PHASES.WAITING ? game.cast.waitMs : 1);
    if (game.phase === PHASES.RESTING) tap(game);
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

test("操作がなければ、釣果(ウロコイン・素材)は増えない", () => {
  for (const seed of [1, 4, 777]) {
    for (const rodStage of [1, 3, 5]) {
      const progress = { coins: 3, material: 2, rodStage, seen: [] };
      const game = play(createGame(seed, { progress }), 600000);
      assert.equal(game.progress.coins, 3);
      assert.equal(game.progress.material, 2);
      assert.ok(game.results.length > 0);
      assert.ok(game.results.every((r) => r.outcome === OUTCOMES.ESCAPED && r.reason === REASONS.LATE));
    }
  }
});

test("合わせを続けて 5 回逃すと休み、操作がなければそのまま止まる", () => {
  const game = play(createGame(4), 600000);
  assert.equal(game.results.length, DEFAULT_CONFIG.missStreakLimit);
  assert.equal(game.phase, PHASES.RESTING);
  update(game, 3600000);
  assert.equal(game.phase, PHASES.RESTING, "休みは時間では終わらない");
});

test("休みはタップで再開し、魚の並びは休まなかったときと同じ", () => {
  const rested = createGame(4);
  const fishOrder = [rested.cast.fish.id];
  let lastCast = rested.castCount;
  let rests = 0;
  while (fishOrder.length < 12) {
    update(rested, 7);
    if (rested.phase === PHASES.RESTING) {
      rests += 1;
      update(rested, 60000);
      assert.deepEqual(tap(rested), { action: "resume" });
      assert.equal(rested.phase, PHASES.CASTING);
    }
    if (rested.castCount !== lastCast) {
      fishOrder.push(rested.cast.fish.id);
      lastCast = rested.castCount;
    }
  }
  assert.ok(rests >= 2);
  const rng = createRng(4);
  const expected = Array.from({ length: 12 }, () => drawCast(rng).fish.id);
  assert.deepEqual(fishOrder, expected);
});

test("合わせに成功すると、逃した回数の数え直しになる", () => {
  const game = createGame(4);
  for (let i = 0; i < 4; i++) {
    while (game.phase !== PHASES.BITE) update(game, 5);
    update(game, 5000);
  }
  assert.equal(game.missStreak, 4);
  while (!(game.phase === PHASES.BITE && hookGood(game))) update(game, 5);
  assert.equal(tap(game).grade, "good");
  const before = game.results.length;
  while (game.results.length === before) update(game, 5);
  assert.equal(game.missStreak, 0);
});

test("掛かったらすぐ合わせ、真ん中を狙えば、普通も強いも釣れる", () => {
  const game = play(createGame(4), 300000, { hook: hookJust, fight: aimCenter });
  assert.ok(game.counts.normal > 0);
  assert.ok(game.counts.strong > 0);
  assert.equal(game.counts.escaped, 0);
});

test("合わせだけしてミニゲームで何もしないと、強い魚は時間切れで逃げる", () => {
  const game = play(createGame(4), 300000, { hook: hookJust });
  assert.ok(game.counts.normal > 0);
  assert.equal(game.counts.strong, 0);
  for (const r of game.results.filter((x) => x.kind === FISH_KINDS.STRONG)) {
    assert.equal(r.outcome, OUTCOMES.ESCAPED);
    assert.equal(r.reason, REASONS.TIMEOUT);
  }
});

test("ちがうシードなら釣果の並びも変わる", () => {
  const a = play(createGame(1), 300000, { hook: hookJust, fight: aimCenter });
  const b = play(createGame(2), 300000, { hook: hookJust, fight: aimCenter });
  assert.notDeepEqual(a.results, b.results);
});

test("掛かっていない場面のタップは何もしない", () => {
  const game = createGame(4);
  for (const phase of [PHASES.CASTING, PHASES.WAITING]) {
    while (game.phase !== phase) update(game, 5);
    assert.equal(tap(game), null);
    assert.equal(game.phase, phase);
  }
  assert.deepEqual(game.results, []);
});

test("場面は 投げる → 待つ → 掛かる → 巻く/ミニゲーム → 結果 → 投げる の順に進む", () => {
  const game = createGame(4);
  const seen = [game.phase];
  while (game.castCount < 30) {
    update(game, 5);
    if (seen.at(-1) !== game.phase) seen.push(game.phase);
    if (game.phase === PHASES.BITE && hookGood(game)) tap(game);
    if (seen.at(-1) !== game.phase) seen.push(game.phase);
  }
  const next = {
    [PHASES.CASTING]: [PHASES.WAITING],
    [PHASES.WAITING]: [PHASES.BITE],
    [PHASES.BITE]: [PHASES.REELING, PHASES.MINIGAME, PHASES.RESULT],
    [PHASES.REELING]: [PHASES.RESULT],
    [PHASES.MINIGAME]: [PHASES.RESULT],
    [PHASES.RESULT]: [PHASES.CASTING, PHASES.RESTING],
  };
  for (let i = 1; i < seen.length; i++) {
    assert.ok(next[seen[i - 1]].includes(seen[i]), `${seen[i - 1]} → ${seen[i]}`);
  }
  assert.ok(seen.includes(PHASES.MINIGAME) && seen.includes(PHASES.REELING));
});
