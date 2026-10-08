// 重いテスト:防御とヌシ戦の長さ(②-4c 防御、戦闘の調整の条件 4〜6:D-235・D-260・D-254・D-255・D-260)。
// 装備は builds.js:平均的な装備・育てた装備(各枠 N(g) 個から)・最強の装備。戦闘は「上手」(真ん中で命中、タップの間 250 ミリ秒以上)。
// 結果の表は報告に使う(console.log)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { effectiveStats, hitDamage } from "../../src/core/combat.js";
import { createGame } from "../../src/core/fishing.js";
import { bossHitTarget, fishDefense, softCurve, stagePosition } from "../../src/core/formula.js";
import { skillAmount, SKILL_ROWS } from "../../src/core/skills.js";
import { areaOfStage, areaPosition } from "../../src/core/areas.js";
import { DEFAULT_CONTENT, defineFish, FISH_ROWS, makeContent } from "../../src/core/fish.js";
import { syntheticContent } from "../../src/core/synthetic.js";
import { averageItems, fightOnce, grownItems, measure, progressWith, skillSummary, strongestItems } from "./builds.js";

const G_MAX = 100;
const CONTENT = syntheticContent(G_MAX);
// これまでのヌシの制限時間(係数を無限大にすると、上限=これまでの値:D-368)。命中回数は時間切れに左右されないよう、こちらで数える
// (体力を変えていないので、命中回数の表は変わらない)。勝率の前後の比べにも使う。
const OLD_FORMULA = { ...DEFAULT_CONFIG.formula, bossTimeLimitHitsRatio: Infinity };
const CONTENT_OLD = syntheticContent(G_MAX, OLD_FORMULA);
const REAL_OLD = makeContent(FISH_ROWS.map((r) => defineFish(r, OLD_FORMULA)));
const GACHA_SEEDS = Array.from({ length: 15 }, (_, i) => (i + 1) * 11);
const FIGHT_SEEDS = [1, 2, 3, 4, 5];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const boss = (g) => `s${g}-boss`;
const strong = (g) => `s${g}-strong`;

/** 育てた装備(ガチャの種 15 個:D-262)で戦う。各装備の 5 シードの中央値の、さらに中央値(これまでの制限時間で数える:D-368)。 */
function grownHits(g, fishId, options = {}) {
  const per = GACHA_SEEDS.map((gs) => measure(CONTENT_OLD, g, grownItems(CONTENT_OLD, g, fishId, gs * 1000 + g, options), fishId, FIGHT_SEEDS).median);
  return { median: median(per), per };
}

const HIT_GS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100];

test("ヌシの命中回数(育てた装備・貫通を含む):s=1 は 4〜7 回、s=5 は 10〜15 回、その間は少しずつ伸びる", () => {
  const lines = ["| g | s | 目標 | 体力 | 防御 | 育てた装備(ガチャの種 15 個:D-262)| 中央値 |"];
  /** @type {Record<number, number[]>} */
  const byS = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  /** @type {string[]} */
  const problems = [];
  for (const g of HIT_GS) {
    const s = stagePosition(g);
    const r = grownHits(g, boss(g));
    const m = CONTENT_OLD.byId.get(boss(g)).minigame;
    byS[s].push(r.median);
    lines.push(`| ${g} | ${s} | ${bossHitTarget(g)} | ${m.hp} | ${Math.round(m.defense * 1000) / 10}% | ${r.per.join("・")} | ${r.median} |`);
    // s=5 は 15 回まで(g=5 は D-260。ガチャの種を 15 個にして、ほかの g も 15 回が出るため:D-269)。
    const [lo, hi] = s === 1 ? [4, 7] : s === 5 ? [10, 15] : [4, 14];
    if (!(r.median >= lo && r.median <= hi)) problems.push(`g=${g} s=${s}:${r.median} 回`);
  }
  const means = [1, 2, 3, 4, 5].map((s) => byS[s].reduce((a, b) => a + b, 0) / byS[s].length);
  lines.push(`位置 s ごとの平均:${means.map((v, i) => `s=${i + 1} ${v.toFixed(1)}`).join("、")}`);
  console.log(lines.join("\n"));
  assert.deepEqual(problems, []);
  for (let i = 1; i < 5; i++) assert.ok(means[i] > means[i - 1], `s=${i + 1} の平均が s=${i} より多い`);
});

