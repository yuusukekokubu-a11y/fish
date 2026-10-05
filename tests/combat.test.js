// 戦闘の数値の表とクリティカルのテスト(受け入れ条件 4・5・6)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { chanceRule, DEFAULT_CRIT_RULES, hitDamage, isCritical, normalizeCombat } from "../src/core/combat.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { createGame, drawCast, PHASES, REASONS, tap, update } from "../src/core/fishing.js";
import { createRng } from "../src/core/rng.js";
import { NO_CRIT, untilFight, waitForCenter, waitForOutside } from "./fight_helpers.js";

const BASE = DEFAULT_CONFIG.combat;
const LIMITS = DEFAULT_CONFIG.combatLimits;
const norm = (stats) => normalizeCombat(stats, BASE, LIMITS);

test("基本の表:ダメージ 10・確率 10%・倍率 2・回復 10・時間の増減 0", () => {
  assert.deepEqual(norm(BASE), { damage: 10, critChance: 0.1, critMultiplier: 2, missHeal: 10, timeLimitBonusMs: 0 });
  assert.deepEqual(norm(undefined), norm(BASE), "表がなければ基本の表");
});

test("範囲外の値は境目に丸める(最小ダメージ 1・回復 0 以上・確率 0〜100%・倍率 1〜10)", () => {
  assert.deepEqual(norm({ damage: -5, critChance: 1.5, critMultiplier: 50, missHeal: -3, timeLimitBonusMs: 0 }), {
    damage: 1,
    critChance: 1,
    critMultiplier: 10,
    missHeal: 0,
    timeLimitBonusMs: 0,
  });
  assert.deepEqual(norm({ damage: 0, critChance: -0.2, critMultiplier: 0.5, missHeal: 0, timeLimitBonusMs: 0 }), {
    damage: 1,
    critChance: 0,
    critMultiplier: 1,
    missHeal: 0,
    timeLimitBonusMs: 0,
  });
  // 境目ちょうどはそのまま。
  assert.deepEqual(norm({ damage: 1, critChance: 1, critMultiplier: 10, missHeal: 0, timeLimitBonusMs: 0 }).critChance, 1);
  assert.equal(norm({ ...BASE, critChance: 0 }).critChance, 0);
  // 数でない値は基本の表に戻す。整数でない値は四捨五入。
  const odd = norm({ damage: "10", critChance: NaN, critMultiplier: Infinity, missHeal: null, timeLimitBonusMs: undefined });
  assert.deepEqual(odd, norm(BASE));
  assert.equal(norm({ ...BASE, damage: 12.5 }).damage, 13);
  assert.equal(norm({ ...BASE, damage: 12.4 }).damage, 12);
});

test("ダメージ:通常は表のまま、クリティカルは「ダメージ × 倍率」を四捨五入", () => {
  const s = (damage, critMultiplier) => norm({ ...BASE, damage, critMultiplier });
  assert.equal(hitDamage(s(10, 2), false), 10);
  assert.equal(hitDamage(s(10, 2), true), 20);
  assert.equal(hitDamage(s(10, 1.5), true), 15);
  assert.equal(hitDamage(s(7, 1.5), true), 11, "10.5 → 11");
  assert.equal(hitDamage(s(3, 1.1), true), 3, "3.3 → 3(通常より小さくしない)");
  assert.equal(hitDamage(s(1, 1), true), 1);
});

test("クリティカルの規則:確率 0% は出ず、100% は必ず出る", () => {
  const stats0 = norm({ ...BASE, critChance: 0 });
  const stats1 = norm({ ...BASE, critChance: 1 });
  const rng = createRng(5);
  for (let i = 0; i < 2000; i++) {
    const roll = rng();
    assert.equal(chanceRule({ roll, stats: stats0 }), false);
    assert.equal(chanceRule({ roll, stats: stats1 }), true);
  }
  // 境界:乱数が確率ちょうどならクリティカルにしない(確率より小さいときだけ)。
  assert.equal(chanceRule({ roll: 0.1, stats: norm(BASE) }), false);
  assert.equal(chanceRule({ roll: 0.0999, stats: norm(BASE) }), true);
});

