// @ts-check
// ドット絵の見本のページ(D-362・D-364・D-383)。3 つの粗さのクロダイを、同じ表示の大きさで並べる。
// その下に、釣り場ごとの魚(D-386〜D-388:ゲームと同じ大きさ。魚は 1 マス 3px、ヌシは 6px。釣り場は切り替え)。
// 下に、背景の見本(6 つの釣り場・昼)を 1 ドット 3px(幅 390 CSS px)で出す。釣り場を切り替え、「ゲームの位置」で、水面・竿・ウキ・魚・ゲージの位置を重ねる。
// - 大きさ:×1(幅 160 CSS px)・×2(320)・ゲームで使う大きさの想定 96・192。1 マス = 整数の画素の数なので、
//   表示の幅は目安にいちばん近い値になる(粗さと画素比によって少しちがう。下に実際の値を出す)。
// - 背景の色:明るい水色・濃い青・暗い藍(魚だけを置く)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { BACKGROUNDS, BG_HORIZON } from "./bg/index.js";
import { KURODAI } from "./fish/kurodai.js";
import { FISH_MINATO } from "./fish/minato.js";
import { FISH_ISO } from "./fish/iso.js";
import { FISH_KAWA } from "./fish/kawa.js";

/** 魚の絵のある釣り場(切り替えの並び)。 */
const FISH_AREAS = [
  { id: "minato", label: "港", arts: FISH_MINATO },
  { id: "iso", label: "磯", arts: FISH_ISO },
  { id: "kawa", label: "川", arts: FISH_KAWA },
];
import { artCanvas, artSize, checkArt, colorCount } from "./pixel.js";

/** 大きさの選び方(表示の幅の目安。CSS px)。 */
export const SIZE_CHOICES = Object.freeze([
  { id: "x1", label: "×1", target: 160 },
  { id: "x2", label: "×2", target: 320 },
  { id: "g96", label: "96px", target: 96 },
  { id: "g192", label: "192px", target: 192 },
]);

/** 背景の色の選び方。 */
export const BG_CHOICES = Object.freeze([
  { id: "light", label: "明るい水色", color: "#a9dcef" },
  { id: "blue", label: "濃い青", color: "#1f5fa8" },
  { id: "navy", label: "暗い藍", color: "#141c3a" },
]);

/** 背景の見本の重ね方。 */
export const GUIDE_CHOICES = Object.freeze([
  { id: "off", label: "絵だけ" },
  { id: "on", label: "ゲームの位置" },
]);

/** 背景の見本の表示の幅(CSS px。1 ドット 3px:D-372)。 */
export const BACKGROUND_WIDTH = 390;

/**
 * ゲームの絵の位置(画面の幅 w・高さ h に対する割合。src/ui/draw.js の drawScene と同じ数)。
 * 背景の見本に重ねて、邪魔にならないかを見る。
 */
export const GAME_GUIDES = Object.freeze({
  waterY: 0.42,
  rod: Object.freeze({ x0: 0.82, y0: 0.98, x1: 0.62, y1: 0.3 }),
  bobber: Object.freeze({ x: 0.4, y: 0.5 }),
  fish: Object.freeze({ x: 0.5, y: 0.55 }),
  gauge: Object.freeze({ x: 0.1, y: 0.8, w: 0.8, hPx: 34 }),
});

/**
 * 背景の見本に、ゲームの位置を線で重ねる(水面・竿・ウキ・魚・ゲージ)。
 * @param {CanvasRenderingContext2D} ctx @param {number} w @param {number} h 画素の幅と高さ @param {number} px 1 CSS px の画素の数
 */
