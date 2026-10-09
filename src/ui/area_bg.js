// @ts-check
// 釣り場の背景のドット絵を、ゲームの画面で使う(D-385)。
// - 絵のデータは大きいので、ゲームを開くときには読まない。いまいる釣り場の絵だけを、必要になったときに読む(動的な import)。
// - 読んだ絵は、1 マス = 1 画素の小さな canvas(130 × 280)に描いて取っておく。画面には draw.js が拡大して写す。
// - 表にない釣り場(あとから足す「釣り場 n」)や、読み込みの前・失敗のときは null(今までの色の段で描く)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/** 釣り場の id → 絵を読む関数。並びは釣り場の表と同じ(src/art/bg/index.js)。 */
const LOADERS = Object.freeze({
  minato: () => import("../art/bg/minato.js").then((m) => m.BG_MINATO),
  iso: () => import("../art/bg/iso.js").then((m) => m.BG_ISO),
  kawa: () => import("../art/bg/kawa.js").then((m) => m.BG_KAWA),
  oki: () => import("../art/bg/oki.js").then((m) => m.BG_OKI),
  gaiyou: () => import("../art/bg/gaiyou.js").then((m) => m.BG_GAIYOU),
  shinkai: () => import("../art/bg/shinkai.js").then((m) => m.BG_SHINKAI),
});

/** 背景の絵の水平線の行(上から。どの絵も同じ:D-383)。 */
export const ART_HORIZON = 118;

/** 絵の id のある釣り場か。 @param {string} areaId */
export function hasAreaArt(areaId) {
  return Object.hasOwn(LOADERS, areaId);
}

/**
 * 読み込みの状態(釣り場の id ごと)。image は 1 マス = 1 画素の canvas。
 * @type {Map<string, { image: HTMLCanvasElement | null }>}
 */
const cache = new Map();

/**
 * 釣り場の背景の絵(1 マス = 1 画素の canvas)。まだ読んでいなければ読み始めて、いまは null を返す。
 * 画面(document)がないとき(テスト)は、いつも null。
 * @param {string | null | undefined} areaId
 * @returns {HTMLCanvasElement | null}
 */
export function areaBackground(areaId) {
  if (!areaId || !hasAreaArt(areaId) || typeof document === "undefined") return null;
  let entry = cache.get(areaId);
  if (!entry) {
    const slot = { image: /** @type {HTMLCanvasElement | null} */ (null) };
    entry = slot;
    cache.set(areaId, slot);
    const load = LOADERS[/** @type {keyof typeof LOADERS} */ (areaId)];
    Promise.all([load(), import("../art/pixel.js")])
      .then(([art, pixel]) => {
        const canvas = document.createElement("canvas");
        canvas.width = art.width;
        canvas.height = art.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        pixel.drawArt(ctx, art, { dot: 1 });
        slot.image = canvas;
      })
      .catch(() => {
        // 読めなかったら、色の段のまま(遊びは止めない)。次に開いたときにもう一度読む。
        cache.delete(areaId);
      });
  }
  return entry.image;
}
