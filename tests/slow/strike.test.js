// 重いテスト:強い魚のジャストの初撃(戦闘の調整の条件 7:D-256・D-257・D-260)。
// 一撃で釣れる割合:上手(ジャスト 70%)・平均的な装備で、強い魚のうち初撃で釣り上げた割合。結果は報告に使う(console.log)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { createGame, REASONS, update } from "../../src/core/fishing.js";
import { effectRange, RARITY_ROWS } from "../../src/core/gear.js";
import { levelRange, maxLevel, SKILL_ROWS } from "../../src/core/skills.js";
import { syntheticContent } from "../../src/core/synthetic.js";
import { startQuickFight } from "../../src/ui/debug_view.js";
import { averageItems, progressWith } from "./builds.js";
import { policyOf, SKILLED } from "./policy.js";

const BIG = syntheticContent(100);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];

/** 上手・平均的な装備で 20 分ずつ遊んだときの、強い魚の数と、初撃で釣れた数。 */
function oneShotRate(g) {
  let strong = 0;
  let strike = 0;
  for (const seed of SEEDS) {
    const game = createGame(seed, { content: BIG, progress: progressWith(g, averageItems(BIG, g)) });
    const policy = policyOf(SKILLED, seed);
    for (let t = 0; t < 1200000; t += 16) {
      update(game, 16);
      policy(game);
    }
    for (const r of game.results) {
      if (r.kind !== "strong") continue;
      strong += 1;
      if (r.reason === REASONS.STRIKE) strike += 1;
    }
  }
  return { strong, rate: strike / strong };
}

test("一撃で釣れる割合(上手・平均的な装備):g=5 は 10〜30%、g=20 以上は 10% 以下。g=1 は約 70%(1 種類しかいないので 0% か 70% の二択:D-260)", () => {
  const lines = [];
  for (const g of [1, 2, 3, 4, 5, 6, 10, 20, 50, 100]) {
    const r = oneShotRate(g);
    lines.push(`g=${g}:強い魚 ${r.strong} 匹、一撃 ${(r.rate * 100).toFixed(1)}%`);
    if (g === 1) assert.ok(r.rate >= 0.6 && r.rate <= 0.8, lines.at(-1));
    if (g === 5) assert.ok(r.rate >= 0.1 && r.rate <= 0.3, lines.at(-1));
    if (g >= 20) assert.ok(r.rate <= 0.1, lines.at(-1));
  }
  console.log(lines.join("\n"));
});

test("初撃向けに育てた装備(ジャスト・ブースト最大・強打)なら、g=5・20・100 の強い魚をジャストの一撃で釣れる", () => {
  const lines = [];
  for (const g of [5, 20, 100]) {
    const level = levelRange("legend", g, DEFAULT_CONFIG.skills).max;
    const items = BIG.equipKinds.map((kind) => {
      const r = effectRange(kind, RARITY_ROWS[3], g, DEFAULT_CONFIG.gacha.gradeGrowth);
      const skills = kind.id === "lure" ? [{ id: "power", level }] : [{ id: "just-boost", level }, { id: "power", level }];
      return { kind: kind.id, rarity: "legend", grade: g, value: Math.round((r.min + r.max) / 2 / kind.step) * kind.step, skills };
    });
    const game = createGame(1, { content: BIG, progress: progressWith(g, items) });
    const jb = SKILL_ROWS.find((s) => s.id === "just-boost");
    assert.ok(2 * level >= maxLevel(jb, g, DEFAULT_CONFIG.skills), "ジャスト・ブーストは最大レベル");
    const fish = BIG.fish.find((f) => f.kind === "strong" && f.stage === g);
    assert.equal(startQuickFight(game, fish.id, "just").ok, true);
    const s = game.lastResult.strike;
    lines.push(`g=${g}:基本のダメージ ${game.combat.damage}・ジャスト倍率 ${s.multiplier.toFixed(2)}・初撃 ${s.damage} / 体力 ${s.maxHp}`);
    assert.equal(game.lastResult.reason, REASONS.STRIKE, lines.at(-1));
  }
  console.log(lines.join("\n"));
});
