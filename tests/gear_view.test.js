// クレートと装備の画面の中身のテスト(画面に触らない部分:D-162)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame } from "../src/core/fishing.js";
import { emptyGear, equipItem, makeCrates } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import {
  bulkDismantlePreview,
  bulkDismantleRows,
  crateCards,
  formatRate,
  inventoryLabel,
  inventoryRows,
  inventorySpaceLabel,
  pullResultView,
  rarityStars,
  slotRows,
} from "../src/ui/gear_view.js";
import { progressAt } from "./helpers.js";

const item = (id, kind, rarity, grade, value) => ({ id, kind, rarity, grade, value, skills: [] });

function gameWith(stage, coins, items = [], equipped = {}) {
  const gear = { ...emptyGear(), seed: 1, items, equipped, nextId: items.length + 1 };
  return createGame(1, { progress: progressAt(stage, ROD_STEPS.NONE, { coins, gear }) });
}

test("クレートの画面:解放済みだけを段階の新しい順に。価格は 1 回と 10 連、足りないと引けない理由", () => {
  const game = gameWith(3, 10);
  const crates = makeCrates(game.content, game.config);
  const cards = crateCards(game, crates);
  assert.deepEqual(cards.map((c) => c.name), ["ヒラメのクレート", "スズキのクレート", "クロダイのクレート"]);
  assert.deepEqual(cards[0].price, { one: "17", ten: "170" });
  assert.deepEqual(cards[0].blockers, { one: "coins", ten: "coins" });
  assert.deepEqual(cards[2].blockers, { one: null, ten: "coins" });
  assert.deepEqual(cards[0].rates.map((r) => r.rate), ["70%", "22%", "6.5%", "1.5%"]);
  assert.deepEqual(cards[2].kinds.map((k) => k.range), [
    "制限時間 +0.5〜+3.2 秒",
    "ダメージ +1〜+6",
    "命中範囲 +5〜+24%",
    "ウロコイン +4.9〜+18%",
    "合わせの帯 +8.6〜+26.7%",
  ]);
  assert.equal(formatRate(15), "1.5%");
});

test("装備の画面:ガチャの 5 枠(お守りは別:D-392)、持ち物の並べ替え、差と ▲、まとめて分解の見込み(装着中を除く)", () => {
  const items = [item(1, "reel", "normal", 1, 2), item(2, "reel", "epic", 3, 6), item(3, "line", "rare", 2, 1500), item(4, "reel", "normal", 1, 1)];
  const game = gameWith(3, 0, items);
  equipItem(game.progress.gear, 1);
  const crates = makeCrates(game.content, game.config);
  assert.deepEqual(slotRows(game, crates).map((s) => [s.kindName, s.item?.name ?? null]), [
    ["糸", null],
    ["リール", "クロダイのリール"],
    ["ルアー", null],
    ["おもり", null],
    ["浮き", null],
  ]);
  const byRarity = inventoryRows(game, crates, "rarity");
  assert.deepEqual(byRarity.map((v) => v.id), [2, 3, 1, 4]);
  assert.deepEqual(inventoryRows(game, crates, "new").map((v) => v.id), [4, 3, 2, 1]);
  const [epic, line, equipped, worse] = byRarity;
  assert.deepEqual([epic.better, epic.diff], [true, "+4"]);
  assert.deepEqual([line.better, line.diff, line.effect], [true, "+1.5 秒", "制限時間 +1.5 秒"]);
  assert.deepEqual([equipped.equipped, equipped.better, equipped.diff], [true, false, "±0"]);
  assert.deepEqual([worse.better, worse.diff, worse.diffSign], [false, "−1", -1]);
  assert.deepEqual(bulkDismantlePreview(game, crates, "normal"), { count: 1, coins: worse.refund, locked: 0 });
  assert.equal(inventoryLabel(game), "持ち物 4 / 300");
});

test("引いた結果:一番良いレア度を強調し、▲ は引く前の装着と比べる", () => {
  const game = gameWith(1, 0, [item(1, "reel", "normal", 1, 2)], { reel: 1 });
  const crates = makeCrates(game.content, game.config);
  const result = pullResultView(game, [item(2, "reel", "normal", 1, 1), item(3, "reel", "rare", 1, 3), item(4, "lure", "normal", 1, 2)], crates);
  assert.equal(result.best, "rare");
  assert.deepEqual(result.items.map((v) => v.better), [false, true, true]);
});

test("レア度は色と★で表す(色だけに頼らない:D-154)", () => {
  assert.deepEqual(["normal", "rare", "epic", "legend"].map(rarityStars), ["★", "★★", "★★★", "★★★★"]);
  const game = gameWith(1, 0, [item(1, "reel", "epic", 1, 3)]);
  const crates = makeCrates(game.content, game.config);
  const [v] = inventoryRows(game, crates, "rarity");
  assert.deepEqual([v.stars, v.rarity], ["★★★", "エピック"]);
  assert.deepEqual(crateCards(game, crates)[0].rates.map((r) => r.stars), ["★", "★★", "★★★", "★★★★"]);
});

test("持ち物の空き(「あと n 個」)と、種類での絞り込み、まとめて分解の一覧", () => {
  const items = [item(1, "reel", "normal", 1, 2), item(2, "line", "normal", 1, 500), item(3, "line", "rare", 1, 1000)];
  const game = gameWith(1, 0, items);
  const crates = makeCrates(game.content, game.config);
  assert.equal(inventorySpaceLabel(game), "持ち物 あと 297 個");
  assert.deepEqual(inventoryRows(game, crates, "new", "line").map((v) => v.id), [3, 2]);
  assert.deepEqual(inventoryRows(game, crates, "new", null).map((v) => v.id), [3, 2, 1]);
  equipItem(game.progress.gear, 1);
  const rows = bulkDismantleRows(game, crates);
  assert.deepEqual(rows.map((r) => [r.id, r.stars, r.count]), [
    ["normal", "★", 1],
    ["rare", "★★", 1],
    ["epic", "★★★", 0],
    ["legend", "★★★★", 0],
  ]);
  const full = gameWith(1, 0, Array.from({ length: 300 }, (_, i) => item(i + 1, "reel", "normal", 1, 1)));
  assert.equal(inventorySpaceLabel(full), "持ち物がいっぱいです");
});

test("スキルの欄は最大 3 行(名前とレベル)。スキルなしは空", () => {
  const skills = [
    { id: "power", level: 1 },
    { id: "crit-rate", level: 2 },
    { id: "insight", level: 1 },
  ];
  const game = gameWith(1, 0, [{ ...item(1, "reel", "legend", 1, 2), skills }, item(2, "reel", "normal", 1, 1)]);
  const crates = makeCrates(game.content, game.config);
  const views = inventoryRows(game, crates, "new");
  assert.deepEqual(views.find((v) => v.id === 1).skills.map((s) => s.text), ["強打 Lv1", "会心率 Lv2", "見極め Lv1"]);
  assert.deepEqual(views.find((v) => v.id === 2).skills, []);
});

test("クレートの排出率に、レア度ごとのスキルの数を出す", () => {
  const game = gameWith(1, 0);
  const cards = crateCards(game, makeCrates(game.content, game.config));
  assert.deepEqual(cards[0].rates.map((r) => r.skillsText), ["スキルなし", "スキル 1 つ", "スキル 2 つ", "スキル 3 つ"]);
});
