// 画面の絵を描く。背景は釣り場のドット絵(D-385。まだ読んでいない・絵のない釣り場は色の段)、魚もドット絵(D-386。絵のない魚は丸い形)。
// 体力のバー・命中のゲージ・札は、ドット絵の箱(px_draw.js:D-398)。竿・糸・浮き・輪は簡素な図形。

import { PHASES } from "../core/fishing.js";
import { ART_HORIZON } from "./area_bg.js";
import { BOSS_DOT, FISH_DOT } from "./fish_art.js";
import { PX, PX_COLORS, pxBar, pxBox, pxLabel, pxText } from "./px_draw.js";

const COLORS = {
  skyTop: "#7ec8e3",
  skyBottom: "#c9ecf6",
  water: "#1b6ca8",
  waterDeep: "#0b3954",
  line: "rgba(255,255,255,0.8)",
  rod: "#5b3a1a",
  bobberTop: "#e63946",
  bobberBottom: "#ffffff",
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

/**
 * 魚を描く。ドット絵(1 マス = 1 画素の canvas:D-386)があれば、それを (x, y) を真ん中にして拡大して写す(補間なし)。
 * 1 マスの大きさは、魚 3px・ヌシ(36 マスの絵)6px。big なら魚を 4px にする(釣れたあとの大きな絵)。絵がなければ丸い形。
 */
function drawFishOrArt(ctx, x, y, size, color, art, big = false) {
  if (!art) return drawFish(ctx, x, y, size, color);
  const dot = art.width > 32 ? BOSS_DOT : big ? FISH_DOT + 1 : FISH_DOT;
  const w = art.width * dot;
  const h = art.height * dot;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art, Math.round(x - w / 2), Math.round(y - h / 2), w, h);
}

/**
 * 降臨のキャラ(64 × 64 マス:D-396)を、画面の幅いっぱいに描く(1 マス = 幅 ÷ 64 の整数。体力のバーより上に収まらなければ小さくする)。
 * ゆっくり上下に揺らす。
 */
function drawRaidArt(ctx, w, h, art, timeMs) {
  const room = h * 0.8 - 56 - 48;
  const dot = Math.max(1, Math.min(Math.floor(w / art.width), Math.floor(room / art.height)));
  const size = art.width * dot;
  const x = Math.round((w - size) / 2);
  const y = Math.round(48 + (room - art.height * dot) / 2 + Math.sin(timeMs / 500) * 4);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(art, x, y, size, art.height * dot);
}

/** 空と海。colors は釣り場の色({ sky: [上, 下], sea: [上, 下] }:D-278)。なければ港の色。 */
function paintBackground(ctx, w, h, waterY, colors) {
  const skyColors = colors?.sky ?? [COLORS.skyTop, COLORS.skyBottom];
  const seaColors = colors?.sea ?? [COLORS.water, COLORS.waterDeep];
  const sky = ctx.createLinearGradient(0, 0, 0, waterY);
  sky.addColorStop(0, skyColors[0]);
  sky.addColorStop(1, skyColors[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, waterY);
  const water = ctx.createLinearGradient(0, waterY, 0, h);
  water.addColorStop(0, seaColors[0]);
  water.addColorStop(1, seaColors[1]);
  ctx.fillStyle = water;
  ctx.fillRect(0, waterY, w, h - waterY);
}

/**
 * 背景の絵(1 マス = 1 画素の canvas:D-385)を、画面の幅に合わせて拡大して描く。水平線(ART_HORIZON 行目)を水面 waterY に合わせる。
 * 絵が画面の上や下に届かないところは、絵のいちばん上・いちばん下の行を伸ばして埋める。補間はしない(ドットのまま)。
 */
function paintArt(ctx, w, h, waterY, image) {
  const s = w / image.width;
  const top = waterY - ART_HORIZON * s;
  const bottom = top + image.height * s;
  ctx.imageSmoothingEnabled = false;
  if (top > 0) ctx.drawImage(image, 0, 0, image.width, 1, 0, 0, w, top + 1);
  if (bottom < h) ctx.drawImage(image, 0, image.height - 1, image.width, 1, 0, bottom - 1, w, h - bottom + 1);
  ctx.drawImage(image, 0, top, w, image.height * s);
}

// 空と海は、色・絵と大きさが変わらない間は、描いた絵を取っておいて写すだけにする(毎回の色の重ね塗りは重い:D-284)。
// 釣り場を移る間(0.5 秒)は、前と次の 2 枚を取っておいて重ねる(D-385)。
/** @type {Map<string, HTMLCanvasElement>} */
const layers = new Map();
/** @type {WeakMap<HTMLCanvasElement, number>} */
const imageIds = new WeakMap();
let nextImageId = 1;

/** 1 枚の背景(絵があれば絵、なければ色の段)を、取っておいた canvas で返す。 */
function backgroundLayer(w, h, ratio, waterY, colors, image) {
  if (image && !imageIds.has(image)) imageIds.set(image, nextImageId++);
  const what = image ? `art${imageIds.get(image)}` : colors ? [...colors.sky, ...colors.sea].join(",") : "";
  const key = `${w}x${h}@${ratio}:${what}`;
  let canvas = layers.get(key);
  if (!canvas) {
    if (layers.size >= 4) layers.clear();
    canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * ratio));
    canvas.height = Math.max(1, Math.round(h * ratio));
    const bg = canvas.getContext("2d");
    bg.setTransform(ratio, 0, 0, ratio, 0, 0);
    if (image) paintArt(bg, w, h, waterY, image);
    else paintBackground(bg, w, h, waterY, colors);
    layers.set(key, canvas);
  }
  return canvas;
}

