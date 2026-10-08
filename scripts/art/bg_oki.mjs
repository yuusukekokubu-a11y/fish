// 沖(昼)の背景のドット絵を作る(D-372・D-384)。幅 130 × 高さ 280 マス。
// 沖の景色:濃い青の空と大きな入道雲、何もない水平線、遠くの小さな漁船、白い波頭の多い深い青の海。
// 特定のゲームの絵や画像は参照しない。画像生成 AI は使わない。ゲームの位置は港と同じ。
// 使い方:node scripts/art/bg_oki.mjs

import { deepRipples, H, HORIZON, makeRand, makeScene, seaWaves, W, writeBackground } from "./bg_common.mjs";

// ---- 色:濃い青の空、白い入道雲、深い青の海、白い船 ----
const P = {
  sky1: "#2a66ad",
  sky2: "#3a79bd",
  sky3: "#4f8fcc",
  sky4: "#6aa6da",
  sky5: "#8bbde5",
  cloud: "#ffffff",
  cloudShade: "#dce8f4",
  cloudShade2: "#b4cbe3",
  cloudDeep: "#8eaed0",
  sea1: "#2560a8",
  sea2: "#1d4f93",
  sea3: "#173f7c",
  sea4: "#113164",
  sea5: "#0b244d",
  waveHi: "#d6e8f7",
  waveMid: "#6f9fd2",
  hull: "#f1f1ec",
  hullShade: "#c9cdd0",
  hullLine: "#b03a35",
  cabin: "#e6e3d8",
  window: "#2d3b4a",
  mast: "#3a4652",
  flag: "#e8b33c",
  gull: "#8a96a2",
};

const sc = makeScene();
const { set, rect, get, bandFill, cloud, flyingGull } = sc;
const rand = makeRand(17);

// ---- 空:濃い青。水平線に近いほど明るい ----
bandFill(0, HORIZON - 1, [
  [0, "sky1"],
  [28, "sky2"],
  [56, "sky3"],
  [82, "sky4"],
  [102, "sky5"],
]);
// 入道雲:水平線の上の平らな底から、ドームが積み上がって上ほど細くなる。左寄り(竿のある右を空ける)。
const TOWER = [
  // 底の段
  [8, 96, 7],
  [20, 92, 10],
  [36, 90, 11],
  [52, 92, 10],
  [64, 96, 7],
  // 中の段
  [22, 76, 9],
  [36, 70, 12],
  [50, 76, 9],
  // 上の段
  [30, 54, 8],
  [42, 52, 9],
  [36, 40, 8],
];
const TOWER_BOTTOM = 102;
cloud(TOWER, TOWER_BOTTOM);
// ドームごとの影:それぞれの丸の右下(光は左上から)。上に重なる丸の中は塗らない。
for (let y = 20; y <= TOWER_BOTTOM; y++) {
  for (let x = 0; x < 80; x++) {
    if (get(x, y) !== "cloud") continue;
    const px = x + 0.5;
    const py = y + 0.5;
    // このマスを含む丸のうち、いちばん上(手前)に見えるもの:中心がいちばん下のもの。
    const hits = TOWER.filter(([cx, cy, r]) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r);
    if (hits.length === 0) continue;
    const [cx, cy, r] = hits.reduce((a, b) => (b[1] > a[1] ? b : a));
    const dx = (px - cx) / r;
    const dy = (py - cy) / r;
    if (dx + dy > 0.95) set(x, y, "cloudShade2");
    else if (dx + dy > 0.55) set(x, y, "cloudShade");
  }
}
// 底の段は、平らな底の近くを暗く(積み上がった重さ)。
for (let y = TOWER_BOTTOM - 4; y < TOWER_BOTTOM; y++) for (let x = 0; x < 80; x++) if (get(x, y)?.startsWith("cloud")) set(x, y, y === TOWER_BOTTOM - 1 ? "cloudDeep" : "cloudShade2");
// 遠くの小さな雲(右)。
cloud(
  [
    [104, 40, 3],
    [109, 38, 4],
    [114, 40, 3],
  ],
  42,
);
cloud(
  [
    [90, 98, 3],
    [96, 96, 4],
    [102, 98, 3],
  ],
  100,
);

// ---- 海:深い青。白い波頭が多い ----
bandFill(HORIZON, H - 1, [
  [HORIZON, "sea1"],
  [134, "sea2"],
  [160, "sea3"],
  [194, "sea4"],
  [250, "sea5"],
]);
rect(0, HORIZON, W - 1, HORIZON, "sky5");
const isSea = (c) => !!c && c.startsWith("sea");
seaWaves(sc, rand, { hi: "waveHi", mid: "waveMid", isWater: isSea, count: 11 });
deepRipples(sc, rand, (c) => (c === "sea5" ? "sea4" : c === "sea4" ? "sea3" : null));

// ---- 遠くの漁船(左。水平線の上。白い船体、赤い線、操舵室、マストと旗) ----
const bx = 14;
const by = HORIZON - 1; // 喫水線
// 船体:下が細い台形。
for (let y = by - 4; y <= by; y++) {
  const inset = by - y < 2 ? 2 - (by - y) : 0;
  for (let x = bx + inset; x <= bx + 22 - inset; x++) set(x, y, y === by - 2 ? "hullLine" : x > bx + 18 ? "hullShade" : "hull");
}
// へさき(右)を少し高く。
rect(bx + 20, by - 5, bx + 22, by - 5, "hull");
// 操舵室。
rect(bx + 4, by - 10, bx + 11, by - 5, "cabin");
rect(bx + 11, by - 10, bx + 11, by - 5, "hullShade");
rect(bx + 5, by - 9, bx + 6, by - 8, "window");
rect(bx + 8, by - 9, bx + 9, by - 8, "window");
rect(bx + 3, by - 11, bx + 12, by - 11, "mast");
// マストと旗。
rect(bx + 15, by - 18, bx + 15, by - 5, "mast");
rect(bx + 16, by - 18, bx + 19, by - 16, "flag");
rect(bx + 2, by - 14, bx + 2, by - 5, "mast");
// 船のまわりの白い波。
for (let x = bx - 2; x <= bx + 25; x++) if (isSea(get(x, by + 1)) || get(x, by + 1) === "sky5") set(x, by + 1, x % 3 ? "waveHi" : "waveMid");

// ---- 鳥(1 羽) ----
flyingGull(88, 60, "cloud", "gull");

writeBackground({ id: "bg-oki", name: "沖(昼)", constName: "BG_OKI", file: "oki.js", decision: "D-384", script: "scripts/art/bg_oki.mjs", P, grid: sc.grid });
