// 保存の版 4 とセーブコード FISH4 の、装備とガチャのまとまりのテスト(②-4a の受け入れ条件 11)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { emptyGear, EQUIP_KIND_ROWS, equipItem, makeCrates, pullCrate } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { initialProgress, parseSave, readSaveData, toSaveData } from "../src/core/save.js";
import { checksum, decodeSaveCode, encodeSaveCode } from "../src/core/savecode.js";
import { progressAt } from "./helpers.js";

const GACHA = DEFAULT_CONFIG.gacha;
const CRATES = makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG);

/** ガチャを何回か引いて、いくつか付けた進み具合。 */
function sample(pulls = 3) {
  const p = progressAt(5, ROD_STEPS.CRAFTED, {
    coins: 1e9,
    scales: { maguro: 2 },
    seen: ["aji"],
    gear: { ...emptyGear(), seed: 4242 },
  });
  for (let i = 0; i < pulls; i++) pullCrate(p, CRATES[i % 5], 10, EQUIP_KIND_ROWS, GACHA);
  for (const kind of ["line", "reel", "lure"]) {
    const item = p.gear.items.find((it) => it.kind === kind);
    if (item) equipItem(p.gear, item.id);
  }
  return p;
}

function codeWith(data, prefix = "FISH4") {
  const body = btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `${prefix}-${body}-${checksum(body)}`;
}

test("版 4 の保存とセーブコード(FISH4)は、往復で元に戻る", () => {
  for (const p of [progressAt(1), sample(1), sample(10)]) {
    assert.deepEqual(parseSave(JSON.stringify(toSaveData(p))), p);
    const code = encodeSaveCode(p);
    assert.match(code, /^FISH4-/);
    assert.deepEqual(decodeSaveCode(code), { ok: true, progress: p });
  }
});

test("版 1〜3 から版 4 に読み替えると、ウロコイン・鱗・竿の段階はそのまま、持ち物は空、引いた回数 0、種は未定", () => {
  const v1 = { version: 1, coins: 5, material: 2, rodStage: 2, seen: ["aji"] };
  const v2 = { version: 2, progress: { coins: 5, material: 2, rodStage: 2, seen: ["aji"] } };
  const v3 = { version: 3, progress: { coins: 7, scales: { suzuki: 3 }, rod: { stage: 2, step: "crafted" }, seen: ["aji"] } };
  for (const data of [v1, v2]) {
    assert.deepEqual(readSaveData(data), { ok: true, progress: progressAt(2, ROD_STEPS.NONE, { coins: 7, seen: ["aji"] }) });
  }
  const r = readSaveData(v3);
  assert.deepEqual(r, { ok: true, progress: progressAt(2, ROD_STEPS.CRAFTED, { coins: 7, scales: { suzuki: 3 }, seen: ["aji"] }) });
  assert.deepEqual(r.progress.gear, { items: [], equipped: {}, draws: 0, seed: null, nextId: 1 });
  assert.deepEqual(initialProgress().gear, emptyGear());
});

test("壊れた・範囲外・表にない種類やレア度・持ち物にない装着の番号を含むコードは拒否し、何も変えない", () => {
  const good = toSaveData(sample(2));
  const g = good.progress.gear;
  const item0 = g.items[0];
  const withGear = (over) => ({ ...good, progress: { ...good.progress, gear: { ...g, ...over } } });
  const withItem = (over) => withGear({ items: [{ ...item0, ...over }, ...g.items.slice(1)], equipped: {} });
  const bad = [
    withItem({ kind: "rod" }),
    withItem({ rarity: "mythic" }),
    withItem({ grade: 0 }),
    withItem({ grade: 6 }),
    withItem({ grade: 1.5 }),
    withItem({ value: 0 }),
    withItem({ value: 1e9 }),
    withItem({ value: "3" }),
    withItem({ id: 0 }),
    withItem({ id: g.items[1].id }),
    withItem({ skills: ["power-hit"] }),
    withItem({ skills: null }),
    withGear({ items: "x" }),
    withGear({ items: Array.from({ length: GACHA.inventoryMax + 1 }, (_, i) => ({ ...item0, id: i + 1 })), nextId: 9999 }),
    withGear({ equipped: { line: 99999 } }),
    withGear({ equipped: { glove: item0.id } }),
    withGear({ equipped: { [item0.kind === "line" ? "reel" : "line"]: item0.id } }),
    withGear({ equipped: [] }),
    withGear({ draws: -1 }),
    withGear({ seed: -1 }),
    withGear({ seed: 2 ** 32 }),
    withGear({ seed: "1" }),
    withGear({ nextId: item0.id }),
    withGear({ nextId: 0 }),
    { ...good, progress: { ...good.progress, gear: null } },
    { ...good, progress: { ...good.progress, gear: undefined } },
  ];
  for (const data of bad) {
    const result = decodeSaveCode(codeWith(data));
    assert.equal(result.ok, false, String(JSON.stringify(data.progress.gear)).slice(0, 120));
    assert.equal(result.error, "content");
    assert.deepEqual(parseSave(JSON.stringify(data)), initialProgress());
  }
  // 途中で切れたコードも拒否する。
  const code = encodeSaveCode(sample(2));
  for (const cut of [10, Math.floor(code.length / 2), code.length - 1]) assert.equal(decodeSaveCode(code.slice(0, cut)).ok, false);
});

test("FISH3 以前のコードも読める", () => {
  const v3 = { version: 3, progress: { coins: 1, scales: {}, rod: { stage: 1, step: "none" }, seen: [] } };
  assert.deepEqual(decodeSaveCode(codeWith(v3, "FISH3")), { ok: true, progress: progressAt(1, ROD_STEPS.NONE, { coins: 1 }) });
});

test("セーブコードの長さの見込み:持ち物が上限いっぱいでも、上限(4 万文字)の中", () => {
  const full = sample(GACHA.inventoryMax / 10);
  assert.equal(full.gear.items.length, GACHA.inventoryMax);
  const code = encodeSaveCode(full);
  assert.ok(code.length < 15000, `${code.length} 文字`);
  assert.deepEqual(decodeSaveCode(code), { ok: true, progress: full });
});
