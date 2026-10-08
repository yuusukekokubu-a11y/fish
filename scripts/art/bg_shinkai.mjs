// 深海(昼)の背景のドット絵を作る(D-372・D-384)。幅 130 × 高さ 280 マス。
// 深海の景色:厚い雲におおわれた暗い空と、雲のすき間からの光の筋、水平線の調査船(小さな明かり)、
// ほぼ黒に近い紺の海、深いところで光る小さな粒と、チョウチンアンコウの光。昼だが、釣り場の色(ほぼ黒の藍)に合わせて暗くする。
// 特定のゲームの絵や画像は参照しない。画像生成 AI は使わない。ゲームの位置は港と同じ。
// 使い方:node scripts/art/bg_shinkai.mjs

import { H, HORIZON, makeRand, makeScene, W, writeBackground } from "./bg_common.mjs";

// ---- 色:暗い藍の空と雲、光の筋、ほぼ黒の紺の海、光る粒 ----
const P = {
  sky1: "#151b3b",
  sky2: "#1b2348",
  sky3: "#232d56",
  sky4: "#2d3965",
  sky5: "#3a4874",
  cloudHi: "#3c4772",
  cloud: "#2b3459",
  cloudLo: "#1d2343",
  ray: "#53648f",
  sea1: "#14234d",
  sea2: "#101c40",
  sea3: "#0c1634",
  sea4: "#081027",
  sea5: "#050a1b",
  waveHi: "#4a6599",
  waveMid: "#26396c",
  glow: "#8ff3e3",
  glowMid: "#3fb3aa",
  ship: "#262c45",
  shipLight: "#ffd47e",
  lure: "#fff3a8",
  lureHalo: "#b39f55",
  shadow: "#0b1531",
};

const sc = makeScene();
const { set, rect, get, bandFill } = sc;
const rand = makeRand(23);

// ---- 空:暗い藍。水平線に近いほど少し明るい ----
bandFill(0, HORIZON - 1, [
  [0, "sky1"],
  [24, "sky2"],
  [52, "sky3"],
  [80, "sky4"],
  [102, "sky5"],
]);
// 厚い雲:横に長い帯を 3 段。下の縁は暗く、上の縁は少し明るい。
/** 横に長い雲の帯。 @param {number} y0 上の目安 @param {number} y1 下の目安 @param {number} seed */
function cloudBand(y0, y1, phase) {
  for (let x = 0; x < W; x++) {
    const top = Math.round(y0 + 3 * Math.sin(x * 0.11 + phase) + 2 * Math.sin(x * 0.29 + phase * 2));
    const bottom = Math.round(y1 + 2 * Math.sin(x * 0.07 + phase * 3));
    for (let y = top; y <= bottom; y++) set(x, y, y === top ? "cloudHi" : y >= bottom - 1 ? "cloudLo" : (x + y) % 7 === 0 ? "cloudLo" : "cloud");
  }
}
cloudBand(6, 20, 0.3);
cloudBand(34, 46, 2.1);
cloudBand(66, 74, 4.0);
// 雲のすき間からの光の筋(斜めの点描)。右の竿のあたりは避けて、左寄りに 3 本。
for (const [x0, w] of [
  [14, 5],
  [34, 4],
  [52, 3],
]) {
  for (let y = 47; y < HORIZON - 1; y++) {
    const shift = Math.round((y - 47) * 0.35);
    for (let x = x0 + shift; x < x0 + shift + w; x++) if (get(x, y)?.startsWith("sky") && (x + y) % 2 === 0) set(x, y, "ray");
  }
}

