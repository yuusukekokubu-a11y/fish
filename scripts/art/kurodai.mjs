// クロダイのドット絵を、32・64・128 マスの 3 つの粗さで作る(D-361・D-364)。
// 実在のクロダイの特徴(体の形・ひれ・目・色)から、形と光と影の決まりを書き、1 マスずつ色を決めて、
// 色番号の並び(src/art/fish/kurodai.js)に書き出す。特定のゲームの絵や画像は参照しない。画像生成 AI は使わない。
// 書き出したあと、見本のページのスクリーンショットを見て直す(直したことは、下の「手直し」と DESIGN に書く)。
// 使い方:node scripts/art/kurodai.mjs

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../src/art/fish/kurodai.js");
const CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

// ---- 形(魚の長さ L を 1 とした座標。u は口先 0 〜 尾の端 1、v は体の中心線からの縦。下が +) ----

/** なめらかな補間(単調な 3 次。行き過ぎない)。 */
function pchip(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const n = xs.length;
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const d = h.map((hi, i) => (ys[i + 1] - ys[i]) / hi);
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
}

// 背の線:口先から急に立ち上がる額、背の頂点は体の前寄り(クロダイは体高が高く、側扁した楕円)。
const TOP = pchip([
  [0.0, 0.012],
  [0.015, -0.02],
  [0.05, -0.085],
  [0.1, -0.15],
  [0.16, -0.198],
  [0.24, -0.228],
  [0.33, -0.238],
  [0.43, -0.226],
  [0.53, -0.192],
  [0.62, -0.14],
  [0.69, -0.088],
  [0.74, -0.062],
  [0.775, -0.058],
]);
// 腹の線:あごの下からゆるく下がり、腹びれのあたりが最も深い。
const BOT = pchip([
  [0.0, 0.034],
  [0.03, 0.068],
  [0.08, 0.108],
  [0.15, 0.15],
  [0.24, 0.18],
  [0.33, 0.19],
  [0.43, 0.176],
  [0.52, 0.148],
  [0.6, 0.114],
  [0.68, 0.08],
  [0.74, 0.062],
  [0.775, 0.058],
]);
const BODY_END = 0.775;

