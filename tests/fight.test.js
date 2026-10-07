// 強い魚の体力制のミニゲームのテスト(受け入れ条件 3・7)。
// 数値の決まりを確かめやすいよう、多くはクリティカルの確率 0% の表で遊ぶ。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { FISH_KINDS, FISH_LIST } from "../src/core/fish.js";
import { createGame, OUTCOMES, PHASES, REASONS, tap, update } from "../src/core/fishing.js";
import { createRng } from "../src/core/rng.js";
import { untilFight, waitForCenter, waitForOutside } from "./fight_helpers.js";
import { progressAt } from "./helpers.js";

const STRONG = FISH_LIST.filter((f) => f.kind === FISH_KINDS.STRONG).sort((a, b) => a.stage - b.stage);
const NO_CRIT = { ...DEFAULT_CONFIG.combat, critChance: 0 };

test("体力は (10 + 10g)×(1 − 防御)(式)で、段階が上の強い魚ほど多い。制限時間は 8 秒 + 4 秒 × log5(g)", () => {
  assert.deepEqual(
    STRONG.map((f) => f.minigame.hp),
    STRONG.map((f) => Math.round((10 + 10 * f.stage) * (1 - f.minigame.defense))),
  );
  assert.deepEqual(STRONG.map((f) => f.minigame.hp).slice(0, 2), [20, 30], "段階 1〜2 は防御 0 で前のまま");
  for (let i = 1; i < STRONG.length; i++) assert.ok(STRONG[i].minigame.hp > STRONG[i - 1].minigame.hp);
  for (let i = 1; i < STRONG.length; i++) {
    assert.ok(STRONG[i].minigame.timeLimitMs >= STRONG[i - 1].minigame.timeLimitMs);
  }
  assert.deepEqual(
    STRONG.map((f) => f.minigame.timeLimitMs),
    [8000, 9700, 10700, 11400, 12000, 12500, 12800, 13200, 13500, 13700, 14000, 14200, 14400, 14600, 14700, 14900, 15000, 15200, 15300, 15400],
  );
});

test("確率 0%:当たるたびに体力が 10 減り、「体力 ÷ 10」回でゼロになって釣り上げ(防御 0 の段階 1〜2)", () => {
  for (const fish of STRONG.filter((f) => f.minigame.defense === 0)) {
    const game = untilFight(fish.id);
    assert.equal(game.phase, PHASES.MINIGAME, fish.name);
    assert.equal(game.fight.hp, fish.minigame.hp);
    const needed = fish.minigame.hp / 10;
    for (let i = 1; i <= needed; i++) {
      assert.ok(waitForCenter(game), `${fish.name}:真ん中に来ない`);
      const r = tap(game);
      assert.equal(r.action, "hit", fish.name);
      assert.equal(r.damage, 10);
      assert.equal(r.critical, false);
      assert.equal(r.hp, fish.minigame.hp - 10 * i, fish.name);
      assert.equal(r.caught, i === needed);
    }
    assert.equal(game.phase, PHASES.RESULT);
    assert.equal(game.lastResult.outcome, OUTCOMES.CAUGHT);
    assert.equal(game.lastResult.reason, REASONS.HP_ZERO);
    assert.deepEqual(game.lastResult.reward, fish.reward);
    assert.equal(game.lastResult.hits, needed);
    assert.equal(game.lastResult.crits, 0);
  }
});

test("残りの体力ちょうどのダメージで釣り上げ、超えるダメージは切り捨てて 0", () => {
  // ちょうど:クロダイ 20 に、ダメージ 20。
  let game = untilFight("kurodai", { combat: { ...NO_CRIT, damage: 20 } });
  assert.ok(waitForCenter(game));
  let r = tap(game);
  assert.deepEqual([r.hp, r.caught], [0, true]);
  // 1 足りない:ダメージ 19 なら 1 残る。
  game = untilFight("kurodai", { combat: { ...NO_CRIT, damage: 19 } });
  assert.ok(waitForCenter(game));
  r = tap(game);
  assert.deepEqual([r.hp, r.caught], [1, false]);
  // 超過:ダメージ 25 でも体力は 0(負にならない)。
  game = untilFight("kurodai", { combat: { ...NO_CRIT, damage: 25 } });
  assert.ok(waitForCenter(game));
  r = tap(game);
  assert.deepEqual([r.hp, r.damage, r.caught], [0, 25, true]);
});

test("外すと体力が 10 回復し、最大はこえない(境界)", () => {
  const game = untilFight("suzuki");
  assert.ok(waitForOutside(game));
  let r = tap(game);
  assert.deepEqual([r.action, r.hp, r.heal], ["miss", 30, 0], "最大のときは回復しない");
  assert.ok(waitForCenter(game));
  r = tap(game);
  assert.deepEqual([r.action, r.hp], ["hit", 20]);
  assert.ok(waitForOutside(game));
  r = tap(game);
  assert.deepEqual([r.action, r.hp, r.heal], ["miss", 30, 10], "ちょうど最大まで");
  assert.equal(game.fight.misses, 2);
  // 回復 15 で、残り 20 から外すと 30 で止まる(35 にならない)。
  const g2 = untilFight("suzuki", { combat: { ...NO_CRIT, missHeal: 15 } });
  assert.ok(waitForCenter(g2));
  tap(g2);
  assert.ok(waitForOutside(g2));
  r = tap(g2);
  assert.deepEqual([r.hp, r.heal], [30, 10]);
});

test("制限時間を過ぎたら逃げる(境界:1 ミリ秒前はまだ続く)", () => {
  for (const fish of STRONG) {
    const game = untilFight(fish.id);
    update(game, fish.minigame.timeLimitMs - 1);
    assert.equal(game.phase, PHASES.MINIGAME, fish.name);
    update(game, 1);
    assert.equal(game.phase, PHASES.RESULT, fish.name);
    assert.equal(game.lastResult.reason, REASONS.TIMEOUT);
    assert.deepEqual(game.lastResult.reward, { coins: 0, scales: 0 });
  }
});

test("どんな操作でも、掛かってから 受付時間+制限時間 の中で必ず終わる(基本の表)", () => {
  const limit = (fish) => DEFAULT_CONFIG.combat.hook.strong.ringMs + fish.minigame.timeLimitMs;
  for (const seed of [1, 2, 3]) {
    const rng = createRng(seed + 100);
    for (const tapChance of [0, 0.01, 0.1, 0.5, 1]) {
      const game = createGame(seed, { progress: progressAt(5) });
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
