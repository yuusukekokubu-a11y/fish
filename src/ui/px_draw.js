// @ts-check
// 釣りの絵の中の「ドット絵の箱」の描き方(D-398)。theme.css の箱(黒い縁・左上が明るく右下が暗い)と同じ見た目を canvas で描く。
// 色は theme.css の変数と同じ値(canvas からは CSS の変数を読めないので、ここに同じ値を置く)。見た目だけで、計算本体には触れない。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/** 1 ドットの太さ(theme.css の --px と同じ)。 */
export const PX = 3;

/** 色(theme.css と同じ値)。 */
export const PX_COLORS = Object.freeze({
  ink: "#2a1608",
  panel: "#6e4626",
  panelHi: "#9c6b3c",
  panelLo: "#4a2c14",
  well: "#3a2210",
  wellHi: "#5a3a1e",
  text: "#fff4dc",
  muted: "#dcc29a",
  gold: "#ffd166",
  goldHi: "#fff1b8",
  goldLo: "#c4902a",
  goldInk: "#3a2a00",
  red: "#e84a5f",
  redHi: "#ff8fa3",
  redLo: "#8a1f2e",
  green: "#52b788",
  greenHi: "#8ee0b4",
  greenLo: "#2e7d5b",
  core: "#1b7a4e",
  edge: "#e9c46a",
  purple: "#9b5cff",
  purpleHi: "#c9a6ff",
  purpleLo: "#5a2fa0",
  info: "#8be9fd",
  white: "#ffffff",
});

/**
 * 箱:黒い縁(PX)の中を fill で塗り、左上に hi・右下に lo の帯(PX)を入れる。へこみは hi と lo を入れ替えて渡す。
 * 座標は整数に丸める(ドットがにじまないように)。
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {{ fill: string, hi?: string, lo?: string, ink?: string }} c
 */
export function pxBox(ctx, x, y, w, h, c) {
  const X = Math.round(x);
  const Y = Math.round(y);
  const W = Math.round(w);
  const H = Math.round(h);
  ctx.fillStyle = c.ink ?? PX_COLORS.ink;
  ctx.fillRect(X, Y, W, H);
  ctx.fillStyle = c.fill;
  ctx.fillRect(X + PX, Y + PX, W - PX * 2, H - PX * 2);
  if (c.hi) {
    ctx.fillStyle = c.hi;
    ctx.fillRect(X + PX, Y + PX, W - PX * 2, PX);
    ctx.fillRect(X + PX, Y + PX, PX, H - PX * 2);
  }
  if (c.lo) {
    ctx.fillStyle = c.lo;
    ctx.fillRect(X + PX, Y + H - PX * 2, W - PX * 2, PX);
    ctx.fillRect(X + W - PX * 2, Y + PX, PX, H - PX * 2);
  }
}

/**
 * 箱の中の棒(体力・ゲージの溝など):へこんだ箱に、割合 ratio の幅だけ fill を塗る。塗った部分の上に hi、下に lo の帯。
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {number} ratio @param {{ fill: string, hi: string, lo: string }} c
 */
export function pxBar(ctx, x, y, w, h, ratio, c) {
  pxBox(ctx, x, y, w, h, { fill: PX_COLORS.well, hi: "#1d1006", lo: PX_COLORS.wellHi });
  const X = Math.round(x) + PX;
  const Y = Math.round(y) + PX;
  const W = Math.round(w) - PX * 2;
  const H = Math.round(h) - PX * 2;
  const fw = Math.round(W * Math.max(0, Math.min(1, ratio)));
  if (fw <= 0) return;
  ctx.fillStyle = c.fill;
  ctx.fillRect(X, Y, fw, H);
  ctx.fillStyle = c.hi;
  ctx.fillRect(X, Y, fw, PX);
  ctx.fillStyle = c.lo;
  ctx.fillRect(X, Y + H - PX, fw, PX);
}

/**
 * 文字を、黒い影つきで描く(背景の絵の上でも読めるように)。
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y
 * @param {{ color?: string, font?: string, align?: CanvasTextAlign, shadow?: string }} [o]
 */
export function pxText(ctx, text, x, y, o = {}) {
  ctx.font = o.font ?? "bold 15px system-ui, sans-serif";
  ctx.textAlign = o.align ?? "center";
  ctx.fillStyle = o.shadow ?? PX_COLORS.ink;
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = o.color ?? PX_COLORS.text;
  ctx.fillText(text, x, y);
}

/**
 * 小さな札(文字入りの箱)。align で x を左・中・右のどこに合わせるか。高さ 26px、押せる場所ではない。
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y
 * @param {{ align?: CanvasTextAlign, color?: string, fill?: string, font?: string }} [o]
 * @returns {number} 札の幅
 */
export function pxLabel(ctx, text, x, y, o = {}) {
  const font = o.font ?? "bold 14px system-ui, sans-serif";
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 16;
  const h = 26;
  const left = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
  pxBox(ctx, left, y, w, h, { fill: o.fill ?? "rgba(42, 22, 8, 0.82)", hi: "rgba(255, 244, 220, 0.12)" });
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.fillStyle = o.color ?? PX_COLORS.text;
  ctx.fillText(text, Math.round(left + w / 2), Math.round(y + 18));
  return w;
}
