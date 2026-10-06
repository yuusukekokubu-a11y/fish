// 竿の工程(製作 → ヌシ撃破 → 進化)のテスト(受け入れ条件 6)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONTENT, STAGE_LIST } from "../src/core/fish.js";
import {
  addCount,
  canChallengeStep,
  canCraft,
  canEvolve,
  COUNT_MAX,
  craftRod,
  evolveRod,
  markBossDefeated,
  nextNeed,
  ROD_STEPS,
  rodName,
} from "../src/core/rod.js";
import { progressAt } from "./helpers.js";

test("製作に要る鱗は、その段階の強い魚の鱗(3・4・4・5・6)、進化はヌシの鱗 1", () => {
  assert.deepEqual(
    STAGE_LIST.map((s) => [s.craft.scale, s.craft.count, s.evolve.scale, s.evolve.count]),
    [
      ["kurodai", 3, "nushi-kurodai", 1],
      ["suzuki", 4, "nushi-suzuki", 1],
      ["hirame", 4, "nushi-hirame", 1],
      ["warasa", 5, "nushi-warasa", 1],
      ["buri", 6, "nushi-buri", 1],
    ],
  );
});

test("製作:鱗が 1 足りないとできず、何も変わらない", () => {
  const p = progressAt(1, ROD_STEPS.NONE, { coins: 7, scales: { kurodai: 2 } });
  assert.equal(canCraft(p), false);
  assert.equal(craftRod(p), false);
  assert.deepEqual(p, progressAt(1, ROD_STEPS.NONE, { coins: 7, scales: { kurodai: 2 } }));
});

test("製作:ちょうどなら全部使って製作済み、多ければ必要数だけ使う(ウロコインは使わない)", () => {
  const p = progressAt(1, ROD_STEPS.NONE, { coins: 7, scales: { kurodai: 3 } });
  assert.equal(craftRod(p), true);
  assert.deepEqual(p, progressAt(1, ROD_STEPS.CRAFTED, { coins: 7, scales: { kurodai: 0 } }));
  const q = progressAt(2, ROD_STEPS.NONE, { scales: { suzuki: 10, kurodai: 5 } });
  assert.equal(craftRod(q), true);
  assert.deepEqual(q.scales, { suzuki: 6, kurodai: 5 }, "ほかの魚の鱗は使わない");
});

test("製作は未製作のときだけ(製作済みで、もう一度は作れない)", () => {
  const p = progressAt(1, ROD_STEPS.CRAFTED, { scales: { kurodai: 99 } });
  assert.equal(canCraft(p), false);
  assert.equal(craftRod(p), false);
});

test("ヌシに挑めるのは、製作済みかヌシ撃破のとき", () => {
  assert.equal(canChallengeStep(progressAt(1, ROD_STEPS.NONE)), false);
  assert.equal(canChallengeStep(progressAt(1, ROD_STEPS.CRAFTED)), true);
  assert.equal(canChallengeStep(progressAt(1, ROD_STEPS.DEFEATED)), true);
  assert.equal(canChallengeStep(progressAt(5, ROD_STEPS.EVOLVED)), false);
  const p = progressAt(1, ROD_STEPS.CRAFTED);
  markBossDefeated(p);
  assert.equal(p.rodStep, ROD_STEPS.DEFEATED);
});

test("進化:ヌシ撃破でヌシの鱗があれば、ヌシの鱗を使って次の段階の未製作へ", () => {
  const none = progressAt(1, ROD_STEPS.DEFEATED, { scales: { "nushi-kurodai": 0 } });
  assert.equal(canEvolve(none), false, "ヌシの鱗がない");
  const crafted = progressAt(1, ROD_STEPS.CRAFTED, { scales: { "nushi-kurodai": 1 } });
  assert.equal(canEvolve(crafted), false, "まだヌシを倒していない");
  const p = progressAt(1, ROD_STEPS.DEFEATED, { scales: { "nushi-kurodai": 2 } });
  assert.equal(evolveRod(p), true);
  assert.deepEqual(p, progressAt(2, ROD_STEPS.NONE, { scales: { "nushi-kurodai": 1 } }));
});

test("表の最後の段階を進化すると「進化済み」で止まり、エラーにならない", () => {
  const last = DEFAULT_CONTENT.maxStage;
  const p = progressAt(last, ROD_STEPS.DEFEATED, { scales: { "nushi-buri": 1 } });
  assert.equal(evolveRod(p), true);
  assert.equal(p.rodStage, last);
  assert.equal(p.rodStep, ROD_STEPS.EVOLVED);
  assert.equal(canEvolve(p), false);
  assert.equal(evolveRod(p), false);
  assert.equal(canCraft(p), false);
  assert.equal(nextNeed(p), null);
});

test("竿の名前と、次に要る鱗", () => {
  assert.equal(rodName(progressAt(1)), "はじめの釣竿");
  assert.equal(rodName(progressAt(1, ROD_STEPS.CRAFTED)), "クロダイの釣竿");
  assert.equal(rodName(progressAt(1, ROD_STEPS.DEFEATED)), "クロダイの釣竿");
  assert.equal(rodName(progressAt(2)), "ヌシ・クロダイの釣竿");
  assert.equal(rodName(progressAt(5, ROD_STEPS.EVOLVED)), "ヌシ・ブリの釣竿");
  assert.deepEqual(nextNeed(progressAt(1, ROD_STEPS.NONE, { scales: { kurodai: 2 } })), { id: "kurodai", have: 2, need: 3 });
  assert.deepEqual(nextNeed(progressAt(1, ROD_STEPS.CRAFTED)), { id: "nushi-kurodai", have: 0, need: 1 });
});

test("数は安全な整数の上限で止まる", () => {
  assert.equal(addCount(COUNT_MAX - 1, 5), COUNT_MAX);
  assert.equal(addCount(1, 2), 3);
});
