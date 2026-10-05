// タイミングのミニゲームの判定のテスト(受け入れ条件 4)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { drawZone, isHit, markerPosition } from "../src/core/minigame.js";
import { createRng } from "../src/core/rng.js";

const zone = { start: 0.4, end: 0.6 };

test("当たり範囲の内側は成功", () => {
  for (const p of [0.4001, 0.45, 0.5, 0.5999]) {
    assert.equal(isHit(p, zone), true, String(p));
  }
});

test("境界ちょうど(start と end)は成功に含める", () => {
  assert.equal(isHit(0.4, zone), true);
  assert.equal(isHit(0.6, zone), true);
});

test("当たり範囲の外側は失敗(境界のすぐ外も失敗)", () => {
  for (const p of [0, 0.3, 0.3999, 0.6001, 0.9, 1]) {
    assert.equal(isHit(p, zone), false, String(p));
  }
  assert.equal(isHit(zone.start - Number.EPSILON, zone), false);
  assert.equal(isHit(zone.end + 1e-12, zone), false);
});

test("印は 0 → 1 → 0 と往復する", () => {
  const sweep = 1000;
  assert.equal(markerPosition(0, sweep), 0);
  assert.equal(markerPosition(250, sweep), 0.25);
  assert.equal(markerPosition(1000, sweep), 1);
  assert.equal(markerPosition(1500, sweep), 0.5);
  assert.equal(markerPosition(2000, sweep), 0);
  assert.equal(markerPosition(2250, sweep), 0.25);
});

test("当たり範囲はゲージの中に収まり、幅は決めたとおり", () => {
  const rng = createRng(3);
  const { zoneMargin } = DEFAULT_CONFIG.minigame;
  for (const zoneWidth of [0.22, 0.1]) {
    for (let i = 0; i < 1000; i++) {
      const z = drawZone(rng, { zoneWidth, zoneMargin });
      assert.ok(z.start >= zoneMargin - 1e-12);
      assert.ok(z.end <= 1 - zoneMargin + 1e-12);
      assert.ok(Math.abs(z.end - z.start - zoneWidth) < 1e-12);
    }
  }
});
