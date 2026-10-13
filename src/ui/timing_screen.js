// @ts-check
// 設定の画面の「タイミング補正」(D-285)。− と + で 5 ミリ秒ずつ変える(±100 ミリ秒)。「0 に戻す」。
// 「測る」:バーの上を往復する印が、真ん中の線を通る瞬間に 8 回押して、ずれの平均と補正の目安を出す(「この値にする」で決める:D-417)。
// 値は端末ごとの別の保存場所に持つ(ゲームの保存データとセーブコードには入れない)。数と文字は timing.js。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { markerPosition } from "../core/minigame.js";
import { button, el } from "./list_view.js";
import { openSheet } from "./sheet.js";
import { clampTiming, measureDeviation, suggestTiming, TIMING_EARLIER, TIMING_LATER, TIMING_MAX, TIMING_MIN, TIMING_STEP, timingLabel } from "./timing.js";

/** 測るときの、印が端から端まで動く時間(戦いのゲージと同じ往復:D-417)と、押す回数。 */
export const MEASURE_SWEEP_MS = 1000;
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
  const measure = button("測る(バーに合わせて 8 回押す)", "secondary-button timing-measure");
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
 * 測る:印が真ん中の線を通る瞬間(MEASURE_SWEEP_MS の半分ずれて、MEASURE_SWEEP_MS ごと)と、押した時刻とのずれを集める。
 * @param {HTMLElement} app @param {TimingCtx} timing @param {() => void} onChange
 */
function openMeasure(app, timing, onChange) {
  openSheet(app, (panel, close) => {
    panel.classList.add("timing-sheet");
    const title = el("h2", "section-title", "印が真ん中の線を通る瞬間に押す");
    const pad = button("", "timing-pad");
    pad.setAttribute("aria-label", "ここを押す");
    const bar = el("span", "timing-bar");
    const line = el("span", "timing-line");
    const marker = el("span", "timing-marker");
    bar.append(line, marker);
    pad.append(bar);
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
      // 印は端から端へ往復する(戦いのゲージと同じ動き)。
      marker.style.left = `${markerPosition(now - start, MEASURE_SWEEP_MS) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    pad.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (deviations.length >= MEASURE_TAPS) return;
      // 一番近い「印が真ん中を通る瞬間」とのずれ(+ は遅く押した)。
      deviations.push(measureDeviation(event.timeStamp, start, MEASURE_SWEEP_MS));
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
