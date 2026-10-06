// 重いテスト:ルアーの命中範囲(②-4b2 の条件 6、D-181)。
// 序盤の高レア(レジェンド・グレード 1)で、命中範囲がはっきり広がる(目安 +15〜25%)。
// 終盤の最高の装備でも、上限(ゲージの 70%)に届かない。下限(10%)は守る。
// 実際に戦いを進めて、ゲージの命中範囲の幅と、でたらめにタップしたときの命中の割合を測る。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { makeContent } from "../../src/core/fish.js";
import { challengeBoss, createGame, PHASES, tap, update } from "../../src/core/fishing.js";
import { effectRange, emptyGear, EQUIP_KIND_ROWS, RARITY_ROWS } from "../../src/core/gear.js";
import { createRng } from "../../src/core/rng.js";
import { progressAt, stage6Content } from "../helpers.js";

const LURE = EQUIP_KIND_ROWS.find((k) => k.id === "lure");
const LEGEND = RARITY_ROWS.find((r) => r.id === "legend");
const GG = DEFAULT_CONFIG.gacha.gradeGrowth;
const MAX = DEFAULT_CONFIG.combatLimits.maxZoneWidth;

/** ルアー(値 value)を付けて、段階 stage のヌシ戦を始め、でたらめにタップして命中の割合と幅を測る。 */
function measure(content, stage, value, seed) {
  const item = { id: 1, kind: "lure", rarity: "legend", grade: 1, value, skills: [] };
  const gear = { ...emptyGear(), seed: 1, items: value > 0 ? [item] : [], equipped: value > 0 ? { lure: 1 } : {}, nextId: 2 };
  const g = createGame(seed, { content, progress: progressAt(stage, "crafted", { gear }), combat: { ...DEFAULT_CONFIG.combat, missHeal: 0 } });
  challengeBoss(g);
  const width = g.fight.zone.end - g.fight.zone.start;
  const r = createRng(seed);
  let hits = 0;
  let taps = 0;
  for (let t = 0; t < 20000 && g.phase === PHASES.MINIGAME; t += 7) {
    update(g, 7);
    if (g.phase === PHASES.MINIGAME && r() < 0.02) {
      taps += 1;
      if (tap(g).action === "hit") hits += 1;
    }
  }
  return { width, hits, taps };
}

test("序盤の高レアのルアー(レジェンド・グレード 1)で、命中範囲がはっきり広がり、命中の割合も上がる", () => {
  const range = effectRange(LURE, LEGEND, 1, GG);
  assert.ok(range.min >= 15 && range.max <= 25, `${range.min}〜${range.max}%`);
  const content = makeContent();
  let base = { hits: 0, taps: 0 };
  let lured = { hits: 0, taps: 0 };
  let w0 = 0;
  let w1 = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const a = measure(content, 1, 0, seed);
    const b = measure(content, 1, range.max, seed);
    w0 = a.width;
    w1 = b.width;
    base = { hits: base.hits + a.hits, taps: base.taps + a.taps };
    lured = { hits: lured.hits + b.hits, taps: lured.taps + b.taps };
  }
  assert.ok(Math.abs(w1 / w0 - (1 + range.max / 100)) < 1e-9);
  const rate0 = base.hits / base.taps;
  const rate1 = lured.hits / lured.taps;
  console.log(`ヌシ・クロダイ:幅 ${(w0 * 100).toFixed(1)}% → ${(w1 * 100).toFixed(1)}%、でたらめなタップの命中 ${(rate0 * 100).toFixed(1)}% → ${(rate1 * 100).toFixed(1)}%(${base.taps} 回)`);
  assert.ok(rate1 > rate0 * 1.1, "命中の割合も上がる");
});

test("終盤の最高のルアー(レジェンドの最大。段階 6 を足しても)でも、どの魚でも上限(70%)に届かない。下限(10%)は守る", () => {
  const content = stage6Content();
  const lines = [];
  for (const grade of [1, 3, 5, 6]) {
    const best = effectRange(LURE, LEGEND, grade, GG).max;
    const widths = content.fish
      .filter((f) => f.minigame)
      .map((f) => [f.name, f.minigame.zoneWidth, f.minigame.zoneWidth * (1 + best / 100)]);
    for (const [, , w] of widths) assert.ok(w < MAX, `グレード ${grade}:${w}`);
    const widest = widths.reduce((a, b) => (b[2] > a[2] ? b : a));
    const narrowest = widths.reduce((a, b) => (b[2] < a[2] ? b : a));
    lines.push(
      `グレード ${grade} の最高(+${best}%):一番広い ${widest[0]} ${(widest[1] * 100).toFixed(0)}% → ${(widest[2] * 100).toFixed(1)}%、` +
        `一番せまい ${narrowest[0]} ${(narrowest[1] * 100).toFixed(0)}% → ${(narrowest[2] * 100).toFixed(1)}%`,
    );
  }
  // 実際の戦いでも、段階 6 のヌシで幅が割合どおり。極端な値は上限で止まり、下限より狭くならない。
  assert.ok(Math.abs(measure(content, 6, 66, 1).width - 0.1 * 1.66) < 1e-9);
  assert.equal(measure(content, 6, 100000, 1).width, MAX);
  assert.ok(measure(content, 6, 0, 1).width >= DEFAULT_CONFIG.minigame.minZoneWidth);
  console.log(lines.join("\n"));
});