/**
 * 空と海を描く。art は釣り場の背景の絵({ from, to, t }:to が いまの釣り場、from が前の釣り場、t は切り替えの進み 0〜1)。
 * 絵がない(まだ読んでいない・表にない釣り場)ときは、colors の色の段で描く。
 */
function drawBackground(ctx, w, h, waterY, colors = null, art = null) {
  if (typeof document === "undefined") return paintBackground(ctx, w, h, waterY, colors);
  const ratio = typeof ctx.getTransform === "function" ? Math.abs(ctx.getTransform().a) || 1 : 1;
  const to = backgroundLayer(w, h, ratio, waterY, colors, art?.to ?? null);
  const t = art ? Math.min(1, Math.max(0, art.t)) : 1;
  if (art?.from && t < 1) {
    ctx.drawImage(backgroundLayer(w, h, ratio, waterY, colors, art.from), 0, 0, w, h);
    ctx.globalAlpha = t;
    ctx.drawImage(to, 0, 0, w, h);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.drawImage(to, 0, 0, w, h);
}

/**
 * ミニゲームのゲージ(D-092・D-398):へこんだ溝に、命中範囲(緑)と往復する印(白。黒い縁つき)。
 * 上に数値つきの体力のバー、下に制限時間の残りの細いバー。どれもドット絵の箱。
 */
function drawGauge(ctx, w, h, view) {
  const gx = Math.round(w * 0.08);
  const gw = Math.round(w * 0.84);
  const gy = Math.round(h * 0.8);
  const gh = 36;
  // 溝と命中範囲。
  pxBox(ctx, gx, gy, gw, gh, { fill: PX_COLORS.well, hi: "#1d1006", lo: PX_COLORS.wellHi });
  const ix = gx + PX;
  const iw = gw - PX * 2;
  const iy = gy + PX;
  const ih = gh - PX * 2;
  const zx = Math.round(ix + iw * view.zone.start);
  const zw = Math.round(iw * (view.zone.end - view.zone.start));
  ctx.fillStyle = PX_COLORS.green;
  ctx.fillRect(zx, iy, zw, ih);
  ctx.fillStyle = PX_COLORS.greenHi;
  ctx.fillRect(zx, iy, zw, PX);
  ctx.fillStyle = PX_COLORS.greenLo;
  ctx.fillRect(zx, iy + ih - PX, zw, PX);
  // 芯・縁のスキルを付けているときだけ、命中範囲の中に帯を重ねる(芯は濃い緑、縁は両端の金色:D-209)。
  if (view.bands) {
    const half = zw / 2;
    if (view.bands.edge !== null) {
      const ew = Math.round(half * (1 - view.bands.edge));
      ctx.fillStyle = PX_COLORS.edge;
      ctx.fillRect(zx, iy, ew, ih);
      ctx.fillRect(zx + zw - ew, iy, ew, ih);
    }
    if (view.bands.core !== null) {
      const cw = Math.round(half * view.bands.core);
      ctx.fillStyle = PX_COLORS.core;
      ctx.fillRect(zx + Math.round(half) - cw, iy, cw * 2, ih);
    }
  }
  // 印:白い棒に黒い縁。溝から上下に少しはみ出す。
  const mx = Math.round(ix + iw * view.marker);
  ctx.fillStyle = PX_COLORS.ink;
  ctx.fillRect(mx - 5, gy - 8, 10, gh + 16);
  ctx.fillStyle = PX_COLORS.white;
  ctx.fillRect(mx - 2, gy - 5, 4, gh + 10);

  // 体力:数値つきの横長のバー(D-092)。
  const bh = 24;
  const by = gy - 14 - bh;
  pxBar(ctx, gx, by, gw, bh, view.maxHp > 0 ? view.hp / view.maxHp : 0, { fill: PX_COLORS.red, hi: PX_COLORS.redHi, lo: PX_COLORS.redLo });
  pxText(ctx, `${view.hp} / ${view.maxHp}`, Math.round(w / 2), by + 17, { font: "bold 14px system-ui, sans-serif" });
  // 制限時間の残り:細い金の棒。
  pxBar(ctx, gx, gy + gh + 8, gw, 12, view.timeLeft, { fill: PX_COLORS.gold, hi: PX_COLORS.goldHi, lo: PX_COLORS.goldLo });

  // 魚の防御(体力のバーの上。貫通があれば実効防御も。100% 以上は赤:D-235)。
  let top = by - 8;
  if (view.defense) {
    top -= 26;
    pxLabel(ctx, view.defense.text, Math.round(w / 2), top, { align: "center", color: view.defense.high ? PX_COLORS.redHi : PX_COLORS.text });
  }
  // 連撃の段数(左)と、次の命中で効く条件の短い名前(右)。説明の文章は置かない(D-191)。
  const badges = view.badges;
  if (badges && (badges.combo || badges.labels.length > 0)) {
    top -= 30;
    if (badges.combo) pxLabel(ctx, badges.combo, gx, top, { align: "left", color: PX_COLORS.gold });
    if (badges.labels.length > 0) pxLabel(ctx, badges.labels.join("・"), gx + gw, top, { align: "right", color: PX_COLORS.info });
  }
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
  // 輪は黒い縁つきの白(釣れるクレートの輪は金色で太く、「クレート!」:D-333)。
  const width = hook.gold ? 7 : 4;
  ctx.strokeStyle = PX_COLORS.ink;
  ctx.lineWidth = width + 4;
  ctx.beginPath();
  ctx.arc(bobber.x, bobber.y, r(t), 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = hook.gold ? PX_COLORS.gold : PX_COLORS.white;
  ctx.lineWidth = width;
  ctx.stroke();
  if (hook.gold) {
    pxText(ctx, "クレート!", bobber.x, bobber.y - RING_MAX - 8, { color: PX_COLORS.gold, font: "bold 30px system-ui, sans-serif" });
    return;
  }
  pxText(ctx, "!", bobber.x, bobber.y - RING_MAX - 8, { color: PX_COLORS.gold, font: "bold 44px system-ui, sans-serif" });
}

/** 釣れるクレートの箱(巻き上げと結果で、魚の代わりに描く)。 */
function drawCrate(ctx, x, y, size) {
  const w = size * 2;
  const lid = Math.round(size * 0.5);
  pxBox(ctx, x - size, y - size * 0.7, w, lid + PX, { fill: "#8d5a2b", hi: "#b57a3e", lo: "#5e3a19" });
  pxBox(ctx, x - size, y - size * 0.7 + lid, w, size * 1.4 - lid, { fill: "#a86b35", hi: "#c8884a", lo: "#7a4a22" });
  // 金の帯(釣れるクレートの印)。
  ctx.fillStyle = PX_COLORS.gold;
  ctx.fillRect(Math.round(x - PX), Math.round(y - size * 0.7), PX * 2, Math.round(size * 1.4));
}

/**
 * 1 枚の絵を描く。view はゲームの状態から作った、描くのに必要な値。
 * timeMs は画面の揺れなどの飾りにだけ使う(ゲームの結果には関係しない)。
 */
export function drawScene(ctx, w, h, view, timeMs) {
  const waterY = h * 0.42;
  drawBackground(ctx, w, h, waterY, view.colors ?? null, view.art ?? null);

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

  // 仕切り直しのストック(グローブ:D-334)。左上に小さく。
  if (view.retry && (view.phase === PHASES.CASTING || view.phase === PHASES.WAITING || view.phase === PHASES.BITE)) {
    pxLabel(ctx, view.retry, 8, 60, { align: "left", color: PX_COLORS.info });
  }

  // 魚の色と大きさは、設定表(src/core/fish.js)の値を使う。
  const fishColor = view.fish.color;
  const fishSize = view.fish.size;
  if (view.crate && (view.phase === PHASES.REELING || (view.phase === PHASES.RESULT && view.caught))) {
    // 釣れるクレート:魚の代わりに箱(D-333)。
    const p = view.phase === PHASES.REELING ? { x: bobber.x, y: bobber.y + 20 } : { x: w * 0.5, y: h * 0.55 };
    drawCrate(ctx, p.x, p.y, view.phase === PHASES.REELING ? 16 : 30);
  } else if (view.phase === PHASES.REELING) {
    drawFishOrArt(ctx, bobber.x, bobber.y + fishSize, fishSize, fishColor, view.fishArt ?? null);
  } else if (view.phase === PHASES.BITE) {
    drawHookRing(ctx, bobber, view.hook);
  } else if (view.raidArt && (view.phase === PHASES.MINIGAME || view.phase === PHASES.RESULT)) {
    // 降臨のキャラ(D-396):戦いと結果の間は、画面の幅いっぱい。
    drawRaidArt(ctx, w, h, view.raidArt, timeMs);
    if (view.phase === PHASES.MINIGAME) drawGauge(ctx, w, h, view);
  } else if (view.phase === PHASES.MINIGAME) {
    drawFishOrArt(ctx, target.x + Math.sin(timeMs / 120) * 20, target.y + 60, fishSize, fishColor, view.fishArt ?? null);
    drawGauge(ctx, w, h, view);
  } else if (view.phase === PHASES.RESULT && view.caught) {
    drawFishOrArt(ctx, w * 0.5, h * 0.55, fishSize * 1.6, fishColor, view.fishArt ?? null, true);
  }
}
