// ドット絵のデータと描く部品(D-360〜D-364・D-383):点検・表示の大きさ・補間なしの描き方・左右反転。
// ゲームを開くときに絵のデータを読み込まないこと、見本のページへの入口が ?debug の画面だけにあること。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

import { BG_MINATO, MINATO_HORIZON } from "../src/art/bg/minato.js";
import { KURODAI } from "../src/art/fish/kurodai.js";
import { artSize, checkArt, colorCount, drawArt, fitScale, PALETTE_LIMITS, PIXEL_CHARS } from "../src/art/pixel.js";
import { ROOT } from "./helpers.js";

test("クロダイは 32・64・128 マスの 3 枚。どれも点検(幅×高さ・色番号・色数の上限 16/24/48・透明)に通る", () => {
  assert.deepEqual(KURODAI.map((a) => [a.width, a.height]), [[32, 32], [64, 64], [128, 128]]);
  for (const a of KURODAI) {
    assert.deepEqual(checkArt(a), [], a.id);
    assert.ok(colorCount(a) <= PALETTE_LIMITS[a.width], `${a.id}:${colorCount(a)} 色`);
    assert.equal(a.palette[0], "");
    // 背景は透明:四隅は透明。
    for (const [x, y] of [[0, 0], [a.width - 1, 0], [0, a.height - 1], [a.width - 1, a.height - 1]]) assert.equal(a.rows[y][x], "0");
  }
  // 粗さが細かいほど、色数とデータは増える。
  assert.ok(colorCount(KURODAI[0]) < colorCount(KURODAI[1]) && colorCount(KURODAI[1]) < colorCount(KURODAI[2]));
  assert.ok(artSize(KURODAI[0]) < artSize(KURODAI[1]) && artSize(KURODAI[1]) < artSize(KURODAI[2]));
});

test("港の背景(D-383):幅 130 × 高さ 280、点検に通る(色数は 32 まで)、全面を塗る、水平線は 118 行目", () => {
  assert.equal(BG_MINATO.kind, "background");
  assert.deepEqual([BG_MINATO.width, BG_MINATO.height], [130, 280]);
  assert.deepEqual(checkArt(BG_MINATO), []);
  assert.ok(colorCount(BG_MINATO) <= PALETTE_LIMITS[130], `${colorCount(BG_MINATO)} 色`);
  assert.ok(BG_MINATO.rows.every((r) => !r.includes("0")), "透明のマスがない");
  // 水平線(ゲームの水面 0.42 の位置)。
  assert.equal(MINATO_HORIZON, 118);
  assert.equal(Math.round(280 * 0.42), MINATO_HORIZON);
  // 1 ドット 3px で、幅 390px(スマホの幅)。
  assert.equal(fitScale(BG_MINATO.width, 390, 1).cssWidth, 390);
  // 描くと全面が塗られる(塗った面積 = 幅 × 高さ × dot²)。
  let area = 0;
  const ctx = /** @type {any} */ ({ set fillStyle(_v) {}, fillRect: (_x, _y, w, h) => (area += w * h), imageSmoothingEnabled: true });
  drawArt(ctx, BG_MINATO, { dot: 3 });
  assert.equal(area, 130 * 280 * 9);
});

test("背景の点検:背景は透明のマスがあると問題、魚は透明のマスがないと問題", () => {
  const bg = { id: "b", name: "b", kind: /** @type {"background"} */ ("background"), width: 2, height: 1, palette: ["", "#000000"], rows: ["11"] };
  assert.deepEqual(checkArt(bg), []);
  assert.ok(checkArt({ ...bg, rows: ["01"] }).length > 0, "背景に透明");
  assert.ok(checkArt({ ...bg, kind: "fish" }).length > 0, "魚に透明がない");
});

test("点検は、形のまちがいを見つける", () => {
  const ok = { id: "t", name: "t", width: 2, height: 2, palette: ["", "#000000"], rows: ["01", "10"] };
  assert.deepEqual(checkArt(ok), []);
  const bad = (patch) => checkArt({ ...ok, ...patch });
  assert.ok(bad({ rows: ["01"] }).length > 0, "行の数");
  assert.ok(bad({ rows: ["011", "10"] }).length > 0, "行の長さ");
  assert.ok(bad({ rows: ["02", "10"] }).length > 0, "パレットの外の色番号");
  assert.ok(bad({ rows: ["0!", "10"] }).length > 0, "表にない文字");
  assert.ok(bad({ rows: ["11", "11"] }).length > 0, "透明のマスがない");
  assert.ok(bad({ palette: ["#000000", "#000000"] }).length > 0, "色番号 0 は透明の印");
  assert.ok(bad({ palette: ["", "#000000", "#ffffff"] }).length > 0, "使っていない色");
  assert.ok(bad({ palette: ["", "black"] }).length > 0, "色の形");
  // 粗さごとの色数の上限(32 は 16 色)。
  const many = Array.from({ length: 17 }, (_, i) => `#0000${(i + 16).toString(16)}`);
  const row = PIXEL_CHARS.slice(0, 18) + "0".repeat(14);
  const big = { id: "m", name: "m", width: 32, height: 32, palette: ["", ...many], rows: Array.from({ length: 32 }, () => row) };
  assert.ok(checkArt(big).some((p) => p.includes("上限 16")));
});