// ---- 海:ほぼ黒の紺 ----
bandFill(HORIZON, H - 1, [
  [HORIZON, "sea1"],
  [132, "sea2"],
  [156, "sea3"],
  [188, "sea4"],
  [236, "sea5"],
]);
rect(0, HORIZON, W - 1, HORIZON, "waveMid");
const isSea = (c) => !!c && c.startsWith("sea");
// 波:水平線の近くだけ、少なめ(暗い海)。光の筋の下だけ少し明るい波。
for (let y = HORIZON + 3; y < 170; y += 4) {
  const t = (y - HORIZON) / (170 - HORIZON);
  for (let i = 0; i < Math.round(6 - 3 * t); i++) {
    const len = Math.round(2 + 4 * t);
    const x = Math.floor(rand() * (W - len));
    if (x > 74 && y > 150) continue;
    const c = x < 70 && rand() < 0.5 ? "waveHi" : "waveMid";
    for (let k = 0; k < len; k++) if (isSea(get(x + k, y))) set(x + k, y, c);
  }
}

// ---- 深いところ:光る小さな粒(ゲージと体力のあたり y = 208〜244 は空ける) ----
for (let i = 0; i < 46; i++) {
  const y = 176 + Math.floor(rand() * (H - 180));
  if (y >= 206 && y <= 246) continue;
  const x = Math.floor(rand() * W);
  if (!isSea(get(x, y))) continue;
  const big = rand() < 0.25;
  set(x, y, big ? "glow" : "glowMid");
  if (big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (isSea(get(x + dx, y + dy))) set(x + dx, y + dy, "glowMid");
}
// 大きな魚の影(深いところを横切る、ぼんやりした形)。ゲージより下。
for (let y = 252; y <= 270; y++) {
  for (let x = 40; x <= 120; x++) {
    const u = (x - 82) / 34;
    const v = (y - 261) / 8;
    const body = u * u + v * v <= 1;
    const tail = x > 112 && Math.abs(y - 261) <= (x - 110) * 0.9;
    if ((body || tail) && isSea(get(x, y)) && (x + y) % 2 === 0) set(x, y, "shadow");
  }
}
// チョウチンアンコウの光(左下):明るい点と、まわりの光の輪、ちょうちんの柄。
const LX = 18;
const LY = 258;
for (let y = LY - 4; y <= LY + 4; y++) {
  for (let x = LX - 4; x <= LX + 4; x++) {
    const d = Math.hypot(x - LX, y - LY);
    if (d <= 1.2) set(x, y, "lure");
    else if (d <= 2.6) set(x, y, "lureHalo");
    else if (d <= 4.2 && (x + y) % 2 === 0 && isSea(get(x, y))) set(x, y, "lureHalo");
  }
}
for (let i = 1; i <= 6; i++) set(LX + Math.round(i * 0.8), LY + i, "shadow");

// ---- 水平線の調査船(左寄り。暗い船体、クレーン、小さな明かり) ----
const bx = 60;
const by = HORIZON - 1;
for (let y = by - 3; y <= by; y++) {
  const inset = by - y < 1 ? 1 : 0;
  for (let x = bx + inset; x <= bx + 26 - inset; x++) set(x, y, "ship");
}
rect(bx + 3, by - 8, bx + 10, by - 4, "ship");
rect(bx + 6, by - 12, bx + 6, by - 9, "ship");
// クレーン(右へのびる腕)。
for (let i = 0; i <= 10; i++) set(bx + 16 + i, by - 5 - Math.round(i * 0.7), "ship");
rect(bx + 16, by - 5, bx + 16, by - 4, "ship");
// 明かり。
for (const [dx, dy] of [
  [4, -6],
  [7, -6],
  [6, -13],
  [26, -12],
  [12, -2],
  [20, -2],
]) set(bx + dx, by + dy, "shipLight");
for (let x = bx - 1; x <= bx + 27; x++) if (isSea(get(x, by + 2)) && x % 3 === 0) set(x, by + 2, "shipLight");

writeBackground({ id: "bg-shinkai", name: "深海(昼)", constName: "BG_SHINKAI", file: "shinkai.js", decision: "D-384", script: "scripts/art/bg_shinkai.mjs", P, grid: sc.grid });
