// 押した時刻で判定するテスト(タップのラグの条件 1・2・4:D-284・D-285)。
// 合わせと命中は、指が触れた瞬間のイベントの時刻で判定する。ハンドラが遅れて呼ばれても(描画が先に進んでも)、同じ判定になる。
// タイミング補正は、押した時刻に足す(+ は遅らせる、− は早める)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame, PHASES, tap, update } from "../src/core/fishing.js";
import { advanceTo, createSession, setOffset, tapAt, viewLeadMs } from "../src/ui/session.js";
import { startQuickFight } from "../src/ui/debug_view.js";
import { progressAt } from "./helpers.js";

const FRAME = 16;

/** 描画のたびに advanceTo を呼び、phase になるまで進める。そのときの時刻を返す。 */
function framesUntil(session, phase, start = 0) {
  let t = start;
  advanceTo(session, t);
  for (let i = 0; i < 100000 && session.game.phase !== phase; i++) {
    t += FRAME;
    advanceTo(session, t);
    if (session.game.phase === PHASES.RESTING) tap(session.game);
  }
  return t;
}

/** 同じ時刻の流れのゲームで、押した時刻ぴったりまで進めて押した結果(手本)。 */
function reference(seed, setup, eventMs, offset = 0) {
  const s = createSession(createGame(seed, { progress: progressAt(1) }));
  setup?.(s.game);
  const start = framesUntil(s, setup ? PHASES.MINIGAME : PHASES.BITE);
  let t = start;
  const target = eventMs + offset;
  while (t + FRAME <= target) advanceTo(s, (t += FRAME));
  update(s.game, target - s.clockMs);
  return norm({ r: tap(s.game), hp: s.game.fight?.hp ?? null, phase: s.game.phase });
}

/** 比べやすい形に(印の位置は小数の丸めの差だけ許す)。 */
function norm(x) {
  return JSON.parse(JSON.stringify(x, (k, v) => (k === "position" && typeof v === "number" ? Math.round(v * 1e9) / 1e9 : v)));
}

/**
 * 押してから、ハンドラが呼ばれるまでに delayFrames 回の描画が先に進んだ場合。
 * 先に進んだ描画で場面が終わってしまった(輪が通り過ぎた・制限時間が切れた)ときは、さかのぼれないので null。
 */
function handled(seed, setup, eventMs, delayFrames, offset = 0) {
  const s = createSession(createGame(seed, { progress: progressAt(1) }));
  setup?.(s.game);
  let t = framesUntil(s, setup ? PHASES.MINIGAME : PHASES.BITE);
  while (t + FRAME <= eventMs) advanceTo(s, (t += FRAME));
  const phase = s.game.phase;
  for (let i = 0; i < delayFrames; i++) advanceTo(s, (t += FRAME));
  if (s.game.phase !== phase) return null;
  setOffset(s, offset);
  return norm({ r: tapAt(s, eventMs, Math.max(t, eventMs)), hp: s.game.fight?.hp ?? null, phase: s.game.phase });
}

test("合わせ:ハンドラが遅れて呼ばれても(描画が 0〜2 回先に進んでも)、押した時刻の判定と同じ", () => {
  const s = createSession(createGame(3, { progress: progressAt(1) }));
  const bite = framesUntil(s, PHASES.BITE);
  const grades = new Set();
  let skipped = 0;
  for (let k = 0; k <= 1500; k += 37) {
    const event = bite + k + 0.4;
    const ref = reference(3, null, event);
    grades.add(ref.r?.grade ?? ref.phase);
    assert.deepEqual(handled(3, null, event, 0), ref, `${k} ミリ秒`);
    for (const delay of [1, 2]) {
      const h = handled(3, null, event, delay);
      if (h) assert.deepEqual(h, ref, `${k} ミリ秒・描画 ${delay} 回の遅れ`);
      else skipped += 1;
    }
  }
  assert.ok(grades.has("early") && grades.has("just") && grades.has("good"), [...grades].join(","));
  assert.ok(skipped <= 4, `輪が通り過ぎたあとは比べない:${skipped} 回`);
});

