// ジャストの効果(戦闘中の一時的な上乗せ)のテスト(受け入れ条件 5)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { boostedDamage, consumeBoosts } from "../src/core/combat.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { tap } from "../src/core/fishing.js";
import { NO_CRIT, untilFight, untilJustFight, waitForCenter, waitForOutside } from "./fight_helpers.js";

const BASE = DEFAULT_CONFIG.combat;

function hit(game) {
  assert.ok(waitForCenter(game));
  const r = tap(game);
  assert.equal(r.action, "hit");
  return r;
}

test("ジャストのあとは、最初の当たりだけ 1.5 倍(10 → 15)、次からは 10", () => {
  const game = untilJustFight("maguro");
  assert.deepEqual(game.fight.boosts, [{ id: "just", damageMultiplier: 1.5, uses: 1 }]);
  let r = hit(game);
  assert.deepEqual([r.damage, r.boosted, r.hp], [15, true, 45]);
  assert.deepEqual(game.fight.boosts, []);
  r = hit(game);
  assert.deepEqual([r.damage, r.boosted, r.hp], [10, false, 35]);
});

test("通常の成功では、上乗せはかからない", () => {
  const game = untilFight("maguro");
  assert.deepEqual(game.fight.boosts, []);
  assert.equal(hit(game).damage, 10);
});

test("クリティカルと重なると掛け算:20 × 1.5 = 30", () => {
  const game = untilJustFight("maguro", { combat: { ...BASE, critChance: 1 } });
  const r = hit(game);
  assert.deepEqual([r.critical, r.boosted, r.damage], [true, true, 30]);
  assert.equal(hit(game).damage, 20, "2 回目はクリティカルだけ");
});

test("最初のタップが外れても、上乗せは次の当たりに持ち越す", () => {
  const game = untilJustFight("maguro");
  assert.ok(waitForOutside(game));
  const miss = tap(game);
  assert.equal(miss.action, "miss");
  assert.equal(game.fight.boosts.length, 1);
  assert.equal(hit(game).damage, 15);
});

test("倍率は表の値で変えられ、丸めは四捨五入", () => {
  const game = untilJustFight("maguro", { combat: { ...NO_CRIT, hook: { ...BASE.hook, justMultiplier: 2 } } });
  assert.equal(hit(game).damage, 20);
  assert.equal(boostedDamage(7, [{ damageMultiplier: 1.5 }]), 11, "10.5 → 11");
  assert.equal(boostedDamage(10, []), 10);
  assert.equal(boostedDamage(10, [{ damageMultiplier: 1.5 }, { damageMultiplier: 2 }]), 30, "上乗せが 2 つなら両方かける");
  assert.deepEqual(consumeBoosts([{ id: "a", damageMultiplier: 2, uses: 2 }, { id: "b", damageMultiplier: 3, uses: 1 }]), [
    { id: "a", damageMultiplier: 2, uses: 1 },
  ]);
});

test("ジャストで最初の一撃が増えると、クロダイは 2 回で釣れる(15 + 10 ≥ 20)", () => {
  const game = untilJustFight("kurodai");
  hit(game);
  const r = hit(game);
  assert.deepEqual([r.hp, r.caught], [0, true]);
  assert.equal(game.lastResult.hook, "just");
});
