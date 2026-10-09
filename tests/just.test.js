// ジャストのテスト(戦闘の調整の条件 1・2・3:D-256・D-257・D-258)。
// 強い魚のジャストの初撃、ジャスト・ブースト、弱い魚のジャストのウロコイン。

import assert from "node:assert/strict";
import { test } from "node:test";

import { effectiveStats, strikeDamage } from "../src/core/combat.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { challengeBoss, createGame, currentMarker, OUTCOMES, PHASES, REASONS, tap, update } from "../src/core/fishing.js";
import { emptyGear } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { startQuickFight } from "../src/ui/debug_view.js";
import { NO_CRIT } from "./fight_helpers.js";
import { hookGood, hookJust, NO_DEFENSE_CONTENT, progressAt, withDefense } from "./helpers.js";

/** スキル(id → レベル)を付けた糸を装着した進み具合(段階 5。最大 Lv7。糸なのでダメージは変わらない)。 */
function progressWith(levels = {}, stage = 5) {
  const skills = Object.entries(levels).map(([id, level]) => ({ id, level }));
  const item = { id: 1, kind: "line", rarity: "legend", grade: 1, value: 0, skills };
  return progressAt(stage, ROD_STEPS.CRAFTED, { gear: { ...emptyGear(), seed: 1, items: [item], equipped: { line: 1 }, nextId: 2 } });
}

/** 魚 fishId が掛かったら、grade("just" か "good")で合わせる。タップの結果を返す。 */
function hookOn(game, fishId, grade) {
  for (let i = 0; i < 2000000; i++) {
    update(game, 5);
    if (game.phase === PHASES.BITE && game.cast.fish.id === fishId && (grade === "just" ? hookJust(game) : hookGood(game))) {
      const r = tap(game);
      assert.equal(r.grade, grade);
      return r;
    }
    if (game.phase === PHASES.RESTING) tap(game);
  }
  throw new Error(`${fishId} が掛からない`);
}

function hitOnce(game) {
  for (let i = 0; i < 4000; i++) {
    const z = game.fight.zone;
    if (Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.02) return tap(game);
    update(game, 2);
  }
  throw new Error("命中しない");
}

const game5 = (opts = {}) => createGame(1, { content: NO_DEFENSE_CONTENT, combat: NO_CRIT, progress: progressWith(), ...opts });

test("初撃:強い魚のジャストで、基本のダメージ × 2 が体力から減る(ブリ 60 − 20 = 40。D-407)。命中には数えず、連撃も増えない", () => {
  const game = game5();
  const r = hookOn(game, "buri", "just");
  assert.deepEqual(r.strike, { damage: 20, rawDamage: 20, defended: false, effDefense: 0, multiplier: 2, hp: 40, maxHp: 60, caught: false });
  assert.equal(game.phase, PHASES.MINIGAME);
  assert.deepEqual([game.fight.hp, game.fight.hits, game.fight.combo], [40, 0, 0]);
  const hit = hitOnce(game);
  assert.deepEqual([hit.damage, hit.combo, hit.hp], [10, 1, 30], "初撃のあとの最初の命中は、ふつうの命中(連撃 1 段目)");
});

test("初撃が体力以上なら、ミニゲームなしでその場で釣り上げ(クロダイ 20 ≤ 20)。鱗とウロコインは通常どおり", () => {
  const game = game5();
  const r = hookOn(game, "kurodai", "just");
  assert.equal(r.strike.caught, true);
  assert.equal(game.phase, PHASES.RESULT);
  const res = game.lastResult;
  assert.deepEqual([res.outcome, res.reason, res.hits, res.hook], [OUTCOMES.CAUGHT, REASONS.STRIKE, 0, "just"]);
  assert.deepEqual(res.reward, DEFAULT_CONTENT.byId.get("kurodai").reward);
  assert.equal(game.progress.scales.kurodai, 1);
  assert.equal(game.progress.coins, res.reward.coins);
});

test("通常の成功では初撃はない。ヌシ(挑戦・すぐ戦う)にも初撃はない。弱い魚にもない", () => {
  const good = game5();
  const r = hookOn(good, "buri", "good");
  assert.equal(r.strike, undefined);
  assert.equal(good.fight.hp, good.fight.maxHp);
  const boss = createGame(1, { content: NO_DEFENSE_CONTENT, combat: NO_CRIT, progress: progressWith({}, 1) });
  assert.equal(challengeBoss(boss), true);
  assert.deepEqual([boss.fight.hp === boss.fight.maxHp, boss.fight.strike], [true, null]);
  const quick = game5();
  assert.equal(startQuickFight(quick, "nushi-buri", "just").ok, true);
  assert.deepEqual([quick.fight.hp === quick.fight.maxHp, quick.fight.strike], [true, null]);
  const weak = game5();
  const w = hookOn(weak, "aji", "just");
  assert.equal(w.strike, undefined);
  assert.equal(weak.phase, PHASES.REELING);
});

