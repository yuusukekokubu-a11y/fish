// 外洋(昼)の背景のドット絵を作る(D-372・D-384)。幅 130 × 高さ 280 マス。
// 外洋の景色:上が紺で水平線が白っぽい空、高い太陽と海の上の光の道、遠くの大きな貨物船、クジラの潮吹き、
// 長いうねりのある深い青緑の海。特定のゲームの絵や画像は参照しない。画像生成 AI は使わない。ゲームの位置は港と同じ。
// 使い方:node scripts/art/bg_gaiyou.mjs

import { deepRipples, H, HORIZON, makeRand, makeScene, W, writeBackground } from "./bg_common.mjs";

// ---- 色:紺 → 白っぽい空、太陽、深い青緑の海、灰色の船 ----
const P = {
  sky1: "#2c4c84",
  sky2: "#3f6297",
  sky3: "#5e80ab",
  sky4: "#8ea7c4",
  sky5: "#c3d1df",
  sky6: "#e2e9f0",
  sun: "#fffbe6",
  sunHalo: "#f3eac2",
  cloud: "#f4f6f8",
  cloudShade: "#d3dce6",
  cloudShade2: "#aebdcf",
  sea1: "#1d7480",
  sea2: "#16636e",
  sea3: "#11525c",
  sea4: "#0c434b",
  sea5: "#07343a",
  swellHi: "#5fa7ad",
  swell: "#2b858f",
  glint: "#fff6cf",
  glintMid: "#bfe0d6",
  ship: "#6d7780",
  shipDark: "#4b545d",
  shipHull: "#8a3e38",
  container1: "#c9773c",
  container2: "#3f7fa6",
  whale: "#3c4f5c",
  spout: "#e8f2f4",
};

const sc = makeScene();
const { set, rect, get, bandFill, cloud } = sc;
const rand = makeRand(19);

// ---- 空:上は紺、水平線は白っぽい(6 段) ----
bandFill(0, HORIZON - 1, [
  [0, "sky1"],
  [22, "sky2"],
  [46, "sky3"],
  [70, "sky4"],
  [90, "sky5"],
  [106, "sky6"],
]);
// 太陽:高いところ(左寄り)。光の輪は点描で。
const SX = 30;
const SY = 26;
for (let y = SY - 10; y <= SY + 10; y++) {
  for (let x = SX - 10; x <= SX + 10; x++) {
    const d = Math.hypot(x - SX, y - SY);
    if (d <= 4.5) set(x, y, "sun");
    else if (d <= 6.5) set(x, y, "sunHalo");
    else if (d <= 9 && (x + y) % 2 === 0) set(x, y, "sunHalo");
  }
}
// うすい筋の雲(横に長い)。
cloud(
  [
    [80, 40, 3],
    [86, 39, 4],
    [94, 40, 4],
    [102, 41, 3],
  ],
  42,
);
cloud(
  [
    [96, 78, 3],
    [103, 76, 4],
    [111, 78, 3],
  ],
  80,
);
cloud(
  [
    [10, 66, 2],
    [15, 65, 3],
    [20, 66, 2],
  ],
  67,
);

// ---- 海:深い青緑 ----
bandFill(HORIZON, H - 1, [
  [HORIZON, "sea1"],
  [136, "sea2"],
  [164, "sea3"],
  [198, "sea4"],
  [252, "sea5"],
]);
rect(0, HORIZON, W - 1, HORIZON, "sky6");
const isSea = (c) => !!c && c.startsWith("sea");
// うねり:ゆるく波打つ長い線(明るい頭と、その下の影)。手前ほど間が広い。右の竿のまわりとゲージのあたりは控えめ。
for (let k = 0, y0 = HORIZON + 4; y0 < 204; k++, y0 += 5 + Math.floor(k * 1.3)) {
  for (let x = 0; x < W; x++) {
    const y = Math.round(y0 + 1.5 * Math.sin(x * 0.12 + k * 1.7));
    if (x > 74 && y > 150) continue;
    if (((x + k * 5) % 23) < 6) continue; // うねりの切れ目
    if (isSea(get(x, y))) set(x, y, "swellHi");
    if (isSea(get(x, y + 1))) set(x, y + 1, "swell");
  }
}
// 太陽の光の道:太陽の真下の海に、きらめく点(下へ行くほど広がる)。
for (let y = HORIZON + 2; y < 200; y += 2) {
  const half = 2 + (y - HORIZON) * 0.12;
  for (let i = 0; i < 3; i++) {
    const x = Math.round(SX + (rand() * 2 - 1) * half);
    const len = 1 + Math.floor(rand() * 3);
    for (let j = 0; j < len; j++) if (isSea(get(x + j, y)) || get(x + j, y)?.startsWith("swell")) set(x + j, y, y < 150 ? "glint" : "glintMid");
  }
}
deepRipples(sc, rand, (c) => (c === "sea5" ? "sea4" : c === "sea4" ? "sea3" : null));

// ---- 遠くの貨物船(水平線の上。左寄り。積み上げたコンテナと後ろの船橋) ----
const bx = 46;
const by = HORIZON - 1;
for (let y = by - 3; y <= by; y++) {
  const inset = by - y < 1 ? 1 : 0;
  for (let x = bx + inset; x <= bx + 34 - inset; x++) set(x, y, y >= by - 1 ? "shipHull" : "shipDark");
}
// へさき(右)を少し上げる。
rect(bx + 32, by - 4, bx + 35, by - 4, "shipDark");
// コンテナ(2 色を交互に、2 段)。
for (let x = bx + 10; x <= bx + 31; x++) {
  set(x, by - 4, Math.floor((x - bx) / 3) % 2 ? "container1" : "container2");
  set(x, by - 5, Math.floor((x - bx + 1) / 3) % 2 ? "container2" : "container1");
}
// 船橋(後ろ=左)と煙突。
rect(bx + 2, by - 10, bx + 7, by - 4, "ship");
rect(bx + 7, by - 10, bx + 7, by - 4, "shipDark");
rect(bx + 3, by - 9, bx + 6, by - 9, "shipDark");
rect(bx + 4, by - 13, bx + 5, by - 11, "shipDark");

// ---- クジラの潮吹き(右の遠く。黒い背と、白い潮) ----
const wx = 108;
for (let x = wx - 5; x <= wx + 5; x++) {
  const h = Math.round(2.2 * (1 - ((x - wx) / 5.5) ** 2));
  for (let y = HORIZON - h; y <= HORIZON; y++) set(x, y, "whale");
}
set(wx - 6, HORIZON, "whale");
// 潮:白い噴き上げと、空に負けないよう外側を灰色でふちどる。
const spout = ["..o.o..", ".owwwo.", "owwwwwo", ".owwwo.", "..owo..", "...w...", "...w..."];
spout.forEach((row, dy) => {
  [...row].forEach((ch, dx) => {
    if (ch === "w") set(wx - 5 + dx, HORIZON - 9 + dy, "spout");
    if (ch === "o") set(wx - 5 + dx, HORIZON - 9 + dy, "cloudShade2");
  });
});
for (let x = wx - 8; x <= wx + 8; x++) if (isSea(get(x, HORIZON + 1))) set(x, HORIZON + 1, x % 2 ? "glintMid" : "swellHi");

writeBackground({ id: "bg-gaiyou", name: "外洋(昼)", constName: "BG_GAIYOU", file: "gaiyou.js", decision: "D-384", script: "scripts/art/bg_gaiyou.mjs", P, grid: sc.grid, night: { moon: null } });
