// 持ち物の空きの警告と、スキルの画面のグループのテスト(②-4b4 の条件 6・7:D-216・D-217・D-221)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { createGame } from "../src/core/fishing.js";
import { emptyGear, makeCrates, pullCrate } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { SKILL_ROWS } from "../src/core/skills.js";
import { inventoryWarning, spaceWarnAt } from "../src/ui/gear_view.js";
import { SCREENS } from "../src/ui/screens.js";
import { SKILL_GROUPS, skillGroups } from "../src/ui/skill_view.js";
import { progressAt } from "./helpers.js";

/** 持ち物の上限(300)と、黄色の警告のしきい値(上限の 10% = 30:D-355)。 */
const MAX = DEFAULT_CONFIG.gacha.inventoryMax;
const WARN = 30;

const filler = (n) => Array.from({ length: n }, (_, i) => ({ id: i + 1, kind: "line", rarity: "normal", grade: 1, value: 500, skills: [] }));

function gameWithSpace(space, coins = 100000) {
  const items = filler(MAX - space);
  const gear = { ...emptyGear(), seed: 1, items, nextId: items.length + 1 };
  return createGame(1, { progress: progressAt(1, ROD_STEPS.NONE, { coins, gear }) });
}

test("上限 300・空き 31/30/10/9/1/0 の警告:黄(30 以下)・10 連を押せない・赤と装備へ。目次の「!」も同じ", () => {
  assert.deepEqual([MAX, spaceWarnAt(DEFAULT_CONFIG.gacha)], [300, WARN]);
  const badge = SCREENS.find((s) => s.id === "equipment").badge;
  const cases = [
    [WARN + 1, null, false, false],
    [WARN, "warn", false, false],
    [10, "warn", false, false],
    [9, "warn", true, false],
    [1, "warn", true, false],
    [0, "full", true, true],
  ];
  for (const [space, level, tenBlocked, oneBlocked] of cases) {
    const game = gameWithSpace(space);
    const w = inventoryWarning(game);
    assert.equal(w.left, space);
    assert.equal(w.level, level, `空き ${space}`);
    assert.equal(w.tenBlocked, tenBlocked, `空き ${space} の 10 連`);
    assert.equal(w.oneBlocked, oneBlocked, `空き ${space} の 1 回`);
    assert.equal(badge(game), level);
    assert.equal(w.text, level === "full" ? "持ち物がいっぱいです。分解して空きを作ってください" : level === "warn" ? "もうすぐいっぱいです" : "");
    assert.equal(w.tenNote, space >= 1 && space <= 9 ? "10 連には空き 10 個が必要です" : "");
  }
});

test("引けないときは、装備は増えず、ウロコインも減らない(空き 9 の 10 連・空き 0 の 1 回=300 個で止まる)。空き 9 の 1 回・空き 1 の 1 回は引ける(300 個ちょうどになる)", () => {
  for (const [space, count, ok] of [[9, 10, false], [0, 1, false], [9, 1, true], [10, 10, true], [1, 1, true]]) {
    const game = gameWithSpace(space);
    const crate = makeCrates(game.content, game.config)[0];
    const coins = game.progress.coins;
    const before = game.progress.gear.items.length;
    const r = pullCrate(game.progress, crate, count, game.content.equipKinds, game.config.gacha);
    assert.equal(r.ok, ok, `空き ${space}・${count} 回`);
    if (!ok) {
      assert.equal(r.reason, "space");
      assert.equal(game.progress.coins, coins);
      assert.equal(game.progress.gear.items.length, before);
    } else {
      assert.equal(game.progress.gear.items.length, before + count);
    }
  }
});

const skillGame = (items, equipped, skills = SKILL_ROWS) => {
  const gear = { ...emptyGear(), seed: 1, items, equipped, nextId: 50 };
  const game = createGame(1, { progress: progressAt(5, ROD_STEPS.NONE, { gear }) });
  game.content = { ...game.content, skills };
  return game;
};

test("スキルの画面は 数値型 10・条件発動型 8・ゲージ系 2 のグループ。見出しはレベル 1 以上の数", () => {
  const game = skillGame([], {});
  const groups = skillGroups(game);
  assert.deepEqual(groups.map((g) => [g.title, g.total]), [["数値型", 10], ["条件発動型", 8], ["ゲージ系", 2]]);
  assert.deepEqual(groups.flatMap((g) => g.rows.map((r) => r.id)).sort(), SKILL_ROWS.map((s) => s.id).sort());
  assert.deepEqual(groups.find((g) => g.id === "gauge").rows.map((r) => r.id), ["core", "edge"]);
  // スキルがなければ全部閉じる。
  assert.deepEqual(groups.map((g) => g.open), [false, false, false]);
  assert.deepEqual(groups.map((g) => g.count), [0, 0, 0]);
});

test("初めは、レベル 1 以上のスキルがあるグループだけ開く", () => {
  const items = [{ id: 1, kind: "reel", rarity: "legend", grade: 5, value: 20, skills: [{ id: "power", level: 2 }, { id: "edge", level: 1 }, { id: "fortune", level: 1 }] }];
  const groups = skillGroups(skillGame(items, { reel: 1 }));
  assert.deepEqual(groups.map((g) => [g.id, g.count, g.open]), [["numeric", 2, true], ["trigger", 0, false], ["gauge", 1, true]]);
  assert.equal(groups[0].label, "数値型(2 / 10)");
});

test("スキルの表に行を足すと、種類に合うグループに入る。グループの表に行を足すと、グループが増える", () => {
  const extra = [
    ...SKILL_ROWS,
    { ...SKILL_ROWS[0], id: "new-numeric", name: "新しい数値" },
    { ...SKILL_ROWS.find((s) => s.id === "momentum"), id: "new-trigger", name: "新しい条件" },
    { ...SKILL_ROWS.find((s) => s.id === "core"), id: "new-gauge", name: "新しい帯" },
  ];
  const groups = skillGroups(skillGame([], {}, extra));
  assert.deepEqual(groups.map((g) => g.total), [11, 9, 3]);
  assert.ok(groups.find((g) => g.id === "gauge").rows.some((r) => r.id === "new-gauge"));
  const more = [{ id: "growth", title: "成長型の数値", order: 0, match: (s) => s.target.kind !== "trigger" && s.type === "growth" }, ...SKILL_GROUPS];
  const four = skillGroups(skillGame([], {}), more);
  assert.deepEqual(four.map((g) => g.title), ["成長型の数値", "数値型", "条件発動型", "ゲージ系"]);
  assert.equal(four.reduce((n, g) => n + g.total, 0), SKILL_ROWS.length);
});
