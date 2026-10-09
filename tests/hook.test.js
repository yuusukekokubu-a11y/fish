// 合わせ(縮む輪)のテスト(受け入れ条件 1・2・3・4・6)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { hookTiming, judgeHook, normalizeHook } from "../src/core/combat.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { FISH_LIST } from "../src/core/fish.js";
import {
  createGame,
  currentHookTiming,
  FISH_KINDS,
  OUTCOMES,
  PHASES,
  REASONS,
  tap,
  update,
} from "../src/core/fishing.js";
import { areaEndFor } from "./fight_helpers.js";
import { progressAt } from "./helpers.js";

const BASE_HOOK = DEFAULT_CONFIG.combat.hook;
const LIMITS = DEFAULT_CONFIG.combatLimits;

/** 竿の段階 rodStage で、魚 fishId が掛かった瞬間(「!」の 0 ミリ秒)まで進める。ほかの魚は逃がす。 */
function untilBite(fishId, { rodStage = areaEndFor(fishId), seed = 1, combat } = {}) {
  const game = createGame(seed, { progress: progressAt(rodStage), combat });
  for (let i = 0; i < 2000000; i++) {
    if (game.phase === PHASES.WAITING && game.cast.fish.id === fishId) {
      // 待ちの残りぴったりだけ進めると、掛かった瞬間(経過 0 ミリ秒)で止まる。
      update(game, game.cast.waitMs - game.phaseMs);
      assert.equal(game.phase, PHASES.BITE);
      assert.equal(game.phaseMs, 0);
      return game;
    }
    update(game, 1);
    if (game.phase === PHASES.RESTING) tap(game);
  }
  throw new Error(`${fishId} が掛からない`);
}

/** 掛かった瞬間から t ミリ秒たったところでタップした結果。 */
function tapAt(fishId, t, options) {
  const game = untilBite(fishId, options);
  update(game, t);
  if (game.phase !== PHASES.BITE) return { game, result: null };
  return { game, result: tap(game) };
}

test("基本の輪:弱い魚はゆっくりで帯が広く、強い魚は速くて帯が狭い", () => {
  const n = hookTiming(BASE_HOOK.normal);
  const s = hookTiming(BASE_HOOK.strong);
  assert.deepEqual(n, { ringMs: 1600, successStart: 1000, justStart: 1200, justEnd: 1400 });
  assert.deepEqual(s, { ringMs: 1200, successStart: 800, justStart: 930, justEnd: 1070 });
  assert.ok(BASE_HOOK.strong.ringMs < BASE_HOOK.normal.ringMs);
  assert.ok(BASE_HOOK.strong.successMs <= BASE_HOOK.normal.successMs);
  assert.ok(BASE_HOOK.strong.justMs <= BASE_HOOK.normal.justMs);
});

test("下限:輪 1.0 秒以上・成功帯 0.25 秒以上・ジャスト帯 0.10 秒以上(基本の値も守る)", () => {
  for (const ring of [BASE_HOOK.normal, BASE_HOOK.strong]) {
    assert.ok(ring.ringMs >= 1000);
    assert.ok(ring.successMs >= 250);
    assert.ok(ring.justMs >= 100);
  }
});

test("範囲外の輪の値は丸める(下限・成功帯 ≤ 輪 − 0.3 秒・ジャスト帯 ≤ 成功帯・強い魚 ≤ 弱い魚)", () => {
  const h = normalizeHook(
    {
      normal: { ringMs: -5, successMs: 99999, justMs: 99999 },
      strong: { ringMs: 5000, successMs: 4000, justMs: 3000 },
    },
    BASE_HOOK,
    LIMITS,
  );
  assert.deepEqual(h.normal, { ringMs: 1000, successMs: 700, justMs: 700 });
  assert.deepEqual(h.strong, { ringMs: 5000, successMs: 700, justMs: 700 }, "強い魚の帯は弱い魚の帯まで");
  // ジャスト倍率は輪ではなく、戦闘の数値の表の項目(D-256)。
  assert.equal("justMultiplier" in h, false);
  const low = normalizeHook({ normal: { ringMs: 1600, successMs: 10, justMs: 0 } }, BASE_HOOK, LIMITS);
  assert.deepEqual(low.normal, { ringMs: 1600, successMs: 250, justMs: 100 });
  const odd = normalizeHook({ normal: { ringMs: NaN, successMs: "x" }, strong: null }, BASE_HOOK, LIMITS);
  assert.deepEqual(odd, normalizeHook(BASE_HOOK, BASE_HOOK, LIMITS), "数でない値は基本の値");
});

test("判定の境界(関数):始まりを含み、終わりを含まない", () => {
  const t = hookTiming(BASE_HOOK.normal);
  assert.equal(judgeHook(t, 0), "early");
  assert.equal(judgeHook(t, 999.999), "early");
  assert.equal(judgeHook(t, 1000), "good");
  assert.equal(judgeHook(t, 1199.999), "good");
  assert.equal(judgeHook(t, 1200), "just");
  assert.equal(judgeHook(t, 1399.999), "just");
  assert.equal(judgeHook(t, 1400), "good");
  assert.equal(judgeHook(t, 1599.999), "good");
});

