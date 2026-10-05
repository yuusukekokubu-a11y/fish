// 重いテスト:たくさんのシードで、待ち時間と強い魚の割合が決めた値の近くに収まるか。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { drawCast, FISH_KINDS } from "../../src/core/fishing.js";
import { createRng } from "../../src/core/rng.js";

test("200 個のシード × 5000 回で、平均の待ち時間と強い魚の割合が決めた値に近い", () => {
  const expectedWait = (DEFAULT_CONFIG.waitMinMs + DEFAULT_CONFIG.waitMaxMs) / 2;
  let waitSum = 0;
  let strong = 0;
  let total = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rng = createRng(seed);
    for (let i = 0; i < 5000; i++) {
      const cast = drawCast(rng);
      waitSum += cast.waitMs;
      if (cast.kind === FISH_KINDS.STRONG) strong += 1;
      total += 1;
    }
  }
  assert.ok(Math.abs(waitSum / total - expectedWait) < 20, `平均 ${waitSum / total}`);
  assert.ok(Math.abs(strong / total - DEFAULT_CONFIG.strongChance) < 0.003, `割合 ${strong / total}`);
});
