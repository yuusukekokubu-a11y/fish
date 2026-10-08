// 磯(昼)の背景のドット絵を作る(D-372・D-384)。幅 130 × 高さ 280 マス。
// 磯の景色:うす曇りの空(灰色がかった青)と重なった雲、左の岩の崖(上に草)、崖のふもとの岩と白いしぶき、
// 水の中の岩の柱、遠くの小島、青緑の海。特定のゲームの絵や画像は参照しない。画像生成 AI は使わない。
// ゲームの位置は港と同じ(右側と手前の海は模様を減らす)。使い方:node scripts/art/bg_iso.mjs

import { deepRipples, H, HORIZON, makeRand, makeScene, seaWaves, W, writeBackground } from "./bg_common.mjs";

// ---- 色:灰色がかった空、暗い岩、緑の草、青緑の海 ----
const P = {
  sky1: "#7f9bb8",
  sky2: "#94adc6",
  sky3: "#aabfd2",
  sky4: "#c2d2df",
  sky5: "#d9e3ea",
  cloud: "#eef2f4",
  cloudShade: "#cfd9e0",
  cloudShade2: "#adbccb",
  island: "#7f9aa3",
  islandDark: "#667f8a",
  rockHi: "#8c8a86",
  rock: "#6b6a68",
  rockDark: "#4b4b4c",
  rockDeep: "#323338",
  grass: "#6e9a4f",
  grassDark: "#4f7a3c",
  sea1: "#3a968c",
  sea2: "#2b8178",
  sea3: "#1f6a63",
  sea4: "#18564f",
  sea5: "#11433e",
  foam: "#f4f7f6",
  waveHi: "#b8e0d8",
  waveMid: "#6fb8ac",
  gull: "#7d8a92",
};

const sc = makeScene();
const { set, rect, get, bandFill, cloud, flyingGull } = sc;
const rand = makeRand(11);

// ---- 空:灰色がかった青。下ほど白っぽい ----
bandFill(0, HORIZON - 1, [
  [0, "sky1"],
  [24, "sky2"],
  [50, "sky3"],
  [76, "sky4"],
  [98, "sky5"],
]);
// 重なった大きな雲(うす曇り)。
cloud(
  [
    [70, 22, 9],
    [82, 18, 11],
    [95, 22, 9],
    [106, 26, 7],
    [60, 27, 6],
  ],
  31,
);
cloud(
  [
    [100, 58, 5],
    [108, 55, 7],
    [117, 58, 5],
  ],
  62,
);
cloud(
  [
    [56, 72, 3],
    [61, 70, 4],
    [66, 72, 3],
  ],
  74,
);

// ---- 遠くの小島(右寄り) ----
for (let x = 92; x < 126; x++) {
  const h = Math.round(7 * Math.exp(-(((x - 108) / 9) ** 2)) + 3 * Math.exp(-(((x - 120) / 4) ** 2)));
  for (let y = HORIZON - h; y < HORIZON; y++) set(x, y, x > 110 ? "islandDark" : "island");
}

// ---- 海:青緑。下ほど深い ----
bandFill(HORIZON, H - 1, [
  [HORIZON, "sea1"],
  [134, "sea2"],
  [160, "sea3"],
  [194, "sea4"],
  [250, "sea5"],
]);
rect(0, HORIZON, W - 1, HORIZON, "waveMid");
const isSea = (c) => !!c && c.startsWith("sea");
seaWaves(sc, rand, { hi: "waveHi", mid: "waveMid", isWater: isSea });
deepRipples(sc, rand, (c) => (c === "sea5" ? "sea4" : c === "sea4" ? "sea3" : null));