// 線は 6% 未満(ガチャの種を 15 個にして、g=10 が 5.7% になったため:D-269)。
test("磯の実データ(g=6〜10、ヌシ・メジナ〜ヌシ・クエ):s=1 は 4〜7 回、s=5 は 10〜15 回。s=5 は貫通なしで勝率 6% 未満。ガチャの運のぶれも出す(D-276)", () => {
  const ISO = DEFAULT_CONTENT;
  const bosses = ["nushi-mejina", "nushi-ishidai", "nushi-budai", "nushi-ishigakidai", "nushi-kue"];
  const lines = ["| g | 位置 s | ヌシ | 体力 | 防御 | 育てた装備(ガチャの種 15 個)| 中央値 | 最小〜最大 |"];
  bosses.forEach((id, i) => {
    const g = 6 + i;
    const s = areaPosition(ISO, g);
    // 命中回数は、これまでの制限時間で数える(D-368)。
    const per = GACHA_SEEDS.map((gs) => measure(REAL_OLD, g, grownItems(REAL_OLD, g, id, gs * 1000 + g), id, FIGHT_SEEDS).median);
    const m = median(per);
    const fish = ISO.byId.get(id);
    const finite = per.filter(Number.isFinite);
    lines.push(`| ${g} | ${s} | ${fish.name} | ${fish.minigame.hp} | ${Math.round(fish.minigame.defense * 1000) / 10}% | ${per.join("・")} | ${m} | ${Math.min(...finite)}〜${Math.max(...finite)}(倒せない種 ${per.length - finite.length}) |`);
    if (s === 1) assert.ok(m >= 4 && m <= 7, `${fish.name}:${m} 回`);
    if (s === 5) assert.ok(m >= 10 && m <= 15, `${fish.name}:${m} 回`);
  });
  // 5 体目(ヌシ・クエ)は貫通なしで倒せない。
  let wins = 0;
  let total = 0;
  for (const gs of GACHA_SEEDS) {
    const r = measure(ISO, 10, grownItems(ISO, 10, "nushi-kue", gs * 1000 + 10, { noPen: true }), "nushi-kue", Array.from({ length: 20 }, (_, i) => i + 1));
    wins += r.runs.filter((x) => x.caught).length;
    total += r.runs.length;
  }
  lines.push(`ヌシ・クエ:貫通なしの育てた装備の勝率 ${((wins / total) * 100).toFixed(1)}%(${wins} / ${total})`);
  console.log(lines.join("\n"));
  assert.ok(wins / total < 0.06);
});

/** 目安の外で、報告して相談中のヌシ(D-350)。s=1 の目安を 4〜7 回に広げたので、いまはない(D-351)。 */
const KNOWN_OUTSIDE = Object.freeze({});

