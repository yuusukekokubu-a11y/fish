// メニューを開いている間は釣りが止まることのテスト(受け入れ条件 2・3、D-134)。
// 画面は時間とタップを src/ui/session.js を通して渡す。止めている間は、どちらも計算本体に渡さない。

import assert from "node:assert/strict";
import { test } from "node:test";

import { canChallengeBoss, challengeBoss, craftGameRod, createGame, currentMarker, FISH_KINDS, PHASES } from "../src/core/fishing.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { createRng } from "../src/core/rng.js";
import { act, advance, createSession, setPaused, tapSession } from "../src/ui/session.js";
import { hookJust, progressAt } from "./helpers.js";

const FRAME_MS = 16;

/** 上手に遊ぶ操作(ゲームの状態だけを見て決めるので、止めていた時間には左右されない)。 */
function wantsTap(game) {
  if (game.phase === PHASES.BITE) return hookJust(game);
  if (game.phase === PHASES.MINIGAME) {
    const z = game.fight.zone;
    return Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.02;
  }
  return game.phase === PHASES.RESTING;
}

/**
 * ゲームの時間で totalMs まで、16 ミリ秒ずつ遊ぶ。
 * menu(frame, game) が true のフレームではメニューを開いている(止めて、そのフレームでもタップを試す)。
 * 鱗が貯まったら製作し、投げる・待つの間にヌシに挑む。
 */
function playWithMenu(seed, totalMs, menu = () => false) {
  const game = createGame(seed, { progress: progressAt(1, ROD_STEPS.NONE, { scales: { kurodai: 2 } }) });
  const session = createSession(game, { maxStepMs: 100 });
  let played = 0;
  let pausedFrames = 0;
  let ignoredTaps = 0;
  for (let frame = 0; played < totalMs; frame++) {
    const open = menu(frame, game);
    setPaused(session, open);
    if (open) {
      pausedFrames += 1;
      // 開いている間のタップ(メニューの中・外側)は数えない。
      if (tapSession(session) === null) ignoredTaps += 1;
      assert.equal(act(session, (g) => craftGameRod(g)), false);
      assert.equal(advance(session, FRAME_MS), false);
      continue;
    }
    advance(session, FRAME_MS);
    played += FRAME_MS;
    if (wantsTap(game)) tapSession(session);
    act(session, (g) => craftGameRod(g));
    if (game.progress.rodStep === ROD_STEPS.CRAFTED && canChallengeBoss(game)) act(session, (g) => challengeBoss(g));
  }
  return { game, pausedFrames, ignoredTaps };
}

const snapshot = (game) => ({ progress: game.progress, results: game.results, phase: game.phase, phaseMs: game.phaseMs });

test("メニューを開閉する場所と回数を変えても、結果(釣果・ウロコイン・鱗・竿の段階と工程)は完全に同じ", () => {
  const base = playWithMenu(7, 240000);
  assert.ok(base.game.results.some((r) => r.kind === FISH_KINDS.BOSS), "ヌシ戦を含む");
  assert.ok(base.game.results.some((r) => r.kind === FISH_KINDS.STRONG));
  for (const seed of [1, 2, 3]) {
    const rng = createRng(seed);
    // ランダムなフレームで開き、ランダムな長さ(最大 3 秒ぶん)開いたままにする。
    let closeAt = -1;
    const menu = (frame) => {
      if (frame < closeAt) return true;
      if (rng() < 0.01) closeAt = frame + 1 + Math.floor(rng() * 180);
      return frame < closeAt;
    };
    const run = playWithMenu(7, 240000, menu);
    assert.ok(run.pausedFrames > 100 && run.ignoredTaps === run.pausedFrames);
    assert.deepEqual(snapshot(run.game), snapshot(base.game), `開き方 ${seed}`);
  }
});

test("場面ごとに開いて閉じても(待ち・合わせ・巻き上げ・体力制・ヌシ戦・結果)、続きから同じに進む", () => {
  const base = playWithMenu(11, 240000);
  const opened = new Set();
  let closeAt = -1;
  const menu = (frame, game) => {
    if (frame < closeAt) return true;
    const key = `${game.phase}:${game.cast.kind}`;
    if (!opened.has(key) && game.phaseMs > 30) {
      opened.add(key);
      closeAt = frame + 60; // 約 1 秒開く
      return true;
    }
    return false;
  };
  const run = playWithMenu(11, 240000, menu);
  for (const key of ["waiting:weak", "bite:weak", "reeling:weak", "minigame:strong", "minigame:boss", "result:boss"]) {
    assert.ok(opened.has(key), `${key} で開いた`);
  }
  assert.deepEqual(snapshot(run.game), snapshot(base.game));
});

test("開いている間は、待ち時間・合わせの輪・体力制・制限時間が進まず、タップは合わせにも当たりにも数えない", () => {
  const game = createGame(3);
  const session = createSession(game);
  while (game.phase !== PHASES.BITE) advance(session, FRAME_MS);
  advance(session, 1000); // 輪が成功帯に入るころ
  const before = structuredClone({ ...snapshot(game), missStreak: game.missStreak, fight: game.fight, cast: game.cast });
  setPaused(session, true);
  for (let i = 0; i < 300; i++) {
    advance(session, FRAME_MS);
    assert.equal(tapSession(session), null);
  }
  assert.deepEqual({ ...snapshot(game), missStreak: game.missStreak, fight: game.fight, cast: game.cast }, before);
  // 閉じたら、止めたところから続く(輪の時間は 1000 ミリ秒のまま)。
  setPaused(session, false);
  assert.equal(game.phaseMs, before.phaseMs);
  advance(session, FRAME_MS);
  assert.equal(game.phaseMs, before.phaseMs + FRAME_MS);
});

test("ヌシ戦の最中に開いても、体力と制限時間はそのまま。閉じたら続きから", () => {
  const game = createGame(5, { progress: progressAt(1, ROD_STEPS.CRAFTED) });
  const session = createSession(game);
  assert.equal(act(session, (g) => challengeBoss(g)), true);
  for (let i = 0; i < 100; i++) {
    advance(session, FRAME_MS);
    if (wantsTap(game)) tapSession(session);
  }
  const hp = game.fight.hp;
  const ms = game.phaseMs;
  setPaused(session, true);
  for (let i = 0; i < 5000; i++) advance(session, FRAME_MS); // 80 秒(制限時間 30 秒より長い)
  assert.equal(game.phase, PHASES.MINIGAME);
  assert.deepEqual([game.fight.hp, game.phaseMs], [hp, ms]);
  setPaused(session, false);
  advance(session, FRAME_MS);
  assert.equal(game.phaseMs, ms + FRAME_MS);
});

test("1 回に進める時間は上限まで(裏に回って戻ったとき)", () => {
  const game = createGame(1);
  const session = createSession(game, { maxStepMs: 100 });
  advance(session, 5000);
  assert.equal(game.phaseMs, 100);
});