// ---- 左の岩の崖:上がでこぼこ、ふもとは水に入る。光は左上から(右の面が暗い) ----
/** 崖の右の端(行 y での x)。上ほど細い。 */
const cliffRight = (y) => {
  if (y < 52) return -1;
  const t = (y - 52) / (HORIZON + 8 - 52);
  return Math.round(14 + 22 * Math.sqrt(t) + 3 * Math.sin(y * 0.45) + (y > 96 ? 4 : 0));
};
/** 崖の上の線(列 x での y)。 */
const cliffTop = (x) => Math.round(52 + 0.5 * x + 4 * Math.sin(x * 0.7) + 3 * Math.sin(x * 0.23));
for (let y = 46; y <= HORIZON + 8; y++) {
  const right = cliffRight(y);
  for (let x = 0; x <= right; x++) {
    if (y < cliffTop(x)) continue;
    // 岩の面:波打つ横の層(厚さ 7)を、層ごとに幅のちがう塊に分ける。層の境目は暗い割れ目、塊の上の縁は明るい
    // (光は左上から)。塊ごとに明るさを少し変える。右の端の 3 マスは影。
    const wy = y + 3 * Math.sin(x * 0.35) + 2 * Math.sin(x * 0.9 + 1);
    const layer = Math.floor(wy / 7);
    const inLayer = wy - layer * 7;
    const width = 6 + ((layer * 5) % 5);
    const bx = x + ((layer * 11) % 7);
    const block = Math.floor(bx / width);
    const shade = (block * 7 + layer * 13) % 6;
    let c = shade === 0 ? "rockHi" : shade >= 4 ? "rockDark" : "rock";
    if (inLayer < 1) c = "rockDeep";
    else if (inLayer < 2 && shade < 4) c = "rockHi";
    else if (bx % width === 0 && (block + layer) % 2 === 0) c = "rockDark";
    if (x >= right - 2) c = "rockDark";
    if (x === right) c = "rockDeep";
    set(x, y, c);
  }
}
// 崖の上の草(上の縁から 2〜3 マス)。
for (let x = 0; x < 40; x++) {
  const top = cliffTop(x);
  if (top > cliffRight(top) + 0 && x > cliffRight(top)) continue;
  if (get(x, top) && get(x, top).startsWith("rock")) {
    set(x, top, "grass");
    set(x, top + 1, x % 3 === 0 ? "grassDark" : "grass");
    if (x % 4 === 1) set(x, top + 2, "grassDark");
    if (x % 5 === 0) set(x, top - 1, "grassDark");
  }
}
// ふもとの岩(水の上に頭を出す)と、白いしぶき。
const rocks = [
  [36, 122, 6, 4],
  [46, 120, 4, 3],
  [8, 128, 7, 4],
  [22, 132, 5, 3],
];
for (const [cx, cy, rx, ry] of rocks) {
  for (let y = cy - ry; y <= cy + 1; y++) {
    for (let x = cx - rx; x <= cx + rx; x++) {
      if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 > 1) continue;
      set(x, y, x > cx + rx / 3 ? "rockDark" : y < cy - ry / 2 ? "rockHi" : "rock");
    }
  }
  // しぶき:岩のまわりの白いマス。
  for (let x = cx - rx - 2; x <= cx + rx + 2; x++) {
    if (isSea(get(x, cy + 2))) set(x, cy + 2, (x + cy) % 3 === 0 ? "waveHi" : "foam");
    if ((x + cy) % 2 === 0 && isSea(get(x, cy + 3))) set(x, cy + 3, "waveMid");
  }
  set(cx - rx - 1, cy - 1, "foam");
  set(cx + rx + 1, cy - 2, "foam");
}
// 崖のふもとの白いしぶき(水平線のあたり)。
for (let y = HORIZON + 1; y <= HORIZON + 9; y++) {
  const r = cliffRight(Math.min(y, HORIZON + 8));
  for (let x = r + 1; x <= r + 3; x++) if (isSea(get(x, y))) set(x, y, (x + y) % 2 ? "foam" : "waveHi");
}

// ---- 水の中の岩の柱(水平線の近く、真ん中より左) ----
for (let y = 98; y <= HORIZON + 2; y++) {
  const half = y < 102 ? 2 : 3;
  for (let x = 58 - half; x <= 58 + half; x++) set(x, y, x >= 58 + half - 1 ? "rockDark" : y < 101 ? "rockHi" : "rock");
}
set(58, 97, "grass");
set(57, 97, "grassDark");
for (let x = 53; x <= 63; x++) if (isSea(get(x, HORIZON + 3))) set(x, HORIZON + 3, x % 2 ? "foam" : "waveHi");

// ---- 鳥(灰色のカモメ 2 羽) ----
flyingGull(28, 30, "cloud", "gull");
flyingGull(84, 48, "cloud", "gull");

writeBackground({ id: "bg-iso", name: "磯(昼)", constName: "BG_ISO", file: "iso.js", decision: "D-384", script: "scripts/art/bg_iso.mjs", P, grid: sc.grid });
