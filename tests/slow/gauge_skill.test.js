// 重いテスト:芯・縁の腕前による損得(②-4b3 の条件 7、D-197・D-209)。
// タップの位置のずれ(標準偏差)を 小・中・大 の 3 通りにして、ヌシ・マグロ(命中範囲 10%)を釣る 1 匹あたりの時間を比べる。
//  - ふつう:芯・縁のスキルなし。命中範囲の真ん中を狙う。
//  - 芯:芯 Lv4。真ん中を狙う。
//  - 縁:縁 Lv4。縁の帯の真ん中(中心からの距離 0.875)を狙う。
// 腕前が高い(ずれが小さい)ほど縁が有利、低いと縁は不利(ふつうとの順位が入れ替わる)。芯は腕前が高い人にやや有利。

import assert from "node:assert/strict";
import { test } from "node:test";

import { challengeBoss, createGame, currentMarker, PHASES, tap, update } from "../../src/core/fishing.js";
import { emptyGear } from "../../src/core/gear.js";
import { createRng } from "../../src/core/rng.js";
import { progressAt } from "../helpers.js";

const NOISE = [
  ["小", 0.004],
  ["中", 0.012],
  ["大", 0.025],
];
const STYLES = [
  ["ふつう", {}, 0],
  ["芯", { core: 4 }, 0],
  ["縁", { edge: 4 }, 0.875],
];

/** 標準正規分布の乱数(シードつき)。 */
function gauss(r) {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

function bossGame(levels, seed) {
  const skills = Object.entries(levels).map(([id, level]) => ({ id, level }));
  const items = [{ id: 1, kind: "reel", rarity: "legend", grade: 5, value: 8, skills }];
  const g = createGame(seed, { progress: progressAt(5, "crafted", { gear: { ...emptyGear(), seed: 1, items, equipped: { reel: 1 }, nextId: 2 } }) });
  g.bossAttempts = seed;
  challengeBoss(g);
  return g;
}

/** 1 回のヌシ戦。狙う位置(中心からの距離 aim)に、ずれ sigma を足してタップする。 */
function fight(levels, aim, sigma, seed) {
  const g = bossGame(levels, seed);
  const r = createRng(seed * 31 + 7);
  let ms = 0;
  let target = null;
  let last = currentMarker(g);
  let misses = 0;
  while (g.phase === PHASES.MINIGAME && ms < 200000) {
    update(g, 2);
    ms += 2;
    if (g.phase !== PHASES.MINIGAME) break;
    const p = currentMarker(g);
    const z = g.fight.zone;
    const half = (z.end - z.start) / 2;
    const center = (z.start + z.end) / 2;
    if (target === null) {
      // 印の進む向きの手前の側を狙う(縁なら近い側の縁の帯)。
      const side = p >= last ? -1 : 1;
      target = center + side * aim * half + gauss(r) * sigma;
    }
    if ((last - target) * (p - target) <= 0 && last !== p) {
      if (tap(g).action === "miss") misses += 1;
      target = null;
    }
    last = p;
  }
  return { ms, caught: g.lastResult?.outcome === "caught", misses };
}

test("腕前による損得:ずれが小さいと 縁 < ふつう(縁が速い)、大きいと 縁 > ふつう(縁が遅い)。芯は腕前が高いとふつうより速い", () => {
  const table = {};
  const lines = [];
  for (const [nlabel, sigma] of NOISE) {
    table[nlabel] = {};
    const cells = [];
    for (const [slabel, levels, aim] of STYLES) {
      let ms = 0;
      let caught = 0;
      let misses = 0;
      for (let seed = 1; seed <= 40; seed++) {
        const f = fight(levels, aim, sigma, seed);
        ms += f.ms;
        caught += f.caught ? 1 : 0;
        misses += f.misses;
      }
      const per = ms / Math.max(1, caught);
      table[nlabel][slabel] = per;
      cells.push(`${slabel} ${(per / 1000).toFixed(2)} 秒(釣れた ${caught}/40・ミス ${misses})`);
    }
    lines.push(`ずれ ${nlabel}(${sigma}):${cells.join("、")}`);
  }
  console.log(lines.join("\n"));
  assert.ok(table["小"]["縁"] < table["小"]["ふつう"], "腕前が高いと縁が有利");
  assert.ok(table["大"]["縁"] > table["大"]["ふつう"], "腕前が低いと縁は不利(順位が入れ替わる)");
  assert.ok(table["小"]["芯"] < table["小"]["ふつう"], "芯は腕前が高い人に有利");
  assert.ok(table["小"]["縁"] < table["小"]["芯"] || table["大"]["縁"] > table["大"]["芯"], "縁は芯より、腕前で差が大きい");
});
