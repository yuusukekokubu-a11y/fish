// 重いテスト:ヌシの強さの目安(D-379・D-380)と、強い魚・ダメージの差・逓減(②-4c 防御・戦闘の調整の条件:D-254・D-255・D-260)。
// 装備は builds.js:引いた装備(段階 1〜g を目安の引く回数 P(h) × 割合ずつ)から選んだ一番強い組み合わせ。
// 遊び方は、ふつう(1 往復に 1 回・命中 80%)と上手(同じ速さで、ミスなく真ん中)。結果の表は報告に使う(console.log)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { effectiveStats, hitDamage } from "../../src/core/combat.js";
import { DEFAULT_CONTENT, defineFish, FISH_ROWS, makeContent } from "../../src/core/fish.js";
import { createGame } from "../../src/core/fishing.js";
import { fishQuirks, softCurve, targetPulls } from "../../src/core/formula.js";
import { skillAmount, SKILL_ROWS } from "../../src/core/skills.js";
import { averageItems, fightOnce, grownItems, measure, progressWith, SKILLED_PLAY, skillSummary, STANDARD_PLAY, strongestItems, unlimitedContent } from "./builds.js";

const CONTENT = DEFAULT_CONTENT;
const UNLIMITED = unlimitedContent(CONTENT);
const FIGHT_SEEDS = [1, 2, 3, 4, 5];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const boss = (g) => CONTENT.stageByNumber.get(g).boss;
const strong = (g) => CONTENT.stageByNumber.get(g).craft.scale;
const pct = (r) => `${Math.round(r * 100)}%`;

/** 引く回数の割合 pulls・遊び方 play で、ヌシに勝つ割合(装備はガチャの種 seeds ごとに選ぶ。本物の制限時間で戦う)。 */
function winRate(g, pulls, play, seeds, fights) {
  let wins = 0;
  let total = 0;
  for (const k of seeds) {
    const items = grownItems(UNLIMITED, g, boss(g), k, { pulls, standard: play });
    for (const s of fights) {
      wins += fightOnce(CONTENT, g, items, boss(g), s, { standard: play }).caught ? 1 : 0;
      total += 1;
    }
  }
  return wins / total;
}

// 目安(D-379):ふつう + P 回で 80% 以上、上手 + 3 分の 2 で 80% 以上、ふつう + 3 分の 2 で半分くらい、ふつう + 3 分の 1 で 3 割未満。
// 体力は g=1〜30 をシミュレーションで合わせて式にした(差は ±2 割以内:D-380)。テストの線は、式とガチャの運のぶれを見込んで、
// ふつう + P 回は 60〜100%、上手 + 3 分の 2 は川まで 60% 以上、3 分の 1 はふつう + 3 分の 2 以下で 65% 以下。
test("ヌシの強さの目安:引いた回数(P・3 分の 2・3 分の 1)と遊び方(ふつう・上手)ごとの勝率", () => {
  const seeds = Array.from({ length: 10 }, (_, i) => (i + 1) * 11);
  const fights = [1, 2, 3, 4, 5, 6];
  const lines = ["| g | P | 体力 | 制限時間 | ふつう + P | 上手 + 2/3 | ふつう + 2/3 | ふつう + 1/3 |", "| --- | --- | --- | --- | --- | --- | --- | --- |"];
  /** @type {string[]} */
  const problems = [];
  for (const g of [3, 8, 13, 18, 23, 28]) {
    const m = CONTENT.byId.get(boss(g)).minigame;
    const stdP = winRate(g, 1, STANDARD_PLAY, seeds, fights);
    const sk23 = winRate(g, 2 / 3, SKILLED_PLAY, seeds, fights);
    const std23 = winRate(g, 2 / 3, STANDARD_PLAY, seeds, fights);
    const std13 = winRate(g, 1 / 3, STANDARD_PLAY, seeds, fights);
    lines.push(`| ${g} | ${targetPulls(g)} | ${m.hp} | ${m.timeLimitMs / 1000} 秒 | ${pct(stdP)} | ${pct(sk23)} | ${pct(std23)} | ${pct(std13)} |`);
    if (!(stdP >= 0.6)) problems.push(`g=${g} ふつう + P ${pct(stdP)}`);
    // 上手 + 3 分の 2 は、ルアーでふつうの遊び方も当てやすくなる後半ほど差が小さい(オーナーが受け入れ:D-381)。線は川まで。
    if (g <= 15 && !(sk23 >= 0.6)) problems.push(`g=${g} 上手 + 2/3 ${pct(sk23)}`);
    if (!(std13 <= 0.65 && std13 <= std23 + 0.05)) problems.push(`g=${g} ふつう + 1/3 ${pct(std13)}`);
  }
  console.log(lines.join("\n"));
  assert.deepEqual(problems, []);
});