// 川・沖・外洋・深海の本物の表(D-347・D-377):磯と同じ条件。報告に、命中回数と戦闘の時間の表を出す。
// 外洋・深海(g=21〜30)の s=5 の目安は 9〜19 回(依頼の条件:D-377)。
test("川・沖・外洋・深海の実データ(g=11〜30):s=1 は 4〜7 回、s=5 は 10〜15 回(外洋・深海は 9〜19 回)。s=5 は貫通なしで勝率 6% 未満。命中回数と時間の表", () => {
  const C = DEFAULT_CONTENT;
  /** @type {string[]} */
  const problems = [];
  const lines = ["| g | 釣り場 | s | ヌシ | 体力 | 防御 | 命中回数(中央値)| 最小〜最大 | 時間(秒・中央値)|", "| --- | --- | --- | --- | --- | --- | --- | --- | --- |"];
  for (let g = 11; g <= 30; g++) {
    const id = C.stageByNumber.get(g).boss;
    const s = areaPosition(C, g);
    // 命中回数と時間は、これまでの制限時間で数える(D-368)。
    const results = GACHA_SEEDS.map((gs) => measure(REAL_OLD, g, grownItems(REAL_OLD, g, id, gs * 1000 + g), id, FIGHT_SEEDS));
    const per = results.map((r) => r.median);
    const m = median(per);
    const ms = median(results.flatMap((r) => r.runs.filter((x) => x.caught).map((x) => x.ms)));
    const fish = C.byId.get(id);
    const finite = per.filter(Number.isFinite);
    lines.push(`| ${g} | ${areaOfStage(C, g).name} | ${s} | ${fish.name} | ${fish.minigame.hp} | ${Math.round(fish.minigame.defense * 1000) / 10}% | ${m} | ${Math.min(...finite)}〜${Math.max(...finite)}(倒せない種 ${per.length - finite.length}) | ${(ms / 1000).toFixed(1)} |`);
    const [lo, hi] = s === 1 ? [4, 7] : s === 5 ? (g > 20 ? [9, 19] : [10, 15]) : [4, 14];
    // 目安の外で、報告して相談中のもの(数値は勝手に変えない:D-350)。測った値が変わったら気づけるよう、値で固定する。
    if (KNOWN_OUTSIDE[id] !== undefined) assert.equal(m, KNOWN_OUTSIDE[id], `${fish.name}(相談中の外れ)`);
    else if (!(m >= lo && m <= hi)) problems.push(`${fish.name}(g=${g} s=${s}):${m} 回`);
  }
  for (const [g, id] of [[15, "nushi-itou"], [20, "nushi-kihada"], [25, "nushi-kuromaguro"], [30, "nushi-shiirakansu"]]) {
    let wins = 0;
    let total = 0;
    for (const gs of GACHA_SEEDS) {
      const r = measure(C, g, grownItems(C, g, id, gs * 1000 + g, { noPen: true }), id, Array.from({ length: 20 }, (_, i) => i + 1));
      wins += r.runs.filter((x) => x.caught).length;
      total += r.runs.length;
    }
    lines.push(`${C.byId.get(id).name}:貫通なしの育てた装備の勝率 ${((wins / total) * 100).toFixed(1)}%(${wins} / ${total})`);
    assert.ok(wins / total < 0.06, lines.at(-1));
  }
  console.log(lines.join("\n"));
  assert.deepEqual(problems, []);
});

/**
 * 育てた装備の、ヌシの勝率の前後(D-366・D-368)。装備は、これまでの制限時間で選ぶ(命中回数が最も少ないもの)。
 * 同じ装備で、これまでの制限時間(前)と、新しい制限時間(後)で戦う。rarities ならそのレア度だけ。
 */
function winRates(g, options = {}) {
  let before = 0;
  let after = 0;
  let total = 0;
  for (const gs of GACHA_SEEDS) {
    const items = grownItems(CONTENT_OLD, g, boss(g), gs * 1000 + g, options);
    before += measure(CONTENT_OLD, g, items, boss(g), FIGHT_SEEDS).runs.filter((x) => x.caught).length;
    after += measure(CONTENT, g, items, boss(g), FIGHT_SEEDS).runs.filter((x) => x.caught).length;
    total += FIGHT_SEEDS.length;
  }
  return { before: before / total, after: after / total };
}

const pct = (r) => `${(r * 100).toFixed(1)}%`;
const WIN_GS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 50, 100];

/**
 * 目安の外で、報告して相談中のもの(数値は勝手に変えない:D-366・D-368)。測った値が変わったら気づけるよう、値で固定する。
 * 育てた装備(貫通を含む):後の勝率が 80% を下回る g。ノーマルとレアだけ:後の勝率が 5% 以上の g(g=3 以降)。
 */
const GROWN_BELOW = Object.freeze({});
// ノーマルとレアだけで 5% 以上勝てる g(後の勝率 %。小数 1 けた)。s=1〜2 は下限 8 秒と糸・粘りの延長のうちに届く。s=3〜4 も多くは届く(D-368)。
const NR_OVER = Object.freeze({ 3: 100, 4: 60, 5: 20, 6: 100, 7: 100, 8: 82.7, 9: 92, 11: 100, 12: 100, 13: 100, 14: 74.7, 16: 100, 17: 100, 18: 100, 19: 90.7, 100: 13.3 });

