// @ts-check
// 目次と全画面のバーに出すドット絵の印(アイコン:D-400)。11 × 11 マスを文字の並びで持ち(1 行 1 文字、. は透明)、SVG の data URI にして背景の絵に使う。
// 色は theme.css と同じ値。画面(document)がなくても動く(テスト)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

const PAL = { k: "#2a1608", w: "#fff4dc", g: "#ffd166", G: "#c4902a", r: "#e84a5f", b: "#7bdff2", B: "#1f6f86", p: "#9b5cff", P: "#5a2fa0", n: "#8d5a2b", N: "#5e3a19", s: "#cfd8dc", S: "#8a9aa5", t: "#8fd3c7", T: "#2e7d5b", y: "#fff1b8" };
const ICON_ROWS = {
  areas: [ // 釣り場:岩と波
    "...........",
    "....kk.....",
    "...kssk....",
    "..kssSsk...",
    "..kssSsk...",
    ".kssSSSsk..",
    "kkkkkkkkkkk",
    "kbbkbbkbbkb",
    "kBbbkBbbkBb",
    "kbBBkbBBkbB",
    "kkkkkkkkkkk",
  ],
  kourin: [ // 降臨:紫の冠
    "...........",
    ".k...k...k.",
    "kpk.kpk.kpk",
    "kpkkkpkkkpk",
    "kppppppppkk",
    "kpygpypgypk",
    "kppppppppk.",
    "kPPPPPPPPk.",
    "kkkkkkkkkk.",
    "...........",
    "...........",
  ],
  equipment: [ // 装備:竿と針
    "..........k",
    ".........kn",
    "........knk",
    ".......knk.",
    "......knk..",
    ".....knk...",
    "....knk....",
    "...knk..k..",
    "..knk...k..",
    ".knk..k.k..",
    "kkk....kk..",
  ],
  skills: [ // スキル:星
    ".....k.....",
    "....kgk....",
    "....kgk....",
    "kkkkgygkkkk",
    "kggggygggsk",
    ".kggyyyggk.",
    "..kgyygk...",
    "..kggggk...",
    ".kgk...kgk.",
    ".kk.....kk.",
    "...........",
  ],
  crates: [ // クレート:木の箱
    "...........",
    "kkkkkkkkkkk",
    "knnnnnnnnnk",
    "kNNNNNNNNNk",
    "kkkkkkkkkkk",
    "knnnkgknnnk",
    "knnnkGknnnk",
    "knnnnnnnnnk",
    "knnnnnnnnnk",
    "kNNNNNNNNNk",
    "kkkkkkkkkkk",
  ],
  shop: [ // 店:袋とコイン
    "....kkk....",
    "...kyggk...",
    "...kgGgk...",
    "....kkk....",
    "...kkkkk...",
    "..knnnnnk..",
    ".knnnnnnnk.",
    ".knnNnnNnk.",
    ".knnnnnnnk.",
    ".kNNNNNNNk.",
    "..kkkkkkk..",
  ],
  materials: [ // 素材:鱗
    "...........",
    "....kkk....",
    "...kbbbk...",
    "..kbbbbbk..",
    ".kbbBbbbbk.",
    ".kbbbbbbbk.",
    ".kBbbbbbBk.",
    "..kBbbbBk..",
    "...kBBBk...",
    "....kkk....",
    "...........",
  ],
  status: [ // ステータス:棒グラフ
    "...........",
    ".......kk..",
    ".......ktk.",
    "...kk..ktk.",
    "...ktk.ktk.",
    "kk.ktk.ktk.",
    "ktkktkkktk.",
    "kTkkTkkkTk.",
    "kTkkTkkkTk.",
    "kkkkkkkkkk.",
    "...........",
  ],
  settings: [ // 設定:歯車
    "....kkk....",
    ".kk.ksk.kk.",
    "kskkkskkksk",
    "kssssssssSk",
    ".kssskksssk",
    "kssskkkkssk",
    ".kssskkssSk",
    "ksssssssssk",
    "kskkkskkkSk",
    ".kk.kSk.kk.",
    "....kkk....",
  ],
  debug: [ // デバッグ:虫
    "...........",
    "..k.....k..",
    "...k...k...",
    "..kkkkkkk..",
    ".krrrkrrrk.",
    "kkrrrkrrrkk",
    ".krrkkkrrk.",
    "kkrrrkrrrkk",
    ".krrrkrrrk.",
    "..kkkkkkk..",
    "..k.....k..",
  ],
};

/** @type {Map<string, string>} */
const cache = new Map();

/**
 * 画面の id の印の data URI。印のない id は null。
 * @param {string} id
 */
export function iconUrl(id) {
  const rows = ICON_ROWS[/** @type {keyof typeof ICON_ROWS} */ (id)];
  if (!rows) return null;
  let url = cache.get(id);
  if (url) return url;
  /** @type {Record<string, string[]>} */
  const paths = {};
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== ".") (paths[ch] ??= []).push(`M${x} ${y}h1v1h-1z`);
    }),
  );
  const inner = Object.entries(paths)
    .map(([ch, ps]) => `<path fill='${PAL[/** @type {keyof typeof PAL} */ (ch)]}' d='${ps.join("")}'/>`)
    .join("");
  url = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 11 11' shape-rendering='crispEdges'>${inner}</svg>`)}`;
  cache.set(id, url);
  return url;
}

/** 印のある画面の id の一覧(テストで画面の表と比べる)。 */
export const ICON_IDS = Object.freeze(Object.keys(ICON_ROWS));

/**
 * 印の要素(<i class="px-icon">)。印のない id は null。
 * @param {string} id
 */
export function iconElement(id) {
  const url = iconUrl(id);
  if (!url) return null;
  const node = document.createElement("i");
  node.className = "px-icon";
  node.setAttribute("aria-hidden", "true");
  node.style.setProperty("background-image", `url("${url}")`);
  return node;
}