/** 点が多角形の中か。 */
function inPoly(u, v, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// 尾びれ:二股。上下の葉の先はとがり、切れ込みは中くらい。
const TAIL = [
  [0.75, -0.06],
  [0.8, -0.098],
  [0.86, -0.155],
  [0.925, -0.205],
  [0.99, -0.238],
  [0.968, -0.168],
  [0.935, -0.1],
  [0.908, -0.04],
  [0.898, 0.0],
  [0.908, 0.04],
  [0.935, 0.1],
  [0.968, 0.168],
  [0.99, 0.238],
  [0.925, 0.205],
  [0.86, 0.155],
  [0.8, 0.098],
  [0.75, 0.06],
];

// 32 マスの尾びれ:葉を太くする(細い線だけにならないように)。
const TAIL32 = [
  [0.75, -0.065],
  [0.8, -0.11],
  [0.86, -0.17],
  [0.925, -0.215],
  [0.995, -0.245],
  [0.97, -0.165],
  [0.915, -0.075],
  [0.87, 0.0],
  [0.915, 0.075],
  [0.97, 0.165],
  [0.995, 0.245],
  [0.925, 0.215],
  [0.86, 0.17],
  [0.8, 0.11],
  [0.75, 0.065],
];

// 背びれ:前半は強い棘(11 本。2〜4 本目が最も高い)、後半は軟条で丸い。棘は後ろに傾く。
const DORSAL_SPINES = Array.from({ length: 11 }, (_, i) => {
  const u = 0.285 + i * 0.0235;
  const hs = [0.05, 0.1, 0.118, 0.115, 0.108, 0.1, 0.092, 0.084, 0.076, 0.07, 0.066];
  return { u, h: hs[i] };
});
const LEAN = 0.024; // 棘の傾き(高さ 0.1 あたり、後ろへ)

/** 背びれの棘の先を結んだ高さ(棘の傾きの分だけ後ろへずらす)。 */
const DORSAL_ENV = pchip([
  [0.27, 0.0],
  ...DORSAL_SPINES.map((s) => [s.u + LEAN * (s.h / 0.1), s.h]),
  [0.56, 0.066],
]);
const SOFT_DORSAL = pchip([
  [0.52, 0.066],
  [0.55, 0.074],
  [0.6, 0.07],
  [0.65, 0.055],
  [0.69, 0.03],
  [0.715, 0.0],
]);
// しりびれ:強い棘 3 本(2 本目が最も太く長い)と、後ろの軟条。
const ANAL_SPINES = [
  { u: 0.53, h: 0.045 },
  { u: 0.552, h: 0.078 },
  { u: 0.574, h: 0.072 },
];
const SOFT_ANAL = pchip([
  [0.575, 0.07],
  [0.61, 0.066],
  [0.64, 0.05],
  [0.665, 0.02],
  [0.68, 0.0],
]);

// 腹びれ:胸の下から後ろ下へ。先に棘。
const PELVIC = [
  [0.262, 0.17],
  [0.305, 0.178],
  [0.375, 0.262],
  [0.352, 0.27],
  [0.3, 0.23],
];
// 64 マスの腹びれ:少し太くする(細い棒に見えないように)。
const PELVIC64 = [
  [0.255, 0.168],
  [0.315, 0.176],
  [0.385, 0.258],
  [0.35, 0.276],
  [0.29, 0.236],
];
// 胸びれ:えらぶたの後ろから、細長く後ろへ伸びる(体の上に重なる)。
const PECTORAL = [
  [0.262, 0.02],
  [0.3, 0.014],
  [0.36, 0.03],
  [0.43, 0.052],
  [0.478, 0.068],
  [0.43, 0.074],
  [0.35, 0.076],
  [0.29, 0.07],
  [0.262, 0.058],
];

const EYE = { u: 0.122, v: -0.074, r: 0.034 };
// えらぶたの後ろの縁(上から下へ、ゆるく後ろにふくらむ)。
const OPERCLE = pchip([
  [-0.14, 0.215],
  [-0.08, 0.24],
  [0.0, 0.252],
  [0.08, 0.245],
  [0.14, 0.225],
]);
// 前えらぶた(頬の線)。128 だけ。
const PREOPERCLE = pchip([
  [-0.1, 0.178],
  [-0.03, 0.19],
  [0.05, 0.19],
  [0.11, 0.168],
]);

// ---- 領域を決める ----

/**
 * 1 点の領域。body・tail・dorsal・anal・pelvic・pectoral・spine(棘)と、体の中の目印。
 * @returns {{ region: string, extra?: any } | null}
 */
function regionAt(u, v, res) {
  // 胸びれは体の上に重なる。
  if (inPoly(u, v, PECTORAL)) return { region: "pectoral" };
  // 体。
  if (u >= 0 && u <= BODY_END) {
    const t = TOP(u);
    const b = BOT(u);
    if (v >= t && v <= b) return { region: "body", t: (v - t) / (b - t) };
  }
  if (inPoly(u, v, res === 32 ? TAIL32 : TAIL)) return { region: "tail" };
  if (inPoly(u, v, res === 64 ? PELVIC64 : PELVIC) && res !== 32) return { region: "pelvic" };
  // 背びれ(背の線より上)。
  if (u >= 0.27 && u <= 0.72) {
    const d = TOP(u) - v; // 背から上への高さ
    if (d > 0) {
      for (const s of res === 32 ? [] : res === 64 ? DORSAL_SPINES.filter((_, i) => i % 2 === 0) : DORSAL_SPINES) {
        if (d > s.h) continue;
        const su = s.u + LEAN * (d / 0.1);
        const half = res >= 128 ? 0.0036 : 0.0045;
        if (Math.abs(u - su) <= half) return { region: "spine" };
      }
      if (u < 0.525) {
        // 棘と棘の間の膜:棘の先どうしを結んだ高さの 8 割ほどで、棘のところだけ少し高い(上の縁が小さく切れ込む)。
        const H = DORSAL_ENV(u);
        let near = 0;
        for (const s of DORSAL_SPINES) near = Math.max(near, Math.max(0, 1 - Math.abs(u - (s.u + LEAN * 0.8)) / 0.0118));
        // 32 は棘を描かず、膜の縁の切れ込みを少し深くして棘を表す。
        let near3 = 0;
        if (res === 32) for (const s of DORSAL_SPINES.filter((_, i) => i % 3 === 1)) near3 = Math.max(near3, Math.max(0, 1 - Math.abs(u - (s.u + LEAN)) / 0.03));
        const mem = res === 32 ? H * (0.62 + 0.38 * near3) : H * (0.8 + 0.2 * near);
        if (u >= DORSAL_SPINES[0].u - 0.004 && d <= mem) return { region: "dorsal" };
      } else if (d <= SOFT_DORSAL(u)) return { region: "dorsal", soft: true };
    }
  }
  // しりびれ(腹の線より下)。
  if (u >= 0.52 && u <= 0.69) {
    const d = v - BOT(u);
    if (d > 0) {
      for (const s of res === 32 ? [] : res === 64 ? [ANAL_SPINES[1]] : ANAL_SPINES) {
        if (d > s.h) continue;
        const su = s.u + LEAN * (d / 0.1);
        const half = res >= 128 ? 0.0045 : 0.006;
        if (Math.abs(u - su) <= half) return { region: "spine" };
      }
      if (u < 0.578) {
        let env = 0;
        for (const s of ANAL_SPINES) env = Math.max(env, s.h * Math.max(0, 1 - Math.abs(u - (s.u + LEAN * 0.5)) / 0.024));
        if (d <= env * (res === 64 ? 1.0 : 0.82)) return { region: "anal" };
      } else if (d <= SOFT_ANAL(u)) return { region: "anal", soft: true };
    }
  }
  return null;
}

// ---- 色 ----

// 粗さごとのパレット(名前 → 色)。体は 背(黒に近い灰)→ わき(銀灰)→ 腹(明るい銀)の段。光は左上から。輪郭は濃紺〜黒。
const PALETTES = {
  32: {
    outline: "#0c1018",
    tones: ["#1d232c", "#313a46", "#4d5867", "#6f7b8a", "#a3adb8", "#d3d9df"],
    fin0: "#1b2028",
    fin1: "#2b323d",
    pec: "#5a6573",
    pupil: "#05080c",
    iris: "#8f979d",
    eyeHi: "#ffffff",
    lip: "#8a939d",
  },
  64: {
    outline: "#0c1018",
    tones: ["#1a2029", "#252d38", "#323b47", "#404a58", "#4f5a69", "#606c7c", "#73808f", "#8f9aa7", "#b0b9c3", "#d2d9df"],
    fin0: "#141920",
    fin1: "#202731",
    fin2: "#2e3641",
    ray: "#3a4350",
    pec0: "#566170",
    pec1: "#6e7a88",
    lateral: "#9aa6b3",
    pupil: "#05080c",
    iris: "#9aa19f",
    irisGold: "#b1a886",
    eyeHi: "#ffffff",
  },
  128: {
    outline: "#0c1018",
    tones: ["#171c24", "#1e252e", "#262e38", "#2f3843", "#39434f", "#444f5c", "#505b69", "#5d6977", "#6c7886", "#7e8a97", "#94a0ac", "#adb7c1", "#c7cfd6", "#e0e5e9"],
    sheen: "#a9b6c4",
    sheen2: "#c5d0da",
    fin0: "#12171e",
    fin1: "#1b2129",
    fin2: "#252c35",
    fin3: "#313944",
    ray: "#323a45",
    spine: "#2d3540",
    spineHi: "#7d8894",
    pec0: "#4f5a68",
    pec1: "#65717f",
    pec2: "#7e8a97",
    pecEdge: "#3a4350",
    lateral: "#a3afbb",
    gill: "#10151c",
    gillLight: "#7c8794",
    lip: "#9099a3",
    lipDark: "#4b5560",
    mouth: "#0e1218",
    nostril: "#10151c",
    eyeRing: "#3c4550",
    iris: "#a2a8a5",
    iris2: "#6e7673",
    irisGold: "#b8ad8b",
    pupil: "#04070a",
    eyeHi: "#ffffff",
    eyeHi2: "#c7d1da",
  },
};

/** 4×4 の網の目(ディザ)のしきい値。 */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((n) => (n + 0.5) / 16));

