// @ts-check
// ドット絵の見本のページ(D-362・D-364)。3 つの粗さのクロダイを、同じ表示の大きさで並べる。
// - 大きさ:×1(幅 160 CSS px)・×2(320)・ゲームで使う大きさの想定 96・192。1 マス = 整数の画素の数なので、
//   表示の幅は目安にいちばん近い値になる(粗さと画素比によって少しちがう。下に実際の値を出す)。
// - 背景の色:明るい水色・濃い青・暗い藍(魚だけを置く。背景の絵はまだない)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { KURODAI } from "./fish/kurodai.js";
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
  const state = { size: "x1", bg: "blue" };
  const problems = KURODAI.flatMap((a) => checkArt(a));
  if (problems.length > 0) {
    problemsBox.hidden = false;
    problemsBox.textContent = `データの点検で問題があります:${problems.join("、")}`;
  }
  const render = () => {
    const dpr = window.devicePixelRatio || 1;
    const size = SIZE_CHOICES.find((c) => c.id === state.size) ?? SIZE_CHOICES[0];
    const bg = BG_CHOICES.find((c) => c.id === state.bg) ?? BG_CHOICES[0];
    stage.style.background = bg.color;
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
    dprNote.textContent = `この画面の画素比 ${short(dpr)}。1 マスを整数の数の画素で描くので、表示の幅は目安(${size.target} px)にいちばん近い値になります。`;
  };
  render();
  // 画素比が変わったとき(ズーム・別の画面へ移す)に描き直す。
  window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`).addEventListener?.("change", render);
}

main();
