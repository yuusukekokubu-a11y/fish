// 自動分解のテスト(餌と自動分解の条件 5:D-266)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { createGame } from "../src/core/fishing.js";
import { AUTO_SCRAP_ROWS, autoScrap, autoScrapSetting, autoScrapTargets, emptyGear, makeCrates, pullCrate, refundFor, setAutoScrap } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { progressAt } from "./helpers.js";

const item = (id, kind, rarity, value, extra = {}) => ({ id, kind, rarity, grade: 1, value, skills: [], ...extra });

function gameWith(items, equipped = {}, coins = 0) {
  const gear = { ...emptyGear(), seed: 1, items, equipped, nextId: Math.max(0, ...items.map((it) => it.id)) + 1 };
  return createGame(1, { progress: progressAt(3, ROD_STEPS.NONE, { coins, gear }) });
}

test("設定:オフ・ノーマルまで・レアまで・エピックまで。既定はオフ(欄なし)。表にない値は変えない", () => {
  assert.deepEqual(AUTO_SCRAP_ROWS.map((r) => r.id), ["off", "normal", "rare", "epic"]);
  const p = progressAt(1);
  assert.equal(autoScrapSetting(p), "off");
  assert.equal(setAutoScrap(p, "rare"), true);
  assert.equal(p.autoScrap, "rare");
  assert.equal(setAutoScrap(p, "legend"), false, "レジェンドは選べない");
  assert.equal(p.autoScrap, "rare");
  setAutoScrap(p, "off");
  assert.equal("autoScrap" in p, false);
});

test("しきい値:そのレア度以下だけ。レジェンドはどの設定でも対象外", () => {
  // 装着中のリール(効果 5)より低い効果 1 のリールを、レア度ごとに並べる。
  const equipped = item(1, "reel", "legend", 5);
  const fresh = ["normal", "rare", "epic", "legend"].map((r, i) => item(10 + i, "reel", r, 1));
  const gear = { ...emptyGear(), items: [equipped, ...fresh], equipped: { reel: 1 } };
  const ids = (s) => autoScrapTargets(gear, fresh, s).map((it) => it.rarity);
  assert.deepEqual(ids("off"), []);
  assert.deepEqual(ids("normal"), ["normal"]);
  assert.deepEqual(ids("rare"), ["normal", "rare"]);
  assert.deepEqual(ids("epic"), ["normal", "rare", "epic"]);
});

test("ロック中・装着中・▲(装着中より基本効果が高い。空き枠なら全部)は対象外。同じ効果は対象(スキルは見ない)", () => {
  const gear = {
    ...emptyGear(),
    items: [item(1, "reel", "rare", 3), item(2, "reel", "normal", 1, { locked: true }), item(3, "reel", "normal", 4), item(4, "reel", "normal", 3, { skills: [{ id: "fortune", level: 3 }] }), item(5, "line", "normal", 100)],
    equipped: { reel: 1 },
  };
  const targets = autoScrapTargets(gear, gear.items, "epic").map((it) => it.id);
  // 1 は装着中、2 はロック中、3 は ▲、5 は糸の枠が空いているので ▲。4 は同じ効果なのでスキルがあっても対象。
  assert.deepEqual(targets, [4]);
});

test("引いた装備だけを、引いた直後に分解し、ウロコインを足す。持ち物に元からあるものは分解しない", () => {
  const old = item(1, "reel", "normal", 0);
  const game = gameWith([old, item(2, "reel", "epic", 1e9), item(3, "line", "epic", 1e9), item(4, "lure", "epic", 1e9)], { reel: 2, line: 3, lure: 4 }, 1e6);
  const p = game.progress;
  setAutoScrap(p, "epic");
  const crates = makeCrates(game.content, game.config);
  const crate = crates.find((c) => c.stage === 3);
  const pulled = pullCrate(p, crate, 10, game.content.equipKinds, DEFAULT_CONFIG.gacha);
  assert.equal(pulled.ok, true);
  const coins = p.coins;
  const r = autoScrap(p, pulled.items, crates, Number.MAX_SAFE_INTEGER);
  // 装着中がとても強いので、レジェンド以外は全部 ▲ でない → 分解。
  const expected = pulled.items.filter((it) => it.rarity !== "legend");
  assert.deepEqual(r.items.map((it) => it.id), expected.map((it) => it.id));
  assert.equal(r.coins, expected.reduce((s, it) => s + refundFor(it, crates), 0));
  assert.equal(p.coins, coins + r.coins);
  assert.ok(p.gear.items.some((it) => it.id === 1), "元からある装備は残る");
  assert.equal(p.gear.items.length, 4 + 10 - expected.length);
});

test("10 連でも全部を同じ基準(引いた時点の装着)で判定する。オフなら何もしない", () => {
  const game = gameWith([], {}, 1e6);
  const p = game.progress;
  const crates = makeCrates(game.content, game.config);
  const pulled = pullCrate(p, crates.find((c) => c.stage === 3), 10, game.content.equipKinds, DEFAULT_CONFIG.gacha);
  assert.deepEqual(autoScrap(p, pulled.items, crates, Number.MAX_SAFE_INTEGER), { items: [], coins: 0 }, "オフ");
  setAutoScrap(p, "epic");
  // 空き枠なので全部 ▲:何も分解しない(同じ 10 連のうち、先の装備で後の判定は変わらない)。
  assert.deepEqual(autoScrap(p, pulled.items, crates, Number.MAX_SAFE_INTEGER).items, []);
  assert.equal(p.gear.items.length, 10);
});
