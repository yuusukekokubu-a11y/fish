// ドット絵のデータと描く部品(D-360〜D-364・D-383):点検・表示の大きさ・補間なしの描き方・左右反転。
// ゲームを開くときに絵のデータを読み込まないこと、見本のページへの入口が ?debug の画面だけにあること。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";

import { BACKGROUNDS, BG_HORIZON } from "../src/art/bg/index.js";
import { BG_MINATO, MINATO_HORIZON } from "../src/art/bg/minato.js";
import { AREA_ROWS } from "../src/core/areas.js";
import { ART_HORIZON, areaBackground, hasAreaArt } from "../src/ui/area_bg.js";
import { areaOfFishStage, CROWN_GOLD, CROWN_KOURIN, fishArt, hasFishArt, KOURIN_GLOW, kourinPalette } from "../src/ui/fish_art.js";
import { GOLD } from "../scripts/art/fish_common.mjs";
import { FISH_MINATO } from "../src/art/fish/minato.js";
import { FISH_ISO } from "../src/art/fish/iso.js";
import { FISH_KAWA } from "../src/art/fish/kawa.js";
import { FISH_OKI } from "../src/art/fish/oki.js";
import { FISH_GAIYOU } from "../src/art/fish/gaiyou.js";
import { FISH_SHINKAI } from "../src/art/fish/shinkai.js";
import { FISH_ROWS } from "../src/core/fish.js";
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

test("背景は 6 つの釣り場(港・磯・川・沖・外洋・深海:D-384)。どれも 130 × 280・点検に通る・32 色まで・全面を塗る・名前と id が重ならない", () => {
  assert.deepEqual(
    BACKGROUNDS.map((b) => b.areaId),
    AREA_ROWS.map((a) => a.id),
  );
  assert.equal(BG_HORIZON, 118);
  assert.equal(new Set(BACKGROUNDS.map((b) => b.art.id)).size, BACKGROUNDS.length);
  for (const { areaId, art } of BACKGROUNDS) {
    assert.equal(art.kind, "background", areaId);
    assert.deepEqual([art.width, art.height], [130, 280], areaId);
    assert.deepEqual(checkArt(art), [], areaId);
    assert.ok(colorCount(art) <= PALETTE_LIMITS[130], `${areaId}:${colorCount(art)} 色`);
    assert.ok(art.rows.every((r) => !r.includes("0")), `${areaId}:透明のマスがない`);
    assert.ok(art.name.startsWith(AREA_ROWS.find((a) => a.id === areaId)?.name ?? "?"), `${areaId}:名前`);
  }
});

test("夜の背景(D-392):6 つの釣り場にあり、昼と同じ大きさ・点検に通る・32 色まで・全面を塗る。名前は「(夜)」、id は昼の id + -night", () => {
  for (const { areaId, art, night } of BACKGROUNDS) {
    assert.equal(night.kind, "background", areaId);
    assert.deepEqual([night.width, night.height], [art.width, art.height], areaId);
    assert.deepEqual(checkArt(night), [], areaId);
    assert.ok(colorCount(night) <= PALETTE_LIMITS[130], `${areaId}:${colorCount(night)} 色`);
    assert.ok(night.rows.every((r) => !r.includes("0")), `${areaId}:透明のマスがない`);
    assert.equal(night.id, `${art.id}-night`);
    assert.equal(night.name, art.name.replace("(昼)", "(夜)"));
    assert.notDeepEqual(night.palette, art.palette, `${areaId}:色が夜になっている`);
  }
  // 画面がないとき(テスト)は、夜の絵も読まない。
  assert.equal(areaBackground("minato", true), null);
});

test("降臨ヌシの紫の冠(D-392):冠の色は生成の道具と同じ。魚の体は冠と縁の色を使わないので、置き換えで変わるのは冠と縁だけ", () => {
  assert.deepEqual({ ...CROWN_GOLD }, { ...GOLD });
  assert.equal(new Set(Object.values(CROWN_KOURIN)).size, Object.keys(CROWN_KOURIN).length);
  const arts = { ...FISH_MINATO, ...FISH_ISO, ...FISH_KAWA, ...FISH_OKI, ...FISH_GAIYOU, ...FISH_SHINKAI };
  for (const boss of FISH_ROWS.filter((r) => r.kind === "boss")) {
    const art = arts[boss.id];
    const strong = arts[boss.id.replace(/^nushi-/, "")];
    assert.ok(art && strong, boss.id);
    // 冠と縁の色は、もとの魚の絵(32 マス)に出てこない。
    const special = [...Object.values(CROWN_GOLD), boss.color.toLowerCase()];
    assert.deepEqual(strong.palette.filter((c) => special.includes(c.toLowerCase())), [], `${boss.id}:魚の体が冠・縁の色を使っていない`);
    assert.ok(art.palette.some((c) => c.toLowerCase() === boss.color.toLowerCase()), `${boss.id}:縁の色が表の色`);
    const purple = kourinPalette(art.palette, boss.color);
    assert.equal(purple.length, art.palette.length);
    const changed = art.palette.filter((c, i) => c !== purple[i]);
    assert.ok(changed.every((c) => special.includes(c.toLowerCase())), `${boss.id}:変わるのは冠と縁だけ`);
    assert.ok(purple.includes(KOURIN_GLOW) && purple.includes(CROWN_KOURIN.gold), boss.id);
  }
  assert.equal(fishArt({ id: "nushi-kurodai", stage: 1, color: "#9c4f1c" }, "kourin"), null);
});

