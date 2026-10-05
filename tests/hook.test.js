// 合わせのテスト(受け入れ条件 1・3)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { FISH_LIST } from "../src/core/fish.js";
import { createGame, FISH_KINDS, hookWindowMs, OUTCOMES, PHASES, REASONS, tap, update } from "../src/core/fishing.js";

/** 竿の段階 rodStage で、魚 fishId が掛かった瞬間まで進める(ほかの魚は逃がす)。 */
function untilBite(fishId, rodStage = 5, seed = 1) {
  const game = createGame(seed, { progress: { coins: 0, material: 0, rodStage, seen: [] } });
  for (let i = 0; i < 2000000; i++) {
    if (game.phase === PHASES.WAITING && game.cast.fish.id === fishId) {
      // 待ちの残りぴったりだけ進めると、掛かった瞬間(受付の経過 0 ミリ秒)で止まる。
      update(game, game.cast.waitMs - game.phaseMs);
      assert.equal(game.phase, PHASES.BITE);
      assert.equal(game.phaseMs, 0);
      return game;
    }
    update(game, 1);
    if (game.phase === PHASES.RESTING) tap(game);
  }
  throw new Error(`${fishId} が掛からない`);
}

test("受付時間は 普通の魚 > 強い魚 で、どちらも 1.0 秒以上", () => {
  const { normalMs, strongMs } = DEFAULT_CONFIG.hook;
  assert.ok(normalMs > strongMs);
  assert.ok(strongMs >= 1000);
  assert.ok(normalMs >= 1000);
});

for (const kind of [FISH_KINDS.NORMAL, FISH_KINDS.STRONG]) {
  const fishId = kind === FISH_KINDS.NORMAL ? "aji" : "kurodai";

  test(`合わせの境界(${kind}):受付時間の 1 ミリ秒前のタップは成功`, () => {
    const game = untilBite(fishId, 1);
    const windowMs = hookWindowMs(game);
    update(game, windowMs - 1);
    assert.equal(game.phase, PHASES.BITE);
    assert.deepEqual(tap(game), { action: "hook" });
    assert.equal(game.phase, kind === FISH_KINDS.NORMAL ? PHASES.REELING : PHASES.MINIGAME);
  });

  test(`合わせの境界(${kind}):受付時間ちょうどを過ぎたら逃げる`, () => {
    const game = untilBite(fishId, 1);
    update(game, hookWindowMs(game));
    assert.equal(game.phase, PHASES.RESULT);
    assert.equal(game.lastResult.outcome, OUTCOMES.ESCAPED);
    assert.equal(game.lastResult.reason, REASONS.NO_HOOK);
    assert.equal(tap(game), null, "逃げたあとのタップは何もしない");
    assert.deepEqual(game.progress, { coins: 0, material: 0, rodStage: 1, seen: [] });
  });
}

test("普通の魚は、どの段階でも合わせの成功だけで釣り上げる", () => {
  for (const fish of FISH_LIST.filter((f) => f.kind === FISH_KINDS.NORMAL)) {
    const game = untilBite(fish.id);
    tap(game);
    update(game, DEFAULT_CONFIG.reelMs);
    assert.equal(game.phase, PHASES.RESULT, fish.name);
    assert.equal(game.lastResult.outcome, OUTCOMES.CAUGHT, fish.name);
    assert.equal(game.lastResult.reason, REASONS.HOOKED);
    assert.deepEqual(game.lastResult.reward, fish.reward);
  }
});
