// 重いテスト:たくさんのシードで、待ち時間・強い魚の割合・魚の出やすさが決めた値の近くに収まるか。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { areaOfStage } from "../../src/core/areas.js";
import { availableFish, DEFAULT_CONTENT, fishWeight, STAGE_LIST } from "../../src/core/fish.js";
import { drawCast, FISH_KINDS } from "../../src/core/fishing.js";
import { createRng } from "../../src/core/rng.js";

test("全段階で、200 個のシード × 2000 回の統計が決めた値に近い", () => {
  const expectedWait = (DEFAULT_CONFIG.waitMinMs + DEFAULT_CONFIG.waitMaxMs) / 2;
  for (const { stage } of STAGE_LIST) {
    let waitSum = 0;
    let strong = 0;
    let total = 0;
    const perFish = new Map();
    for (let seed = 1; seed <= 200; seed++) {
      const rng = createRng(seed);
      for (let i = 0; i < 2000; i++) {
        const cast = drawCast(rng, DEFAULT_CONFIG, stage);
        waitSum += cast.waitMs;
        if (cast.kind === FISH_KINDS.STRONG) strong += 1;
        perFish.set(cast.fish.id, (perFish.get(cast.fish.id) ?? 0) + 1);
        total += 1;
      }
    }
    assert.ok(Math.abs(waitSum / total - expectedWait) < 20, `段階 ${stage}:平均 ${waitSum / total}`);
    assert.ok(Math.abs(strong / total - DEFAULT_CONFIG.strongChance) < 0.003, `段階 ${stage}:割合 ${strong / total}`);
    // 区分の中での出やすさは、重み(釣り場の中の位置で段階ごとに 2 倍:D-275)の比に近い。
    const first = areaOfStage(DEFAULT_CONTENT, stage).firstStage;
    for (const kind of [FISH_KINDS.WEAK, FISH_KINDS.STRONG]) {
      const list = availableFish(stage, kind, undefined, first);
      const weightSum = list.reduce((s, f) => s + fishWeight(f, first), 0);
      const share = kind === FISH_KINDS.STRONG ? DEFAULT_CONFIG.strongChance : 1 - DEFAULT_CONFIG.strongChance;
      for (const f of list) {
        const expected = (share * fishWeight(f, first)) / weightSum;
        const actual = (perFish.get(f.id) ?? 0) / total;
        assert.ok(Math.abs(actual - expected) < 0.005, `段階 ${stage} ${f.name}:${actual} / ${expected}`);
      }
    }
  }
});
