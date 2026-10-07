// @ts-check
// 設定の画面の「タイミング補正」(D-285)。− と + で 5 ミリ秒ずつ変える(±100 ミリ秒)。「0 に戻す」。
// 「測る」:縮む輪が一番小さくなる瞬間に 8 回押して、ずれの平均と補正の目安を出す(「この値にする」で決める)。
// 値は端末ごとの別の保存場所に持つ(ゲームの保存データとセーブコードには入れない)。数と文字は timing.js。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { button, el } from "./list_view.js";
import { openSheet } from "./sheet.js";
import { clampTiming, suggestTiming, TIMING_EARLIER, TIMING_LATER, TIMING_MAX, TIMING_MIN, TIMING_STEP, timingLabel } from "./timing.js";

/** 測るときの 1 回の長さ(縮むのに 1 秒、間 0.5 秒)と、押す回数。 */
export const MEASURE_SHRINK_MS = 1000;
export const MEASURE_CYCLE_MS = 1500;
export const MEASURE_TAPS = 8;

/** @typedef {{ get: () => number, set: (v: number) => number }} TimingCtx */

/**
 * タイミング補正の欄を作る。
 * @param {HTMLElement} container @param {TimingCtx} timing @param {HTMLElement} app
 */
export function mountTiming(container, timing, app) {
  const box = el("section", "screen-section timing-section");
  box.append(el("h2", "section-title", "タイミング補正"));
  const row = el("div", "timing-row");
  const minus = button(TIMING_EARLIER, "chip timing-step");
  minus.setAttribute("aria-label", "補正を 5 ミリ秒早める");
  const value = el("output", "timing-value");
  const plus = button(TIMING_LATER, "chip timing-step");
  plus.setAttribute("aria-label", "補正を 5 ミリ秒遅らせる");
  const reset = button("0 に戻す", "chip timing-reset");
  row.append(value, minus, plus, reset);
  const note = el(
    "p",
    "timing-note",
    "合わせと命中で、押した時刻に足す補正です。「早すぎ」が多いときは「遅らせる(+)」、「遅すぎ」が多いときは「早める(−)」を押します。この端末だけの設定で、セーブコードには入りません。",
  );
  const measure = button("測る(輪に合わせて 8 回押す)", "secondary-button timing-measure");
  box.append(row, note, measure);
  container.append(box);

  const render = () => {
    const v = timing.get();
    value.textContent = timingLabel(v);
    minus.disabled = v <= TIMING_MIN;
    plus.disabled = v >= TIMING_MAX;
  };
  minus.addEventListener("click", () => {
    timing.set(timing.get() - TIMING_STEP);
    render();
  });
  plus.addEventListener("click", () => {
    timing.set(timing.get() + TIMING_STEP);
    render();
  });
  reset.addEventListener("click", () => {
    timing.set(0);
    render();
  });
  measure.addEventListener("click", () => openMeasure(app, timing, render));
  render();
}

/**
 * 測る:輪が一番小さくなる瞬間(MEASURE_SHRINK_MS ごと)に押した時刻とのずれを集める。
 * @param {HTMLElement} app @param {TimingCtx} timing @param {() => void} onChange
 */
function openMeasure(app, timing, onChange) {
  openSheet(app, (panel, close) => {
    panel.classList.add("timing-sheet");
    const title = el("h2", "section-title", "輪が一番小さくなった瞬間に押す");
    const pad = button("", "timing-pad");
    pad.setAttribute("aria-label", "ここを押す");
    const ring = el("span", "timing-ring");
    const dot = el("span", "timing-dot");
    pad.append(dot, ring);
    const status = el("p", "timing-status", `あと ${MEASURE_TAPS} 回`);
    status.setAttribute("role", "status");
    const apply = button("この値にする", "primary-button timing-apply");
    apply.hidden = true;
    const done = button("閉じる", "secondary-button timing-close");
    panel.append(title, pad, status, apply, done);

    /** @type {number[]} */
    const deviations = [];
    const start = performance.now() + 300;
    let raf = 0;
    const tick = (/** @type {number} */ now) => {
      const t = (now - start) % MEASURE_CYCLE_MS;
      const shrinking = now >= start && t < MEASURE_SHRINK_MS;
      const scale = shrinking ? 1 - (t / MEASURE_SHRINK_MS) * 0.85 : 0.15;
      ring.style.transform = `scale(${scale})`;
      ring.style.opacity = shrinking ? "1" : "0.3";
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    pad.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (deviations.length >= MEASURE_TAPS) return;
      // 一番近い「一番小さくなる瞬間」とのずれ(+ は遅く押した)。
      const k = Math.round((event.timeStamp - start - MEASURE_SHRINK_MS) / MEASURE_CYCLE_MS);
      const target = start + MEASURE_SHRINK_MS + k * MEASURE_CYCLE_MS;
      deviations.push(event.timeStamp - target);
      const r = suggestTiming(deviations);
      if (deviations.length < MEASURE_TAPS) {
        status.textContent = `あと ${MEASURE_TAPS - deviations.length} 回(いまの平均 ${r?.average ?? 0} ms)`;
        return;
      }
      status.textContent = `ずれの平均 ${r?.average ?? 0} ms(+ は遅め)。補正の目安は ${timingLabel(r?.suggestion ?? 0)}`;
      apply.hidden = false;
      apply.textContent = `${timingLabel(r?.suggestion ?? 0)} にする`;
      apply.onclick = () => {
        timing.set(clampTiming(r?.suggestion ?? 0));
        onChange();
        cancelAnimationFrame(raf);
        close();
      };
    });
    done.addEventListener("click", () => {
      cancelAnimationFrame(raf);
      close();
    });
  });
}
