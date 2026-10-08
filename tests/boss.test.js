// ヌシ戦のテスト(受け入れ条件 6・7)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { FISH_KINDS, STAGE_LIST } from "../src/core/fish.js";
import {
  canChallengeBoss,
  challengeBoss,
  createGame,
  currentMarker,
  OUTCOMES,
  PHASES,
  REASONS,
  tap,
  update,
} from "../src/core/fishing.js";
import { fishQuirks } from "../src/core/formula.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { createRng } from "../src/core/rng.js";
import { emptyGear } from "../src/core/gear.js";
import { applyPreset } from "../src/ui/debug_view.js";
import { hookGood, progressAt } from "./helpers.js";

/** 腕前のモデル:印が当たり範囲の真ん中に来るたびに、割合 rate で当て、残りは範囲の外で押して外す。 */
function makeSkill(rate, seed) {
  const r = createRng(seed * 7919 + 13);
  let plan = null;
  // 人の指の速さ:タップとタップの間は 250 ミリ秒以上あける(D-260)。
  let last = -Infinity;
  let fightRef = null;
  return (g) => {
    if (g.phase !== PHASES.MINIGAME) return;
    if (g.fight !== fightRef) {
      fightRef = g.fight;
      last = -Infinity;
    }
    if (g.phaseMs - last < 250) return;
    const z = g.fight.zone;
    const p = currentMarker(g);
    if (plan === "miss") {
      if (p < z.start - 0.03 || p > z.end + 0.03) {
        tap(g);
        last = g.phaseMs;
        plan = null;
      }
      return;
    }
    if (Math.abs(p - (z.start + z.end) / 2) < 0.02) {
      if (plan === null) plan = r() < rate ? "hit" : "miss";
      if (plan === "hit") {
        tap(g);
        last = g.phaseMs;
        plan = null;
      }
    }
  };
}

/**
 * ヌシに挑める状態のゲーム。段階 1〜2 は装備なし(装備なしでも倒せる:D-237)。
 * 段階 3 からは装備前提なので、デバッグの「貫通」のプリセット(貫通・連撃・貫など)を付ける(D-254)。
 */
function bossGame(stage, seed = 1, step = ROD_STEPS.CRAFTED, { gear = stage >= 3 } = {}) {
  const game = createGame(seed, { progress: progressAt(stage, step, { coins: 10, scales: { kurodai: 2 }, gear: { ...emptyGear(), seed: 1 } }) });
  if (gear) {
    const before = game.progress.rodStage;
    applyPreset(game, "pen");
    assert.equal(game.progress.rodStage, before);
  }
  return game;
}

/** ヌシ戦を最後まで(または制限時間まで)遊ぶ。かかった時間(ミリ秒)を返す。 */
function fight(game, skill) {
  let t = 0;
  while (game.phase === PHASES.MINIGAME) {
    update(game, 16);
    t += 16;
    skill(game);
  }
  return t;
}

test("未製作ではヌシに挑めない。製作済み・ヌシ撃破なら、投げる・待つの間だけ挑める", () => {
  assert.equal(canChallengeBoss(bossGame(1, 1, ROD_STEPS.NONE)), false);
  assert.equal(challengeBoss(bossGame(1, 1, ROD_STEPS.NONE)), false);
  for (const step of [ROD_STEPS.CRAFTED, ROD_STEPS.DEFEATED]) {
    const game = bossGame(1, 1, step);
    assert.equal(game.phase, PHASES.CASTING);
    assert.equal(canChallengeBoss(game), true);
    while (game.phase !== PHASES.WAITING) update(game, 5);
    assert.equal(canChallengeBoss(game), true);
  }
});

test("魚が掛かっている最中(合わせ・巻き上げ・戦い・結果・休み)は挑めない", () => {
  const game = bossGame(1, 4);
  const seenPhases = new Set();
  for (let t = 0; t < 600000 && seenPhases.size < 5; t += 5) {
    update(game, 5);
    if (![PHASES.CASTING, PHASES.WAITING].includes(game.phase)) {
      seenPhases.add(game.phase);
      assert.equal(canChallengeBoss(game), false, game.phase);
      assert.equal(challengeBoss(game), false);
    }
    if (game.phase === PHASES.BITE && hookGood(game)) tap(game);
  }
  for (const phase of [PHASES.BITE, PHASES.REELING, PHASES.MINIGAME, PHASES.RESULT]) assert.ok(seenPhases.has(phase), phase);
});

