// @ts-check
// ドット絵のデータの形と、描く部品(D-360〜D-364・D-383)。
// - 1 枚の絵:幅・高さ・パレット(色の一覧)・マスごとの色番号の並び。色番号 0 は透明。
// - 並びは、1 行を 1 つの文字列にして、1 マスを 1 文字(PIXEL_CHARS の位置が色番号)で書く。
// - 描くときは、1 マスを「整数の数の画素」の正方形で塗る(補間なし。縦横比が崩れない)。左右反転もできる。
// ゲームの計算本体(src/core/)とは関係しない。ゲームを開くときには読み込まない(見本のページだけ:D-362)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/** 色番号を書く文字(0 = 透明、1〜61 = パレットの色)。 */
export const PIXEL_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 粗さ(幅)ごとのパレットの色数の上限(透明を除く:D-364)。130 は背景(D-383)。 */
export const PALETTE_LIMITS = Object.freeze({ 32: 16, 64: 24, 128: 48, 130: 32 });

/**
 * ドット絵 1 枚。
 * @typedef {object} PixelArt
 * @property {string} id 識別名(例:kurodai-32)
 * @property {string} name 画面に出す名前
 * @property {number} width 幅(マス)
 * @property {number} height 高さ(マス)
 * @property {readonly string[]} palette 色の一覧(#rrggbb)。palette[0] は透明の印("")
 * @property {readonly string[]} rows マスの並び(height 行、各行 width 文字)
 * @property {"fish" | "background"} [kind] 種類。background は全面を塗る(透明のマスがなくてよい:D-383)。省くと fish
 */

/** 文字 → 色番号(表にない文字は -1)。 @param {string} ch */
export function colorIndex(ch) {
  return PIXEL_CHARS.indexOf(ch);
}

/**
 * 絵の点検。問題の一覧を返す(なければ空)。
 * 幅 × 高さ = マスの数、色番号がパレットの範囲内、パレットの色数が上限以内(32 は 16 色・64 は 24 色・128 は 48 色)、
 * 透明の使い方(palette[0] は透明の印 ""、ほかは #rrggbb で、透明でない色が 1 つ以上・透明のマスが 1 つ以上。
 * 背景は逆に、透明のマスがない:D-383)、
 * 使っていない色がない。
 * @param {PixelArt} art @returns {string[]}
 */
export function checkArt(art) {
  /** @type {string[]} */
  const problems = [];
  const { width, height, palette, rows } = art;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1) return [`${art.id}:幅と高さ`];
  if (rows.length !== height) problems.push(`${art.id}:行の数 ${rows.length} が高さ ${height} とちがう`);
  const cells = rows.reduce((n, r) => n + r.length, 0);
  if (cells !== width * height) problems.push(`${art.id}:マスの数 ${cells} が 幅 × 高さ ${width * height} とちがう`);
  rows.forEach((r, y) => {
    if (r.length !== width) problems.push(`${art.id}:${y} 行目の長さ ${r.length}`);
  });
  if (palette[0] !== "") problems.push(`${art.id}:色番号 0 は透明の印("")にする`);
  palette.slice(1).forEach((c, i) => {
    if (!/^#[0-9a-f]{6}$/.test(c)) problems.push(`${art.id}:色 ${i + 1} の形「${c}」`);
  });
  const colors = palette.length - 1;
  const limit = PALETTE_LIMITS[/** @type {32 | 64 | 128 | 130} */ (width)];
  if (limit !== undefined && colors > limit) problems.push(`${art.id}:色数 ${colors} が上限 ${limit} をこえる`);
  if (colors > PIXEL_CHARS.length - 1) problems.push(`${art.id}:色数 ${colors} は文字で書けない`);
  const used = new Set();
  for (const r of rows) {
    for (const ch of r) {
      const i = colorIndex(ch);
      if (i < 0 || i >= palette.length) {
        problems.push(`${art.id}:色番号「${ch}」がパレットの外`);
        break;
      }
      used.add(i);
    }
  }
  if (art.kind === "background") {
    if (used.has(0)) problems.push(`${art.id}:背景に透明のマスがある(全面を塗る)`);
  } else if (!used.has(0)) problems.push(`${art.id}:透明のマスがない(背景は透明にする)`);
  for (let i = 1; i < palette.length; i++) if (!used.has(i)) problems.push(`${art.id}:色 ${i}(${palette[i]})を使っていない`);
  return [...new Set(problems)];
}

