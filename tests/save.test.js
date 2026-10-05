// 保存の形式のテスト(受け入れ条件 9 の一部:版 1 から版 2 への読み替え)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { createGame } from "../src/core/fishing.js";
import { initialProgress, parseSave, readSaveData, SAVE_VERSION, toSaveData } from "../src/core/save.js";

const ROD = DEFAULT_CONFIG.rod;

test("保存の形は版 2 で、progress の下に進み具合を置く", () => {
  const progress = { coins: 123, material: 45, rodStage: 3, seen: ["aji", "saba"] };
  assert.equal(SAVE_VERSION, 2);
  assert.deepEqual(toSaveData(progress), { version: 2, progress });
});

test("保存して読むと、同じ値に戻る", () => {
  const progress = { coins: 123, material: 45, rodStage: 3, seen: ["aji", "saba"] };
  assert.deepEqual(parseSave(JSON.stringify(toSaveData(progress)), ROD), progress);
});

test("版 1 の保存データは、版 2 に読み替えて読める", () => {
  const v1 = { version: 1, coins: 50, material: 7, rodStage: 2, seen: ["aji", "kurodai"] };
  const expected = { coins: 50, material: 7, rodStage: 2, seen: ["aji", "kurodai"] };
  assert.deepEqual(parseSave(JSON.stringify(v1), ROD), expected);
  assert.deepEqual(readSaveData(v1, ROD), { ok: true, progress: expected });
  // 読み替えたものを保存し直すと版 2 になる。
  assert.equal(JSON.parse(JSON.stringify(toSaveData(parseSave(JSON.stringify(v1), ROD)))).version, 2);
});

test("保存したものからゲームを作ると、続きから遊べる", () => {
  const progress = parseSave(JSON.stringify(toSaveData({ coins: 5, material: 6, rodStage: 2, seen: [] })), ROD);
  const game = createGame(1, { progress });
  assert.deepEqual(game.progress, { coins: 5, material: 6, rodStage: 2, seen: [] });
  game.progress.coins = 999;
  assert.equal(progress.coins, 5, "読んだものは書き換えない");
});

test("壊れた・形のちがう保存データは、エラーにせず初めの状態にする", () => {
  const p = { coins: 1, material: 1, rodStage: 1, seen: [] };
  const v2 = (over) => JSON.stringify({ version: 2, progress: { ...p, ...over } });
  const broken = [
    null,
    undefined,
    "",
    "{",
    "null",
    "[]",
    "42",
    '"text"',
    JSON.stringify({ version: 3, progress: p }),
    JSON.stringify({ progress: p }),
    JSON.stringify({ version: 2 }),
    JSON.stringify({ version: 2, progress: [] }),
    JSON.stringify({ version: 1, coins: -1, material: 0, rodStage: 1, seen: [] }),
    v2({ coins: -1 }),
    v2({ coins: 1.5 }),
    v2({ coins: "10" }),
    v2({ material: null }),
    v2({ rodStage: 0 }),
    v2({ rodStage: 6 }),
    v2({ rodStage: 2.5 }),
    v2({ seen: "aji" }),
    v2({ seen: [3] }),
  ];
  for (const text of broken) {
    assert.deepEqual(parseSave(text, ROD), initialProgress(), String(text));
  }
});

test("知らない魚の id や重なりは捨てる", () => {
  const text = JSON.stringify({ version: 2, progress: { coins: 0, material: 0, rodStage: 1, seen: ["aji", "nazo", "aji"] } });
  assert.deepEqual(parseSave(text, ROD).seen, ["aji"]);
});

test("段階の境界(1 と上限)は読める", () => {
  for (const rodStage of [1, ROD.maxStage]) {
    const text = JSON.stringify(toSaveData({ coins: 0, material: 0, rodStage, seen: [] }));
    assert.equal(parseSave(text, ROD).rodStage, rodStage);
  }
});
