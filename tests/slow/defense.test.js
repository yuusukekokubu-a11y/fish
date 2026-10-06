// 重いテスト:防御とヌシ戦の長さ(②-4c 防御の条件 2〜5・8、D-235〜D-239・D-245)。
// 装備は builds.js:平均的な装備・育てた装備(各枠 100 個から)・最強の装備。戦闘は「上手」(真ん中で命中、タップの間 250 ミリ秒以上)。
// 結果の表は報告に使う(console.log)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { effectiveStats, hitDamage } from "../../src/core/combat.js";
import { createGame } from "../../src/core/fishing.js";
import { bossHitTarget, fishDefense, softCurve, stagePosition } from "../../src/core/formula.js";
import { skillAmount, SKILL_ROWS } from "../../src/core/skills.js";
import { syntheticContent } from "../../src/core/synthetic.js";
import { averageItems, fightOnce, grownItems, measure, progressWith, skillSummary, strongestItems } from "./builds.js";

const G_MAX = 100;
const CONTENT = syntheticContent(G_MAX);
const GACHA_SEEDS = [11, 22, 33, 44, 55, 66, 77];
const FIGHT_SEEDS = [1, 2, 3, 4, 5];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const boss = (g) => `s${g}-boss`;
const strong = (g) => `s${g}-strong`;

/** 育てた装備(ガチャの種 7 つ)で戦う。各装備の 5 シードの中央値の、さらに中央値。 */
function grownHits(g, fishId, options = {}) {
  const per = GACHA_SEEDS.map((gs) => measure(CONTENT, g, grownItems(CONTENT, g, fishId, gs * 1000 + g, options), fishId, FIGHT_SEEDS).median);
  return { median: median(per), per };
}

const HIT_GS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100];

test("ヌシの命中回数(育てた装備・貫通を含む):s=1 は 4〜6 回、s=5 は 10〜14 回、その間は少しずつ伸びる", () => {
  const lines = ["| g | s | 目標 | 体力 | 防御 | 育てた装備(ガチャの種 7 つ)| 中央値 |"];
  /** @type {Record<number, number[]>} */
  const byS = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  /** @type {string[]} */
  const problems = [];
  for (const g of HIT_GS) {
    const s = stagePosition(g);
    const r = grownHits(g, boss(g));
    const m = CONTENT.byId.get(boss(g)).minigame;
    byS[s].push(r.median);
    lines.push(`| ${g} | ${s} | ${bossHitTarget(g)} | ${m.hp} | ${Math.round(m.defense * 1000) / 10}% | ${r.per.join("・")} | ${r.median} |`);
    const [lo, hi] = s === 1 ? [4, 6] : s === 5 ? [10, 14] : [4, 14];
    if (!(r.median >= lo && r.median <= hi)) problems.push(`g=${g} s=${s}:${r.median} 回`);
  }
  const means = [1, 2, 3, 4, 5].map((s) => byS[s].reduce((a, b) => a + b, 0) / byS[s].length);
  lines.push(`位置 s ごとの平均:${means.map((v, i) => `s=${i + 1} ${v.toFixed(1)}`).join("、")}`);
  console.log(lines.join("\n"));
  assert.deepEqual(problems, []);
  for (let i = 1; i < 5; i++) assert.ok(means[i] > means[i - 1], `s=${i + 1} の平均が s=${i} より多い`);
});

test("貫通必須:s=5 のヌシは、貫通なしの育てた装備で、制限時間のうちに倒せる確率が 5% 未満", () => {
  const lines = [];
  for (const g of [5, 10, 15, 20, 50, 100]) {
    let wins = 0;
    let total = 0;
    for (const gs of GACHA_SEEDS) {
      const items = grownItems(CONTENT, g, boss(g), gs * 1000 + g, { noPen: true });
      const r = measure(CONTENT, g, items, boss(g), Array.from({ length: 20 }, (_, i) => i + 1));
      wins += r.runs.filter((x) => x.caught).length;
      total += r.runs.length;
    }
    lines.push(`g=${g}:貫通なしの育てた装備の勝率 ${((wins / total) * 100).toFixed(1)}%(${wins} / ${total})`);
    assert.ok(wins / total < 0.05, lines.at(-1));
  }
  console.log(lines.join("\n"));
});

test("序盤:g=1〜2 の強い魚とヌシは防御 0% で、装備なしでも(上手に遊んで)制限時間のうちに倒せる", () => {
  for (const g of [1, 2]) {
    for (const id of [strong(g), boss(g)]) {
      assert.equal(CONTENT.byId.get(id).minigame.defense, 0);
      const r = measure(CONTENT, g, [], id, Array.from({ length: 20 }, (_, i) => i + 1));
      assert.equal(r.winRate, 1, `${id}:装備なしの勝率 ${r.winRate}`);
    }
  }
});

