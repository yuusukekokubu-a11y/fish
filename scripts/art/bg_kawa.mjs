// 川(昼)の背景のドット絵を作る(D-372・D-384)。幅 130 × 高さ 280 マス。
// 川の景色:明るい空と雲、遠くの青い山、向こう岸の緑の森、左の赤い橋、手前左の草の土手と葦、青緑の川の流れ。
// 特定のゲームの絵や画像は参照しない。画像生成 AI は使わない。ゲームの位置は港と同じ。
// 使い方:node scripts/art/bg_kawa.mjs

import { deepRipples, H, HORIZON, makeRand, makeScene, W, writeBackground } from "./bg_common.mjs";

// ---- 色:明るい空、緑の森と土手、赤い橋、青緑の川 ----
const P = {
  sky1: "#73bde6",
  sky2: "#8ccbec",
  sky3: "#a6d8f0",
  sky4: "#c2e5f4",
  sky5: "#dbf0f8",
  cloud: "#ffffff",
  cloudShade: "#e1f0f6",
  cloudShade2: "#c3e0ec",
  mountFar: "#9fbfd2",
  mount: "#86aac2",
  forestHi: "#7fb062",
  forest: "#5c9447",
  forestDark: "#3f7236",
  bank: "#9a8a62",
  bridge: "#d2503f",
  bridgeDark: "#9e3a2f",
  river1: "#5cb1aa",
  river2: "#4a9d98",
  river3: "#3a8784",
  river4: "#2d716f",
  river5: "#225a59",
  flowHi: "#c6ebe6",
  flowMid: "#86cbc3",
  reed: "#a9b85a",
  reedDark: "#6f8a3d",
  grassHi: "#8fc067",
  grass: "#6aa24c",
  grassDark: "#4b7f37",
  bird: "#6f7e88",
};

const sc = makeScene();
const { set, rect, get, bandFill, cloud, flyingGull } = sc;
const rand = makeRand(13);

// ---- 空 ----
bandFill(0, HORIZON - 1, [
  [0, "sky1"],
  [26, "sky2"],
  [52, "sky3"],
  [74, "sky4"],
  [90, "sky5"],
]);
cloud(
  [
    [26, 30, 6],
    [34, 26, 8],
    [44, 30, 6],
  ],
  35,
);
cloud(
  [
    [96, 16, 4],
    [102, 13, 5],
    [109, 16, 4],
  ],
  19,
);
cloud(
  [
    [112, 52, 3],
    [117, 50, 4],
    [122, 52, 3],
  ],
  54,
);

// ---- 遠くの青い山(2 段) ----
for (let x = 0; x < W; x++) {
  const far = Math.round(24 + 8 * Math.sin(x * 0.05 + 1) + 6 * Math.sin(x * 0.13));
  for (let y = HORIZON - far; y < HORIZON; y++) set(x, y, "mountFar");
  const near = Math.round(16 + 6 * Math.sin(x * 0.08 + 3) + 3 * Math.sin(x * 0.21));
  for (let y = HORIZON - near; y < HORIZON; y++) set(x, y, "mount");
}
// ---- 向こう岸の森:丸い木の頭が並ぶ。上の縁は明るく、下は暗い ----
for (let x = 0; x < W; x++) {
  const top = Math.round(HORIZON - 12 - 3 * Math.abs(Math.sin(x * 0.42)) - 2 * Math.abs(Math.sin(x * 0.17 + 2)));
  for (let y = top; y < HORIZON - 1; y++) {
    const d = y - top;
    set(x, y, d < 1 ? "forestHi" : d < 6 ? ((x + y) % 5 === 0 ? "forestHi" : "forest") : (x + y) % 4 === 0 ? "forest" : "forestDark");
  }
  set(x, HORIZON - 1, "bank");
}