// 強い魚はブリ(段階 5):ジャストの初撃(10 × 3)では釣れないので、合わせのあとは必ず体力制になる(D-256)。
for (const [fishId, kind, rodStage] of [
  ["aji", FISH_KINDS.WEAK, 1],
  ["buri", FISH_KINDS.STRONG, 5],
]) {
  test(`判定の境界(ゲームの中、${kind}):早すぎ/成功/ジャスト/遅すぎ`, () => {
    const timing = currentHookTiming(untilBite(fishId, { rodStage }));
    const cases = [
      [0, "early"],
      [timing.successStart - 1, "early"],
      [timing.successStart, "good"],
      [timing.justStart - 1, "good"],
      [timing.justStart, "just"],
      [timing.justEnd - 1, "just"],
      [timing.justEnd, "good"],
      [timing.ringMs - 1, "good"],
    ];
    for (const [t, grade] of cases) {
      const { game, result } = tapAt(fishId, t, { rodStage });
      assert.equal(result.grade, grade, `${t} ミリ秒`);
      if (grade === "early") {
        assert.equal(game.phase, PHASES.RESULT);
        assert.deepEqual([game.lastResult.outcome, game.lastResult.reason], [OUTCOMES.ESCAPED, REASONS.EARLY]);
      } else {
        assert.equal(game.phase, kind === FISH_KINDS.WEAK ? PHASES.REELING : PHASES.MINIGAME);
      }
    }
    // 輪の時間ちょうどで、タップしていなければ遅すぎ。
    const { game, result } = tapAt(fishId, timing.ringMs, { rodStage });
    assert.equal(result, null);
    assert.deepEqual([game.lastResult.outcome, game.lastResult.reason], [OUTCOMES.ESCAPED, REASONS.LATE]);
    assert.equal(tap(game), null, "逃げたあとのタップは何もしない");
    assert.deepEqual(game.progress, progressAt(rodStage));
  });
}

test("「!」が出る前のタップは、何も変えない(逃げない・数えない)", () => {
  const game = createGame(4);
  for (const phase of [PHASES.CASTING, PHASES.WAITING]) {
    while (game.phase !== phase) update(game, 5);
    const before = JSON.stringify({ ...game, rng: null, critRules: null });
    for (let i = 0; i < 20; i++) assert.equal(tap(game), null);
    assert.equal(JSON.stringify({ ...game, rng: null, critRules: null }), before);
  }
  assert.equal(game.missStreak, 0);
  assert.deepEqual(game.results, []);
});

test("連打は成功しない:「!」の直後からタップし続けると、全部の魚で最初のタップが早すぎ", () => {
  // ヌシは掛からない(挑戦ボタンで、合わせなしで始まる)ので、弱い魚と強い魚の全種類で確かめる。
  // 珍しい魚(D-406)は、弱い魚と同じ合わせなので、元の弱い魚で確かめる(まれにしか出ないため)。
  for (const fish of FISH_LIST.filter((f) => f.kind !== FISH_KINDS.BOSS && !f.rare)) {
    const game = untilBite(fish.id);
    update(game, 16);
    const r = tap(game);
    assert.equal(r.grade, "early", fish.name);
    assert.equal(game.lastResult.reason, REASONS.EARLY);
    // 続けてタップしても、もう逃げたあとなので何も起きない。
    for (let i = 0; i < 10; i++) {
      update(game, 16);
      assert.equal(tap(game), null);
    }
    assert.deepEqual(game.lastResult.reward, { coins: 0, scales: 0 });
  }
});

test("早すぎ・遅すぎは、どちらも「続けて逃した数」に入り、5 回で休み。成功で数え直し", () => {
  const game = createGame(4);
  const bite = () => {
    while (game.phase !== PHASES.BITE) update(game, 5);
  };
  // 早すぎ・遅すぎを交互に 4 回。
  for (let i = 0; i < 4; i++) {
    bite();
    if (i % 2 === 0) tap(game);
    else update(game, 5000);
    while (game.phase === PHASES.BITE) update(game, 5);
  }
  assert.equal(game.missStreak, 4);
  // 成功で 0 に戻る。
  bite();
  while (game.phaseMs < currentHookTiming(game).successStart) update(game, 1);
  assert.equal(tap(game).grade, "good");
  const before = game.results.length;
  while (game.results.length === before) update(game, 5);
  assert.equal(game.missStreak, 0);
  // 5 回続けて逃すと休み。
  for (let i = 0; i < 5; i++) {
    bite();
    if (i % 2 === 0) tap(game);
    else update(game, 5000);
  }
  while (game.phase === PHASES.RESULT) update(game, 5);
  assert.equal(game.phase, PHASES.RESTING);
});

test("弱い魚は、どの段階でも成功帯の合わせで釣り上げ。ジャストならウロコイン × 1.5(四捨五入、最小 1:D-258)", () => {
  for (const fish of FISH_LIST.filter((f) => f.kind === FISH_KINDS.WEAK && !f.rare)) {
    for (const [at, grade] of [
      ["successStart", "good"],
      ["justStart", "just"],
    ]) {
      const game = untilBite(fish.id);
      update(game, currentHookTiming(game)[at]);
      assert.equal(tap(game).grade, grade);
      update(game, DEFAULT_CONFIG.reelMs);
      assert.equal(game.phase, PHASES.RESULT, fish.name);
      assert.equal(game.lastResult.outcome, OUTCOMES.CAUGHT);
      assert.equal(game.lastResult.reason, REASONS.HOOKED);
      assert.equal(game.lastResult.hook, grade);
      const coins = grade === "just" ? Math.max(1, Math.round(fish.reward.coins * 1.5)) : fish.reward.coins;
      assert.deepEqual(game.lastResult.reward, { ...fish.reward, coins });
    }
  }
});

test("範囲外の輪の表でも、合わせは必ず輪の時間で終わる", () => {
  const combat = { ...DEFAULT_CONFIG.combat, hook: { normal: { ringMs: -1, successMs: -1, justMs: -1 }, strong: {} } };
  const game = untilBite("aji", { combat });
  assert.equal(currentHookTiming(game).ringMs, 1000);
  update(game, 1000);
  assert.equal(game.lastResult.reason, REASONS.LATE);
});
