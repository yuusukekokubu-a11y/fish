// ドロワーメニューのタブの中身のテスト(受け入れ条件 4・5・6、D-130・D-135)。
// 中身を作る部品は画面に触らないので、ブラウザなしで確かめられる。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { craftGameRod, createGame } from "../src/core/fishing.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { hasObtainedScale, materialsView, MENU_TABS, STATUS_ITEMS, statusView } from "../src/ui/menu_tabs.js";
import { progressAt } from "./helpers.js";

const rowsOf = (view) => view.sections.flatMap((s) => s.rows);

test("タブは表で定義され、素材・ステータス・設定の 3 つ。どれも中身を作る部品を 1 つ持つ", () => {
  assert.deepEqual(
    MENU_TABS.map((t) => [t.id, t.name]),
    [
      ["materials", "素材"],
      ["status", "ステータス"],
      ["settings", "設定"],
    ],
  );
  for (const t of MENU_TABS) assert.equal([t.view, t.mount].filter((f) => typeof f === "function").length, 1, t.id);
});

test("素材タブ:鱗を段階の順に並べ、未入手は「?」で名前と詳細を隠す", () => {
  const game = createGame(1, { progress: progressAt(2, ROD_STEPS.NONE, { scales: { kurodai: 2, "nushi-kurodai": 1 }, seen: ["aji", "kurodai", "nushi-kurodai"] }) });
  const view = materialsView({ game });
  assert.deepEqual(view.sections.map((s) => s.title), ["段階 1", "段階 2", "段階 3", "段階 4", "段階 5"]);
  const rows = rowsOf(view);
  assert.equal(rows.length, 10, "強い魚とヌシの鱗(弱い魚は鱗を落とさない)");
  assert.deepEqual(rows.slice(0, 3).map((r) => [r.label, r.value]), [
    ["クロダイの鱗", "2"],
    ["ヌシ・クロダイの鱗", "1"],
    ["?", ""],
  ]);
  for (const r of rows.slice(2)) {
    assert.deepEqual(r, { label: "?", value: "", detail: null }, "名前と詳細を隠す");
  }
});

test("素材タブの詳細:入手元の魚と使い道(魚と段階の表から作る)", () => {
  const game = createGame(1, { progress: progressAt(1, ROD_STEPS.NONE, { scales: { kurodai: 1, "nushi-kurodai": 0 } }) });
  const [kurodai, nushi] = rowsOf(materialsView({ game }));
  assert.deepEqual(kurodai.detail, [
    ["入手元", "クロダイ(段階 1 の強い魚)"],
    ["使い道", "クロダイの釣竿の製作に使う(3 枚)"],
  ]);
  assert.deepEqual(nushi.detail, [
    ["入手元", "ヌシ・クロダイ(段階 1 のヌシ)"],
    ["使い道", "ヌシ・クロダイの釣竿への進化に使う(1 枚)"],
  ]);
});

test("使って 0 枚になっても、一度手に入れた鱗は名前を出す", () => {
  const game = createGame(1, { progress: progressAt(1, ROD_STEPS.NONE, { scales: { kurodai: 3 }, seen: ["kurodai"] }) });
  assert.equal(craftGameRod(game), true);
  assert.equal(game.progress.scales.kurodai, 0);
  const [kurodai] = rowsOf(materialsView({ game }));
  assert.deepEqual([kurodai.label, kurodai.value], ["クロダイの鱗", "0"]);
  // 釣れた記録だけあっても(古い保存など)、入手済みとみなす。
  assert.equal(hasObtainedScale({ seen: ["suzuki"], scales: {} }, "suzuki"), true);
  assert.equal(hasObtainedScale({ seen: [], scales: {} }, "suzuki"), false);
});

test("素材タブの数は短く出す", () => {
  const game = createGame(1, { progress: progressAt(1, ROD_STEPS.NONE, { scales: { kurodai: 123456789 } }) });
  assert.equal(rowsOf(materialsView({ game }))[0].value, "1.2億");
});

test("ステータスタブ:竿の名前と段階、戦闘の数値の表から作った値", () => {
  const game = createGame(1, { progress: progressAt(2, ROD_STEPS.CRAFTED) });
  const view = statusView({ game });
  assert.equal(view.header, "スズキの釣竿(段階 2)");
  assert.deepEqual(rowsOf(view).map((r) => [r.label, r.value]), [
    ["通常ダメージ", "10"],
    ["クリティカルの確率", "10%"],
    ["クリティカルの倍率", "2 倍"],
    ["ジャストの倍率", "1.5 倍"],
    ["外したときの回復", "10"],
    ["制限時間の増減", "+0 秒"],
    ["合わせの成功帯(強い魚)", "0.4 秒"],
    ["ジャスト帯(強い魚)", "0.14 秒"],
  ]);
  assert.equal(rowsOf(view).length, STATUS_ITEMS.length);
});

test("ステータスタブ:戦闘の数値の表を書き換えると、表示も変わる(基本の値は詳細に残る)", () => {
  const combat = {
    ...DEFAULT_CONFIG.combat,
    damage: 13,
    critChance: 0.255,
    critMultiplier: 2.5,
    missHeal: 4,
    timeLimitBonusMs: 1500,
    hook: { ...DEFAULT_CONFIG.combat.hook, justMultiplier: 2, strong: { ringMs: 1200, successMs: 500, justMs: 200 } },
  };
  const game = createGame(1, { combat });
  const rows = rowsOf(statusView({ game }));
  assert.deepEqual(rows.map((r) => r.value), ["13", "25.5%", "2.5 倍", "2 倍", "4", "+1.5 秒", "0.5 秒", "0.2 秒"]);
  assert.deepEqual(rows[0].detail, [
    ["今の値", "13"],
    ["基本の値", "10"],
  ]);
  // マイナスの増減。
  const minus = createGame(1, { combat: { ...DEFAULT_CONFIG.combat, timeLimitBonusMs: -2000 } });
  assert.equal(rowsOf(statusView({ game: minus }))[5].value, "−2 秒");
});