// 育てた装備の勝率の前後(依頼の基準:後が 80% を下回るなら、数値を変えずに相談)。
test("育てた装備(貫通を含む):ヌシの勝率の前後の表(g=1〜20・50・100)。後が 80% 未満のものは相談中として固定", () => {
  const lines = ["| g | s | 制限時間(前 → 後) | 勝率(前) | 勝率(後) |", "| --- | --- | --- | --- | --- |"];
  /** @type {string[]} */
  const problems = [];
  for (const g of WIN_GS) {
    const r = winRates(g);
    lines.push(`| ${g} | ${stagePosition(g)} | ${(CONTENT_OLD.byId.get(boss(g)).minigame.timeLimitMs / 1000).toFixed(1)} → ${(CONTENT.byId.get(boss(g)).minigame.timeLimitMs / 1000).toFixed(1)} 秒 | ${pct(r.before)} | ${pct(r.after)} |`);
    if (GROWN_BELOW[g] !== undefined) assert.equal(Math.round(r.after * 1000) / 10, GROWN_BELOW[g], `g=${g}(相談中)`);
    else if (r.after < 0.8) problems.push(`g=${g}:${pct(r.after)}`);
  }
  console.log(lines.join("\n"));
  assert.deepEqual(problems, []);
});

// ノーマルとレアだけ(D-353・D-366):各枠で T(g) の候補から、ノーマルとレアの最良を選ぶ。目標は g=3 以降のヌシに勝つ確率 5% 未満。
test("ノーマルとレアだけの育てた装備:ヌシの勝率の前後の表(g=3 以降の目標は 5% 未満。届かないものは相談中として固定)", () => {
  const lines = ["| g | s | 制限時間(後) | 勝率(前) | 勝率(後) |", "| --- | --- | --- | --- | --- |"];
  /** @type {string[]} */
  const problems = [];
  for (const g of WIN_GS.filter((x) => x >= 3)) {
    const r = winRates(g, { rarities: ["normal", "rare"] });
    lines.push(`| ${g} | ${stagePosition(g)} | ${(CONTENT.byId.get(boss(g)).minigame.timeLimitMs / 1000).toFixed(1)} 秒 | ${pct(r.before)} | ${pct(r.after)} |`);
    if (NR_OVER[g] !== undefined) assert.equal(Math.round(r.after * 1000) / 10, NR_OVER[g], `g=${g}(相談中)`);
    else if (r.after >= 0.05) problems.push(`g=${g}:${pct(r.after)}`);
  }
  console.log(lines.join("\n"));
  assert.deepEqual(problems, []);
});

test("貫通必須:s=5 のヌシは、貫通なしの育てた装備で、制限時間のうちに倒せる確率が 6% 未満", () => {
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
    assert.ok(wins / total < 0.06, lines.at(-1));
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
  // ジャストの初撃(防御で減らす前):基本のダメージ × ジャスト倍率(表 + ジャスト・ブースト、逓減つき:D-256)。
  const just = effectiveStats({ ...game.combat, justMultiplier: game.combat.justMultiplier + (game.triggers.just?.justMultiplier ?? 0) }, DEFAULT_CONFIG.formula).justMultiplier;
  const strike = Math.round(stats.damage * just);
  const whole = Math.floor(stats.critChance);
  const frac = stats.critChance - whole;
  const expected = hitDamage(stats, whole, limits) * (1 - frac) + hitDamage(stats, whole + 1, limits) * frac;
  return { per, expected, strike, chance: stats.critChance, mult: stats.critMultiplier, top: hitDamage(stats, limits.maxCritStages, limits) };
}

test("1 命中のダメージの差:育てた装備は平均的な装備の 100 倍以内、最強は 1000 倍以内、最強でも安全上限(10 億)に届かない", () => {
  const lines = ["| g | 装備 | 通常 / 1 段 / 2 段 / 3 段 | 会心率・倍率 | 期待値 | 初撃 | ヌシの命中回数 |"];
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
