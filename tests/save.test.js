// 保存の形式のテスト(受け入れ条件 8)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { createGame } from "../src/core/fishing.js";
import { initialProgress, parseSave, SAVE_VERSION, toSaveData } from "../src/core/save.js";

const ROD = DEFAULT_CONFIG.rod;

test("保存して読むと、同じ値に戻る", () => {
  const progress = { coins: 123, material: 45, rodStage: 3, seen: ["aji", "saba"] };
  const text = JSON.stringify(toSaveData(progress));
  assert.deepEqual(JSON.parse(text).version, SAVE_VERSION);
  assert.deepEqual(parseSave(text, ROD), progress);
});

test("保存したものからゲームを作ると、続きから遊べる", () => {
  const progress = parseSave(JSON.stringify(toSaveData({ coins: 5, material: 6, rodStage: 2, seen: [] })), ROD);
  const game = createGame(1, { progress });
  assert.deepEqual(game.progress, { coins: 5, material: 6, rodStage: 2, seen: [] });
  game.progress.coins = 999;
  assert.equal(progress.coins, 5, "読んだものは書き換えない");
});

test("壊れた・形のちがう保存データは、エラーにせず初めの状態にする", () => {
  const good = { version: SAVE_VERSION, coins: 1, material: 1, rodStage: 1, seen: [] };
  const broken = [
    null,
    undefined,
    "",
    "{",
    "null",
    "[]",
    "42",
    '"text"',
    JSON.stringify({ ...good, version: 2 }),
    JSON.stringify({ ...good, version: undefined }),
    JSON.stringify({ ...good, coins: -1 }),
    JSON.stringify({ ...good, coins: 1.5 }),
    JSON.stringify({ ...good, coins: "10" }),
    JSON.stringify({ ...good, material: null }),
    JSON.stringify({ ...good, rodStage: 0 }),
    JSON.stringify({ ...good, rodStage: 6 }),
    JSON.stringify({ ...good, rodStage: 2.5 }),
    JSON.stringify({ ...good, seen: "aji" }),
  ];
  for (const text of broken) {
    assert.deepEqual(parseSave(text, ROD), initialProgress(), String(text));
  }
});

test("知らない魚の id や重なりは捨てる", () => {
  const text = JSON.stringify({ version: SAVE_VERSION, coins: 0, material: 0, rodStage: 1, seen: ["aji", "nazo", 3, "aji"] });
  assert.deepEqual(parseSave(text, ROD).seen, ["aji"]);
});

test("段階の境界(1 と上限)は読める", () => {
  for (const rodStage of [1, ROD.maxStage]) {
    const text = JSON.stringify({ version: SAVE_VERSION, coins: 0, material: 0, rodStage, seen: [] });
    assert.equal(parseSave(text, ROD).rodStage, rodStage);
  }
});