test("強い魚:全ての g で防御 100% 未満・ヌシより低い。育てた装備では 1〜3 回前後(目安)", () => {
  for (let g = 1; g <= G_MAX; g++) {
    assert.ok(fishDefense("strong", g) < 1);
    if (g >= 3) assert.ok(fishDefense("strong", g) < fishDefense("boss", g));
  }
  const lines = [];
  for (const g of [1, 2, 5, 10, 20, 50, 100]) {
    const avg = measure(CONTENT, g, averageItems(CONTENT, g), strong(g), FIGHT_SEEDS);
    const grown = grownHits(g, strong(g));
    lines.push(`g=${g}:強い魚 平均的な装備 ${avg.median} 回(勝率 ${avg.winRate})・育てた装備 ${grown.median} 回`);
    assert.equal(avg.winRate, 1, `g=${g} 平均的な装備で倒せる`);
    assert.ok(grown.median <= 4, lines.at(-1));
  }
  console.log(lines.join("\n"));
});

/** 装備から、1 命中のダメージ(通常・クリティカルの段数ごと)と、会心率で重みづけた期待値を作る。 */
function damageRow(g, items) {
  const game = createGame(1, { content: CONTENT, progress: progressWith(g, items) });
  const stats = effectiveStats(game.combat, DEFAULT_CONFIG.formula);
  const limits = DEFAULT_CONFIG.combatLimits;
  const per = [0, 1, 2, 3].map((k) => hitDamage(stats, k, limits));
  const whole = Math.floor(stats.critChance);
  const frac = stats.critChance - whole;
  const expected = hitDamage(stats, whole, limits) * (1 - frac) + hitDamage(stats, whole + 1, limits) * frac;
  return { per, expected, chance: stats.critChance, mult: stats.critMultiplier, top: hitDamage(stats, limits.maxCritStages, limits) };
}

test("1 命中のダメージの差:育てた装備は平均的な装備の 100 倍以内、最強は 1000 倍以内、最強でも安全上限(10 億)に届かない", () => {
  const lines = ["| g | 装備 | 通常 / 1 段 / 2 段 / 3 段 | 会心率・倍率 | 期待値 | ヌシの命中回数 |"];
  for (const g of [1, 2, 5, 6, 10, 20, 50, 100]) {
    const avg = averageItems(CONTENT, g);
    const grown = grownItems(CONTENT, g, boss(g), 11000 + g);
    const best = strongestItems(CONTENT, g, boss(g));
    const rows = [
      ["平均的", avg],
      ["育てた", grown],
      ["最強", best],
    ].map(([name, items]) => {
      const d = damageRow(g, items);
      const hits = measure(CONTENT, g, items, boss(g), FIGHT_SEEDS).median;
      lines.push(`| ${g} | ${name}(${skillSummary(items) || "スキルなし"}) | ${d.per.join(" / ")} | ${(d.chance * 100).toFixed(0)}%・${d.mult.toFixed(2)} 倍 | ${Math.round(d.expected)} | ${hits} |`);
      return d;
    });
    const [a, gr, b] = rows;
    assert.ok(gr.expected / a.expected <= 100, `g=${g} 育てた / 平均 = ${(gr.expected / a.expected).toFixed(1)}`);
    assert.ok(b.expected / a.expected <= 1000, `g=${g} 最強 / 平均 = ${(b.expected / a.expected).toFixed(1)}`);
    assert.ok(b.top < DEFAULT_CONFIG.combatLimits.maxHitDamage, `g=${g} 最強の最大ダメージ ${b.top}`);
  }
  console.log(lines.join("\n"));
});

test("会心率と会心威力の逓減:Lv1〜7 は線形、8 からは増分がだんだん小さく、合計は増え続ける(単独で付けたとき)", () => {
  const rate = SKILL_ROWS.find((s) => s.id === "crit-rate");
  const power = SKILL_ROWS.find((s) => s.id === "crit-power");
  const f = DEFAULT_CONFIG.formula;
  const total = (L) => [
    softCurve(DEFAULT_CONFIG.combat.critChance + skillAmount(rate, L), f.critChanceCurve),
    softCurve(DEFAULT_CONFIG.combat.critMultiplier + skillAmount(power, L), f.critMultiplierCurve),
  ];
  const lines = ["| Lv | 会心率(増分) | 会心の倍率(増分) |"];
  let prev = total(0);
  let prevInc = [Infinity, Infinity];
  for (let L = 1; L <= 100; L++) {
    const t = total(L);
    const inc = [t[0] - prev[0], t[1] - prev[1]];
    if (L <= 7) {
      assert.ok(Math.abs(inc[0] - 0.15) < 1e-9 && Math.abs(inc[1] - 0.1) < 1e-9, `Lv${L} は線形`);
    } else {
      assert.ok(inc[0] > 0 && inc[1] > 0, `Lv${L} の増分はプラス`);
      assert.ok(inc[0] <= prevInc[0] + 1e-12 && inc[1] <= prevInc[1] + 1e-12, `Lv${L} の増分は前以下`);
    }
    if (L <= 30 || L === 100) {
      lines.push(`| ${L} | ${(t[0] * 100).toFixed(1)}%(+${(inc[0] * 100).toFixed(2)}%) | ${t[1].toFixed(3)} 倍(+${inc[1].toFixed(3)}) |`);
    }
    prev = t;
    prevInc = inc;
  }
  console.log(lines.join("\n"));
});
