// 重いテスト:グローブ(②-5b:D-333・D-334・D-337)。結果の表は報告に使う(console.log)。
// - 釣れるクレートの出現の間隔(上手に遊んで、条件を満たす間。目安 30〜40 分に 1 回)。
// - 自動合わせの放置の稼ぎ ÷ 上手に遊ぶ稼ぎ(目安 5 割以下)。
// - 育てた装備に各グローブを付けたときの、ヌシの命中回数(目標の半分を下回らない)。
//   戦闘は「上手」(真ん中で命中)と、3 回に 1 回は命中範囲のすぐ外を押す遊び方(グローブが効く場面)の 2 つ。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { DEFAULT_CONTENT } from "../../src/core/fish.js";
import { createGame, update } from "../../src/core/fishing.js";
import { bossHitTarget, stagePosition } from "../../src/core/formula.js";
import { GLOVE_ABILITY_ROWS } from "../../src/core/glove.js";
import { syntheticContent } from "../../src/core/synthetic.js";
import { averageItems, grownItems, measure, progressWith, skillSummary, strongestItems } from "./builds.js";
import { policyOf, SKILLED } from "./policy.js";

const HOUR = 3600000;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

test("釣れるクレート:上手に遊んで(条件を満たす間)、平均 30〜40 分に 1 回", () => {
  let crates = 0;
  let minutes = 0;
  const rows = [];
  for (const g of [1, 4, 7, 10]) {
    let n = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const p = progressWith(g, averageItems(DEFAULT_CONTENT, g));
      p.gear.seed = 5000 + seed * 17 + g;
      const game = createGame(seed * 31 + g, { progress: p });
      const policy = policyOf(SKILLED, seed);
      let shown = 0;
      for (let t = 0; t < 3 * HOUR; t += 16) {
        update(game, 16);
        policy(game);
        while (shown < game.results.length) if (game.results[shown++].crate) n += 1;
        // 保管がいっぱいにならないように、手に入れたグローブは数えたら捨てる(出現の条件をそろえる)。
        if (game.progress.gloves?.items.length) game.progress.gloves.items = [];
      }
    }
    rows.push(`| ${g} | ${n} | ${((10 * 180) / Math.max(1, n)).toFixed(1)} 分 |`);
    crates += n;
    minutes += 10 * 180;
  }
  const interval = minutes / crates;
  console.log([`出現率 ${DEFAULT_CONFIG.glove.crateChance}(弱い魚の投ごと)、各 3 時間 × 10 シード`, "| g | クレート | 間隔 |", ...rows, `全体の平均の間隔:${interval.toFixed(1)} 分`].join("\n"));
  assert.ok(interval >= 30 && interval <= 40, `${interval} 分`);
});

test("自動合わせの放置の稼ぎは、上手に遊ぶ稼ぎの 5 割以下(平均的な装備・レジェンド)", () => {
  const BIG = syntheticContent(100);
  const config = { ...DEFAULT_CONFIG, glove: { ...DEFAULT_CONFIG.glove, crateChance: 0 } };
  const perMin = (content, g, idle, seed) => {
    const gloves = idle ? { items: [{ id: 1, ability: "auto-hook", rarity: "legend", grade: g }], equipped: 1, nextId: 2, rolls: 0 } : null;
    const game = createGame(seed, { config, content, progress: progressWith(g, averageItems(content, g), gloves) });
    const policy = idle ? () => {} : policyOf(SKILLED, seed);
    for (let t = 0; t < HOUR; t += 16) {
      update(game, 16);
      policy(game);
    }
    return game.progress.coins / 60;
  };
  const lines = ["| g | 上手(ウロコイン/分) | 放置・自動合わせ | 比 |"];
  for (const [content, gs] of [
    [DEFAULT_CONTENT, [1, 5, 6, 10]],
    [BIG, [20, 50, 100]],
  ]) {
    for (const g of gs) {
      let a = 0;
      let b = 0;
      for (const s of [1, 2, 3]) {
        a += perMin(content, g, false, s);
        b += perMin(content, g, true, s);
      }
      lines.push(`| ${g} | ${(a / 3).toFixed(1)} | ${(b / 3).toFixed(1)} | ${(b / a).toFixed(2)} |`);
      assert.ok(b / a <= 0.5, lines.at(-1));
    }
  }
  console.log(lines.join("\n"));
});

