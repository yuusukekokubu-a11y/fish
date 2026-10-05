// データ駆動のテスト(②-4b の条件 10):段階 6 と、装備の枠 7 つでも、スキル・保存・画面がそのまま動くか。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { defineFish, defineStage, FISH_ROWS, makeContent, STAGE_ROWS } from "../src/core/fish.js";
import { createGame } from "../src/core/fishing.js";
import { effectRange, emptyGear, EQUIP_KIND_ROWS, equipItem, makeCrates, pullCrate, RARITY_ROWS } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { decodeSaveCode, encodeSaveCode } from "../src/core/savecode.js";
import { pointsRange } from "../src/core/skills.js";
import { slotRows } from "../src/ui/gear_view.js";
import { skillRows } from "../src/ui/skill_view.js";
import { progressAt } from "./helpers.js";

const GACHA = DEFAULT_CONFIG.gacha;

function stage6Content() {
  const fish = [
    ...FISH_ROWS,
    { id: "kisu", name: "キス", kind: "weak", stage: 6, coins: 120, scales: 0, color: "#fefae0", size: 26 },
    {
      id: "kanpachi", name: "カンパチ", kind: "strong", stage: 6, coins: 600, scales: 1, color: "#bc6c25", size: 46,
      minigame: { sweepMs: 480, zoneWidth: 0.1, hp: 70, timeLimitMs: 13000 },
    },
    {
      id: "nushi-kanpachi", name: "ヌシ・カンパチ", kind: "boss", stage: 6, coins: 6000, scales: 1, color: "#7f4f24", size: 62,
      minigame: { sweepMs: 460, zoneWidth: 0.1, hp: 245, timeLimitMs: 55000 },
    },
  ];
  const stages = [...STAGE_ROWS, { stage: 6, craft: { scale: "kanpachi", count: 2 }, boss: "nushi-kanpachi", evolve: { count: 1 } }];
  return makeContent(fish.map(defineFish), stages.map(defineStage));
}

test("段階 6:成長型の最大は Lv8、グレード 6 の装備のポイントは段階 5 より大きく、保存とセーブコードで往復する", () => {
  const content = stage6Content();
  const crates = makeCrates(content, DEFAULT_CONFIG);
  const p = progressAt(6, ROD_STEPS.NONE, { coins: 1e9, gear: { ...emptyGear(), seed: 9 } });
  for (let i = 0; i < 10; i++) pullCrate(p, crates[5], 10, content.equipKinds, GACHA);
  const legend = p.gear.items.find((it) => it.rarity === "legend");
  assert.ok(legend);
  const pr6 = pointsRange("legend", 6, DEFAULT_CONFIG.skills);
  const pr5 = pointsRange("legend", 5, DEFAULT_CONFIG.skills);
  assert.ok(pr6.max > pr5.max);
  assert.ok(legend.skills.every((s) => s.points >= pr6.min && s.points <= pr6.max));
  equipItem(p.gear, legend.id);
  const game = createGame(1, { content, progress: p });
  assert.equal(skillRows(game).find((r) => r.id === "power").max, 8);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p, content), content), { ok: true, progress: p });
  assert.equal(decodeSaveCode(encodeSaveCode(p, content)).ok, false, "元の表には段階 6 がない");
});

test("装備の枠 7 つ:7 枠ぶんのポイントを足し、保存とセーブコードで往復し、画面の枠も 7 つ", () => {
  const extra = ["a", "b", "c", "d"].map((x) => ({
    id: `extra-${x}`,
    name: `枠${x}`,
    stat: "timeLimitBonusMs",
    base: { min: 100, max: 200 },
    step: 10,
    display: { label: "制限時間", scale: 1000, unit: " 秒" },
  }));
  const kinds = [...EQUIP_KIND_ROWS, ...extra];
  const content = makeContent(undefined, undefined, kinds);
  const items = kinds.map((k, i) => ({
    id: i + 1,
    kind: k.id,
    rarity: "rare",
    grade: 1,
    value: effectRange(k, RARITY_ROWS[1], 1, GACHA.gradeGrowth).min,
    skills: [{ id: "power", points: 2 }],
  }));
  const equipped = Object.fromEntries(items.map((it) => [it.kind, it.id]));
  const p = progressAt(5, ROD_STEPS.NONE, { gear: { ...emptyGear(), seed: 1, items, equipped, nextId: 8 } });
  const game = createGame(1, { content, progress: p });
  assert.equal(game.skills.power.points, 14, "7 枠 × 2 ポイント");
  assert.equal(game.skills.power.level, 3);
  assert.equal(slotRows(game, makeCrates(content, DEFAULT_CONFIG)).length, 7);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p, content), content), { ok: true, progress: p });
});
