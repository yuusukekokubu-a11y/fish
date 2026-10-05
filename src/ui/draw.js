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

/** 残りの割合(0〜1)を、細い横のバーで描く。 */
function drawTimeBar(ctx, x, y, width, ratio, color) {
  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(x, y, width, 6);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width * Math.max(0, Math.min(1, ratio)), 6);
}

/**
 * ミニゲームのゲージ:当たり範囲(緑)と、往復する印(白)。
 * 上に数値つきの体力のバー、下に制限時間の残りの細いバーを出す(D-092)。
 */
function drawGauge(ctx, w, h, view) {
  const gx = w * 0.1;
  const gw = w * 0.8;
  const gy = h * 0.8;
  const gh = 34;
  ctx.fillStyle = COLORS.gauge;
  ctx.fillRect(gx, gy, gw, gh);
  ctx.fillStyle = COLORS.zone;
  ctx.fillRect(gx + gw * view.zone.start, gy, gw * (view.zone.end - view.zone.start), gh);
  ctx.fillStyle = COLORS.marker;
  ctx.fillRect(gx + gw * view.marker - 3, gy - 8, 6, gh + 16);

  // 体力:数値つきの横長のバー(D-092)。
  const by = gy - 40;
  const bh = 20;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(gx, by, gw, bh);
  ctx.fillStyle = "#e63946";
  ctx.fillRect(gx, by, gw * (view.maxHp > 0 ? view.hp / view.maxHp : 0), bh);
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 1;
  ctx.strokeRect(gx + 0.5, by + 0.5, gw - 1, bh - 1);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 14px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${view.hp} / ${view.maxHp}`, w / 2, by + 15);
  drawTimeBar(ctx, gx, gy + gh + 10, gw, view.timeLeft, "#ffd166");
}

// 縮む輪の大きさ(半径、ピクセル)。「!」のときに最大で、輪の時間が終わると最小になる。
const RING_MAX = 96;
const RING_MIN = 14;

/** 「!」からの時間 t の、輪の半径。 */
function ringRadius(t, ringMs) {
  const p = Math.min(1, Math.max(0, t / ringMs));
  return RING_MAX - (RING_MAX - RING_MIN) * p;
}

/** 2 つの半径のあいだを塗る(帯の目印)。 */
function fillBand(ctx, center, outer, inner, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(center.x, center.y, outer, 0, Math.PI * 2);
  ctx.arc(center.x, center.y, inner, 0, Math.PI * 2, true);
  ctx.fill();
}

/**
 * 掛かった合図:浮きの上の大きな「!」と、浮きに向かって縮む輪(D-082)。
 * 成功帯(緑)とジャスト帯(金)は、輪が重なるべき位置を帯で示す。
 */
function drawHookRing(ctx, bobber, hook) {
  const { t, timing } = hook;
  const r = (ms) => ringRadius(ms, timing.ringMs);
  fillBand(ctx, bobber, r(timing.successStart), r(timing.ringMs), "rgba(82,183,136,0.45)");
  fillBand(ctx, bobber, r(timing.justStart), r(timing.justEnd), "rgba(255,209,102,0.85)");
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(bobber.x, bobber.y, r(t), 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffd166";
  ctx.font = "bold 44px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("!", bobber.x, bobber.y - RING_MAX - 8);
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
  } else if (view.phase === PHASES.RESTING) {
    bobber.y += Math.sin(timeMs / 600) * 2;
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
  } else if (view.phase === PHASES.BITE) {
    drawHookRing(ctx, bobber, view.hook);
  } else if (view.phase === PHASES.MINIGAME) {
    drawFish(ctx, target.x + Math.sin(timeMs / 120) * 20, target.y + 60, fishSize, fishColor);
    drawGauge(ctx, w, h, view);
  } else if (view.phase === PHASES.RESULT && view.caught) {
    drawFish(ctx, w * 0.5, h * 0.55, fishSize * 1.6, fishColor);
  }
}
