// 画面の入り口:ゲームの状態を時間で進め、絵と数を描き、タップとボタンを受け取る。

import { fishById } from "../core/fish.js";
import {
  canUpgradeRod,
  createGame,
  currentMarker,
  FISH_KINDS,
  OUTCOMES,
  PHASES,
  phaseDuration,
  rodUpgradeCost,
  tap,
  update,
  upgradeGameRod,
} from "../core/fishing.js";
import { DEFAULT_CONFIG } from "../core/config.js";
import { parseSave, SAVE_KEY, toSaveData } from "../core/save.js";
import { drawScene } from "./draw.js";
import { addResultEffects, addUpgradeEffects, createEffects, drawEffects, shakeOffset } from "./effects.js";

// 1 回の描画で進める時間の上限。裏に回って戻ったときに、一気に何匹も進まないようにする。
const MAX_STEP_MS = 100;
// 「データを消す」を 2 回目に押せる時間。
const RESET_CONFIRM_MS = 3000;

/** シードの指定がないときに使う、毎回ちがうシード。計算本体では Math.random を使わない(D-021)。 */
function randomSeed() {
  return Math.floor(Math.random() * 1000000);
}

function readSeed() {
  const value = new URLSearchParams(location.search).get("seed");
  return value === null || value === "" ? randomSeed() : value;
}

// 保存の読み書き。ブラウザの設定で使えないときも、エラーで止めずに遊べるようにする(D-050)。
function loadText() {
  try {
    return localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
}

function saveProgress(progress) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(toSaveData(progress)));
  } catch {
    // 保存できなくても遊びは続ける。
  }
}

function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 消せなくても続ける。
  }
}

function messageFor(game) {
  switch (game.phase) {
    case PHASES.WAITING:
      return "待っています…";
    case PHASES.BITE:
      return game.cast.kind === FISH_KINDS.STRONG ? "強い魚だ!" : "掛かった!";
    case PHASES.RESULT: {
      const r = game.lastResult;
      const name = fishById(r.fishId).name;
      if (r.outcome === OUTCOMES.ESCAPED) return `${name}に逃げられた…`;
      return r.kind === FISH_KINDS.STRONG ? `${name}を釣り上げた!` : `${name}が釣れた`;
    }
    default:
      return "";
  }
}

function upgradeLabel(game) {
  const stage = game.progress.rodStage;
  const cost = rodUpgradeCost(game);
  if (cost === null) return `竿 段階${stage}(最大)`;
  return `竿 段階${stage}→${stage + 1} | 素材 ${cost} | 新しい魚が釣れる`;
}

function main() {
  const canvas = document.getElementById("scene");
  const ctx = canvas.getContext("2d");
  const el = {
    coins: document.getElementById("coins"),
    material: document.getElementById("material"),
    message: document.getElementById("message"),
    upgrade: document.getElementById("upgrade"),
    reset: document.getElementById("reset"),
    seed: document.getElementById("seed"),
  };

  const progress = parseSave(loadText(), DEFAULT_CONFIG.rod);
  const game = createGame(readSeed(), { progress });
  const effects = createEffects();
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

  el.upgrade.addEventListener("click", () => {
    if (upgradeGameRod(game)) {
      saveProgress(game.progress);
      addUpgradeEffects(effects, game.progress.rodStage, performance.now());
    }
  });

  let resetArmedUntil = 0;
  el.reset.addEventListener("click", () => {
    const now = performance.now();
    if (now < resetArmedUntil) {
      clearSave();
      location.reload();
      return;
    }
    resetArmedUntil = now + RESET_CONFIRM_MS;
  });

  let shownResults = 0;
  let last = performance.now();
  function frame(now) {
    update(game, Math.min(MAX_STEP_MS, now - last));
    last = now;

    // 新しい結果が出たら、保存して演出を足す。
    while (shownResults < game.results.length) {
      addResultEffects(effects, game.results[shownResults], now);
      shownResults += 1;
      saveProgress(game.progress);
    }

    const rect = canvas.getBoundingClientRect();
    const view = {
      phase: game.phase,
      progress: Math.min(1, game.phaseMs / phaseDuration(game)),
      fish: game.phase === PHASES.RESULT ? fishById(game.lastResult.fishId) : game.cast.fish,
      zone: game.cast.zone,
      marker: currentMarker(game),
      caught: game.lastResult?.outcome === OUTCOMES.CAUGHT,
    };
    ctx.save();
    ctx.translate(shakeOffset(effects, now), 0);
    drawScene(ctx, rect.width, rect.height, view, now);
    ctx.restore();
    drawEffects(ctx, rect.width, rect.height, effects, now);

    el.coins.textContent = game.progress.coins;
    el.material.textContent = game.progress.material;
    el.message.textContent = messageFor(game);
    el.upgrade.textContent = upgradeLabel(game);
    el.upgrade.disabled = !canUpgradeRod(game);
    const armed = now < resetArmedUntil;
    el.reset.classList.toggle("armed", armed);
    el.reset.textContent = armed ? "もう一度押すと消えます" : "データを消す";
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

main();