test("初撃はクリティカルを判定しない(クリティカルの乱数を引かない)。あとの命中のクリティカルの並びは、通常の成功のときと同じ", () => {
  const combat = { ...DEFAULT_CONFIG.combat, damage: 1, critChance: 0.5 };
  const crits = (grade) => {
    const game = createGame(7, { content: NO_DEFENSE_CONTENT, combat, progress: progressWith() });
    assert.equal(startQuickFight(game, "buri", grade).ok, true);
    if (grade === "just") assert.equal(game.fight.strike.damage, 2, "会心率があっても 2 倍のまま");
    return Array.from({ length: 8 }, () => hitOnce(game).critical);
  };
  const just = crits("just");
  assert.deepEqual(just, crits("good"));
  assert.ok(just.includes(true) && just.includes(false));
});

test("初撃にも防御と貫通が効く(実効防御で減らし、最小 1)。防御 100% 以上なら 1", () => {
  // いまの魚の表は防御 0(D-380)なので、ブリに防御 40% を付けた表で確かめる。
  const content = withDefense(DEFAULT_CONTENT, { buri: 0.4 });
  const game = createGame(1, { content, combat: NO_CRIT, progress: progressWith() });
  const buri = content.byId.get("buri").minigame;
  const r = hookOn(game, "buri", "just");
  assert.equal(r.strike.damage, Math.max(1, Math.round(20 * (1 - buri.defense))));
  assert.equal(r.strike.defended, true);
  assert.deepEqual(strikeDamage(10, 3, 1.2, 1e9), { raw: 30, damage: 1 });
  assert.deepEqual(strikeDamage(10, 3, 0.5, 1e9), { raw: 30, damage: 15 });
  assert.deepEqual(strikeDamage(1e9, 1e6, 0, 1e9), { raw: 1e9, damage: 1e9 }, "安全上限で止める");
});

test("先手は、初撃のあとの最初の命中に乗る(初撃そのものには乗らない)", () => {
  const game = game5({ progress: progressWith({ "first-hit": 2 }) });
  const r = hookOn(game, "buri", "just");
  assert.equal(r.strike.damage, 20, "初撃は基本のダメージ 10 × 2");
  assert.equal(hitOnce(game).damage, 18, "最初の命中に先手 +8");
  assert.equal(hitOnce(game).damage, 10);
});

test("ジャスト・ブースト:ジャスト倍率 +0.08 × Lv(Lv4 で 2.32 倍:D-407)。5.1 倍(Lv38)までは線形、そこから逓減(上限なし)。名人技は変わらない", () => {
  const game = game5({ progress: progressWith({ "just-boost": 4 }) });
  const r = hookOn(game, "buri", "just");
  assert.ok(Math.abs(r.strike.multiplier - 2.32) < 1e-9);
  assert.equal(r.strike.damage, 23);
  const f = DEFAULT_CONFIG.formula;
  const mult = (lv) => effectiveStats({ critChance: 0, critMultiplier: 1, justMultiplier: 2 + 0.08 * lv }, f).justMultiplier;
  assert.ok(Math.abs(mult(30) - 4.4) < 1e-9, "Lv30 は 2 + 2.4(線形)");
  assert.ok(mult(50) > mult(49) && mult(50) - mult(49) < 0.08 - 1e-9, "5.1 倍をこえると増え方が緩やか");
  assert.ok(mult(1000) > mult(100), "上限なし");
  const mastery = DEFAULT_CONFIG.combat.hook;
  assert.ok(game.combat.hook.strong.justMs === mastery.strong.justMs, "ジャスト帯は変わらない");
});

test("弱い魚のジャスト:ウロコイン × 1.5(四捨五入、最小 1)。通常の成功は × 1。強い魚には掛けない", () => {
  const just = game5();
  hookOn(just, "aji", "just");
  update(just, DEFAULT_CONFIG.reelMs);
  const base = DEFAULT_CONTENT.byId.get("aji").reward.coins;
  assert.equal(just.lastResult.reward.coins, Math.max(1, Math.round(base * 1.5)));
  assert.equal(just.lastResult.justCoinRate, 1.5);
  const good = game5();
  hookOn(good, "aji", "good");
  update(good, DEFAULT_CONFIG.reelMs);
  assert.equal(good.lastResult.reward.coins, base);
  assert.equal(good.lastResult.justCoinRate, undefined);
  const strong = game5();
  hookOn(strong, "kurodai", "just");
  assert.equal(strong.lastResult.reward.coins, DEFAULT_CONTENT.byId.get("kurodai").reward.coins, "強い魚には掛けない");
});

test("弱い魚のジャストと豊漁の順番:基本 × ジャスト × 豊漁 をまとめて四捨五入", () => {
  const game = game5({ progress: progressWith({ fortune: 2 }) });
  hookOn(game, "aji", "just");
  update(game, DEFAULT_CONFIG.reelMs);
  const base = DEFAULT_CONTENT.byId.get("aji").reward.coins;
  assert.equal(game.lastResult.reward.coins, Math.max(1, Math.round(base * 1.5 * game.rates.coins)));
  assert.ok(game.rates.coins > 1);
});
