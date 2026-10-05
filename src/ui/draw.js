// 画面の絵を、画像素材を使わずに簡素な図形で描く。

import { PHASES } from "../core/fishing.js";

const COLORS = {
  skyTop: "#7ec8e3",
  skyBottom: "#c9ecf6",
  water: "#1b6ca8",
  waterDeep: "#0b3954",
  line: "rgba(255,255,255,0.8)",
  rod: "#5b3a1a",
  bobberTop: "#e63946",
  bobberBottom: "#ffffff",
  gauge: "rgba(0,0,0,0.45)",
  zone: "#52b788",
  marker: "#ffffff",
};

/** 魚を、楕円の胴と三角の尾びれで描く。 */
function drawFish(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, size, size * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + size * 0.8, y);
  ctx.lineTo(x + size * 1.5, y - size * 0.45);
  ctx.lineTo(x + size * 1.5, y + size * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1d3557";
  ctx.beginPath();
  ctx.arc(x - size * 0.5, y - size * 0.1, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawBackground(ctx, w, h, waterY) {
  const sky = ctx.createLinearGradient(0, 0, 0, waterY);
  sky.addColorStop(0, COLORS.skyTop);
  sky.addColorStop(1, COLORS.skyBottom);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, waterY);
  const water = ctx.createLinearGradient(0, waterY, 0, h);
  water.addColorStop(0, COLORS.water);
  water.addColorStop(1, COLORS.waterDeep);
  ctx.fillStyle = water;
  ctx.fillRect(0, waterY, w, h - waterY);
}

/** ミニゲームのゲージ:当たり範囲(緑)と、往復する印(白)。 */
function drawGauge(ctx, w, h, zone, marker) {
  const gx = w * 0.1;
  const gw = w * 0.8;
  const gy = h * 0.8;
  const gh = 34;
  ctx.fillStyle = COLORS.gauge;
  ctx.fillRect(gx, gy, gw, gh);
  ctx.fillStyle = COLORS.zone;
  ctx.fillRect(gx + gw * zone.start, gy, gw * (zone.end - zone.start), gh);
  ctx.fillStyle = COLORS.marker;
  ctx.fillRect(gx + gw * marker - 3, gy - 8, 6, gh + 16);
  ctx.fillStyle = "#fff";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("緑の中でタップ!", w / 2, gy - 20);
}

/**
 * 1 枚の絵を描く。view はゲームの状態から作った、描くのに必要な値。
 * timeMs は画面の揺れなどの飾りにだけ使う(ゲームの結果には関係しない)。
 */
export function drawScene(ctx, w, h, view, timeMs) {
  const waterY = h * 0.42;
  drawBackground(ctx, w, h, waterY);

  // 竿と糸。竿先は画面の下の真ん中から右上へ。
  const rodBase = { x: w * 0.82, y: h * 0.98 };
  const rodTip = { x: w * 0.62, y: h * 0.3 };
  ctx.strokeStyle = COLORS.rod;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(rodBase.x, rodBase.y);
  ctx.lineTo(rodTip.x, rodTip.y);
  ctx.stroke();

  // 浮きの位置。投げている間は竿先から水面へ飛んでいく。
  const target = { x: w * 0.4, y: waterY + h * 0.08 };
  let bobber = { ...target };
  if (view.phase === PHASES.CASTING) {
    const p = view.progress;
    bobber = {
      x: rodTip.x + (target.x - rodTip.x) * p,
      y: rodTip.y + (target.y - rodTip.y) * p - Math.sin(p * Math.PI) * h * 0.12,
    };
  } else if (view.phase === PHASES.WAITING) {
    bobber.y += Math.sin(timeMs / 300) * 3;
  } else if (view.phase === PHASES.BITE || view.phase === PHASES.MINIGAME) {
    bobber.y += 10 + Math.sin(timeMs / 40) * 5;
  } else if (view.phase === PHASES.REELING) {
    const p = view.progress;
    bobber = { x: target.x + (rodTip.x - target.x) * p, y: target.y + (rodTip.y - target.y) * p };
  }

  if (view.phase !== PHASES.RESULT) {
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rodTip.x, rodTip.y);
    ctx.lineTo(bobber.x, bobber.y);
    ctx.stroke();
    ctx.fillStyle = COLORS.bobberTop;
    ctx.beginPath();
    ctx.arc(bobber.x, bobber.y, 9, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = COLORS.bobberBottom;
    ctx.beginPath();
    ctx.arc(bobber.x, bobber.y, 9, 0, Math.PI);
    ctx.fill();
  }

  // 魚の色と大きさは、設定表(src/core/fish.js)の値を使う。
  const fishColor = view.fish.color;
  const fishSize = view.fish.size;
  if (view.phase === PHASES.REELING) {
    drawFish(ctx, bobber.x, bobber.y + fishSize, fishSize, fishColor);
  } else if (view.phase === PHASES.MINIGAME) {
    drawFish(ctx, target.x + Math.sin(timeMs / 120) * 20, target.y + 60, fishSize, fishColor);
    drawGauge(ctx, w, h, view.zone, view.marker);
  } else if (view.phase === PHASES.RESULT && view.caught) {
    drawFish(ctx, w * 0.5, h * 0.55, fishSize * 1.6, fishColor);
  }
}
