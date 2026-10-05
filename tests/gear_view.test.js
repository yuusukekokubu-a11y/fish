// クレートタブと装備タブの中身のテスト(画面に触らない部分:D-151)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame } from "../src/core/fishing.js";
import { emptyGear, equipItem, makeCrates } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import {
  bulkDismantlePreview,
  crateCards,
  formatRate,
  inventoryLabel,
  inventoryRows,
  pullResultView,
  slotRows,
} from "../src/ui/gear_view.js";
import { progressAt } from "./helpers.js";

const item = (id, kind, rarity, grade, value) => ({ id, kind, rarity, grade, value, skills: [] });

function gameWith(stage, coins, items = [], equipped = {}) {
  const gear = { ...emptyGear(), seed: 1, items, equipped, nextId: items.length + 1 };
  return createGame(1, { progress: progressAt(stage, ROD_STEPS.NONE, { coins, gear }) });
}

test("クレートタブ:解放済みだけを段階の新しい順に。価格は 1 回と 10 連、足りないと引けない理由", () => {
  const game = gameWith(3, 100);
  const crates = makeCrates(game.content, game.config);
  const cards = crateCards(game, crates);
  assert.deepEqual(cards.map((c) => c.name), ["ブリのクレート", "スズキのクレート", "クロダイのクレート"]);
  assert.deepEqual(cards[0].price, { one: "110", ten: "1100" });
  assert.deepEqual(cards[0].blockers, { one: "coins", ten: "coins" });
  assert.deepEqual(cards[2].blockers, { one: null, ten: "coins" });
  assert.deepEqual(cards[0].rates.map((r) => r.rate), ["70%", "22%", "6.5%", "1.5%"]);
  assert.deepEqual(cards[2].kinds.map((k) => k.range), ["制限時間 +0.5〜+3.2 秒", "ダメージ +1〜+6", "外したあとの次の当たり +2〜+13"]);
  assert.equal(formatRate(15), "1.5%");
});

test("装備タブ:3 枠、持ち物の並べ替え、差と ▲、まとめて分解の見込み(装着中を除く)", () => {
  const items = [item(1, "reel", "normal", 1, 2), item(2, "reel", "epic", 3, 6), item(3, "line", "rare", 2, 1500), item(4, "reel", "normal", 1, 1)];
  const game = gameWith(3, 0, items);
  equipItem(game.progress.gear, 1);
  const crates = makeCrates(game.content, game.config);
  assert.deepEqual(slotRows(game, crates).map((s) => [s.kindName, s.item?.name ?? null]), [
    ["糸", null],
    ["リール", "クロダイのリール"],
    ["ルアー", null],
  ]);
  const byRarity = inventoryRows(game, crates, "rarity");
  assert.deepEqual(byRarity.map((v) => v.id), [2, 3, 1, 4]);
  assert.deepEqual(inventoryRows(game, crates, "new").map((v) => v.id), [4, 3, 2, 1]);
  const [epic, line, equipped, worse] = byRarity;
  assert.deepEqual([epic.better, epic.diff], [true, "+4"]);
  assert.deepEqual([line.better, line.diff, line.effect], [true, "+1.5 秒", "制限時間 +1.5 秒"]);
  assert.deepEqual([equipped.equipped, equipped.better, equipped.diff], [true, false, "±0"]);
  assert.deepEqual([worse.better, worse.diff, worse.diffSign], [false, "−1", -1]);
  assert.deepEqual(bulkDismantlePreview(game, crates, "normal"), { count: 1, coins: worse.refund });
  assert.equal(inventoryLabel(game), "持ち物 4 / 100");
});

test("引いた結果:一番良いレア度を強調し、▲ は引く前の装着と比べる", () => {
  const game = gameWith(1, 0, [item(1, "reel", "normal", 1, 2)], { reel: 1 });
  const crates = makeCrates(game.content, game.config);
  const result = pullResultView(game, [item(2, "reel", "normal", 1, 1), item(3, "reel", "rare", 1, 3), item(4, "lure", "normal", 1, 2)], crates);
  assert.equal(result.best, "rare");
  assert.deepEqual(result.items.map((v) => v.better), [false, true, true]);
});
