// 港(昼)の背景のドット絵を作る(D-361・D-372・D-383)。幅 130 × 高さ 280 マス(1 マス 3px で 390 × 840px)。
// 港の景色(空・雲・遠くの山と町・防波堤と赤い灯台・係船柱・カモメ・海と波)を、形の決まりで置いて 1 マスずつ色を決め、
// 色番号の並び(src/art/bg/minato.js)に書き出す。特定のゲームの絵や画像は参照しない。画像生成 AI は使わない。
// ゲームの位置(D-383):水平線は上から 118 マス(水面 0.42)。竿は右(x ≈ 80〜107)、ウキは x ≈ 52・y ≈ 140、
// 魚は中央(y ≈ 154)、ゲージは y ≈ 224。右側と手前の海は模様を減らして、ゲームの絵を見やすくする。
// 使い方:node scripts/art/bg_minato.mjs

import { H, HORIZON, makeRand, makeScene, W, writeBackground } from "./bg_common.mjs";

// ---- 色(名前 → #rrggbb)。昼の港:明るい空と青い海、灰色の防波堤、赤と白の灯台 ----
const P = {
  sky1: "#4fa6de",
  sky2: "#6ab7e6",
  sky3: "#88c8ec",
  sky4: "#a9d9f1",
  sky5: "#c9e8f6",
  cloud: "#ffffff",
  cloudShade: "#dcedf6",
  cloudShade2: "#bcdcee",
  hillFar: "#a2c4d6",
  hill: "#88afc4",
  town: "#b4cad6",
  townDark: "#7a99ad",
  sea1: "#4aa8da",
  sea2: "#3591c8",
  sea3: "#2779b2",
  sea4: "#1e6398",
  sea5: "#174f7e",
  waveHi: "#b6e3f6",
  waveMid: "#79c3e8",
  concTop: "#dadcd6",
  conc: "#b3b8b4",
  concDark: "#8b928f",
  concShadow: "#5d686b",
  red: "#d84a3e",
  redDark: "#a7342d",
  white: "#f3f2ea",
  whiteShade: "#cdd1cc",
  glass: "#ffe590",
  metal: "#46525c",
  gull: "#7f8c96",
};

const { grid, set, rect, get, bandFill, cloud, flyingGull } = makeScene();

// ---- 空:上が濃く、水平線に近いほど明るい ----
bandFill(0, HORIZON - 1, [
  [0, "sky1"],
  [26, "sky2"],
  [54, "sky3"],
  [80, "sky4"],
  [100, "sky5"],
]);

cloud(
  [
    [16, 26, 6],
    [24, 22, 8],
    [33, 25, 6],
    [10, 29, 4],
    [40, 29, 4],
  ],
  31,
);
cloud(
  [
    [92, 48, 4],
    [99, 45, 6],
    [107, 47, 5],
    [114, 50, 3],
  ],
  52,
);
cloud(
  [
    [64, 12, 3],
    [69, 10, 4],
    [74, 12, 3],
  ],
  14,
);

// ---- 遠くの山と町(水平線のすぐ上。右寄り。薄い青灰色) ----
for (let x = 0; x < W; x++) {
  // 低い山:ゆるい 2 つのこぶ。左は防波堤の後ろに少しだけ。
  const h1 = 10 * Math.exp(-(((x - 96) / 22) ** 2)) + 6 * Math.exp(-(((x - 124) / 10) ** 2));
  const h2 = 5 * Math.exp(-(((x - 18) / 16) ** 2));
  const far = Math.round(Math.max(h1, h2));
  for (let y = HORIZON - far; y < HORIZON; y++) set(x, y, "hillFar");
  const near = Math.round(Math.max(h1 - 4, h2 - 2, 0));
  for (let y = HORIZON - near; y < HORIZON; y++) set(x, y, "hill");
}
// 町:四角い建物の並び(右の山のふもと)。窓は明るい点。
const buildings = [
  [70, 4, 5],
  [75, 3, 8],
  [79, 5, 6],
  [85, 3, 10],
  [89, 4, 7],
  [94, 6, 5],
  [101, 3, 9],
  [105, 5, 6],
  [111, 4, 4],
];
for (const [bx, bw, bh] of buildings) {
  rect(bx, HORIZON - bh, bx + bw - 1, HORIZON - 1, "town");
  rect(bx + bw - 1, HORIZON - bh, bx + bw - 1, HORIZON - 1, "townDark");
  for (let y = HORIZON - bh + 1; y < HORIZON - 1; y += 2) if (bw >= 4) set(bx + 1, y, "cloud");
}

// ---- 海:水平線から下へ、明るい青 → 深い青 ----
bandFill(HORIZON, H - 1, [
  [HORIZON, "sea1"],
  [132, "sea2"],
  [158, "sea3"],
  [192, "sea4"],
  [250, "sea5"],
]);
// 水平線の明るい線。
rect(0, HORIZON, W - 1, HORIZON, "waveMid");

// 波:短い横線。水平線の近くは細かく多め、手前ほど長く少なく。右の竿のまわりと、ゲージのあたり(y ≥ 210)は減らす。
const rand = makeRand(7);
for (let y = HORIZON + 3; y < 206; y += 3) {
  const t = (y - HORIZON) / (206 - HORIZON);
  const count = Math.round(9 - 5 * t);
  const len = Math.round(2 + 4 * t);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rand() * (W - len));
    if (x > 74 && y > 150) continue;
    const c = t < 0.35 || rand() < 0.4 ? "waveHi" : "waveMid";
    for (let k = 0; k < len; k++) if (get(x + k, y)?.startsWith("sea")) set(x + k, y, c);
    // 長い波の下に、1 段暗いかげ(手前だけ)。
    if (len >= 4) for (let k = 1; k < len - 1; k++) if (get(x + k, y + 1)?.startsWith("sea")) set(x + k, y + 1, "waveMid");
  }
}

