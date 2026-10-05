// 素材とステータスの画面の中身のテスト(D-130・D-152・D-163)。
// 中身を作る部品は画面に触らないので、ブラウザなしで確かめられる。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { craftGameRod, createGame } from "../src/core/fishing.js";
import { emptyGear } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { critStageText, hasObtainedScale, materialsView, STATUS_ITEMS, STATUS_SECTIONS, statusView } from "../src/ui/screen_views.js";
import { progressAt } from "./helpers.js";

const rowsOf = (view) => view.sections.flatMap((s) => s.rows);

test("素材の画面:鱗を段階の順に並べ、未入手は「?」で名前と詳細を隠す", () => {
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

test("素材の画面の詳細:入手元の魚と使い道(魚と段階の表から作る)", () => {
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

test("素材の画面の数は短く出す", () => {
  const game = createGame(1, { progress: progressAt(1, ROD_STEPS.NONE, { scales: { kurodai: 123456789 } }) });
  assert.equal(rowsOf(materialsView({ game }))[0].value, "1.2億");
});

test("ステータスの画面:竿の名前と段階、戦闘の数値の表から作った値", () => {
  const game = createGame(1, { progress: progressAt(2, ROD_STEPS.CRAFTED) });
  const view = statusView({ game });
  assert.equal(view.header, "スズキの釣竿(段階 2)");
  // 項目はグループ(戦闘・時間・合わせ)に分けて並べる(D-163)。
  assert.deepEqual(
    view.sections.map((s) => [s.title, s.rows.map((r) => [r.label, r.value])]),
    [
      [
        "戦闘",
        [
          ["通常ダメージ", "10"],
          ["クリティカルの確率", "10%"],
          ["クリティカルの倍率", "2 倍"],
          ["外したときの回復", "10"],
          ["外したあとの次の当たり", "+0"],
        ],
      ],
      ["時間", [["制限時間の増減", "+0 秒"]]],
      [
        "合わせ",
        [
          ["合わせの成功帯(強い魚)", "0.4 秒"],
          ["ジャスト帯(強い魚)", "0.14 秒"],
          ["ジャストの倍率", "1.5 倍"],
        ],
      ],
      [
        "報酬と待ち時間",
        [
          ["ウロコイン", "+0%"],
          ["鱗", "+0%"],
          ["待ち時間", "+0%"],
        ],
      ],
    ],
  );
  assert.equal(STATUS_SECTIONS.length, 4);
  assert.equal(rowsOf(view).length, STATUS_ITEMS.length);
});

test("ステータスの画面:戦闘の数値の表を書き換えると、表示も変わる(基本の値は詳細に残る)", () => {
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
  assert.deepEqual(rows.map((r) => r.value), ["13", "25.5%", "2.5 倍", "4", "+0", "+1.5 秒", "0.5 秒", "0.2 秒", "2 倍", "+0%", "+0%", "+0%"]);
  // マイナスの増減。
  const minus = createGame(1, { combat: { ...DEFAULT_CONFIG.combat, timeLimitBonusMs: -2000 } });
  assert.equal(rowsOf(statusView({ game: minus }))[5].value, "−2 秒");
});

test("ステータスの画面:装備を反映した今の値と、装備なしの基本の値の両方が出る", () => {
  const gear = {
    ...emptyGear(),
    items: [
      { id: 1, kind: "reel", rarity: "legend", grade: 5, value: 15, skills: [] },
      { id: 2, kind: "line", rarity: "normal", grade: 1, value: 700, skills: [] },
      { id: 3, kind: "lure", rarity: "rare", grade: 1, value: 4, skills: [] },
    ],
    equipped: { reel: 1, line: 2, lure: 3 },
    nextId: 4,
  };
  const game = createGame(1, { progress: progressAt(5, ROD_STEPS.NONE, { gear }) });
  const rows = rowsOf(statusView({ game }));
  const byLabel = Object.fromEntries(rows.map((r) => [r.label, r]));
  assert.equal(byLabel["通常ダメージ"].value, "25");
  assert.deepEqual(byLabel["通常ダメージ"].detail, [
    ["今の値(装備・スキル込み)", "25"],
    ["基本の値", "10"],
  ]);
  assert.equal(byLabel["制限時間の増減"].value, "+0.7 秒");
  assert.equal(byLabel["外したあとの次の当たり"].value, "+4");
  assert.equal(byLabel["クリティカルの確率"].value, "10%", "装備のない項目はそのまま");
});

test("ステータスの画面:スキル込みの値と基本の値、クリティカルの段の内わけ、報酬と待ち時間の倍率", () => {
  const gear = {
    ...emptyGear(),
    items: [
      { id: 1, kind: "reel", rarity: "legend", grade: 5, value: 15, skills: [{ id: "crit-rate", points: 14 }, { id: "fortune", points: 14 }, { id: "agility", points: 14 }] },
      { id: 2, kind: "line", rarity: "legend", grade: 5, value: 2000, skills: [{ id: "crit-rate", points: 14 }, { id: "appraisal", points: 8 }] },
    ],
    equipped: { reel: 1, line: 2 },
    nextId: 3,
  };
  const game = createGame(1, { progress: progressAt(5, ROD_STEPS.NONE, { gear }) });
  const byLabel = Object.fromEntries(rowsOf(statusView({ game })).map((r) => [r.label, r]));
  // 会心率 28 ポイント → Lv7 → +105%。基本 10% と合わせて 115%(追加クリティカルあり)。
  assert.equal(byLabel["クリティカルの確率"].value, "115%");
  assert.deepEqual(byLabel["クリティカルの確率"].detail, [
    ["今の値(装備・スキル込み)", "115%"],
    ["基本の値", "10%"],
    ["段の内わけ", "1 段 85% / 2 段 15%"],
  ]);
  assert.equal(byLabel["ウロコイン"].value, "+30%");
  assert.equal(byLabel["鱗"].value, "+20%");
  assert.equal(byLabel["待ち時間"].value, "−30%");
  assert.deepEqual(byLabel["待ち時間"].detail.slice(0, 2), [
    ["今の値(装備・スキル込み)", "−30%"],
    ["基本の値", "+0%"],
  ]);
});

test("クリティカルの段の内わけ:120% は 1 段 80% / 2 段 20%、250% は 2 段 50% / 3 段 50%", () => {
  assert.equal(critStageText(1.2), "1 段 80% / 2 段 20%");
  assert.equal(critStageText(2.5), "2 段 50% / 3 段 50%");
  assert.equal(critStageText(0.1), "なし 90% / 1 段 10%");
  assert.equal(critStageText(1), "1 段 100%");
  assert.equal(critStageText(0), "なし 100%");
});