/** 1 つの粗さの絵を作る。名前(または体の段 "t3" など)の 2 次元の並びを返す。 */
function render(N) {
  const res = N;
  const P = PALETTES[res];
  const L = N * 0.94; // 魚の長さ(マス)
  const x0 = (N - L) / 2;
  const yc = N * 0.535;
  /** @type {any[][]} */
  const info = Array.from({ length: N }, () => new Array(N).fill(null));
  // 1 マスの中を 3×3 に分けて多数決(輪郭のがたつきを減らす)。棘は細いので、少ない票でも残す。
  const S = 3;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const votes = new Map();
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const u = (x + (sx + 0.5) / S - x0) / L;
          const v = (y + (sy + 0.5) / S - yc) / L;
          const r = regionAt(u, v, res);
          const k = r ? r.region : "none";
          votes.set(k, (votes.get(k) ?? 0) + 1);
        }
      }
      let best = "none";
      let bestN = 0;
      for (const [k, n] of votes) if (n > bestN || (n === bestN && k !== "none")) [best, bestN] = [k, n];
      if ((votes.get("spine") ?? 0) >= 2) best = "spine";
      if (best === "none") continue;
      const u = (x + 0.5 - x0) / L;
      const v = (y + 0.5 - yc) / L;
      const r = regionAt(u, v, res);
      info[y][x] = { ...(r ?? {}), region: best, u, v };
    }
  }
  const at = (x, y) => (x < 0 || y < 0 || x >= N || y >= N ? null : info[y][x]);
  // 体の輪郭からの距離(体の外 = 0。8 方向の近似)。
  const dist = Array.from({ length: N }, (_, y) => Array.from({ length: N }, (_, x) => (info[y][x]?.region === "body" ? 99 : 0)));
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!dist[y][x]) continue;
        const near = [
          [-1, 0, 1],
          [1, 0, 1],
          [0, -1, 1],
          [0, 1, 1],
          [-1, -1, 1.4],
          [1, -1, 1.4],
          [-1, 1, 1.4],
          [1, 1, 1.4],
        ];
        for (const [dx, dy, w] of near) {
          const xx = x + dx;
          const yy = y + dy;
          const d = xx < 0 || yy < 0 || xx >= N || yy >= N ? 0 : dist[yy][xx];
          dist[y][x] = Math.min(dist[y][x], d + w);
        }
      }
    }
    for (let y = N - 1; y >= 0; y--) {
      for (let x = N - 1; x >= 0; x--) {
        if (!dist[y][x]) continue;
        for (const [dx, dy, w] of [
          [-1, 0, 1],
          [1, 0, 1],
          [0, -1, 1],
          [0, 1, 1],
          [-1, -1, 1.4],
          [1, -1, 1.4],
          [-1, 1, 1.4],
          [1, 1, 1.4],
        ]) {
          const xx = x + dx;
          const yy = y + dy;
          const d = xx < 0 || yy < 0 || xx >= N || yy >= N ? 0 : dist[yy][xx];
          dist[y][x] = Math.min(dist[y][x], d + w);
        }
      }
    }
  }
  const px = (u) => x0 + u * L;
  const py = (v) => yc + v * L;
  const tones = P.tones.length;
  /** @type {(string | null)[][]} */
  const grid = Array.from({ length: N }, () => new Array(N).fill(null));
  const opercU = (v) => 0.235 + (OPERCLE(v) - 0.215);

  // ---- 体の明るさ ----
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = info[y][x];
      if (!c || (c.region !== "body" && c.region !== "pectoral")) continue;
      const { u, v } = c;
      const top = TOP(u);
      const bot = BOT(u);
      const t = Math.max(0, Math.min(1, (v - top) / (bot - top)));
      const half = Math.max(1, ((bot - top) * L) / 2);
      const round = c.region === "pectoral" ? 1 : Math.min(1, dist[y][x] / Math.min(half, res / 10)); // 0 = 縁、1 = 内側
      // 背は暗く、腹は明るい(腹の明るさは下 3 割で急に上がる)。
      let Lv = 0.1 + 0.55 * Math.pow(t, 1.15) + 0.32 * Math.max(0, (t - 0.62) / 0.38) ** 1.5;
      // 左上からの光:体の上半分の内側が少し明るい(丸み)。縁は暗く沈む。
      Lv += 0.1 * round * (1 - Math.abs(t - 0.38) * 1.6);
      Lv -= 0.1 * (1 - round) * (t < 0.7 ? 1 : 0.4);
      // 尾の付け根へ向けて少し暗く。頭の先(額)は少し暗い。
      Lv -= 0.18 * Math.max(0, u - 0.52);
      if (u < opercU(v)) Lv -= 0.04;
      if (res >= 128) Lv += 0.05;
      Lv = Math.max(0, Math.min(0.999, Lv));
      let k = Lv * tones;
      // 128 は段の境目を網の目でなじませる(64・32 は段のまま)。
      if (res >= 128) {
        const f = k - Math.floor(k);
        if (f > 0.75 && BAYER[y % 4][x % 4] < (f - 0.75) * 2) k = Math.floor(k) + 1;
      }
      grid[y][x] = `t${Math.min(tones - 1, Math.floor(k))}`;
    }
  }
  // 1 マスだけ浮いた段は、まわりに合わせる(ちらつき防止)。
  for (let y = 1; y < N - 1; y++) {
    for (let x = 1; x < N - 1; x++) {
      const g = grid[y][x];
      if (!g?.startsWith("t")) continue;
      const n = [grid[y][x - 1], grid[y][x + 1], grid[y - 1][x], grid[y + 1][x]];
      if (n.every((q) => q === n[0] && q?.startsWith("t")) && n[0] !== g && res < 128) grid[y][x] = n[0];
    }
  }
  const tone = (g) => (g?.startsWith("t") ? Number(g.slice(1)) : null);
  const shift = (g, d) => {
    const k = tone(g);
    return k === null ? g : `t${Math.max(0, Math.min(tones - 1, k + d))}`;
  };

  // ---- ひれ・尾 ----
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const c = info[y][x];
      if (!c || c.region === "body" || (c.region === "pectoral" && res >= 64)) continue;
      const { u, v } = c;
      let name;
      switch (c.region) {
        case "tail": {
          const far = Math.max(0, (u - 0.75) / 0.24);
          if (res === 32) name = far < 0.5 ? "fin0" : "fin1";
          else if (far < 0.35) name = "fin0";
          else if (far < 0.75) name = "fin1";
          else name = "fin2";
          break;
        }
        case "dorsal":
        case "anal": {
          const base = c.region === "dorsal" ? TOP(u) - v : v - BOT(u);
          const softRay = false;
          if (res === 32) name = "fin1";
          else if (softRay) name = "ray";
          else if (base < 0.025) name = "fin0";
          else if (base < 0.06 || res === 64) name = "fin1";
          else name = "fin2";
          if (res >= 128 && base > 0.085) name = "fin3";
          break;
        }
        case "spine":
          name = res >= 128 ? "spine" : "ray";
          break;
        case "pelvic":
          name = res >= 128 && u - 0.262 < 0.02 ? "spine" : "fin1";
          break;
        case "pectoral":
          name = "pec"; // あとで、下の体の明るさから決める(半透明のひれ)
          break;
        default:
          name = "fin0";
      }
      grid[y][x] = name;
    }
  }
  // 胸びれ(64・128):下の体の明るさを少し明るくした半透明のひれ。体との境は暗い縁、筋は 1 段暗い。
  if (res >= 64) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (info[y][x]?.region !== "pectoral") continue;
        const { u, v } = info[y][x];
        const nb = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
        const far = (u - 0.262) / 0.216;
        const ray = far > 0.1 && Math.abs(Math.sin((v - 0.017 - far * 0.05) * (res >= 128 ? 210 : 120))) < (res >= 128 ? 0.22 : 0.18);
        if (nb.some((q) => q?.region === "body")) grid[y][x] = shift(grid[y][x], -3);
        else if (ray) grid[y][x] = shift(grid[y][x], 0);
        else grid[y][x] = shift(grid[y][x], far < 0.5 ? 3 : 2);
      }
    }
  }
  // 尾びれの筋(64・128):付け根から縁へ、扇のように広がる線(真ん中は引かない)。
  if (res >= 64) {
    const n = res >= 128 ? 5 : 3;
    for (const side of [-1, 1]) {
      for (let k = 1; k <= n; k++) {
        const vt = side * (0.235 * k) / (n + 0.4);
        const u0 = 0.77;
        const v0 = side * 0.012 * k;
        const u1 = 0.985 - (1 - k / n) * 0.07;
        const steps = Math.ceil((u1 - u0) * L * 2);
        for (let i = 0; i <= steps; i++) {
          const f = i / steps;
          const xx = Math.round(px(u0 + (u1 - u0) * f));
          const yy = Math.round(py(v0 + (vt - v0) * f));
          if (info[yy]?.[xx]?.region === "tail" && f > 0.1) grid[yy][xx] = "ray";
        }
      }
    }
  }

  // 背びれ・しりびれの軟条の筋(128):後ろに傾いた細い線を、3 マスおきに。
  if (res >= 128) {
    for (const [u0, u1, fin] of [
      [0.535, 0.7, "dorsal"],
      [0.585, 0.672, "anal"],
    ]) {
      for (let u = u0; u <= u1; u += 3 / L) {
        for (let h = 0; h < 0.08; h += 0.4 / L) {
          const uu = u + h * 0.35;
          const vv = fin === "dorsal" ? TOP(u) - h : BOT(u) + h;
          const xx = Math.round(px(uu));
          const yy = Math.round(py(vv));
          const c = info[yy]?.[xx];
          if (c?.region === fin && c.soft) grid[yy][xx] = "fin3";
        }
      }
    }
  }

  const set = (x, y, name, onlyBody = true) => {
    x = Math.round(x);
    y = Math.round(y);
    const c = at(x, y);
    if (!c) return;
    if (onlyBody && c.region !== "body") return;
    grid[y][x] = name;
  };
  const bodyAt = (x, y) => at(x, y)?.region === "body";

  // ---- ウロコ(64・128):体のわきに、体の丸みに沿った斜めの格子(ひし形)を 1 段暗く ----
  if (res >= 64) {
    const sp = res >= 128 ? 5 : 4;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!bodyAt(x, y) || dist[y][x] < 1.9) continue;
        const { u, v } = info[y][x];
        if (u < opercU(v) + 0.02 || u > 0.74) continue;
        const t = (v - TOP(u)) / (BOT(u) - TOP(u));
        if (t < 0.12 || t > 0.86) continue;
        const b = Math.round(t * (BOT(u) - TOP(u)) * L); // 体の上の縁からの高さ(マス)
        const a = x;
        const onA = (((a + b) % sp) + sp) % sp === 0;
        const onB = (((a - b) % sp) + sp) % sp === 0;
        if (res >= 128) {
          if (onA && onB) grid[y][x] = shift(grid[y][x], -2);
          else if (onA || onB) grid[y][x] = shift(grid[y][x], -1);
          // ウロコの中ほどに、明るい点(光を受けた面)。腹側は付けない。
          else if (((a + b) % sp + sp) % sp === 2 && ((a - b) % sp + sp) % sp === 2 && t < 0.62) grid[y][x] = shift(grid[y][x], 1);
        } else {
          // 64:3 マスおきの列に、4 マスおきの点(列ごとに 2 マスずらす)。ウロコの並びに見えるように。
          const row = Math.floor(b / 3);
          if (b % 3 === 0 && (((x + (row % 2) * 2) % 4) + 4) % 4 === 0 && t > 0.18 && t < 0.8) grid[y][x] = shift(grid[y][x], -1);
        }
      }
    }
  }

  // ---- 光沢(128):わきの上寄りに、前から後ろへ細く明るい帯 ----
  if (res >= 128) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (!bodyAt(x, y) || dist[y][x] < 3) continue;
        const { u, v } = info[y][x];
        if (u < 0.3 || u > 0.64) continue;
        const t = (v - TOP(u)) / (BOT(u) - TOP(u));
        const center = 0.4 - (u - 0.3) * 0.1;
        const w = 0.035 * Math.max(0, 1 - Math.abs(u - 0.45) / 0.19);
        if (Math.abs(t - center) < w) grid[y][x] = shift(grid[y][x], Math.abs(t - center) < w * 0.4 && u > 0.38 && u < 0.54 ? 2 : 1);
      }
    }
  }

  // ---- 側線:えらぶたの上の端から、背の線に沿って尾の付け根へ ----
  if (res >= 64) {
    let prev = null;
    for (let u = 0.25; u <= 0.75; u += 0.25 / L) {
      const t = 0.26 + (u - 0.25) * 0.3;
      const xx = Math.round(px(u));
      const yy = Math.round(py(TOP(u) + t * (BOT(u) - TOP(u))));
      if (prev && prev[0] === xx && prev[1] === yy) continue;
      prev = [xx, yy];
      if (res >= 128) {
        if (Math.floor((u - 0.25) * L) % 3 !== 2) set(xx, yy, shift(grid[yy]?.[xx], 2));
        set(xx, yy + 1, shift(grid[yy + 1]?.[xx], -1));
      } else set(xx, yy, shift(grid[yy]?.[xx], 2));
    }
  }

  // ---- えらぶた ----
  for (let v = -0.15; v <= 0.15; v += 0.2 / L) {
    const u = opercU(v);
    if (v < TOP(u) + 0.01 || v > BOT(u) - 0.01) continue;
    const xx = Math.round(px(u));
    const yy = Math.round(py(v));
    if (res === 32) set(xx, yy, "t0");
    else if (res === 64) set(xx, yy, "outline");
    else {
      set(xx, yy, "gill");
      set(xx + 1, yy, "gillLight");
    }
  }
  if (res >= 128) {
    for (let v = -0.1; v <= 0.11; v += 0.2 / L) {
      const u = 0.235 + (PREOPERCLE(v) - 0.215) - 0.04;
      if (v < TOP(u) + 0.02 || v > BOT(u) - 0.02) continue;
      set(px(u), py(v), shift(grid[Math.round(py(v))]?.[Math.round(px(u))], -2));
    }
  }

  // ---- 口:小さく、厚い唇 ----
  for (let u = 0.0; u <= 0.048; u += 0.3 / L) {
    const v = 0.026 + u * 0.2;
    const xx = Math.round(px(u));
    const yy = Math.round(py(v));
    if (res === 32) {
      if (u > 0.01) set(xx, yy, "outline");
    } else if (res === 64) {
      set(xx, yy, "outline");
      if (u < 0.035) set(xx, yy - 1, "t7");
    } else {
      set(xx, yy, "mouth");
      if (u < 0.04) {
        set(xx, yy - 1, "lip");
        set(xx, yy + 1, "lipDark");
      }
    }
  }
  if (res === 32) set(px(0.012), py(0.02), "lip");

  // ---- 鼻の穴(128) ----
  if (res >= 128) {
    set(px(0.066), py(-0.094), "nostril");
    set(px(0.082), py(-0.098), "nostril");
  }

  // ---- 目:大きめ。黒い瞳、灰色の虹彩(上が少し金色)、左上のハイライト ----
  {
    const ex = px(EYE.u);
    const ey = py(EYE.v);
    if (res === 32) {
      // 32:黒い 2×2 の瞳、上と後ろに 1 マスの虹彩、左上に 1 マスの光。
      const cx = Math.round(px(EYE.u + 0.012));
      const cy = Math.round(py(EYE.v + 0.008));
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [-1, 0],
        [0, 0],
      ]) set(cx + dx, cy + dy, "pupil");
      for (const [dx, dy] of [
        [-1, -2],
        [0, -2],
        [1, -1],
        [1, 0],
      ]) set(cx + dx, cy + dy, "iris");
      set(cx - 1, cy - 1, "eyeHi");
    } else {
      const er = EYE.r * L;
      for (let y = Math.floor(ey - er - 2); y <= Math.ceil(ey + er + 2); y++) {
        for (let x = Math.floor(ex - er - 2); x <= Math.ceil(ex + er + 2); x++) {
          const dx = x + 0.5 - ex;
          const dy = y + 0.5 - ey;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (res === 64) {
            if (d < er * 0.55) set(x, y, "pupil");
            else if (d < er * 1.0) set(x, y, dy < -0.3 ? "irisGold" : "iris");
            else if (d < er + 0.8) set(x, y, "outline");
          } else {
            if (d < er * 0.5) set(x, y, "pupil");
            else if (d < er * 0.78) set(x, y, dy > 0.5 ? "iris2" : "iris");
            else if (d < er * 1.0) set(x, y, dy < 0 ? "irisGold" : "iris2");
            else if (d < er + 1.1) set(x, y, "eyeRing");
          }
        }
      }
      if (res === 64) set(ex - er * 0.3, ey - er * 0.3, "eyeHi");
      else {
        const hx = Math.round(ex - er * 0.28);
        const hy = Math.round(ey - er * 0.3);
        set(hx, hy, "eyeHi");
        set(hx - 1, hy, "eyeHi");
        set(hx, hy - 1, "eyeHi");
        set(Math.round(ex + er * 0.3), Math.round(ey + er * 0.25), "eyeHi2");
      }
    }
  }

  // ---- 輪郭:外に面したマスを暗い色に(棘の先は 128 だけ明るく) ----
  const out = grid.map((r) => [...r]);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!grid[y][x]) continue;
      const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
      if (!edge) continue;
      if (info[y][x].region === "spine") out[y][x] = res >= 128 && !at(x, y - 1) && info[y][x].v < TOP(info[y][x].u) ? "spineHi" : res >= 128 ? "spine" : "ray";
      else out[y][x] = "outline";
    }
  }
  // 名前 → 色。
  return out.map((r) => r.map((g) => (g ? (g.startsWith("t") ? P.tones[Number(g.slice(1))] : P[g]) : null)));
}