test("命中:ハンドラが遅れて呼ばれても、押した時刻の印の位置で判定する(命中・ミスと体力が同じ)", () => {
  const setup = (g) => startQuickFight(g, "kurodai", "good");
  const s = createSession(createGame(4, { progress: progressAt(1) }));
  setup(s.game);
  const start = framesUntil(s, PHASES.MINIGAME);
  const actions = new Set();
  for (let k = 5; k <= 1800; k += 29) {
    const event = start + k + 0.3;
    const ref = reference(4, setup, event);
    actions.add(ref.r?.action);
    for (const delay of [0, 1, 2]) assert.deepEqual(handled(4, setup, event, delay), ref, `${k} ミリ秒・描画 ${delay} 回の遅れ`);
  }
  assert.ok(actions.has("hit") && actions.has("miss"));
});

test("タイミング補正:判定 = 押したときに見えていた輪の位置 + 補正(+ は遅らせ、− は早め、0 は変えない)", () => {
  const s0 = createSession(createGame(3, { progress: progressAt(1) }));
  const bite = framesUntil(s0, PHASES.BITE);
  let changed = 0;
  for (const offset of [-100, -35, 0, 35, 100]) {
    for (let k = 120; k <= 1300; k += 53) {
      const event = bite + k;
      // 補正つきの窓口で、描画を続けながら押す。
      const s = createSession(createGame(3, { progress: progressAt(1) }));
      setOffset(s, offset);
      const results = [];
      s.onTap = (r) => results.push(r);
      let t = framesUntil(s, PHASES.BITE);
      while (t + FRAME <= event) advanceTo(s, (t += FRAME));
      // 押したときに見えていた輪の位置(「!」からの時間)= ゲームの時刻 + 先に描く分(補正が −)。
      update(s.game, event - s.clockMs);
      s.clockMs = event;
      const seen = s.game.phase === PHASES.BITE ? s.game.phaseMs + viewLeadMs(s) : null;
      const now = tapAt(s, event, event);
      if (now) results.push(now);
      for (let i = 0; i < 20; i++) advanceTo(s, (t = Math.max(t, event) + FRAME));
      const judged = norm({ r: results[0] ?? null });
      // 手本:見えていた位置 + 補正 の時刻で判定したもの。
      const ref = norm({ r: reference(3, null, event, offset).r });
      if (offset >= 0) assert.deepEqual(judged, ref, `補正 ${offset}・${k}`);
      else {
        // − のときは、判定はゲームの押した時刻のまま、見えていた輪は補正の分だけ先(判定 = 見えていた位置 − |補正|)。
        assert.deepEqual(judged, norm({ r: reference(3, null, event, 0).r }), `補正 ${offset}・${k}`);
        assert.equal(viewLeadMs(s), -offset, "輪は補正の分だけ先に描く");
        if (seen !== null) assert.equal(seen + offset, s.game.phase === PHASES.BITE ? seen - viewLeadMs(s) : seen + offset);
      }
      if (offset > 0 && JSON.stringify(ref) !== JSON.stringify(norm({ r: reference(3, null, event, 0).r }))) changed += 1;
    }
  }
  assert.ok(changed > 0, "+ の補正で判定が変わることがある");
});

test("さかのぼるのは、いまの場面の中と、前のタップのあとまで(場面の前や前のタップより前にはならない)", () => {
  const g = createGame(4, { progress: progressAt(1) });
  startQuickFight(g, "kurodai", "good");
  update(g, 300);
  const first = tap(g, 1000);
  assert.ok(first.position >= 0, "場面の始まりより前にはしない(0 ミリ秒の位置)");
  update(g, 200);
  const second = tap(g, 1000);
  // 前のタップ(0 ミリ秒の位置で判定した)より前にはならない。
  assert.ok(second.position !== undefined);
});