test("ゲームの背景(D-385):表の 6 つの釣り場には絵があり、あとから足す釣り場は色の段。画面がないとき(テスト)は読まない", () => {
  assert.deepEqual(AREA_ROWS.map((a) => hasAreaArt(a.id)), AREA_ROWS.map(() => true));
  assert.equal(hasAreaArt("a7"), false);
  assert.equal(ART_HORIZON, BG_HORIZON);
  assert.equal(areaBackground("minato"), null);
  assert.equal(areaBackground(null), null);
});

test("6 つの釣り場の魚(D-386〜D-391):弱い魚 5・強い魚 5 は 32 × 32 で 16 色まで、ヌシ 5 は飾りつきの 36 × 36 で 24 色まで。どれも点検に通る", () => {
  for (const [arts, lo, hi] of [[FISH_MINATO, 1, 5], [FISH_ISO, 6, 10], [FISH_KAWA, 11, 15], [FISH_OKI, 16, 20], [FISH_GAIYOU, 21, 25], [FISH_SHINKAI, 26, 30]]) {
    const rows = FISH_ROWS.filter((r) => r.stage >= lo && r.stage <= hi);
    assert.deepEqual(Object.keys(arts).sort(), rows.map((r) => r.id).sort(), `段階 ${lo}〜${hi} の魚 15 匹(ヌシを含む)が全部ある`);
    for (const r of rows) {
      const a = arts[r.id];
      assert.equal(a.id, r.id);
      assert.equal(a.name, r.name, r.id);
      assert.deepEqual(checkArt(a), [], r.id);
      if (r.kind === "boss") {
        assert.deepEqual([a.width, a.height], [36, 36], r.id);
        assert.ok(colorCount(a) <= 24, `${r.id}:${colorCount(a)} 色`);
      } else {
        assert.deepEqual([a.width, a.height], [32, 32], r.id);
        assert.ok(colorCount(a) <= PALETTE_LIMITS[32], `${r.id}:${colorCount(a)} 色`);
      }
    }
  }
  // ゲームで使う:段階 → 釣り場。6 つの釣り場はどれも絵があり、あとから足す釣り場(絵のない釣り場)は丸い形。画面がないとき(テスト)は読まない。
  assert.deepEqual([1, 5, 6, 30].map(areaOfFishStage), ["minato", "minato", "iso", "shinkai"]);
  assert.equal(hasFishArt("minato"), true);
  assert.equal(hasFishArt("iso"), true);
  assert.equal(hasFishArt("kawa"), true);
  assert.equal(hasFishArt("oki"), true);
  assert.equal(hasFishArt("gaiyou"), true);
  assert.equal(hasFishArt("shinkai"), true);
  assert.equal(hasFishArt("area7"), false);
  assert.equal(hasFishArt(null), false);
  assert.equal(fishArt({ id: "aji", stage: 1 }), null);
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

/**
 * あるファイルから import をたどって、読み込むファイルを全部集める。dynamic が false なら、
 * 開いたときに読む import(import 文)だけをたどる(あとで読む import(...) はたどらない)。
 */
function importGraph(entry, dynamic = true) {
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:import|export)[^"'()]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
      if (m[2] && !dynamic) continue;
      const spec = m[1] ?? m[2];
      if (spec.startsWith(".")) walk(resolve(dirname(file), spec));
    }
  };
  walk(entry);
  return [...seen];
}

test("ゲームを開くときは、絵のデータを読み込まない。背景の絵だけ、あとで読む(D-385)。見本のページへの入口は ?debug の画面だけ", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  assert.doesNotMatch(html, /src\/art\//, "index.html は絵を読まない");
  const entry = join(ROOT, html.match(/<script type="module" src="([^"]+)"/)[1]);
  const art = join("src", "art");
  const files = importGraph(entry, false);
  assert.ok(files.length > 10, "ゲームの読み込みをたどれている");
  assert.deepEqual(files.filter((f) => f.includes(art)), [], "開いたときに読むファイルに src/art がない");
  // あとで読むのは、釣り場の背景の絵・釣り場ごとの魚の絵(D-386)と、描く部品だけ(見本の 3 つの粗さのクロダイ・見本のページは読まない)。
  const later = importGraph(entry, true).filter((f) => f.includes(art)).map((f) => f.slice(f.indexOf(art)).split("\\").join("/"));
  assert.deepEqual(later.sort(), [
    "src/art/bg/gaiyou.js",
    "src/art/bg/gaiyou_night.js",
    "src/art/bg/iso.js",
    "src/art/bg/iso_night.js",
    "src/art/bg/kawa.js",
    "src/art/bg/kawa_night.js",
    "src/art/bg/minato.js",
    "src/art/bg/minato_night.js",
    "src/art/bg/oki.js",
    "src/art/bg/oki_night.js",
    "src/art/bg/shinkai.js",
    "src/art/bg/shinkai_night.js",
    "src/art/fish/gaiyou.js",
    "src/art/fish/iso.js",
    "src/art/fish/kawa.js",
    "src/art/fish/minato.js",
    "src/art/fish/oki.js",
    "src/art/fish/shinkai.js",
    "src/art/pixel.js",
  ]);
  // 見本のページへのリンクは、デバッグ画面の 1 か所だけ。
  const ui = readdirSync(join(ROOT, "src", "ui")).filter((f) => f.endsWith(".js"));
  const linking = ui.filter((f) => readFileSync(join(ROOT, "src", "ui", f), "utf8").includes("art/samples.html"));
  assert.deepEqual(linking, ["debug_screen.js"]);
  assert.doesNotMatch(html, /samples\.html/);
});