test("表示の大きさ:1 マス = 整数の画素の数。表示の幅は目安にいちばん近く、縦横比は崩れない(画素比 1・2・3)", () => {
  for (const dpr of [1, 2, 3]) {
    for (const cells of [32, 64, 128]) {
      for (const target of [96, 160, 192, 320]) {
        const r = fitScale(cells, target, dpr);
        assert.ok(Number.isInteger(r.dot) && r.dot >= 1);
        assert.equal(r.cssWidth, (cells * r.dot) / dpr);
        // 1 つ上・下の整数より、目安に近い(または同じ)。
        for (const other of [r.dot - 1, r.dot + 1].filter((d) => d >= 1)) {
          assert.ok(Math.abs((cells * r.dot) / dpr - target) <= Math.abs((cells * other) / dpr - target) + 1e-9);
        }
      }
    }
  }
  assert.deepEqual(fitScale(32, 160, 1), { dot: 5, cssWidth: 160, cssDot: 5 });
  assert.deepEqual(fitScale(64, 160, 2), { dot: 5, cssWidth: 160, cssDot: 2.5 });
  // 上限:画面の幅をこえない最大の整数(1 より小さくはしない)。
  assert.deepEqual(fitScale(128, 320, 1, 358), { dot: 2, cssWidth: 256, cssDot: 2 });
  assert.equal(fitScale(128, 320, 1, 100).dot, 1);
});

/** 描いた四角を記録する、canvas の代わり。 */
function fakeCtx() {
  const rects = [];
  return {
    rects,
    imageSmoothingEnabled: true,
    fillStyle: "",
    fillRect(x, y, w, h) {
      rects.push({ x, y, w, h, color: this.fillStyle });
    },
  };
}

test("描き方:補間なし(imageSmoothingEnabled = false)で、1 マスを dot × dot の正方形。透明は描かない。左右反転", () => {
  const art = { id: "t", name: "t", width: 4, height: 2, palette: ["", "#111111", "#222222"], rows: ["0112", "2000"] };
  const ctx = fakeCtx();
  drawArt(/** @type {any} */ (ctx), art, { dot: 3 });
  assert.equal(ctx.imageSmoothingEnabled, false);
  assert.deepEqual(ctx.rects, [
    { x: 3, y: 0, w: 6, h: 3, color: "#111111" },
    { x: 9, y: 0, w: 3, h: 3, color: "#222222" },
    { x: 0, y: 3, w: 3, h: 3, color: "#222222" },
  ]);
  const flipped = fakeCtx();
  drawArt(/** @type {any} */ (flipped), art, { dot: 3, flip: true });
  assert.deepEqual(flipped.rects, [
    { x: 3, y: 0, w: 6, h: 3, color: "#111111" },
    { x: 0, y: 0, w: 3, h: 3, color: "#222222" },
    { x: 9, y: 3, w: 3, h: 3, color: "#222222" },
  ]);
  // クロダイ 128 を描いても、塗る面積はちょうど不透明のマスの数 × dot²。
  const k = KURODAI[2];
  const c = fakeCtx();
  drawArt(/** @type {any} */ (c), k, { dot: 2 });
  const opaque = k.rows.reduce((n, r) => n + [...r].filter((ch) => ch !== "0").length, 0);
  assert.equal(c.rects.reduce((n, r) => n + r.w * r.h, 0), opaque * 4);
});

/** あるファイルから import をたどって、読み込むファイルを全部集める。 */
function importGraph(entry) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      const spec = m[1] ?? m[2];
      if (spec.startsWith(".")) walk(resolve(dirname(file), spec));
    }
  };
  walk(entry);
  return [...seen];
}

test("ゲームを開くときは、絵のデータを読み込まない。見本のページへの入口は ?debug の画面だけ", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  assert.doesNotMatch(html, /src\/art\//, "index.html は絵を読まない");
  const entry = join(ROOT, html.match(/<script type="module" src="([^"]+)"/)[1]);
  const files = importGraph(entry);
  assert.ok(files.length > 10, "ゲームの読み込みをたどれている");
  assert.deepEqual(files.filter((f) => f.includes(`${join("src", "art")}`)), [], "ゲームが読み込むファイルに src/art がない");
  // 見本のページへのリンクは、デバッグ画面の 1 か所だけ。
  const ui = readdirSync(join(ROOT, "src", "ui")).filter((f) => f.endsWith(".js"));
  const linking = ui.filter((f) => readFileSync(join(ROOT, "src", "ui", f), "utf8").includes("art/samples.html"));
  assert.deepEqual(linking, ["debug_screen.js"]);
  assert.doesNotMatch(html, /samples\.html/);
});