test("クリティカルの判定は規則の一覧で、後から条件を足せる(腕前型の例)", () => {
  // 例:当たり範囲の中心から ±2% の帯でのタップはクリティカル(今回は作らない規則を、テストの中だけで足す)。
  const centerBand = ({ position, zone }) => Math.abs(position - (zone.start + zone.end) / 2) <= 0.02;
  const rules = [...DEFAULT_CRIT_RULES, centerBand];
  const stats = norm({ ...BASE, critChance: 0 });
  const zone = { start: 0.4, end: 0.6 };
  assert.equal(isCritical({ roll: 0.5, stats, position: 0.5, zone }, rules), true);
  assert.equal(isCritical({ roll: 0.5, stats, position: 0.45, zone }, rules), false);
  assert.equal(isCritical({ roll: 0.5, stats, position: 0.5, zone }), false, "基本の一覧では確率だけ");
  // ゲームにも規則の一覧を渡せる。
  const game = untilFight("kurodai", { combat: { ...NO_CRIT }, critRules: rules });
  assert.ok(waitForCenter(game));
  const r = tap(game);
  assert.equal(r.critical, true);
  assert.equal(r.damage, 20);
});

test("確率 0% の戦闘では一度も出ず、100% では毎回出て倍率どおりに削る", () => {
  for (const [critChance, critMultiplier, expected] of [
    [0, 2, 10],
    [1, 2, 20],
    [1, 3, 30],
  ]) {
    const game = untilFight("maguro", { combat: { ...BASE, critChance, critMultiplier } });
    let hp = 60;
    while (game.phase === PHASES.MINIGAME) {
      assert.ok(waitForCenter(game));
      const r = tap(game);
      assert.equal(r.critical, critChance === 1);
      assert.equal(r.damage, expected);
      hp = Math.max(0, hp - expected);
      assert.equal(r.hp, hp);
    }
    assert.equal(game.lastResult.reason, REASONS.HP_ZERO);
    assert.equal(game.lastResult.hits, Math.ceil(60 / expected));
    assert.equal(game.lastResult.crits, critChance === 1 ? game.lastResult.hits : 0);
  }
});

test("表を書き換えると、回復と制限時間にも反映される", () => {
  const game = untilFight("suzuki", { combat: { ...NO_CRIT, missHeal: 4, timeLimitBonusMs: 2500 } });
  assert.equal(game.fight.timeLimitMs, 9000 + 2500);
  assert.ok(waitForCenter(game));
  tap(game);
  assert.ok(waitForOutside(game));
  const r = tap(game);
  assert.deepEqual([r.hp, r.heal], [24, 4]);
  update(game, 11500 - game.phaseMs - 1);
  assert.equal(game.phase, PHASES.MINIGAME);
  update(game, 1);
  assert.equal(game.lastResult.reason, REASONS.TIMEOUT);
});

test("範囲外の表でも戦闘は必ず終わる(制限時間は 1 秒より短くしない)", () => {
  const weird = { damage: -100, critChance: 99, critMultiplier: -1, missHeal: 1e9, timeLimitBonusMs: -1e9 };
  const game = untilFight("maguro", { combat: weird });
  assert.deepEqual(game.combat, { damage: 1, critChance: 1, critMultiplier: 1, missHeal: 1e9, timeLimitBonusMs: -1e9 });
  assert.equal(game.fight.timeLimitMs, LIMITS.minTimeLimitMs);
  const rng = createRng(3);
  let t = 0;
  while (game.phase === PHASES.MINIGAME && t < 60000) {
    update(game, 10);
    t += 10;
    if (rng() < 0.3 && game.phase === PHASES.MINIGAME) tap(game);
  }
  assert.equal(game.phase, PHASES.RESULT);
  assert.ok(t <= LIMITS.minTimeLimitMs + 10);
});

test("クリティカルの確率を変えても、魚の抽選の乱数の並びは変わらない", () => {
  function fishOrder(critChance) {
    const game = createGame(42, { progress: { coins: 0, material: 0, rodStage: 5, seen: [] }, combat: { ...BASE, critChance } });
    const order = [game.cast.fish.id];
    let last = game.castCount;
    for (let t = 0; order.length < 60 && t < 3600000; t += 16) {
      update(game, 16);
      if (game.phase === PHASES.BITE || game.phase === PHASES.RESTING) tap(game);
      else if (game.phase === PHASES.MINIGAME && game.phaseMs % 160 < 16) tap(game);
      if (game.castCount !== last) {
        order.push(game.cast.fish.id);
        last = game.castCount;
      }
    }
    return order;
  }
  const rng = createRng(42);
  const expected = Array.from({ length: 60 }, () => drawCast(rng, DEFAULT_CONFIG, 5).fish.id);
  for (const chance of [0, 0.1, 0.5, 1]) assert.deepEqual(fishOrder(chance), expected, `確率 ${chance}`);
});
