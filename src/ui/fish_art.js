// @ts-check
// 魚のドット絵を、ゲームの画面で使う(D-386)。
// - 絵のデータは釣り場ごとのファイル(src/art/fish/<釣り場>.js)。ゲームを開くときには読まない。いる魚の釣り場の分だけ、あとで読む。
// - 読んだ絵は、1 マス = 1 画素の小さな canvas にして取っておく。画面には draw.js が拡大して写す。
// - まだ絵のない魚・読み込みの前は null(今までの丸い形で描く)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/** 釣り場の並び(釣り場の表と同じ。1 つの釣り場は 5 段階:D-272)。 */
const AREA_IDS = Object.freeze(["minato", "iso", "kawa", "oki", "gaiyou", "shinkai"]);
/** 1 つの釣り場の段階の数。 */
const STAGES_PER_AREA = 5;

/** 釣り場の id → 魚の絵の表を読む関数(絵ができた釣り場だけ)。 */
const LOADERS = Object.freeze({
  minato: () => import("../art/fish/minato.js").then((m) => m.FISH_MINATO),
});

/** 画面の 1 マスの大きさ(CSS px)。魚は 3px(32 マスで 96px)、ヌシは 6px(魚の部分が 192px:D-372)。 */
export const FISH_DOT = 3;
export const BOSS_DOT = 6;

/**
 * 読み込みの状態(釣り場ごと)と、作った canvas(魚の id ごと)。
 * @type {Map<string, { arts: Record<string, import("../art/pixel.js").PixelArt> | null, draw: ((ctx: CanvasRenderingContext2D, art: any) => void) | null }>}
 */
const areas = new Map();
/** @type {Map<string, HTMLCanvasElement>} */
const canvases = new Map();

/** 段階 → 釣り場の id。 @param {number} stage */
export function areaOfFishStage(stage) {
  return AREA_IDS[Math.floor((stage - 1) / STAGES_PER_AREA)] ?? null;
}

/** 魚の絵がある釣り場か。 @param {string | null} areaId */
export function hasFishArt(areaId) {
  return !!areaId && Object.hasOwn(LOADERS, areaId);
}

/**
 * 魚の絵(1 マス = 1 画素の canvas)。まだ読んでいなければ読み始めて、いまは null を返す。
 * 画面(document)がないとき(テスト)・絵のない魚は null。
 * @param {{ id: string, stage: number } | null | undefined} fish
 * @returns {HTMLCanvasElement | null}
 */
export function fishArt(fish) {
  if (!fish || typeof document === "undefined") return null;
  const done = canvases.get(fish.id);
  if (done) return done;
  const areaId = areaOfFishStage(fish.stage);
  if (!areaId || !hasFishArt(areaId)) return null;
  let entry = areas.get(areaId);
  if (!entry) {
    const slot = { arts: /** @type {Record<string, any> | null} */ (null), draw: /** @type {any} */ (null) };
    entry = slot;
    areas.set(areaId, slot);
    Promise.all([LOADERS[/** @type {keyof typeof LOADERS} */ (areaId)](), import("../art/pixel.js")])
      .then(([arts, pixel]) => {
        slot.arts = arts;
        slot.draw = (/** @type {CanvasRenderingContext2D} */ ctx, /** @type {any} */ art) => pixel.drawArt(ctx, art, { dot: 1 });
      })
      .catch(() => areas.delete(areaId));
  }
  const art = entry.arts?.[fish.id];
  if (!art || !entry.draw) return null;
  const canvas = document.createElement("canvas");
  canvas.width = art.width;
  canvas.height = art.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  entry.draw(ctx, art);
  canvases.set(fish.id, canvas);
  return canvas;
}