test("育てた装備に各グローブ(レジェンド)を付けても、ヌシの命中回数は目標の半分を下回らない(ガチャの種 15 個の中央値)", () => {
  const CONTENT = syntheticContent(100);
  const GACHA_SEEDS = Array.from({ length: 15 }, (_, i) => (i + 1) * 11);
  const FIGHT_SEEDS = [1, 2, 3, 4, 5];
  const abilities = GLOVE_ABILITY_ROWS.map((a) => a.id);
  const lines = [`| g | s | 目標 | 遊び方 | なし | ${abilities.map((id) => GLOVE_ABILITY_ROWS.find((a) => a.id === id)?.name).join(" | ")} |`];
  for (const g of [1, 5, 10, 20, 50, 100]) {
    const boss = `s${g}-boss`;
    const builds = GACHA_SEEDS.map((gs) => grownItems(CONTENT, g, boss, gs * 1000 + g));
    for (const [label, missEvery] of /** @type {[string, number | undefined][]} */ ([
      ["上手", undefined],
      ["3 回に 1 回すぐ外", 3],
    ])) {
      const hitsWith = (ability) => {
        const gloves = ability ? { items: [{ id: 1, ability, rarity: "legend", grade: g }], equipped: 1, nextId: 2, rolls: 0 } : null;
        return median(builds.map((items) => measure(CONTENT, g, items, boss, FIGHT_SEEDS, { gloves, missEvery }).median));
      };
      const none = hitsWith(null);
      const withGlove = abilities.map((id) => hitsWith(id));
      lines.push(`| ${g} | ${stagePosition(g)} | ${bossHitTarget(g)} | ${label} | ${none} | ${withGlove.join(" | ")} |`);
      for (const [i, h] of withGlove.entries()) assert.ok(h >= bossHitTarget(g) / 2, `g=${g} ${label} ${abilities[i]}:${h} 回`);
    }
  }
  console.log(lines.join("\n"));
});

const legendGlove = (ability, g) => ({ items: [{ id: 1, ability, rarity: "legend", grade: g }], equipped: 1, nextId: 2, rolls: 0 });

test("ミスの多い遊び方への備え(記録):3 回に 1 回すぐ外を押す遊び方に合わせて選んだ育てた装備で、s=5 のヌシ(g=5・10・20)を倒せるか", () => {
  // 倒せないときは、原因を報告に書いて相談する(数値は変えない:D-339・D-344)。ここでは表を作るだけで、合否は付けない。
  const CONTENT = syntheticContent(100);
  const GACHA_SEEDS = Array.from({ length: 15 }, (_, i) => (i + 1) * 11);
  const FIGHT_SEEDS = [1, 2, 3, 4, 5];
  const lines = ["| g | 目標 | 体力 | 防御 | グローブ | 命中回数(中央値) | 勝率 | 倒せた装備 |"];
  for (const g of [5, 10, 20]) {
    const boss = `s${g}-boss`;
    const fish = CONTENT.byId.get(boss).minigame;
    const builds = GACHA_SEEDS.map((gs) => grownItems(CONTENT, g, boss, gs * 1000 + g, { missEvery: 3 }));
    for (const ability of [null, "insurance", "combo-keep", "graze"]) {
      const gloves = ability ? legendGlove(ability, g) : null;
      const runs = builds.map((items) => measure(CONTENT, g, items, boss, FIGHT_SEEDS, { gloves, missEvery: 3 }));
      const win = runs.reduce((a, r) => a + r.winRate, 0) / runs.length;
      const beaten = runs.filter((r) => Number.isFinite(r.median)).length;
      const name = ability ? GLOVE_ABILITY_ROWS.find((a) => a.id === ability)?.name : "なし";
      lines.push(`| ${g} | ${bossHitTarget(g)} | ${fish.hp} | ${Math.round(fish.defense * 1000) / 10}% | ${name} | ${median(runs.map((r) => r.median))} | ${(win * 100).toFixed(0)}% | ${beaten} / 15 |`);
    }
    // 倒せた装備の例(グローブなし)。
    const ok = builds.find((items) => Number.isFinite(measure(CONTENT, g, items, boss, FIGHT_SEEDS, { missEvery: 3 }).median));
    lines.push(`g=${g} 倒せた装備の例(グローブなし):${ok ? skillSummary(ok) : "なし"}`);
  }
  console.log(lines.join("\n"));
  assert.ok(lines.length > 3);
});

test("天井の参考(記録):最強の通常装備に各グローブ(レジェンド)を付けたときの、ヌシの命中回数", () => {
  const CONTENT = syntheticContent(100);
  const FIGHT_SEEDS = [1, 2, 3, 4, 5];
  const ids = GLOVE_ABILITY_ROWS.map((a) => a.id);
  const lines = [`| g | 遊び方 | なし | ${ids.map((id) => GLOVE_ABILITY_ROWS.find((a) => a.id === id)?.name).join(" | ")} |`];
  for (const g of [1, 5, 10, 20, 50, 100]) {
    const boss = `s${g}-boss`;
    const best = strongestItems(CONTENT, g, boss);
    for (const [label, missEvery] of /** @type {[string, number | undefined][]} */ ([
      ["上手", undefined],
      ["3 回に 1 回すぐ外", 3],
    ])) {
      const hits = (ability) => measure(CONTENT, g, best, boss, FIGHT_SEEDS, { gloves: ability ? legendGlove(ability, g) : null, missEvery }).median;
      lines.push(`| ${g} | ${label} | ${hits(null)} | ${ids.map((id) => hits(id)).join(" | ")} |`);
    }
  }
  console.log(lines.join("\n"));
  assert.ok(lines.length > 1);
});