// ---- 川:青緑。下ほど深い。流れは横に長い線 ----
bandFill(HORIZON, H - 1, [
  [HORIZON, "river1"],
  [136, "river2"],
  [164, "river3"],
  [198, "river4"],
  [252, "river5"],
]);
const isRiver = (c) => !!c && c.startsWith("river");
// 流れの線:港の波より長く、少なく(川はおだやか)。右の竿のまわりと、ゲージのあたりは空ける。
for (let y = HORIZON + 3; y < 206; y += 4) {
  const t = (y - HORIZON) / (206 - HORIZON);
  const count = Math.round(5 - 2 * t);
  const len = Math.round(5 + 7 * t);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * (W - len));
    if (x > 70 && y > 150) continue;
    for (let k = 0; k < len; k++) if (isRiver(get(x + k, y))) set(x + k, y, k === 0 || k === len - 1 ? "flowMid" : t < 0.4 ? "flowHi" : "flowMid");
  }
}
deepRipples(sc, rand, (c) => (c === "river5" ? "river4" : c === "river4" ? "river3" : null));
// 向こう岸のうつりこみ(水平線のすぐ下に、暗い緑の点)。
for (let x = 0; x < W; x += 2) set(x, HORIZON + 1, (x / 2) % 3 === 0 ? "forestDark" : "river2");

// ---- 赤い橋(左。水平線の少し上に、アーチと欄干) ----
const B0 = 8;
const B1 = 62;
const deckY = 100;
for (let x = B0; x <= B1; x++) {
  rect(x, deckY, x, deckY + 1, "bridge");
  set(x, deckY + 2, "bridgeDark");
  // 欄干:上の手すりと、4 マスごとの柱。
  set(x, deckY - 3, "bridge");
  if ((x - B0) % 4 === 0) rect(x, deckY - 2, x, deckY - 1, "bridgeDark");
}
// アーチ(2 つ)と橋脚。
for (const [cx, span] of [
  [22, 12],
  [48, 12],
]) {
  for (let x = cx - span; x <= cx + span; x++) {
    const dy = Math.round(9 * (1 - ((x - cx) / span) ** 2));
    set(x, deckY + 3 + 9 - dy, "bridgeDark");
  }
}
for (const px of [B0 + 1, 35, B1 - 1]) rect(px - 1, deckY + 3, px + 1, HORIZON - 1, "bridgeDark");

// ---- 手前左の土手:丸くふくらんだ草の岸(y = 138〜212)。縁に葦が立つ ----
const BANK0 = 138;
const BANK1 = 212;
/** 土手の右の端(行 y での x)。 */
const bankRight = (y) => Math.round(30 * Math.sin((Math.PI * (y - BANK0)) / (BANK1 - BANK0)) ** 0.8 + 1.5 * Math.sin(y * 0.5) - 2);
for (let y = BANK0; y <= BANK1; y++) {
  const right = bankRight(y);
  for (let x = 0; x <= right; x++) {
    let c = (x * 3 + y * 5) % 23 === 0 ? "grassHi" : (x * 7 + y * 2) % 29 === 0 ? "grassDark" : "grass";
    if (x < right - 3 && (y - BANK0) < 6 && (x + y) % 3 === 0) c = "grassHi";
    if (x >= right - 1) c = "grassDark";
    // 水ぎわの土(下半分の縁だけ)。
    if (x === right && y > (BANK0 + BANK1) / 2) c = "bank";
    set(x, y, c);
  }
  // 水ぎわの白い線。
  if (right >= -1 && isRiver(get(right + 1, y)) && y % 2 === 0) set(right + 1, y, "flowHi");
}
// 葦:土手の上半分の縁から、細い茎と穂。少し右へ傾く。
for (let i = 0; i < 9; i++) {
  const base = BANK0 + 4 + i * 4;
  const rx = bankRight(base) - 2 - (i % 3);
  const h = 14 + ((i * 7) % 9);
  for (let y = base - h; y <= base; y++) set(rx + Math.round((base - y) * 0.08), y, y < base - h + 4 ? "reed" : "reedDark");
  const tx = rx + Math.round(h * 0.08);
  rect(tx - 1, base - h - 3, tx, base - h, "reed");
}

// ---- 鳥(サギのような白い鳥 1 羽、遠くに 1 羽) ----
flyingGull(76, 40, "cloud", "bird");
flyingGull(60, 66, "cloud", "bird");

writeBackground({ id: "bg-kawa", name: "川(昼)", constName: "BG_KAWA", file: "kawa.js", decision: "D-384", script: "scripts/art/bg_kawa.mjs", P, grid: sc.grid });
