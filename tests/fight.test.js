// 強い魚の体力制のミニゲームのテスト(受け入れ条件 3・4)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { FISH_KINDS, FISH_LIST } from "../src/core/fish.js";
import { createGame, currentMarker, OUTCOMES, PHASES, REASONS, tap, update } from "../src/core/fishing.js";
import { createRng } from "../src/core/rng.js";

const STRONG = FISH_LIST.filter((f) => f.kind === FISH_KINDS.STRONG).sort((a, b) => a.stage - b.stage);

/** 魚 fishId と合わせて、ミニゲームが始まった瞬間まで進める。 */
function untilFight(fishId, seed = 1) {
  const game = createGame(seed, { progress: { coins: 0, material: 0, rodStage: 5, seen: [] } });
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
function waitForCenter(game) {
  for (let i = 0; i < 10000 && game.phase === PHASES.MINIGAME; i++) {
    const z = game.fight.zone;
    if (Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.01) return true;
    update(game, 1);
  }
  return false;
}

/** 印が当たり範囲の外にあるところまで進める。 */
function waitForOutside(game) {
  for (let i = 0; i < 10000 && game.phase === PHASES.MINIGAME; i++) {
    const z = game.fight.zone;
    const p = currentMarker(game);
    if (p < z.start - 0.02 || p > z.end + 0.02) return true;
    update(game, 1);
  }
  return false;
}

test("体力は段階が上の強い魚ほど多く、2〜6 の中にある", () => {
  const hps = STRONG.map((f) => f.minigame.hp);
  assert.deepEqual(hps, [2, 3, 4, 5, 6]);
  for (let i = 1; i < STRONG.length; i++) {
    assert.ok(STRONG[i].minigame.hp > STRONG[i - 1].minigame.hp);
    assert.ok(STRONG[i].minigame.timeLimitMs >= STRONG[i - 1].minigame.timeLimitMs);
  }
});

test("どの段階の強い魚も:合わせ → 当たるたびに体力が 1 減る → ゼロで釣り上げ", () => {
  for (const fish of STRONG) {
    const game = untilFight(fish.id);
    assert.equal(game.phase, PHASES.MINIGAME, fish.name);
    assert.equal(game.fight.hp, fish.minigame.hp);
    for (let hp = fish.minigame.hp - 1; hp >= 0; hp--) {
      assert.ok(waitForCenter(game), `${fish.name}:真ん中に来ない`);
      const r = tap(game);
      assert.equal(r.action, "hit", fish.name);
      assert.equal(r.hp, hp, fish.name);
      if (hp > 0) {
        assert.equal(game.fight.hp, hp);
        assert.ok(Math.abs(game.fight.zone.end - game.fight.zone.start - fish.minigame.zoneWidth) < 1e-12);
      }
    }
    assert.equal(game.phase, PHASES.RESULT);
    assert.equal(game.lastResult.outcome, OUTCOMES.CAUGHT);
    assert.equal(game.lastResult.reason, REASONS.HP_ZERO);
    assert.deepEqual(game.lastResult.reward, fish.reward);
    assert.equal(game.lastResult.hits, fish.minigame.hp);
  }
});

test("外すと体力が 1 回復する(最大をこえない)", () => {
  const game = untilFight("suzuki");
  assert.ok(waitForOutside(game));
  let r = tap(game);
  assert.deepEqual([r.action, r.hp], ["miss", 3], "最大のときは回復しない");
  assert.ok(waitForCenter(game));
  r = tap(game);
  assert.deepEqual([r.action, r.hp], ["hit", 2]);
  assert.ok(waitForOutside(game));
  r = tap(game);
  assert.deepEqual([r.action, r.hp], ["miss", 3]);
  assert.equal(game.fight.misses, 2);
});

test("制限時間を過ぎたら逃げる(境界:1 ミリ秒前はまだ続く)", () => {
  for (const fish of STRONG) {
    const game = untilFight(fish.id);
    update(game, fish.minigame.timeLimitMs - 1);
    assert.equal(game.phase, PHASES.MINIGAME, fish.name);
    update(game, 1);
    assert.equal(game.phase, PHASES.RESULT, fish.name);
    assert.equal(game.lastResult.reason, REASONS.TIMEOUT);
    assert.deepEqual(game.lastResult.reward, { coins: 0, material: 0 });
  }
});

test("どんな操作でも、掛かってから 受付時間+制限時間 の中で必ず終わる", () => {
  const limit = (fish) => DEFAULT_CONFIG.hook.strongMs + fish.minigame.timeLimitMs;
  for (const seed of [1, 2, 3]) {
    const rng = createRng(seed + 100);
    // でたらめにタップする遊び方を、いろいろな確率で試す。
    for (const tapChance of [0, 0.01, 0.1, 0.5, 1]) {
      const game = createGame(seed, { progress: { coins: 0, material: 0, rodStage: 5, seen: [] } });
      let biteAt = null;
      for (let t = 0; t < 600000; t += 10) {
        update(game, 10);
        if (game.phase === PHASES.BITE && biteAt === null) biteAt = t;
        if (rng() < tapChance) tap(game);
        if (game.phase === PHASES.RESULT && biteAt !== null) {
          if (game.cast.kind === FISH_KINDS.STRONG) {
            assert.ok(t - biteAt <= limit(game.cast.fish) + 20, `${t - biteAt} ミリ秒`);
          }
          biteAt = null;
        }
        if (game.phase === PHASES.RESTING) tap(game);
      }
    }
  }
});