/** データの大きさ(文字数。並びとパレットの文字の合計)。 @param {PixelArt} art */
export function artSize(art) {
  return art.rows.reduce((n, r) => n + r.length, 0) + art.palette.reduce((n, c) => n + c.length, 0);
}

/** 色数(透明を除く)。 @param {PixelArt} art */
export function colorCount(art) {
  return art.palette.length - 1;
}

/**
 * 表示の大きさを決める。1 マス = 整数の数の画素(dot 画素)にして、表示の幅を target(CSS px)にいちばん近づける。
 * 表示の幅の上限 max(CSS px)をこえるときは、こえない最大の整数にする(1 より小さくはしない)。
 * @param {number} cells 幅のマスの数 @param {number} target 表示の幅の目安(CSS px) @param {number} dpr 画面の画素比
 * @param {number} [max] 表示の幅の上限(CSS px)
 * @returns {{ dot: number, cssWidth: number, cssDot: number }} dot:1 マスの画素の数、cssWidth:表示の幅、cssDot:1 マスの CSS px
 */
export function fitScale(cells, target, dpr, max = Infinity) {
  const ratio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  let dot = Math.max(1, Math.round((target * ratio) / cells));
  if ((cells * dot) / ratio > max) dot = Math.max(1, Math.floor((max * ratio) / cells));
  return { dot, cssWidth: (cells * dot) / ratio, cssDot: dot / ratio };
}

/**
 * 絵を描く。1 マスを dot × dot 画素の正方形で塗る(補間なし)。同じ色が横に続くところは 1 つの四角にまとめる。
 * @param {CanvasRenderingContext2D} ctx @param {PixelArt} art
 * @param {{ x?: number, y?: number, dot?: number, flip?: boolean }} [options] flip:左右反転
 */
export function drawArt(ctx, art, options = {}) {
  const { x = 0, y = 0, dot = 1, flip = false } = options;
  ctx.imageSmoothingEnabled = false;
  art.rows.forEach((row, ry) => {
    let start = 0;
    for (let i = 1; i <= row.length; i++) {
      if (i < row.length && row[i] === row[start]) continue;
      const c = colorIndex(row[start]);
      if (c > 0) {
        ctx.fillStyle = art.palette[c];
        const left = flip ? art.width - i : start;
        ctx.fillRect(x + left * dot, y + ry * dot, (i - start) * dot, dot);
      }
      start = i;
    }
  });
}

/**
 * 絵を描いた canvas を作る。画素比 dpr でも、ぼやけず縦横比が崩れないよう、canvas の画素の数を
 * マスの数 × dot にして、CSS の幅を そのまま ÷ dpr にする(image-rendering: pixelated)。
 * @param {PixelArt} art @param {number} target 表示の幅の目安(CSS px) @param {number} dpr
 * @param {{ flip?: boolean, max?: number }} [options] max:表示の幅の上限(CSS px)
 */
export function artCanvas(art, target, dpr, options = {}) {
  const { dot, cssWidth, cssDot } = fitScale(art.width, target, dpr, options.max);
  const canvas = document.createElement("canvas");
  canvas.width = art.width * dot;
  canvas.height = art.height * dot;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${(art.height * dot) / (dpr || 1)}px`;
  canvas.style.imageRendering = "pixelated";
  const ctx = canvas.getContext("2d");
  if (ctx) drawArt(ctx, art, { dot, flip: options.flip });
  return { canvas, dot, cssWidth, cssDot };
}
