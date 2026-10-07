// @ts-check
// タイミング補正と、入力の遅れの確かめ(画面に触らない部分:D-285・D-286)。
// - タイミング補正:押した時刻に足す(+ は遅らせる、− は早める)。±100 ミリ秒、5 ミリ秒刻み、既定 0。
//   端末ごとの設定で、ゲームの保存データとセーブコードには入れない(別の保存場所。本番とデバッグで別)。
// - 測る:縮む輪が一番小さくなる瞬間に押したときの「ずれ」(押した時刻 − 一番小さい瞬間)を集め、補正の目安を出す。
// - 入力の遅れとフレーム間隔:?debug のときだけ画面の隅に出す数(直近の平均と最大)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

export const TIMING_KEY = "tsuri:timing";
export const DEBUG_TIMING_KEY = "tsuri:debug-timing";
export const TIMING_MIN = -100;
export const TIMING_MAX = 100;
export const TIMING_STEP = 5;

/** 補正の保存場所(本番とデバッグで別)。 @param {{ debug: boolean }} options */
export function timingKeyFor(options) {
  return options.debug ? DEBUG_TIMING_KEY : TIMING_KEY;
}

/** 補正の値を、範囲(±100)と刻み(5)に丸める。数でなければ 0。 @param {unknown} v */
export function clampTiming(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  const stepped = Math.round(n / TIMING_STEP) * TIMING_STEP;
  return Math.min(TIMING_MAX, Math.max(TIMING_MIN, stepped)) || 0;
}

/** 補正の数だけの見せ方(「+15 ms」「0 ms」「−20 ms」)。 @param {number} v */
export function timingNumber(v) {
  const n = clampTiming(v);
  return n === 0 ? "0 ms" : `${n > 0 ? "+" : "−"}${Math.abs(n)} ms`;
}

/** + と − のボタンの文字(向きを文字でも書く)。 */
export const TIMING_LATER = "遅らせる(+)";
export const TIMING_EARLIER = "早める(−)";

/** 補正の見せ方(「+15 ms(遅らせる)」「0 ms」「−20 ms(早める)」)。 @param {number} v */
export function timingLabel(v) {
  const n = clampTiming(v);
  return n === 0 ? "0 ms" : `${timingNumber(n)}(${n > 0 ? "遅らせる" : "早める"})`;
}

/**
 * 保存場所から読む(なければ 0)。範囲外・不正な値は丸める。
 * @param {{ getItem: (k: string) => string | null }} storage @param {string} key
 */
export function loadTiming(storage, key) {
  try {
    return clampTiming(storage.getItem(key));
  } catch {
    return 0;
  }
}

/**
 * 保存場所に書く(丸めた値)。書いた値を返す。
 * @param {{ setItem: (k: string, v: string) => void }} storage @param {string} key @param {number} v
 */
export function saveTiming(storage, key, v) {
  const n = clampTiming(v);
  try {
    storage.setItem(key, String(n));
  } catch {
    // 書けなくても、その回は使う。
  }
  return n;
}

/**
 * 測ったずれ(ミリ秒。+ は遅く押した)から、補正の目安。遅く押す人は − にする(判定を早める)。
 * ずれが 0 個なら null。
 * @param {readonly number[]} deviations
 */
export function suggestTiming(deviations) {
  if (deviations.length === 0) return null;
  const avg = deviations.reduce((a, b) => a + b, 0) / deviations.length;
  return { average: Math.round(avg), suggestion: clampTiming(-avg) };
}

/**
 * 直近の数の平均と最大(入力の遅れ・フレーム間隔)。少数 1 けた。
 * @param {readonly number[]} values
 */
export function recentStats(values) {
  if (values.length === 0) return { avg: 0, max: 0, n: 0 };
  const sum = values.reduce((a, b) => a + b, 0);
  return { avg: Math.round((sum / values.length) * 10) / 10, max: Math.round(Math.max(...values) * 10) / 10, n: values.length };
}

/**
 * 直近 size 個だけを持つ入れ物。
 * @param {number} size
 */
export function createRecent(size) {
  /** @type {number[]} */
  const values = [];
  return {
    values,
    /** @param {number} v */
    push(v) {
      values.push(v);
      if (values.length > size) values.shift();
    },
  };
}

/**
 * 確かめ用の表示の文(?debug のときだけ:D-286)。
 * @param {readonly number[]} delays @param {readonly number[]} frames
 */
export function perfText(delays, frames) {
  const d = recentStats(delays);
  const f = recentStats(frames);
  return `入力の遅れ 平均 ${d.avg} / 最大 ${d.max} ms(${d.n} 回)\nフレーム 平均 ${f.avg} / 最大 ${f.max} ms(${f.n})`;
}
