// スキルの見せ方のテスト(スキルの画面・装備のカード・付け替えの差・CRITICAL ×n:②-4b の条件 10)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame } from "../src/core/fishing.js";
import { emptyGear } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { SKILL_ROWS } from "../src/core/skills.js";
import { critLabel } from "../src/ui/effects.js";
import { itemSkillLines, skillLevelChanges, skillRows } from "../src/ui/skill_view.js";
import { progressAt } from "./helpers.js";

const item = (id, kind, skills) => ({ id, kind, rarity: "legend", grade: 1, value: kind === "line" ? 500 : 3, skills });

function gameWith(stage, items, equipped) {
  const gear = { ...emptyGear(), seed: 1, items, equipped, nextId: 100 };
  return createGame(1, { progress: progressAt(stage, ROD_STEPS.NONE, { gear }) });
}

test("スキルの画面:表の順に全部。「Lv 2 / 3」、レベルの棒、効果、MAX の印、余り、内訳(装備ごとのレベル)、各レベルの効果", () => {
  const items = [
    item(1, "reel", [{ id: "power", level: 1 }, { id: "agility", level: 2 }]),
    item(2, "line", [{ id: "power", level: 1 }, { id: "agility", level: 2 }]),
    item(3, "lure", [{ id: "power", level: 2 }]),
  ];
  const game = gameWith(1, items, { reel: 1, line: 2 });
  const rows = skillRows(game);
  assert.deepEqual(rows.map((r) => r.name), SKILL_ROWS.map((s) => s.name));
  const power = rows.find((r) => r.id === "power");
  // 強打:装着中 Lv1 + Lv1 = Lv2。段階 1 の最大は 3。
  assert.equal(power.label, "Lv 2 / 3");
  assert.ok(Math.abs(power.progress - 2 / 3) < 1e-9);
  assert.equal(power.effect, "通常ダメージ +4");
  assert.equal(power.capped, false);
  assert.equal(power.growth, true);
  assert.equal(power.over, 0);
  assert.deepEqual(power.breakdown.map((b) => b.level), [1, 1], "装着していない装備は数えない");
  assert.deepEqual(power.levels.map((l) => l.effect), ["通常ダメージ +2", "通常ダメージ +4", "通常ダメージ +6"]);
  // 俊敏:Lv2 + Lv2 = 4 → 頭打ちの Lv3(余り 1)。MAX の印。
  const agility = rows.find((r) => r.id === "agility");
  assert.equal(agility.label, "Lv 3 / 3");
  assert.equal(agility.capped, true);
  assert.equal(agility.progress, 1);
  assert.equal(agility.over, 1);
  assert.equal(agility.effect, "待ち時間 −30%");
  // 付いていないスキル。
  const crit = rows.find((r) => r.id === "crit-rate");
  assert.equal(crit.label, "Lv 0 / 3");
  assert.equal(crit.effect, "効果なし");
  assert.deepEqual(crit.breakdown, []);
  assert.equal(rows.some((r) => r.id === "appraisal"), false, "目利きはない");
});

test("成長型の最大は竿の段階で伸びる(段階 5 で 7)", () => {
  const rows = skillRows(gameWith(5, [], {}));
  assert.equal(rows.find((r) => r.id === "power").max, 7);
  assert.equal(rows.find((r) => r.id === "insight").max, 3);
});

test("装備のカード:スキルの名前とレベル(最大 3 行。例:会心率 Lv2)", () => {
  const lines = itemSkillLines(item(1, "reel", [{ id: "crit-power", level: 1 }, { id: "recovery", level: 2 }]));
  assert.deepEqual(lines.map((l) => l.text), ["会心威力 Lv1", "回復の軽減 Lv2"]);
});

test("付け替えたときのスキルレベルの変化(例:会心率 Lv2 → Lv3)。外すときは下がる", () => {
  const items = [
    item(1, "reel", [{ id: "crit-rate", level: 2 }]),
    item(2, "reel", [{ id: "crit-rate", level: 3 }, { id: "power", level: 1 }]),
    item(3, "line", [{ id: "crit-rate", level: 1 }]),
  ];
  const game = gameWith(1, items, { reel: 1 });
  assert.deepEqual(skillLevelChanges(game, items[1]).map((c) => [c.text, c.up]), [
    ["強打 Lv0 → Lv1", true],
    ["会心率 Lv2 → Lv3", true],
  ]);
  assert.deepEqual(skillLevelChanges(game, items[0]).map((c) => c.text), ["会心率 Lv2 → Lv0"]);
  assert.deepEqual(skillLevelChanges(game, items[2]).map((c) => c.text), ["会心率 Lv2 → Lv3"], "足し合わせ");
  // 最大(段階 1 は Lv3)に届いていると、足してもレベルは変わらない(出さない)。
  const full = gameWith(1, [item(4, "reel", [{ id: "crit-rate", level: 3 }]), item(5, "line", [{ id: "crit-rate", level: 1 }])], { reel: 4 });
  assert.deepEqual(skillLevelChanges(full, full.progress.gear.items[1]), [], "レベルが変わらないものは出さない");
});

test("追加クリティカルの文字:2 段以上は「CRITICAL ×n!」", () => {
  assert.equal(critLabel(1), "CRITICAL!");
  assert.equal(critLabel(2), "CRITICAL ×2!");
  assert.equal(critLabel(5), "CRITICAL ×5!");
});