test("挑むと、合わせなしで体力制の戦いから始まり、倒すとヌシの鱗とウロコインが手に入り「ヌシ撃破」", () => {
  for (const s of STAGE_LIST) {
    const game = bossGame(s.stage);
    const waiting = game.cast;
    assert.equal(challengeBoss(game), true);
    assert.equal(game.phase, PHASES.MINIGAME);
    assert.equal(game.cast.kind, FISH_KINDS.BOSS);
    assert.equal(game.cast.fish.id, s.boss);
    assert.equal(game.fight.hp, game.cast.fish.minigame.hp);
    fight(game, makeSkill(1, s.stage));
    assert.equal(game.lastResult.outcome, OUTCOMES.CAUGHT, `ヌシ ${s.stage}`);
    assert.equal(game.lastResult.reason, REASONS.HP_ZERO);
    assert.equal(game.progress.scales[s.boss], 1);
    assert.equal(game.progress.coins, 10 + game.cast.fish.reward.coins);
    assert.equal(game.progress.rodStep, ROD_STEPS.DEFEATED);
    assert.deepEqual(game.progress.scales.kurodai, 2, "ほかの鱗は変わらない");
    // 結果のあとは、待っていた魚から釣りを続ける(投げ直しの数は増えない)。
    update(game, game.config.resultMs);
    assert.equal(game.phase, PHASES.CASTING);
    assert.equal(game.cast, waiting);
    assert.equal(game.castCount, 1);
  }
});

test("負けても鱗とウロコインは減らず、工程も変わらず、何度でも挑める", () => {
  const game = bossGame(5, 3);
  for (let i = 0; i < 3; i++) {
    assert.equal(challengeBoss(game), true);
    fight(game, () => {}); // 何もしない
    assert.equal(game.lastResult.outcome, OUTCOMES.ESCAPED);
    assert.equal(game.lastResult.reason, REASONS.TIMEOUT);
    assert.deepEqual(game.progress.scales, { kurodai: 2 });
    assert.equal(game.progress.coins, 10);
    assert.equal(game.progress.rodStep, ROD_STEPS.CRAFTED);
    assert.equal(game.missStreak, 0, "続けて逃した数には入らない");
    update(game, game.config.resultMs);
  }
  assert.equal(game.bossAttempts, 3);
});

test("ヌシ戦は、でたらめなタップでも必ず制限時間のうちに終わる", () => {
  for (const s of STAGE_LIST) {
    for (const chance of [0, 0.05, 0.3, 1]) {
      const game = bossGame(s.stage, 11);
      challengeBoss(game);
      const limit = game.fight.timeLimitMs;
      const rng = createRng(s.stage * 31 + chance * 100);
      const t = fight(game, (g) => {
        if (rng() < chance) tap(g);
      });
      assert.equal(game.phase, PHASES.RESULT);
      assert.ok(t <= limit + 16, `${t} > ${limit}`);
    }
  }
});

test("当たり範囲で押せる割合が 100% なら、全部のヌシに必ず勝つ(段階 1〜2 は装備なし、3 からは貫通の装備。シード 20 個)", () => {
  for (const s of STAGE_LIST) {
    for (let seed = 1; seed <= 20; seed++) {
      const game = bossGame(s.stage, seed);
      challengeBoss(game);
      fight(game, makeSkill(1, seed));
      assert.equal(game.lastResult.outcome, OUTCOMES.CAUGHT, `ヌシ ${s.stage} seed ${seed}`);
    }
  }
});

test("当たり範囲で押せる割合が 70% でも、シード 20 個のうち 8 割以上で勝つ(同じ装備。速い印・短い制限時間のヌシは除く)", () => {
  for (const s of STAGE_LIST) {
    // 速い印のヌシ(沖など)はおもり、短い制限時間のヌシ(深海)は糸・粘りの延長が要る(D-382)。
    // 貫通のプリセットには付かないので、ここでは数えない(合う装備での勝ち方は、重いテストの tests/slow/balance.test.js で確かめる)。
    if (fishQuirks("boss", s.stage).some((q) => q === "short" || q === "fast")) continue;
    let wins = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const game = bossGame(s.stage, seed);
      challengeBoss(game);
      fight(game, makeSkill(0.7, seed + 100));
      if (game.lastResult.outcome === OUTCOMES.CAUGHT) wins += 1;
    }
    assert.ok(wins >= 16, `ヌシ ${s.stage}:${wins} / 20`);
  }
});

test("ヌシ戦の乱数は、挑戦の回数で変わり、魚の並びには影響しない", () => {
  const a = bossGame(1, 5);
  const b = bossGame(1, 5);
  challengeBoss(a);
  challengeBoss(b);
  assert.deepEqual(a.cast.zone, b.cast.zone, "同じシード・同じ回数なら同じ");
  fight(a, () => {});
  update(a, a.config.resultMs);
  challengeBoss(a);
  assert.notDeepEqual(a.cast.zone, b.cast.zone, "2 回目は別の当たり範囲");
  // 待っていた魚は、どちらも 1 匹目のまま。
  fight(a, () => {});
  update(a, a.config.resultMs);
  const plain = bossGame(1, 5);
  assert.equal(a.cast.fish.id, plain.cast.fish.id);
  assert.equal(a.cast.waitMs, plain.cast.waitMs);
});

