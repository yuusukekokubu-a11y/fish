// 装備のロックのテスト(装備のロックの条件 1・2・3:D-246)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame } from "../src/core/fishing.js";
import { dismantleItem, dismantleRarity, emptyGear, equipItem, makeCrates, pullCrate, refundFor, setLocked, unequipKind } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { addDebugItem } from "../src/ui/debug_view.js";
import { bulkDismantlePreview, bulkLockPreview, inventoryRows, inventoryWarning } from "../src/ui/gear_view.js";
import { SCREENS } from "../src/ui/screens.js";
import { progressAt } from "./helpers.js";

const item = (id, kind, rarity, extra = {}) => ({ id, kind, rarity, grade: 1, value: kind === "line" ? 500 : kind === "reel" ? 1 : 2, skills: [], ...extra });

function gameWith(items, equipped = {}, coins = 0) {
  const gear = { ...emptyGear(), seed: 1, items, equipped, nextId: Math.max(0, ...items.map((it) => it.id)) + 1 };
  return createGame(1, { progress: progressAt(3, ROD_STEPS.NONE, { coins, gear }) });
}

test("ロック中は、まとめて分解の個数・戻りの量・対象から外れる。1 個ずつの分解もできない。外すと分解できる", () => {
  const items = [item(1, "reel", "normal", { locked: true }), item(2, "reel", "normal"), item(3, "line", "normal"), item(4, "lure", "normal", { locked: true })];
  const game = gameWith(items);
  const crates = makeCrates(game.content, game.config);
  const refund = refundFor(items[1], crates);
  assert.deepEqual(bulkDismantlePreview(game, crates, "normal"), { count: 2, coins: refund + refundFor(items[2], crates), locked: 2 });
  const r = dismantleRarity(game.progress, "normal", crates, Number.MAX_SAFE_INTEGER);
  assert.equal(r.count, 2);
  assert.deepEqual(game.progress.gear.items.map((it) => it.id), [1, 4], "ロック中だけ残る");
  // 1 個ずつも分解できない(ウロコインも増えない)。
  const coins = game.progress.coins;
  assert.equal(dismantleItem(game.progress, 1, crates, Number.MAX_SAFE_INTEGER), 0);
  assert.equal(game.progress.coins, coins);
  assert.equal(game.progress.gear.items.length, 2);
  // 外すと分解できる。
  assert.equal(setLocked(game.progress.gear, [1], false), 1);
  assert.ok(!("locked" in game.progress.gear.items[0]), "ロックなしは欄を持たない");
  assert.ok(dismantleItem(game.progress, 1, crates, Number.MAX_SAFE_INTEGER) > 0);
  assert.deepEqual(game.progress.gear.items.map((it) => it.id), [4]);
});

test("ロック中でも、付ける・外す・付け替えはできる。装着中のロックは、まとめて分解の対象外のまま", () => {
  const items = [item(1, "reel", "rare", { locked: true }), item(2, "reel", "epic", { locked: true })];
  const game = gameWith(items);
  equipItem(game.progress.gear, 1);
  assert.equal(game.progress.gear.equipped.reel, 1);
  equipItem(game.progress.gear, 2);
  assert.equal(game.progress.gear.equipped.reel, 2, "付け替え");
  unequipKind(game.progress.gear, "reel");
  assert.equal(game.progress.gear.equipped.reel, undefined, "外す");
  assert.ok(game.progress.gear.items.every((it) => it.locked), "ロックはそのまま");
});

test("まとめてロック・解除:絞り込み中の装備だけが対象。何個変わるかが分かる。装着中もロックできる", () => {
  const items = [item(1, "reel", "normal"), item(2, "reel", "legend", { locked: true }), item(3, "line", "normal"), item(4, "reel", "rare")];
  const game = gameWith(items, { reel: 1 });
  // リールに絞り込んでロック:1 と 4 が変わる(2 はもうロック中、3 は糸なので対象外)。装着中の 1 もロックできる。
  const p = bulkLockPreview(game, "reel", null, true);
  assert.deepEqual(p, { shown: 3, count: 2, ids: [1, 4] });
  assert.equal(setLocked(game.progress.gear, p.ids, true), 2);
  assert.deepEqual(game.progress.gear.items.map((it) => Boolean(it.locked)), [true, true, false, true]);
  // 「ロック中」に絞り込んで、まとめて解除。
  assert.deepEqual(inventoryRows(game, [], "new", null, "locked").map((v) => v.id), [4, 2, 1]);
  assert.deepEqual(inventoryRows(game, [], "new", null, "unlocked").map((v) => v.id), [3]);
  assert.ok(inventoryRows(game, [], "new", null, "locked").every((v) => v.locked));
  const off = bulkLockPreview(game, "reel", "locked", false);
  assert.deepEqual([off.shown, off.count], [3, 3]);
  setLocked(game.progress.gear, off.ids, false);
  assert.ok(game.progress.gear.items.every((it) => !it.locked));
  assert.equal(bulkLockPreview(game, null, null, false).count, 0, "変わるものがないと 0(ボタンは押せない)");
});

test("満タンの警告にロック中の数が出る。全部ロック中で満タンでも引けず、「装備へ」で装備の画面に移れる", () => {
  const filler = (n, locked) => Array.from({ length: n }, (_, i) => item(i + 1, "line", "normal", locked(i) ? { locked: true } : {}));
  let game = gameWith(filler(95, (i) => i < 12));
  let w = inventoryWarning(game);
  assert.deepEqual([w.level, w.locked, w.lockedText], ["warn", 12, "ロック中 12 個は、分解できません"]);
  // 警告がないときは出さない。
  game = gameWith(filler(50, () => true));
  assert.equal(inventoryWarning(game).lockedText, "");
  // 全部ロック中で満タン。
  game = gameWith(filler(100, () => true), {}, 1e9);
  w = inventoryWarning(game);
  assert.deepEqual([w.level, w.oneBlocked, w.tenBlocked], ["full", true, true]);
  assert.equal(w.text, "持ち物がいっぱいです。全部ロック中なので、ロックを外してから分解してください");
  assert.equal(w.lockedText, "ロック中 100 個は、分解できません");
  const crate = makeCrates(game.content, game.config)[0];
  assert.deepEqual(pullCrate(game.progress, crate, 1, game.content.equipKinds, game.config.gacha), { ok: false, reason: "space" });
  assert.equal(SCREENS.find((s) => s.id === "equipment").badge(game), "full");
  assert.ok(SCREENS.some((s) => s.id === "equipment"), "「装備へ」の移り先がある");
});

test("デバッグで作る装備は、ロックを指定できる(指定しなければロックなし)", () => {
  const game = gameWith([]);
  const spec = { kind: "reel", rarity: "legend", grade: 1, value: "max", skills: [] };
  const a = addDebugItem(game, { ...spec, lock: true });
  const b = addDebugItem(game, spec);
  assert.equal(a.ok && a.item.locked, true);
  assert.ok(b.ok && !("locked" in b.item));
});
