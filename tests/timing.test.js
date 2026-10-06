// タイミング補正と、確かめ用の表示の数のテスト(タップのラグの条件 4・5:D-285・D-286)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { encodeSaveCode } from "../src/core/savecode.js";
import {
  clampTiming,
  createRecent,
  DEBUG_TIMING_KEY,
  loadTiming,
  perfText,
  recentStats,
  saveTiming,
  suggestTiming,
  TIMING_KEY,
  timingKeyFor,
  timingLabel,
} from "../src/ui/timing.js";
import { DEBUG_SAVE_KEY, SAVE_KEY } from "../src/ui/save_store.js";
import { progressAt } from "./helpers.js";

/** localStorage の代わり。 */
function memory() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map };
}

test("補正は ±100 ミリ秒・5 ミリ秒刻みに丸める。数でなければ 0。見せ方は「+15 ms」「−20 ms」「0 ms」", () => {
  assert.deepEqual([0, 5, 7, 8, -12, 100, 101, 250, -250, -100].map(clampTiming), [0, 5, 5, 10, -10, 100, 100, 100, -100, -100]);
  for (const bad of [NaN, Infinity, "x", "", null, undefined, {}]) assert.equal(clampTiming(bad), 0, String(bad));
  assert.equal(clampTiming("35"), 35);
  assert.deepEqual([15, -20, 0, -0].map(timingLabel), ["+15 ms", "−20 ms", "0 ms", "0 ms"]);
});

test("補正の保存場所は、本番とデバッグで別。ゲームの保存場所とも別。読むときも丸める", () => {
  assert.equal(timingKeyFor({ debug: false }), TIMING_KEY);
  assert.equal(timingKeyFor({ debug: true }), DEBUG_TIMING_KEY);
  assert.notEqual(TIMING_KEY, DEBUG_TIMING_KEY);
  assert.ok(![SAVE_KEY, DEBUG_SAVE_KEY].includes(TIMING_KEY) && ![SAVE_KEY, DEBUG_SAVE_KEY].includes(DEBUG_TIMING_KEY));
  const m = memory();
  assert.equal(loadTiming(m, TIMING_KEY), 0, "なければ 0");
  assert.equal(saveTiming(m, TIMING_KEY, 33), 35);
  assert.equal(m.map.get(TIMING_KEY), "35");
  assert.equal(loadTiming(m, TIMING_KEY), 35);
  assert.equal(loadTiming(m, DEBUG_TIMING_KEY), 0, "デバッグとは別");
  m.setItem(TIMING_KEY, "9999");
  assert.equal(loadTiming(m, TIMING_KEY), 100, "範囲外は丸める");
  m.setItem(TIMING_KEY, "abc");
  assert.equal(loadTiming(m, TIMING_KEY), 0);
  const broken = { getItem: () => { throw new Error("使えない"); }, setItem: () => { throw new Error("使えない"); } };
  assert.equal(loadTiming(broken, TIMING_KEY), 0);
  assert.equal(saveTiming(broken, TIMING_KEY, 20), 20, "書けなくても、その回は使う");
});

test("セーブコードに補正は入らない(補正は進み具合とは別に持つ)", () => {
  const p = progressAt(3);
  const code = encodeSaveCode(p);
  assert.ok(!("timing" in p));
  assert.equal(encodeSaveCode({ ...p }), code);
  assert.ok(!/timing/i.test(code));
});

test("測る:遅く押す人は −(判定を早める)、早く押す人は + の目安。0 個なら null", () => {
  assert.equal(suggestTiming([]), null);
  assert.deepEqual(suggestTiming([30, 40, 20]), { average: 30, suggestion: -30 });
  assert.deepEqual(suggestTiming([-12, -18]), { average: -15, suggestion: 15 });
  assert.deepEqual(suggestTiming([300, 400]), { average: 350, suggestion: -100 }, "範囲で止める");
});

test("確かめ用の表示:直近の数だけを持ち、平均と最大を出す", () => {
  const r = createRecent(3);
  for (const v of [10, 20, 30, 40]) r.push(v);
  assert.deepEqual(r.values, [20, 30, 40]);
  assert.deepEqual(recentStats(r.values), { avg: 30, max: 40, n: 3 });
  assert.deepEqual(recentStats([]), { avg: 0, max: 0, n: 0 });
  assert.equal(perfText([4, 8], [16.7, 33.3]), "入力の遅れ 平均 6 / 最大 8 ms(2 回)\nフレーム 平均 25 / 最大 33.3 ms(2)");
});
