// @ts-check
// 魚のドット絵を、ゲームの画面で使う(D-386〜D-391・D-392)。
// - 絵のデータは釣り場ごとのファイル(src/art/fish/<釣り場>.js)。ゲームを開くときには読まない。いる魚の釣り場の分だけ、あとで読む。
// - 読んだ絵は、1 マス = 1 画素の小さな canvas にして取っておく。画面には draw.js が拡大して写す。
// - まだ絵のない魚・読み込みの前は null(今までの丸い形で描く)。
// - 降臨ヌシ(D-392)は、ヌシの絵の金の冠と縁の光の色だけを、紫の冠と降臨の光の色に置き換えて作る(絵のファイルは増やさない)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/** 釣り場の並び(釣り場の表と同じ。1 つの釣り場は 5 段階:D-272)。 */
const AREA_IDS = Object.freeze(["minato", "iso", "kawa", "oki", "gaiyou", "shinkai"]);
/** 1 つの釣り場の段階の数。 */
const STAGES_PER_AREA = 5;

/** 釣り場の id → 魚の絵の表を読む関数(絵ができた釣り場だけ)。 */
const LOADERS = Object.freeze({
  minato: () => import("../art/fish/minato.js").then((m) => m.FISH_MINATO),
  iso: () => import("../art/fish/iso.js").then((m) => m.FISH_ISO),
  kawa: () => import("../art/fish/kawa.js").then((m) => m.FISH_KAWA),
  oki: () => import("../art/fish/oki.js").then((m) => m.FISH_OKI),
  gaiyou: () => import("../art/fish/gaiyou.js").then((m) => m.FISH_GAIYOU),
  shinkai: () => import("../art/fish/shinkai.js").then((m) => m.FISH_SHINKAI),
});

/** ヌシの冠の色(scripts/art/fish_common.mjs の GOLD と同じ)と、降臨の紫の冠の色(D-392)。 */
export const CROWN_GOLD = Object.freeze({ gold: "#f2c43c", goldDark: "#b8862a", jewel: "#e63946", jewel2: "#3a86ff", sparkle: "#fff3b0" });
export const CROWN_KOURIN = Object.freeze({ gold: "#b46cf0", goldDark: "#6c3aa4", jewel: "#f2c43c", jewel2: "#7fe6ff", sparkle: "#f0dcff" });
/** 降臨ヌシの縁の光の色。 */
export const KOURIN_GLOW = "#9b5cff";

/**
 * 降臨ヌシの色の並び:金の冠 → 紫の冠、縁の光(ヌシの色)→ 降臨の光。ほかの色はそのまま。
 * @param {readonly string[]} palette @param {string} glow
 */
export function kourinPalette(palette, glow) {
  /** @type {Record<string, string>} */
  const swap = { [glow.toLowerCase()]: KOURIN_GLOW };
  for (const k of /** @type {(keyof typeof CROWN_GOLD)[]} */ (Object.keys(CROWN_GOLD))) swap[CROWN_GOLD[k]] = CROWN_KOURIN[k];
  return palette.map((c) => swap[c.toLowerCase()] ?? c);
}

/**
 * 珍しい魚(ゴールデン:D-406)の色の並び:元の魚の色を、明るさを保って金色に置き換える(輪郭は濃い金茶)。
 * @param {readonly string[]} palette
 */
export function goldPalette(palette) {
  return palette.map((c) => {
    if (!c) return c;
    const n = parseInt(c.slice(1), 16);
    const lum = (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
    // 暗い(輪郭・目)→ 金茶、中 → 金、明るい → 淡い金。
    /** @type {[number, number[]][]} */
    const stops = [[0, [58, 36, 8]], [0.35, [168, 112, 24]], [0.6, [236, 186, 52]], [0.85, [255, 226, 128]], [1, [255, 246, 214]]];
    let i = 0;
    while (i < stops.length - 2 && lum > stops[i + 1][0]) i++;
    const [l0, a] = stops[i];
    const [l1, b] = stops[i + 1];
    const t = Math.min(1, Math.max(0, (lum - l0) / (l1 - l0)));
    return `#${a.map((v, k) => Math.round(v + (b[k] - v) * t).toString(16).padStart(2, "0")).join("")}`;
  });
}

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
 * 画面(document)がないとき(テスト)・絵のない魚は null。variant が "kourin" なら、降臨ヌシの色(紫の冠)にする。
 * 珍しい魚(rare と base を持つ)は、元の魚の絵を金色にして使う(D-406)。
 * @param {{ id: string, stage: number, color?: string, rare?: boolean, base?: string } | null | undefined} fish
 * @param {"kourin"} [variant]
 * @returns {HTMLCanvasElement | null}
 */
export function fishArt(fish, variant) {
  if (!fish || typeof document === "undefined") return null;
  const key = variant ? `${fish.id}:${variant}` : fish.id;
  const done = canvases.get(key);
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
  const base = entry.arts?.[fish.rare && fish.base ? fish.base : fish.id];
  if (!base || !entry.draw) return null;
  const art = fish.rare ? { ...base, palette: goldPalette(base.palette) } : variant === "kourin" && fish.color ? { ...base, palette: kourinPalette(base.palette, fish.color) } : base;
  const canvas = document.createElement("canvas");
  canvas.width = art.width;
  canvas.height = art.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  entry.draw(ctx, art);
  canvases.set(key, canvas);
  return canvas;
}

/** 降臨のキャラの絵の読み込み(D-396)。null は読み込み中。 @type {{ canvases: Map<string, HTMLCanvasElement> | null, loading: boolean }} */
const kourinArts = { canvases: null, loading: false };

/**
 * 降臨のキャラの絵(64 × 64 マス、1 マス = 1 画素の canvas)。まだ読んでいなければ読み始めて、いまは null を返す。
 * 画面(document)がないとき(テスト)は null。
 * @param {string} id キャラの id(ebi・kani・tako・ika)
 * @returns {HTMLCanvasElement | null}
 */
export function kourinArt(id) {
  if (typeof document === "undefined") return null;
  if (kourinArts.canvases) return kourinArts.canvases.get(id) ?? null;
  if (!kourinArts.loading) {
    kourinArts.loading = true;
    Promise.all([import("../art/kourin.js"), import("../art/pixel.js")])
      .then(([m, pixel]) => {
        /** @type {Map<string, HTMLCanvasElement>} */
        const out = new Map();
        for (const [key, art] of Object.entries(m.KOURIN_CHARS)) {
          const canvas = document.createElement("canvas");
          canvas.width = art.width;
          canvas.height = art.height;
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          pixel.drawArt(ctx, art, { dot: 1 });
          out.set(key, canvas);
        }
        kourinArts.canvases = out;
      })
      .catch(() => {
        // 読めなかったら、丸い形のまま(次に呼んだときにもう一度読む)。
        kourinArts.loading = false;
      });
  }
  return null;
}
