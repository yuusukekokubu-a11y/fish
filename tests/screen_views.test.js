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
          ["クリティカルの倍率", "1.3 倍"],
          ["貫通(合計)", "0%"],
          ["ミスしたときの回復", "10"],
          ["命中範囲の広さ(ルアー)", "+0%"],
        ],
      ],
      ["時間", [["制限時間の増減", "+0 秒"]]],
      [
        "合わせ",
        [
          ["合わせの成功帯(強い魚)", "0.4 秒"],
          ["ジャスト帯(強い魚)", "0.14 秒"],
          ["ジャスト倍率(初撃)", "3 倍"],
        ],
      ],
      [
        "報酬と待ち時間",
        [
          ["ウロコイン", "+0%"],
          ["待ち時間", "+0%"],
        ],
      ],
      ["条件つき", [["なし", ""]]],
    ],
  );
  assert.equal(STATUS_SECTIONS.length, 4);
  assert.equal(rowsOf(view).length, STATUS_ITEMS.length + 1, "項目 + 条件つきの「なし」");
});

test("ステータスの画面:戦闘の数値の表を書き換えると、表示も変わる(基本の値は詳細に残る)", () => {
  const combat = {
    ...DEFAULT_CONFIG.combat,
    damage: 13,
    critChance: 0.255,
    critMultiplier: 2.5,
    penetration: 0.3,
    missHeal: 4,
    timeLimitBonusMs: 1500,
    justMultiplier: 2,
    hook: { ...DEFAULT_CONFIG.combat.hook, strong: { ringMs: 1200, successMs: 500, justMs: 200 } },
  };
  const game = createGame(1, { combat });
  const rows = rowsOf(statusView({ game }));
  assert.deepEqual(rows.map((r) => r.value), ["13", "25.5%", "2.02 倍", "30%", "4", "+0%", "+1.5 秒", "0.5 秒", "0.2 秒", "2 倍", "+0%", "+0%", ""]);
  // 倍率 2.5 は逓減の始まり(1.65)をこえるので 2.02 倍(D-255)。貫通 30% はそのまま。
  // マイナスの増減。
  const minus = createGame(1, { combat: { ...DEFAULT_CONFIG.combat, timeLimitBonusMs: -2000 } });
  assert.equal(rowsOf(statusView({ game: minus }))[6].value, "−2 秒");
});

test("ステータスの画面:装備を反映した今の値と、装備なしの基本の値の両方が出る", () => {
  const gear = {
    ...emptyGear(),
    items: [
      { id: 1, kind: "reel", rarity: "legend", grade: 5, value: 15, skills: [] },
      { id: 2, kind: "line", rarity: "normal", grade: 1, value: 700, skills: [] },
      { id: 3, kind: "lure", rarity: "rare", grade: 1, value: 8, skills: [] },
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
  assert.equal(byLabel["命中範囲の広さ(ルアー)"].value, "+8%");
  assert.equal(byLabel["クリティカルの確率"].value, "10%", "装備のない項目はそのまま");
});

test("ステータスの画面:スキル込みの値と基本の値、クリティカルの段の内わけ、報酬と待ち時間の倍率", () => {
  const gear = {
    ...emptyGear(),
    items: [
      { id: 1, kind: "reel", rarity: "legend", grade: 5, value: 15, skills: [{ id: "crit-rate", level: 4 }, { id: "fortune", level: 3 }, { id: "agility", level: 3 }] },
      { id: 2, kind: "line", rarity: "legend", grade: 5, value: 2000, skills: [{ id: "crit-rate", level: 3 }] },
    ],
    equipped: { reel: 1, line: 2 },
    nextId: 3,
  };
  const game = createGame(1, { progress: progressAt(5, ROD_STEPS.NONE, { gear }) });
  const byLabel = Object.fromEntries(rowsOf(statusView({ game })).map((r) => [r.label, r]));
  // 会心率 Lv4 + Lv3 = Lv7 → +105%。基本 10% と合わせて 115%(追加クリティカルあり)。
  assert.equal(byLabel["クリティカルの確率"].value, "115%");
  assert.deepEqual(byLabel["クリティカルの確率"].detail, [
    ["今の値(装備・スキル込み)", "115%"],
    ["基本の値", "10%"],
    ["段の内わけ", "1 段 85% / 2 段 15%"],
  ]);
  assert.equal(byLabel["ウロコイン"].value, "+30%");
  assert.equal(byLabel["鱗"], undefined, "鱗を増やす効果はない");
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

test("ステータスの画面:条件発動型は「条件つき」の節に出し、今の値には含めない。ルアーの命中範囲の幅の変化も出す", () => {
  const gear = {
    ...emptyGear(),
    items: [
      { id: 1, kind: "reel", rarity: "legend", grade: 5, value: 15, skills: [{ id: "combo-power", level: 2 }, { id: "first-strike", level: 1 }] },
      { id: 2, kind: "lure", rarity: "legend", grade: 5, value: 50, skills: [] },
    ],
    equipped: { reel: 1, lure: 2 },
    nextId: 3,
  };
  const game = createGame(1, { progress: progressAt(5, ROD_STEPS.NONE, { gear }) });
  const view = statusView({ game });
  const cond = view.sections.find((s) => s.title === "条件つき");
  assert.deepEqual(cond.rows.map((r) => [r.label, r.value, r.detail]), [
    ["連撃・攻", "Lv2", [["条件つき", "連続命中 1 段ごとにダメージ +2(最大 10 段)"]]],
    ["先制", "Lv1", [["条件つき", "戦いの最初の命中で会心率 +10%"]]],
  ]);
  const byLabel = Object.fromEntries(rowsOf(view).map((r) => [r.label, r]));
  assert.equal(byLabel["通常ダメージ"].value, "25", "条件つきは今の値に含めない");
  assert.equal(byLabel["クリティカルの確率"].value, "10%");
  assert.equal(byLabel["命中範囲の広さ(ルアー)"].value, "+50%");
  assert.deepEqual(byLabel["命中範囲の広さ(ルアー)"].detail.slice(2), [
    ["命中範囲(ブリ)", "10% → 15%"],
    ["命中範囲(ヌシ・ブリ)", "10% → 15%"],
  ]);
});
