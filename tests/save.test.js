// 保存の形式のテスト(版 1〜4 → 版 5 の読み替え、壊れたデータ:②-3c の受け入れ条件 11・②-4a の受け入れ条件 11)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { createGame } from "../src/core/fishing.js";
import { COUNT_MAX, ROD_STEPS } from "../src/core/rod.js";
import { initialProgress, MIGRATIONS, migrate, parseSave, readSaveData, SAVE_VERSION, toSaveData } from "../src/core/save.js";
import { progressAt } from "./helpers.js";

const SAMPLE = progressAt(3, ROD_STEPS.CRAFTED, {
  coins: 123,
  scales: { kurodai: 2, buri: 1, "nushi-kurodai": 1 },
  seen: ["aji", "saba"],
});

test("保存の形は版 5:鱗は魚の id をキーにした表、竿は段階と工程、装備とガチャのまとまり", () => {
  assert.equal(SAVE_VERSION, 5);
  assert.deepEqual(toSaveData(SAMPLE), {
    version: 5,
    progress: {
      coins: 123,
      scales: { kurodai: 2, buri: 1, "nushi-kurodai": 1 },
      rod: { stage: 3, step: "crafted" },
      seen: ["aji", "saba"],
      gear: { items: [], equipped: [], draws: 0, seed: null, nextId: 1 },
    },
  });
});

test("保存して読むと、同じ値に戻る(全部の工程)", () => {
  assert.deepEqual(parseSave(JSON.stringify(toSaveData(SAMPLE))), SAMPLE);
  for (const step of [ROD_STEPS.NONE, ROD_STEPS.CRAFTED, ROD_STEPS.DEFEATED]) {
    const p = progressAt(2, step);
    assert.deepEqual(parseSave(JSON.stringify(toSaveData(p))), p);
  }
  const last = progressAt(DEFAULT_CONTENT.maxStage, ROD_STEPS.EVOLVED);
  assert.deepEqual(parseSave(JSON.stringify(toSaveData(last))), last);
});

test("版 2 から読むと、ウロコインと竿の段階はそのまま(段階 n の未製作)、前の素材は同じ数のウロコインに換える", () => {
  const v2 = { version: 2, progress: { coins: 50, material: 7, rodStage: 4, seen: ["aji", "kurodai"] } };
  assert.deepEqual(parseSave(JSON.stringify(v2)), progressAt(4, ROD_STEPS.NONE, { coins: 57, seen: ["aji", "kurodai"] }));
  // ウロコインの上限はこえない。
  const big = { version: 2, progress: { coins: COUNT_MAX, material: 10, rodStage: 1, seen: [] } };
  assert.equal(parseSave(JSON.stringify(big)).coins, COUNT_MAX);
});

test("版 1 から読むと、版 2・3・4 を経て版 5 になる", () => {
  const v1 = { version: 1, coins: 50, material: 7, rodStage: 2, seen: ["aji"] };
  assert.deepEqual(migrate(v1).version, 5);
  assert.deepEqual(readSaveData(v1), { ok: true, progress: progressAt(2, ROD_STEPS.NONE, { coins: 57, seen: ["aji"] }) });
  assert.deepEqual(Object.keys(MIGRATIONS), ["1", "2", "3", "4"], "版ごとの小さな関数");
});

test("保存したものからゲームを作ると、続きから遊べる(読んだものは書き換えない)", () => {
  const progress = parseSave(JSON.stringify(toSaveData(SAMPLE)));
  const game = createGame(1, { progress });
  assert.deepEqual(game.progress, SAMPLE);
  game.progress.coins = 999;
  game.progress.scales.kurodai = 0;
  assert.equal(progress.coins, 123);
  assert.equal(progress.scales.kurodai, 2);
});

test("表にない魚の鱗や id が残っていても、エラーにならず、消さずに持ち続ける", () => {
  const data = toSaveData(progressAt(1, ROD_STEPS.NONE, { scales: { "old-fish": 4, kurodai: 1 }, seen: ["old-fish", "aji", "aji"] }));
  const p = parseSave(JSON.stringify(data));
  assert.deepEqual(p.scales, { "old-fish": 4, kurodai: 1 });
  assert.deepEqual(p.seen, ["old-fish", "aji"], "重なりは除く");
});

test("壊れた・形のちがう・範囲外の保存データは、エラーにせず初めの状態にする", () => {
  const good = toSaveData(SAMPLE);
  const v3 = (over) => JSON.stringify({ version: 5, progress: { ...good.progress, ...over } });
  const broken = [
    null,
    undefined,
    "",
    "{",
    "null",
    "[]",
    "42",
    JSON.stringify({ version: 6, progress: good.progress }),
    JSON.stringify({ progress: good.progress }),
    JSON.stringify({ version: 5 }),
    JSON.stringify({ version: 5, progress: [] }),
    JSON.stringify({ version: 4, progress: [] }),
    JSON.stringify({ version: 3, progress: [] }),
    JSON.stringify({ version: 2, progress: { coins: -1, material: 0, rodStage: 1, seen: [] } }),
    JSON.stringify({ version: 2, progress: { coins: 1, material: 0, rodStage: 9, seen: [] } }),
    v3({ coins: -1 }),
    v3({ coins: 1.5 }),
    v3({ coins: COUNT_MAX + 1 }),
    v3({ scales: [] }),
    v3({ scales: { kurodai: -1 } }),
    v3({ scales: { kurodai: "3" } }),
    v3({ scales: { "Bad Id": 1 } }),
    v3({ rod: { stage: 0, step: "none" } }),
    v3({ rod: { stage: DEFAULT_CONTENT.maxStage + 1, step: "none" } }),
    v3({ rod: { stage: 2, step: "unknown" } }),
    v3({ rod: { stage: 2, step: "evolved" } }),
    v3({ rod: { stage: 2.5, step: "none" } }),
    v3({ rod: null }),
    v3({ seen: "aji" }),
    v3({ seen: [3] }),
  ];
  for (const text of broken) {
    assert.deepEqual(parseSave(text), initialProgress(), String(text).slice(0, 80));
  }
});

test("鱗の種類が多すぎるデータは拒否する(1000 種類まで)", () => {
  const scales = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`f${i}`, 1]));
  const text = JSON.stringify({ version: 3, progress: { coins: 0, scales, rod: { stage: 1, step: "none" }, seen: [] } });
  assert.deepEqual(parseSave(text), initialProgress());
  assert.deepEqual(parseSave(text), initialProgress());
});