// 深いところの、うすいさざなみ:1 段明るい青の短い線を少しだけ。ゲージと体力のあたり(y = 208〜244)は空ける。
for (let y = 200; y < H - 2; y += 4) {
  if (y >= 208 && y <= 244) continue;
  for (let i = 0; i < 4; i++) {
    const len = 3 + Math.floor(rand() * 4);
    const x = Math.floor(rand() * (W - len));
    const here = get(x, y);
    const lighter = here === "sea5" ? "sea4" : here === "sea4" ? "sea3" : null;
    if (lighter) for (let k = 0; k < len; k++) if (get(x + k, y) === here) set(x + k, y, lighter);
  }
}

// ---- 防波堤(左から水平線の手前へのびる、コンクリート) ----
const BW_RIGHT = 46;
const BW_TOP = 110;
for (let x = 0; x <= BW_RIGHT; x++) {
  // 先の端は少し丸く欠ける。
  const top = x > BW_RIGHT - 2 ? BW_TOP + 1 : BW_TOP;
  rect(x, top, x, top + 1, "concTop");
  rect(x, top + 2, x, 119, x % 7 === 0 ? "concDark" : "conc");
  rect(x, 120, x, 121, "concShadow");
}
rect(BW_RIGHT, BW_TOP + 1, BW_RIGHT, 121, "concDark");
// 防波堤の足もとの白い波と、水にうつる影。
for (let x = 0; x <= BW_RIGHT + 2; x++) {
  set(x, 122, x % 3 === 0 ? "waveHi" : "cloud");
  if (x % 2 === 0) set(x, 123, "waveMid");
  if (x <= BW_RIGHT && x % 2 === 1) set(x, 124, "sea3");
}
// 係船柱(ビット):小さな黒っぽいきのこ形。
for (const bx of [7, 19]) {
  rect(bx, BW_TOP - 2, bx + 1, BW_TOP - 1, "metal");
  rect(bx - 1, BW_TOP - 3, bx + 2, BW_TOP - 3, "metal");
}

// ---- 赤い灯台(防波堤の先。赤と白の帯、上に灯室と赤い屋根) ----
const LX = 38; // 灯台の真ん中
const towerTop = 80;
const towerBottom = BW_TOP - 1;
for (let y = towerTop; y <= towerBottom; y++) {
  // 下ほど少し太い(半幅 3 → 5)。
  const half = Math.round(3 + (2 * (y - towerTop)) / (towerBottom - towerTop));
  const band = (y - towerTop) % 10 < 7 ? "red" : "white";
  for (let x = LX - half; x <= LX + half; x++) {
    let c = band;
    // 右側は影(光は左上から)。
    if (x >= LX + half - 1) c = band === "red" ? "redDark" : "whiteShade";
    if (x === LX - half || x === LX + half) c = "metal";
    set(x, y, c);
  }
}
// 入り口の扉。
rect(LX - 1, towerBottom - 4, LX, towerBottom, "metal");
// 足もとの台。
rect(LX - 6, BW_TOP - 1, LX + 6, BW_TOP - 1, "concDark");
// 回廊(手すり)。
rect(LX - 5, towerTop - 1, LX + 5, towerTop - 1, "metal");
rect(LX - 5, towerTop - 3, LX + 5, towerTop - 3, "metal");
for (let x = LX - 5; x <= LX + 5; x += 2) set(x, towerTop - 2, "metal");
// 灯室(ガラス)。
rect(LX - 3, towerTop - 8, LX + 3, towerTop - 4, "metal");
rect(LX - 2, towerTop - 7, LX + 2, towerTop - 5, "glass");
set(LX - 1, towerTop - 7, "cloud");
// 屋根(赤い丸屋根)と先の飾り。
for (let y = towerTop - 12; y <= towerTop - 9; y++) {
  const half = y - (towerTop - 13);
  for (let x = LX - half; x <= LX + half; x++) set(x, y, x >= LX + half - 1 ? "redDark" : "red");
}
rect(LX, towerTop - 14, LX, towerTop - 13, "metal");

// ---- カモメ(空に 2 羽、防波堤の上に 1 羽) ----
flyingGull(60, 38);
flyingGull(112, 20);
// 止まっているカモメ(防波堤の上):白い体、灰色の羽、黄色いくちばし。
rect(27, BW_TOP - 3, 29, BW_TOP - 2, "cloud");
set(30, BW_TOP - 4, "cloud");
set(31, BW_TOP - 4, "glass");
rect(27, BW_TOP - 3, 28, BW_TOP - 3, "gull");
set(28, BW_TOP - 1, "metal");

// ---- 書き出し ----
writeBackground({
  id: "bg-minato",
  name: "港(昼)",
  constName: "BG_MINATO",
  file: "minato.js",
  decision: "D-383",
  script: "scripts/art/bg_minato.mjs",
  P,
  grid,
  extra: ["/** 水平線の行(上から。ゲームの水面 0.42 の位置)。 */", `export const MINATO_HORIZON = ${HORIZON};`, ""],
});
