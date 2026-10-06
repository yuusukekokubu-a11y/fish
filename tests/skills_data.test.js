// データ駆動のテスト(②-4b の条件 10):段階 6 と、装備の枠 7 つでも、スキル・保存・画面がそのまま動くか。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { makeContent } from "../src/core/fish.js";
import { createGame } from "../src/core/fishing.js";
import { effectRange, emptyGear, EQUIP_KIND_ROWS, equipItem, makeCrates, pullCrate, RARITY_ROWS } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { decodeSaveCode, encodeSaveCode } from "../src/core/savecode.js";
import { itemLevelRange, levelRange, skillById } from "../src/core/skills.js";
import { slotRows } from "../src/ui/gear_view.js";
import { skillRows } from "../src/ui/skill_view.js";
import { progressAt, riverContent } from "./helpers.js";

const GACHA = DEFAULT_CONFIG.gacha;

test("段階 11(川を足した表):成長型の最大は Lv13、グレード 11 の装備のレベルは範囲の中(頭打ち型は 1)で、保存とセーブコードで往復する", () => {
  const content = riverContent();
  const crates = makeCrates(content, DEFAULT_CONFIG);
  const p = progressAt(11, ROD_STEPS.NONE, { coins: 1e12, gear: { ...emptyGear(), seed: 9 } });
  for (let i = 0; i < 10; i++) pullCrate(p, crates[10], 10, content.equipKinds, GACHA);
  const legend = p.gear.items.find((it) => it.rarity === "legend");
  assert.ok(legend);
  const pr11 = levelRange("legend", 11, DEFAULT_CONFIG.skills);
  const pr10 = levelRange("legend", 10, DEFAULT_CONFIG.skills);
  assert.ok(pr11.max >= pr10.max);
  assert.ok(3 * pr11.max >= 13, "最大のレベルの装備 3 個で Lv13 に届く");
  for (const s of legend.skills) {
    const r = itemLevelRange(skillById(s.id), "legend", 11, DEFAULT_CONFIG.skills);
    assert.ok(s.level >= r.min && s.level <= r.max, `${s.id} Lv${s.level}`);
  }
  equipItem(p.gear, legend.id);
  const game = createGame(1, { content, progress: p });
  assert.equal(skillRows(game).find((r) => r.id === "power").max, 13);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p, content), content), { ok: true, progress: p });
  assert.equal(decodeSaveCode(encodeSaveCode(p, content)).ok, false, "元の表には段階 11 がない");
});

test("装備の枠 7 つ:7 枠ぶんのレベルを足し、保存とセーブコードで往復し、画面の枠も 7 つ", () => {
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
    skills: [{ id: "power", level: 1 }],
  }));
  const equipped = Object.fromEntries(items.map((it) => [it.kind, it.id]));
  const p = progressAt(5, ROD_STEPS.NONE, { gear: { ...emptyGear(), seed: 1, items, equipped, nextId: 8 } });
  const game = createGame(1, { content, progress: p });
  assert.equal(game.skills.power.total, 7, "7 枠 × Lv1");
  assert.equal(game.skills.power.level, 7, "段階 5 の最大 Lv7 にちょうど届く");
  assert.equal(slotRows(game, makeCrates(content, DEFAULT_CONFIG)).length, 7);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p, content), content), { ok: true, progress: p });
});
