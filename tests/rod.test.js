// 竿の強化のテスト(受け入れ条件 6)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { canUpgrade, upgradeCost, upgradeRod } from "../src/core/rod.js";

const ROD = DEFAULT_CONFIG.rod;

test("必要な素材は段階が上がるほど増え、上限では null", () => {
  const costs = [1, 2, 3, 4].map((s) => upgradeCost(s, ROD));
  assert.deepEqual(costs, [10, 30, 80, 200]);
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i] > costs[i - 1]);
  assert.equal(upgradeCost(5, ROD), null);
});

test("素材が 1 足りないと強化できず、何も変わらない", () => {
  const p = { coins: 7, material: 9, rodStage: 1, seen: [] };
  assert.equal(canUpgrade(p, ROD), false);
  assert.equal(upgradeRod(p, ROD), false);
  assert.deepEqual(p, { coins: 7, material: 9, rodStage: 1, seen: [] });
});

test("素材がちょうどなら、全部使って段階が上がる", () => {
  const p = { coins: 7, material: 10, rodStage: 1, seen: [] };
  assert.equal(upgradeRod(p, ROD), true);
  assert.deepEqual(p, { coins: 7, material: 0, rodStage: 2, seen: [] });
});

test("素材が多ければ、必要な数だけ使う(ウロコインは使わない)", () => {
  const p = { coins: 50, material: 45, rodStage: 2, seen: [] };
  assert.equal(upgradeRod(p, ROD), true);
  assert.deepEqual(p, { coins: 50, material: 15, rodStage: 3, seen: [] });
});

test("上限の段階では、素材があっても強化できない", () => {
  const p = { coins: 0, material: 99999, rodStage: 5, seen: [] };
  assert.equal(canUpgrade(p, ROD), false);
  assert.equal(upgradeRod(p, ROD), false);
  assert.equal(p.rodStage, 5);
  assert.equal(p.material, 99999);
});