function drawGuides(ctx, w, h, px) {
  const g = GAME_GUIDES;
  ctx.lineWidth = 2 * px;
  ctx.strokeStyle = "rgba(255, 60, 90, 0.9)";
  ctx.fillStyle = "rgba(255, 60, 90, 0.9)";
  ctx.font = `${12 * px}px system-ui, sans-serif`;
  ctx.setLineDash([6 * px, 4 * px]);
  ctx.beginPath();
  ctx.moveTo(0, g.waterY * h);
  ctx.lineTo(w, g.waterY * h);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText("水面", 4 * px, g.waterY * h - 4 * px);
  ctx.beginPath();
  ctx.moveTo(g.rod.x0 * w, g.rod.y0 * h);
  ctx.lineTo(g.rod.x1 * w, g.rod.y1 * h);
  ctx.stroke();
  ctx.fillText("竿", g.rod.x1 * w + 4 * px, g.rod.y1 * h);
  ctx.beginPath();
  ctx.arc(g.bobber.x * w, g.bobber.y * h, 6 * px, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillText("ウキ", g.bobber.x * w - 30 * px, g.bobber.y * h + 4 * px);
  ctx.beginPath();
  ctx.ellipse(g.fish.x * w, g.fish.y * h, 40 * px, 16 * px, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillText("魚", g.fish.x * w + 44 * px, g.fish.y * h + 4 * px);
  ctx.strokeRect(g.gauge.x * w, g.gauge.y * h, g.gauge.w * w, g.gauge.hPx * px);
  ctx.fillText("ゲージ", g.gauge.x * w, g.gauge.y * h - 4 * px);
}

/**
 * 背景の見本(絵と、その下のラベル)。guide なら、ゲームの位置を重ねる。
 * @param {import("./pixel.js").PixelArt} art @param {number} dpr @param {number} max 表示の幅の上限 @param {boolean} guide
 */
function backgroundBox(art, dpr, max, guide) {
  const box = document.createElement("figure");
  box.className = "sample background";
  box.dataset.art = art.id;
  box.style.margin = "0";
  const { canvas, dot, cssWidth, cssDot } = artCanvas(art, BACKGROUND_WIDTH, dpr, { max });
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", art.name);
  canvas.dataset.dot = String(dot);
  const ctx = canvas.getContext("2d");
  if (guide && ctx) drawGuides(ctx, canvas.width, canvas.height, dpr || 1);
  const title = document.createElement("h2");
  title.textContent = `${art.name}(${art.width}×${art.height})`;
  const dl = document.createElement("dl");
  for (const [k, v] of /** @type {[string, string][]} */ ([
    ["色数", `${colorCount(art)} 色`],
    ["データ", `${artSize(art).toLocaleString("ja-JP")} 文字`],
    ["1 ドット", `${short(cssDot)} px`],
    ["表示の幅", `${short(cssWidth)} px`],
    ["水平線", `上から ${BG_HORIZON} マス`],
  ])) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  }
  box.append(canvas, title, dl);
  return box;
}

/** 数を 1 けた(小数)まで。 @param {number} n */
const short = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/**
 * 1 つの見本(絵と、その下のラベル・色数・データの大きさ・1 ドットの大きさ)。
 * @param {import("./pixel.js").PixelArt} art @param {number} target @param {number} dpr @param {number} max 表示の幅の上限
 */
function sampleBox(art, target, dpr, max) {
  const box = document.createElement("figure");
  box.className = "sample";
  box.dataset.art = art.id;
  box.style.margin = "0";
  const { canvas, dot, cssWidth, cssDot } = artCanvas(art, target, dpr, { max });
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", art.name);
  canvas.dataset.dot = String(dot);
  const title = document.createElement("h2");
  title.textContent = `${art.width}×${art.height}`;
  const dl = document.createElement("dl");
  for (const [k, v] of /** @type {[string, string][]} */ ([
    ["色数", `${colorCount(art)} 色`],
    ["データ", `${artSize(art).toLocaleString("ja-JP")} 文字`],
    ["1 ドット", `${short(cssDot)} px`],
    ["表示の幅", `${short(cssWidth)} px`],
  ])) {
    const dt = document.createElement("dt");
    dt.textContent = k;
    const dd = document.createElement("dd");
    dd.textContent = v;
    dl.append(dt, dd);
  }
  box.append(canvas, title, dl);
  return box;
}

/** 選択のボタンを並べる。 @param {HTMLElement} host @param {readonly { id: string, label: string }[]} choices @param {string} current @param {(id: string) => void} onPick */
function choiceButtons(host, choices, current, onPick) {
  host.replaceChildren(
    ...choices.map((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = c.label;
      b.dataset.choice = c.id;
      b.setAttribute("aria-pressed", String(c.id === current));
      b.addEventListener("click", () => onPick(c.id));
      return b;
    }),
  );
}

function main() {
  const stage = /** @type {HTMLElement} */ (document.getElementById("stage"));
  const sizeHost = /** @type {HTMLElement} */ (document.getElementById("size-choices"));
  const bgHost = /** @type {HTMLElement} */ (document.getElementById("bg-choices"));
  const dprNote = /** @type {HTMLElement} */ (document.getElementById("dpr-note"));
  const problemsBox = /** @type {HTMLElement} */ (document.getElementById("problems"));
  const bgStage = /** @type {HTMLElement} */ (document.getElementById("bg-stage"));
  const guideHost = /** @type {HTMLElement} */ (document.getElementById("guide-choices"));
  const areaHost = /** @type {HTMLElement} */ (document.getElementById("area-choices"));
  const state = { size: "x1", bg: "blue", guide: "off", area: /** @type {string} */ (BACKGROUNDS[0].areaId), fishArea: "minato" };
  const fishAreaHost = /** @type {HTMLElement} */ (document.getElementById("fish-area-choices"));
  const fishStage = /** @type {HTMLElement} */ (document.getElementById("fish-stage"));
  const problems = [...KURODAI, ...FISH_AREAS.flatMap((f) => Object.values(f.arts)), ...BACKGROUNDS.map((b) => b.art)].flatMap((a) => checkArt(a));
  if (problems.length > 0) {
    problemsBox.hidden = false;
    problemsBox.textContent = `データの点検で問題があります:${problems.join("、")}`;
  }
  const render = () => {
    const dpr = window.devicePixelRatio || 1;
    const size = SIZE_CHOICES.find((c) => c.id === state.size) ?? SIZE_CHOICES[0];
    const bg = BG_CHOICES.find((c) => c.id === state.bg) ?? BG_CHOICES[0];
    stage.style.background = bg.color;
    fishStage.style.background = bg.color;
    stage.dataset.bg = bg.id;
    // 画面の幅をこえないように(横スクロールを出さない)。
    const max = Math.max(64, stage.clientWidth - 16);
    stage.replaceChildren(...KURODAI.map((art) => sampleBox(art, size.target, dpr, max)));
    choiceButtons(sizeHost, SIZE_CHOICES, state.size, (id) => {
      state.size = id;
      render();
    });
    choiceButtons(bgHost, BG_CHOICES, state.bg, (id) => {
      state.bg = id;
      render();
    });
    // 釣り場の魚:ゲームと同じ大きさ(魚 3px・ヌシ 6px)。画面の幅をこえるときは小さくする。
    const fishArea = FISH_AREAS.find((f) => f.id === state.fishArea) ?? FISH_AREAS[0];
    choiceButtons(fishAreaHost, FISH_AREAS, fishArea.id, (id) => {
      state.fishArea = id;
      render();
    });
    fishStage.replaceChildren(
      ...Object.values(fishArea.arts).map((art) => {
        const box = document.createElement("figure");
        box.className = "sample fish";
        box.dataset.art = art.id;
        box.style.margin = "0";
        const { canvas } = artCanvas(art, art.width * (art.width > 32 ? 6 : 3), dpr, { max: Math.max(64, fishStage.clientWidth - 16) });
        canvas.setAttribute("role", "img");
        canvas.setAttribute("aria-label", art.name);
        const label = document.createElement("h2");
        label.textContent = `${art.name}(${colorCount(art)} 色)`;
        box.append(canvas, label);
        return box;
      }),
    );
    // 背景の見本:画面の幅をこえるときは、こえない最大の整数の画素で描く。
    const area = BACKGROUNDS.find((b) => b.areaId === state.area) ?? BACKGROUNDS[0];
    bgStage.replaceChildren(backgroundBox(area.art, dpr, Math.max(130, bgStage.clientWidth), state.guide === "on"));
    choiceButtons(
      areaHost,
      BACKGROUNDS.map((b) => ({ id: b.areaId, label: b.art.name.replace("(昼)", "") })),
      state.area,
      (id) => {
        state.area = id;
        render();
      },
    );
    choiceButtons(guideHost, GUIDE_CHOICES, state.guide, (id) => {
      state.guide = id;
      render();
    });
    dprNote.textContent = `この画面の画素比 ${short(dpr)}。1 マスを整数の数の画素で描くので、表示の幅は目安(${size.target} px)にいちばん近い値になります。`;
  };
  render();
  // 画素比が変わったとき(ズーム・別の画面へ移す)に描き直す。
  window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener?.("change", render);
}

main();