/** 色の並び → パレットと文字の行。 */
function encode(grid, id, name) {
  const used = [];
  for (const r of grid) for (const c of r) if (c && !used.includes(c)) used.push(c);
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  };
  used.sort((a, b) => lum(a) - lum(b));
  const palette = ["", ...used];
  const rows = grid.map((r) => r.map((c) => (c ? CHARS[used.indexOf(c) + 1] : "0")).join(""));
  return { id, name, width: grid[0].length, height: grid.length, palette, rows };
}

const arts = [32, 64, 128].map((n) => encode(render(n), `kurodai-${n}`, `クロダイ ${n}×${n}`));
const lines = [
  "// @ts-check",
  "// クロダイのドット絵(32・64・128 マス:D-361・D-364)。scripts/art/kurodai.mjs が書き出す(手で直さない)。",
  "// 色番号 0 は透明。1 行 = 1 つの文字列、1 マス = 1 文字(src/art/pixel.js の PIXEL_CHARS)。",
  "",
  "/** @type {readonly import(\"../pixel.js\").PixelArt[]} */",
  "export const KURODAI = Object.freeze([",
  ...arts.map(
    (a) =>
      `  Object.freeze({\n    id: ${JSON.stringify(a.id)},\n    name: ${JSON.stringify(a.name)},\n    width: ${a.width},\n    height: ${a.height},\n    palette: Object.freeze(${JSON.stringify(a.palette)}),\n    rows: Object.freeze([\n${a.rows.map((r) => `      ${JSON.stringify(r)},`).join("\n")}\n    ]),\n  }),`,
  ),
  "]);",
  "",
];
writeFileSync(OUT, lines.join("\n"));
console.log(arts.map((a) => `${a.id}:${a.palette.length - 1} 色`).join("、"));