// くせ(D-381):合う装備(そのヌシに合わせて選ぶ)と、付け替えない装備(くせのないヌシに合わせて選ぶ)の勝率。
// 防御の壁は、貫通を付けないと越えられない(付け替えない装備は、合う装備より 2 割以上低い)。狭い命中範囲は、差が小さい(記録)。
test("ヌシのくせ:合う装備と、付け替えない装備の勝率(ふつう + P 回)", () => {
  const plain = unlimitedContent(makeContent(FISH_ROWS.map((r) => defineFish(r, { ...DEFAULT_CONFIG.formula, quirks: { ...DEFAULT_CONFIG.formula.quirks, byArea: [] } }))));
  const seeds = Array.from({ length: 10 }, (_, i) => (i + 1) * 11);
  const fights = [1, 2, 3, 4, 5, 6];
  const lines = ["| g | くせ | 合う装備 | 付け替えない装備 |", "| --- | --- | --- | --- |"];
  for (const g of [8, 13, 15]) {
    const rate = (sel) => {
      let wins = 0;
      for (const k of seeds) {
        const items = grownItems(sel, g, boss(g), k, { standard: STANDARD_PLAY });
        for (const f of fights) wins += fightOnce(CONTENT, g, items, boss(g), f, { standard: STANDARD_PLAY }).caught ? 1 : 0;
      }
      return wins / (seeds.length * fights.length);
    };
    const adapt = rate(UNLIMITED);
    const keep = rate(plain);
    const quirks = fishQuirks("boss", g);
    lines.push(`| ${g} | ${quirks.join("・")} | ${pct(adapt)} | ${pct(keep)} |`);
    if (quirks.includes("wall")) assert.ok(keep <= adapt - 0.2, lines.at(-1));
  }
  console.log(lines.join("\n"));
});

test("序盤:g=1〜2 の強い魚とヌシは、装備なしでも(上手に遊んで)制限時間のうちに倒せる", () => {
  for (const g of [1, 2]) {
    for (const id of [strong(g), boss(g)]) {
      const r = measure(CONTENT, g, [], id, Array.from({ length: 20 }, (_, i) => i + 1));
      assert.equal(r.winRate, 1, `${id}:装備なしの勝率 ${r.winRate}`);
    }
  }
});

test("強い魚:平均的な装備で倒せる。育てた装備では 1〜4 回前後(目安)", () => {
  const lines = [];
  for (const g of [1, 2, 5, 10, 20, 30]) {
    const avg = measure(CONTENT, g, averageItems(CONTENT, g), strong(g), FIGHT_SEEDS);
    const grown = median([11, 22, 33, 44, 55].map((k) => measure(CONTENT, g, grownItems(UNLIMITED, g, strong(g), k), strong(g), FIGHT_SEEDS).median));
    lines.push(`g=${g}:強い魚 平均的な装備 ${avg.median} 回(勝率 ${avg.winRate})・育てた装備 ${grown} 回`);
    assert.equal(avg.winRate, 1, `g=${g} 平均的な装備で倒せる`);
    assert.ok(grown <= 4, lines.at(-1));
  }
  console.log(lines.join("\n"));
});

/** 装備から、1 命中のダメージ(通常・クリティカルの段数ごと)と、会心率で重みづけた期待値を作る。 */
function damageRow(g, items) {
  const game = createGame(1, { content: CONTENT, progress: progressWith(g, items) });
  const stats = effectiveStats(game.combat, DEFAULT_CONFIG.formula);
  const limits = DEFAULT_CONFIG.combatLimits;
  const per = [0, 1, 2, 3].map((k) => hitDamage(stats, k, limits));
  // ジャストの初撃:基本のダメージ × ジャスト倍率(表 + ジャスト・ブースト、逓減つき:D-256)。
  const just = effectiveStats({ ...game.combat, justMultiplier: game.combat.justMultiplier + (game.triggers.just?.justMultiplier ?? 0) }, DEFAULT_CONFIG.formula).justMultiplier;
  const strike = Math.round(stats.damage * just);
  const whole = Math.floor(stats.critChance);
  const frac = stats.critChance - whole;
  const expected = hitDamage(stats, whole, limits) * (1 - frac) + hitDamage(stats, whole + 1, limits) * frac;
  return { per, expected, strike, chance: stats.critChance, mult: stats.critMultiplier, top: hitDamage(stats, limits.maxCritStages, limits) };
}

test("1 命中のダメージの差:育てた装備は平均的な装備の 100 倍以内、最強は 1000 倍以内、最強でも安全上限(10 億)に届かない", () => {
  const lines = ["| g | 装備 | 通常 / 1 段 / 2 段 / 3 段 | 会心率・倍率 | 期待値 | 初撃 | ヌシの命中回数 |"];
  for (const g of [1, 2, 5, 6, 10, 20, 30]) {
    const avg = averageItems(CONTENT, g);
    const grown = grownItems(UNLIMITED, g, boss(g), 11);
    const best = strongestItems(CONTENT, g, boss(g));
    const rows = [
      ["平均的", avg],
      ["育てた", grown],
      ["最強", best],
    ].map(([name, items]) => {
      const d = damageRow(g, items);
      const hits = measure(UNLIMITED, g, items, boss(g), FIGHT_SEEDS).median;
      lines.push(`| ${g} | ${name}(${skillSummary(items) || "スキルなし"}) | ${d.per.join(" / ")} | ${(d.chance * 100).toFixed(0)}%・${d.mult.toFixed(2)} 倍 | ${Math.round(d.expected)} | ${d.strike} | ${hits} |`);
      return d;
    });
    const [a, gr, b] = rows;
    assert.ok(gr.expected / a.expected <= 100, `g=${g} 育てた / 平均 = ${(gr.expected / a.expected).toFixed(1)}`);
    assert.ok(b.expected / a.expected <= 1000, `g=${g} 最強 / 平均 = ${(b.expected / a.expected).toFixed(1)}`);
    assert.ok(b.top < DEFAULT_CONFIG.combatLimits.maxHitDamage, `g=${g} 最強の最大ダメージ ${b.top}`);
  }
  console.log(lines.join("\n"));
});

test("会心率と会心威力の逓減:Lv1〜7 は線形(+15%・+0.05 倍)、8 からは増分がだんだん小さく、合計は増え続ける(単独で付けたとき)", () => {
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
      assert.ok(Math.abs(inc[0] - 0.15) < 1e-9 && Math.abs(inc[1] - 0.05) < 1e-9, `Lv${L} は線形`);
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
