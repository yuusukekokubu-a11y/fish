// 画面の入り口:ゲームの状態を時間で進め、絵と数を描き、タップを受け取る。

import { createGame, currentMarker, FISH_KINDS, OUTCOMES, PHASES, phaseDuration, tap, update } from "../core/fishing.js";
import { drawScene } from "./draw.js";

// 1 回の描画で進める時間の上限。裏に回って戻ったときに、一気に何匹も進まないようにする。
const MAX_STEP_MS = 100;

/** シードの指定がないときに使う、毎回ちがうシード。計算本体では Math.random を使わない(D-021)。 */
function randomSeed() {
  return Math.floor(Math.random() * 1000000);
}

function readSeed() {
  const value = new URLSearchParams(location.search).get("seed");
  return value === null || value === "" ? randomSeed() : value;
}

function messageFor(game) {
  switch (game.phase) {
    case PHASES.CASTING:
      return "";
    case PHASES.WAITING:
      return "待っています…";
    case PHASES.BITE:
      return game.cast.kind === FISH_KINDS.STRONG ? "強い魚だ!" : "掛かった!";
    case PHASES.REELING:
      return "";
    case PHASES.MINIGAME:
      return "";
    case PHASES.RESULT: {
      const r = game.lastResult;
      if (r.outcome === OUTCOMES.ESCAPED) return "逃げられた…";
      return r.kind === FISH_KINDS.STRONG ? "強い魚を釣り上げた!" : "普通の魚が釣れた";
    }
    default:
      return "";
  }
}

function main() {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const el = {
    normal: document.getElementById("count-normal"),
    strong: document.getElementById("count-strong"),
    escaped: document.getElementById("count-escaped"),
    message: document.getElementById("message"),
    seed: document.getElementById("seed"),
  };

  const game = createGame(readSeed());
  el.seed.textContent = `seed ${game.seed}`;

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    tap(game);
  });

  let last = performance.now();
  function frame(now) {
    update(game, Math.min(MAX_STEP_MS, now - last));
    last = now;

    const rect = canvas.getBoundingClientRect();
    drawScene(
      ctx,
      rect.width,
      rect.height,
      {
        phase: game.phase,
        progress: Math.min(1, game.phaseMs / phaseDuration(game)),
        kind: game.cast.kind,
        zone: game.cast.zone,
        marker: currentMarker(game),
        caught: game.lastResult?.outcome === OUTCOMES.CAUGHT,
      },
      now,
    );
    el.normal.textContent = game.counts.normal;
    el.strong.textContent = game.counts.strong;
    el.escaped.textContent = game.counts.escaped;
    el.message.textContent = messageFor(game);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
