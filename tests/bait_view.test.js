// 餌と自動分解の見せ方のテスト(店・スイッチ・払い戻し・自動分解の文字:D-263・D-266・D-269)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame } from "../src/core/fishing.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { autoScrapChoices, autoScrapText, baitHud, REFUND_NOTE, refundMessage, shopView } from "../src/ui/bait_view.js";
import { SCREENS } from "../src/ui/screens.js";
import { progressAt } from "./helpers.js";

const gameAt = (stage, extra = {}) => createGame(1, { progress: progressAt(stage, ROD_STEPS.NONE, extra) });

test("店:画面の表に「店」がある。いまの段階の魚の名前の餌・価格・所持数/上限・一言", () => {
  assert.ok(SCREENS.some((s) => s.id === "shop" && s.title === "店"));
  const v = shopView(gameAt(1, { coins: 100, bait: 3 }));
  assert.deepEqual([v.name, v.price, v.priceText, v.countText, v.note], ["クロダイの餌", 4, "1 個 4", "3 / 99", REFUND_NOTE]);
  assert.deepEqual(
    v.buttons.map((b) => [b.count, b.label, b.cost, b.disabled]),
    [
      [1, "1 個", 4, false],
      [10, "10 個", 40, false],
      [25, "上限まで(25 個)", 100, false],
    ],
  );
});

test("店:ウロコインが足りない・上限のときは押せない(理由つき)", () => {
  const poor = shopView(gameAt(1, { coins: 7 }));
  assert.deepEqual(poor.buttons.map((b) => [b.disabled, b.reason]), [[false, null], [true, "coins"], [false, null]]);
  const broke = shopView(gameAt(1, { coins: 0 }));
  assert.deepEqual(broke.buttons.map((b) => b.reason), ["coins", "coins", "coins"]);
  const full = shopView(gameAt(1, { coins: 1e6, bait: 99 }));
  assert.deepEqual(full.buttons.map((b) => [b.disabled, b.reason]), [[true, "max"], [true, "max"], [true, "max"]]);
  assert.equal(full.buttons[2].label, "上限まで");
  const near = shopView(gameAt(1, { coins: 1e6, bait: 95 }));
  assert.deepEqual(near.buttons.map((b) => b.disabled), [false, true, false], "10 個は上限をこえる");
});

test("メイン画面:餌が 0 なら出さない。あれば所持数とスイッチの文字", () => {
  assert.equal(baitHud(gameAt(1)), null);
  assert.equal(baitHud(gameAt(1, { useBait: true })), null);
  assert.deepEqual(baitHud(gameAt(1, { bait: 12 })), { countText: "餌 12", on: false, switchText: "餌を使う:オフ" });
  assert.deepEqual(baitHud(gameAt(1, { bait: 12, useBait: true })), { countText: "餌 12", on: true, switchText: "餌を使う:オン" });
});

test("払い戻しの知らせと、自動分解の文字", () => {
  assert.equal(refundMessage({ count: 7, coins: 84 }), "餌 7 個を払い戻しました +84");
  assert.equal(refundMessage(null), "");
  assert.equal(refundMessage({ count: 0, coins: 0 }), "");
  assert.deepEqual(
    autoScrapChoices(gameAt(1, { autoScrap: "rare" })).map((c) => [c.label, c.selected]),
    [
      ["オフ", false],
      ["ノーマルまで", false],
      ["レアまで", true],
      ["エピックまで", false],
    ],
  );
  assert.equal(autoScrapChoices(gameAt(1)).find((c) => c.selected).id, "off");
  assert.equal(autoScrapText({ items: [1, 2, 3], coins: 120 }), "自動分解 3 個 +120");
  assert.equal(autoScrapText({ items: [], coins: 0 }), "");
});
