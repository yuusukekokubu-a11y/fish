// 降臨(レイド:D-396)の大きな相手 4 体(えび・かに・たこ・いか)のドット絵を作る。
// - 64 × 64 マス(冠と光を含む)、色は 24 色まで。形の座標は 48 を 1 辺とする目盛りで書き、64 マスへ広げて塗る。横向きで、頭が左。
// - 形は「点が体のどの部分か」を返す関数で決め、1 マスを 3 × 3 に分けて多数決で塗る(魚と同じやり方)。
// - 外に面したマスと、手前の部分に接するマスを輪郭の色にする。
// - 頭の上に紫の冠、まわりに紫の光(1 マスの縁と、外側のまばらなもや)と光の点を足す。
// 書き出し先:src/art/kourin.js(ゲームで使う)。引数にフォルダを渡すと、4 体を並べた見本の画像 sheet.png もそこに書く。
// 使い方:node scripts/art/kourin_chars.mjs [見本の画像のフォルダ]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, crc32 } from "node:zlib";
import { artLines, encode, inPoly, pchip } from "./fish_common.mjs";
import { checkArt } from "../../src/art/pixel.js";

const S = 64;
/** 形の目盛り(1 辺 48)から、マスへの倍率。 */
const K = S / 48;
const SHEET_DIR = process.argv[2] ?? null;
const OUT_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../src/art/kourin.js");

/** 降臨の冠と光の色(src/ui/fish_art.js の CROWN_KOURIN・KOURIN_GLOW と同じ)。 */
const DECO = { gold: "#b46cf0", goldDark: "#6c3aa4", jewel: "#f2c43c", jewel2: "#7fe6ff", sparkle: "#f0dcff", glow: "#9b5cff", glow2: "#7a44d8", haze: "#5b2fa8" };

// ---- 形の道具 ----

/** なめらかな線(点を通る曲線)を細かい点の並びにする。 */
function smooth(pts, steps = 24) {
  const p = [pts[0], ...pts, pts[pts.length - 1]];
  const out = [];
  for (let i = 1; i < p.length - 2; i++) {
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      out.push([f(p[i - 1][0], p[i][0], p[i + 1][0], p[i + 2][0]), f(p[i - 1][1], p[i][1], p[i + 1][1], p[i + 2][1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/**
 * 管(太さの変わる曲線の帯)。点 (u, v) が中なら { t:線の上の位置 0〜1, s:中心線からの横のずれ -1〜1(進む向きの左が −)}。
 * at(t) で中心の点・法線・太さを返す。
 */
function tube(pts, radius) {
  const sm = smooth(pts);
  const len = [0];
  for (let i = 1; i < sm.length; i++) len.push(len[i - 1] + Math.hypot(sm[i][0] - sm[i - 1][0], sm[i][1] - sm[i - 1][1]));
  const total = len[len.length - 1];
  const rad = typeof radius === "number" ? () => radius : pchip(radius);
  const tangent = (i) => {
    const a = sm[Math.max(0, i - 1)];
    const b = sm[Math.min(sm.length - 1, i + 1)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  const hit = (u, v) => {
    let best = Infinity;
    let bi = 0;
    for (let i = 0; i < sm.length; i++) {
      const d = (u - sm[i][0]) ** 2 + (v - sm[i][1]) ** 2;
      if (d < best) {
        best = d;
        bi = i;
      }
    }
    const t = len[bi] / total;
    const r = rad(t);
    const d = Math.sqrt(best);
    if (d > r) return null;
    const [tx, ty] = tangent(bi);
    const cross = tx * (v - sm[bi][1]) - ty * (u - sm[bi][0]);
    return { t, s: Math.sign(cross) * (d / r) };
  };
  hit.at = (t) => {
    let i = 0;
    while (i < sm.length - 1 && len[i] / total < t) i++;
    const [tx, ty] = tangent(i);
    return { x: sm[i][0], y: sm[i][1], nx: -ty, ny: tx, r: rad(t) };
  };
  return hit;
}

/** だ円。中なら { nx, ny }(中心からのずれを半径で割ったもの。回転 rot〔度〕をもどした向き)。 */
function ellipse(cx, cy, rx, ry, rot = 0) {
  const a = (rot * Math.PI) / 180;
  return (u, v) => {
    const dx = u - cx;
    const dy = v - cy;
    const x = (dx * Math.cos(a) + dy * Math.sin(a)) / rx;
    const y = (-dx * Math.sin(a) + dy * Math.cos(a)) / ry;
    return x * x + y * y <= 1 ? { nx: x, ny: y } : null;
  };
}

/** 光の当たり(左上から)。だ円の nx, ny から、-1(暗い)〜 1(明るい)。 */
const lit = (nx, ny) => -(nx * 0.45 + ny * 0.9);

/**
 * 形 → 色の並び。
 * def.shape(u, v):{ id〔部分の名前〕, z〔手前ほど大きい〕, ... } か null。
 * def.paint(info, x, y):色の名前。def.noOutline(info):輪郭を付けない部分なら true。def.post(out, tools):目や足などを上から描く。
 */
function build(def) {
  const part = Array.from({ length: S }, () => new Array(S).fill(null));
  const subs = [
    [1, 1],
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const count = {};
      const first = {};
      let total = 0;
      for (const [sx, sy] of subs) {
        const h = def.shape((x + (sx + 0.5) / 3) / K, (y + (sy + 0.5) / 3) / K);
        if (!h) continue;
        total++;
        count[h.id] = (count[h.id] ?? 0) + 1;
        first[h.id] ??= h;
      }
      if (total < 5) continue;
      const id = Object.keys(count).sort((a, b) => count[b] - count[a] || first[b].z - first[a].z)[0];
      part[y][x] = first[id];
    }
  }
  const at = (x, y) => (x >= 0 && x < S && y >= 0 && y < S ? part[y][x] : null);
  const out = part.map((row, y) => row.map((p, x) => (p ? def.paint(p, x, y) : null)));
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const p = part[y][x];
      if (!p || def.noOutline?.(p)) continue;
      const ns = [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)];
      if (ns.some((n) => !n)) out[y][x] = "outline";
      else if (ns.some((n) => n.id !== p.id && n.z > p.z && !(def.joined?.(p, n) ?? false))) out[y][x] = "outline";
    }
  }
  /** マスに直接塗る(マスの番号)。 */
  const cell = (x, y, c) => {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && x < S && y >= 0 && y < S) out[y][x] = c;
  };
  /** 形の目盛りの点に塗る。 */
  const set = (u, v, c) => cell(u * K, v * K, c);
  /** 線(形の目盛りの点を通る)。w は太さのマス数(1 か 2。2 は太さを根元から先へ細らせる区間 thick まで)。 */
  const stroke = (pts, c, { from = 0, to = 1, thick = 0 } = {}) => {
    const sm = smooth(pts, 60);
    const a = Math.floor(from * (sm.length - 1));
    const b = Math.ceil(to * (sm.length - 1));
    for (let i = a; i <= b; i++) {
      cell(sm[i][0] * K, sm[i][1] * K, c);
      if (i < thick * (sm.length - 1)) cell(sm[i][0] * K + 1, sm[i][1] * K, c);
    }
  };
  /** 丸い目(中心は形の目盛り、半径はマス)。輪 ring・中 fill・瞳 pupil・光 hi。 */
  const eye = (u, v, r, { ring, fill, pupil, hi, pupilR = r * 0.55 }) => {
    const cx = u * K;
    const cy = v * K;
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++)
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) cell(x, y, d > r - 1 ? ring : Math.hypot(x + 0.5 - cx - 0.4, y + 0.5 - cy - 0.2) <= pupilR ? pupil : fill);
      }
    cell(cx - r * 0.35, cy - r * 0.4, hi);
    if (r >= 2.5) cell(cx - r * 0.35 + 1, cy - r * 0.4, hi);
  };
  def.post?.(out, { set, cell, stroke, eye, part, at });
  // 冠を載せる高さは、形のマスだけで決める(ひげなどの細い線は数えない)。
  return Object.assign(out, { part });
}

/**
 * 冠と光を足す。crownX:冠の真ん中の列。冠は、その列のまわりでいちばん上のマスに 1 行めり込ませて載せる。
 * sparkles:光の点(十字)の中心の並び。
 */
function decorate(grid, colors, crownU, sparkleUV) {
  const crownX = Math.round(crownU * K);
  const sparkles = sparkleUV.map(([u, v]) => [Math.round(u * K), Math.round(v * K)]);
  const g = grid.map((r) => r.map((c) => (c ? colors[c] : null)));
  let topY = S;
  for (let x = crownX - 3; x <= crownX + 3; x++) for (let y = 0; y < S; y++) if (grid.part[y][x]) {
    topY = Math.min(topY, y);
    break;
  }
  const crown = ["s.....s.....s", "g.....g.....g", "gg...gjg...gg", "ggg.ggggg.ggg", "gsggggggggggg", "GGjGGGkGGGjGG", "GGGGGGGGGGGGG"];
  const half = (crown[0].length - 1) / 2;
  const cy0 = topY + 1 - crown.length;
  crown.forEach((row, ry) =>
    [...row].forEach((ch, rx) => {
      const x = crownX - half + rx;
      const y = cy0 + ry;
      const c = { g: DECO.gold, G: DECO.goldDark, j: DECO.jewel, k: DECO.jewel2, s: DECO.sparkle }[ch];
      if (c) g[y][x] = c;
    }),
  );
  // 冠のふち:冠に接する空のマスを、体の輪郭の色にする(紫の光に冠が溶けないように)。
  const crownCells = new Set([DECO.gold, DECO.goldDark, DECO.jewel, DECO.jewel2, DECO.sparkle]);
  const isCrown = (x, y) => y >= cy0 && y < cy0 + crown.length && x >= crownX - half && x <= crownX + half && crownCells.has(g[y]?.[x]);
  for (let y = cy0 - 1; y <= cy0 + crown.length; y++)
    for (let x = crownX - half - 1; x <= crownX + half + 1; x++)
      if (!g[y][x] && (isCrown(x - 1, y) || isCrown(x + 1, y) || isCrown(x, y - 1) || isCrown(x, y + 1))) g[y][x] = colors.outline;
  // 体と冠からの距離(上下左右に何マス)。1 は縁の光、2〜4 はだんだんまばらになるもや。
  const dist = Array.from({ length: S }, () => new Array(S).fill(Infinity));
  let q = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (g[y][x]) {
    dist[y][x] = 0;
    q.push([x, y]);
  }
  for (let d = 1; d <= 4; d++) {
    const next = [];
    for (const [x, y] of q) {
      for (const [ax, ay] of [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ]) {
        if (ax < 0 || ay < 0 || ax >= S || ay >= S || dist[ay][ax] !== Infinity) continue;
        dist[ay][ax] = d;
        next.push([ax, ay]);
      }
    }
    q = next;
  }
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = dist[y][x];
      if (d === 1) g[y][x] = DECO.glow;
      else if (d === 2) g[y][x] = (x + y) % 2 === 0 ? DECO.glow2 : DECO.haze;
      else if (d === 3 && (x + y) % 2 === 0) g[y][x] = DECO.haze;
      else if (d === 4 && x % 2 === 0 && y % 2 === 0 && (x + y) % 4 === 0) g[y][x] = DECO.haze;
    }
  }
  for (const [sx, sy] of sparkles) {
    for (const [ex, ey] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ]) {
      const x = sx + ex;
      const y = sy + ey;
      if (dist[y][x] >= 2) g[y][x] = DECO.sparkle;
    }
  }
  return { grid: g, dist };
}

// ---- 1. えび:曲がった節の体、長いひげ、扇の尾、細い足。赤みのだいだい。 ----
function ebi() {
  const colors = {
    outline: "#3a0f12",
    dark: "#a8321e",
    mid: "#de5530",
    light: "#f58a4a",
    pale: "#ffc890",
    hi: "#fff0d8",
    seg: "#8a2616",
    fin: "#ec7040",
    finDark: "#b23a22",
    leg: "#c2401f",
    eye: "#14161c",
    eyeHi: "#ffffff",
  };
  const body = tube(
    [
      [9, 26],
      [16, 23.5],
      [23, 23],
      [29, 24.5],
      [34, 27.5],
      [36.5, 32],
      [35.5, 36],
      [32.5, 38],
    ],
    [
      [0, 5],
      [0.08, 7.2],
      [0.3, 7.5],
      [0.45, 6.3],
      [0.7, 5],
      [0.9, 3.8],
      [1, 3],
    ],
  );
  const rostrum = [
    [9, 22.5],
    [3, 20.5],
    [3.5, 21.8],
    [9.5, 25],
  ];
  const fan = [
    [33, 35],
    [23.5, 40],
    [24, 44.6],
    [33, 44.8],
    [41.5, 43.6],
    [38.5, 36.5],
  ];
  const segOf = (t) => (t < 0.4 ? 0 : 1 + Math.min(5, Math.floor((t - 0.4) / 0.1)));
  const shape = (u, v) => {
    const b = body(u, v);
    if (b) return { id: "body", z: 2, ...b, seg: segOf(b.t) };
    if (inPoly(u, v, rostrum)) return { id: "rostrum", z: 1 };
    if (inPoly(u, v, fan)) return { id: "fan", z: 1, u, v };
    return null;
  };
  const paint = (p, x, y) => {
    if (p.id === "rostrum") return "mid";
    if (p.id === "fan") {
      const a = Math.atan2(p.v - 36.5, p.u - 33);
      return Math.abs(Math.sin(a * 6)) < 0.25 ? "finDark" : "fin";
    }
    const s = p.s;
    const local = p.seg === 0 ? p.t / 0.4 : ((p.t - 0.4) % 0.1) / 0.1;
    if (s < -0.25 && s > -0.55 && local > 0.25 && local < 0.6) return "hi";
    if (p.seg === 0 && s > -0.4 && s < 0.5 && (x * 5 + y * 3) % 11 === 0) return "seg";
    if (s < -0.55) return "dark";
    if (s < 0.1) return "mid";
    if (s < 0.6) return "light";
    return "pale";
  };
  const post = (out, { set, cell, stroke, eye, part }) => {
    // 角(ひたいの先)の上のふちのぎざぎざ。
    for (let y = 1; y < S; y++)
      for (let x = 0; x < S; x++) if (part[y][x]?.id === "rostrum" && !part[y - 1][x] && x % 2 === 0) cell(x, y, "pale");
    // 節の線:となりのマスと節がちがうところ(腹側は描かない)。
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        const p = part[y][x];
        if (!p || p.id !== "body" || out[y][x] === "outline" || p.s > 0.65) continue;
        const r = part[y][x + 1];
        const d = part[y + 1]?.[x];
        if ((r && r.id === "body" && r.seg !== p.seg) || (d && d.id === "body" && d.seg !== p.seg)) out[y][x] = "seg";
      }
    // 歩く足(頭の下)と、泳ぐ足(腹の下)。
    for (const t of [0.12, 0.21, 0.3]) {
      const a = body.at(t);
      const bx = a.x + a.nx * a.r;
      const by = a.y + a.ny * a.r;
      stroke([[bx, by - 0.5], [bx - 1.5, by + 2.5], [bx - 3, by + 4.5]], "leg");
    }
    for (const t of [0.48, 0.58, 0.68, 0.78]) {
      const a = body.at(t);
      const bx = a.x + a.nx * (a.r + 0.2);
      const by = a.y + a.ny * (a.r + 0.2);
      stroke([[bx, by], [bx + a.nx * 2.2 - 1, by + a.ny * 2.2]], "leg");
    }
    // ひげ:1 本は上へ立ち上がって背の上へ、もう 1 本は前の下へ。
    stroke([[6, 22], [4, 15], [6.5, 8], [12, 4.5], [21, 3.5], [30, 4.5], [38, 8]], "finDark", { thick: 0.25 });
    stroke([[5.5, 24], [4, 29], [4.5, 35], [8, 40]], "finDark", { thick: 0.3 });
    stroke([[7, 23], [4, 19], [3.5, 15]], "leg");
    // 目(柄の先の黒い玉)。
    eye(10.5, 20.5, 2.8, { ring: "outline", fill: "eye", pupil: "eye", hi: "eyeHi" });
  };
  return { colors, grid: build({ shape, paint, post }), crownX: 19, sparkles: [[43, 15], [4, 44], [44, 30]] };
}

// ---- 2. かに:横に広い甲羅、上げた 2 本のはさみ、足。深い赤茶の固い殻。 ----
function kani() {
  const colors = {
    outline: "#2a0c0c",
    dark: "#6e1a14",
    mid: "#a82a1e",
    light: "#d4482e",
    hi: "#f07a52",
    shine: "#ffd2b8",
    under: "#e8b48a",
    underDark: "#b87a58",
    tip: "#3c1612",
    eye: "#14161c",
    eyeHi: "#ffffff",
  };
  const shell = ellipse(24, 30, 14.5, 8.5);
  const arms = [
    tube([[14, 31], [10, 27], [8.5, 22]], 2.4),
    tube([[34, 31], [38, 27], [39.5, 22.5]], 2.1),
  ];
  const claws = [ellipse(8.5, 15.5, 5, 6.2, -8), ellipse(39.5, 16.5, 4.3, 5.4, 8)];
  const notches = [
    [
      [8.8, 15],
      [6.4, 8.5],
      [11.5, 9.2],
    ],
    [
      [39.3, 16],
      [37.2, 10.5],
      [41.6, 10.6],
    ],
  ];
  const legL = [
    [[14, 34], [8, 34.5], [4.5, 39.5]],
    [[15, 36], [10, 38.5], [8, 43]],
    [[18, 37.5], [15, 40.5], [14.5, 44]],
  ];
  const legs = [...legL, ...legL.map((l) => l.map(([x, y]) => [48 - x, y]))].map((l) => tube(l, [[0, 1.7], [1, 1.1]]));
  const stalks = [
    [17.5, 19.5],
    [30.5, 19.5],
  ];
  const shape = (u, v) => {
    for (let i = 0; i < 2; i++) {
      const c = claws[i](u, v);
      if (c && !inPoly(u, v, notches[i])) return { id: `claw${i}`, z: 5, ...c, u, v };
    }
    for (let i = 0; i < 2; i++) {
      const a = arms[i](u, v);
      if (a) return { id: `arm${i}`, z: 4, ...a };
    }
    for (const [ex, ey] of stalks) {
      if (Math.hypot(u - ex, v - ey) < 1.9) return { id: "eye", z: 4, eye: true };
      if (Math.abs(u - ex) < 0.9 && v > ey && v < 23) return { id: "stalk", z: 3 };
    }
    const s = shell(u, v);
    if (s) return { id: "shell", z: 3, ...s, u, v };
    for (let i = 0; i < legs.length; i++) {
      const l = legs[i](u, v);
      if (l) return { id: `leg${i}`, z: 1, ...l };
    }
    return null;
  };
  const paint = (p, x, y) => {
    if (p.id === "eye") return "eye";
    if (p.id === "stalk") return "mid";
    if (p.id === "shell") {
      if (p.ny > 0.62) return (x + y) % 2 === 0 ? "under" : "underDark";
      const l = lit(p.nx, p.ny);
      // 甲羅のつぶつぶ(暗い点と、その左上の明るい点)。
      if (l < 0.7 && (x * 7 + y * 11) % 17 === 0) return "dark";
      if (l > -0.2 && ((x + 1) * 7 + (y + 1) * 11) % 17 === 0) return "hi";
      if (l > 0.7) return "hi";
      if (l > 0.25) return "light";
      if (l > -0.35) return "mid";
      return "dark";
    }
    if (p.id.startsWith("claw")) {
      if (p.v < (p.id === "claw0" ? 12 : 13)) return "tip";
      const l = lit(p.nx, p.ny);
      if (l > 0.55) return "hi";
      if (l > 0.1) return "light";
      if (l > -0.5) return "mid";
      return "dark";
    }
    if (p.id.startsWith("arm")) return p.s < 0 ? "light" : "mid";
    return p.s < -0.2 ? "mid" : "dark";
  };
  const post = (out, { set, cell, eye, part }) => {
    // はさみの内側の歯:切れこみに面したふちを、1 マスおきに白っぽくする。
    for (let y = 1; y < S - 1; y++)
      for (let x = 1; x < S - 1; x++) {
        const p = part[y][x];
        if (!p?.id.startsWith("claw")) continue;
        const i = Number(p.id.slice(4));
        const open = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].some(([nx, ny]) => !part[ny][nx] && inPoly((nx + 0.5) / K, (ny + 0.5) / K, notches[i]));
        if (open && (x + y) % 2 === 0) cell(x, y, "under");
      }
    // 目(柄の先の黒い玉)。
    for (const [ex, ey] of stalks) eye(ex, ey, 2.6, { ring: "outline", fill: "eye", pupil: "eye", hi: "eyeHi" });
    // 甲羅のつや。
    for (const [u, v] of [[17, 24], [18, 24], [6, 13], [6, 14], [37, 14]]) set(u, v, "shine");
    // 口のまわり(甲羅の前の下)。
    for (let x = Math.round(20 * K); x <= 28 * K; x += 2) cell(x, Math.round(36 * K), "outline");
  };
  return { colors, grid: build({ shape, paint, post }), crownX: 24, sparkles: [[44, 5], [3, 30], [43, 30]] };
}

// ---- 3. たこ:丸い頭、目、吸盤のある 8 本の巻いた足。赤紫がかった茶色。 ----
function tako() {
  const colors = {
    outline: "#2a0c22",
    dark: "#6e2444",
    mid: "#a8445e",
    light: "#d06a78",
    hi: "#f2a2a0",
    sucker: "#f6d4c4",
    suckerDark: "#c48a90",
    eyeWhite: "#fff4e0",
    pupil: "#1a0a14",
    eyeHi: "#ffffff",
    spot: "#843050",
  };
  const mantle = ellipse(27.5, 19.5, 10.5, 8.8, -22);
  const face = ellipse(19.5, 27, 7.2, 6.2);
  const siphon = tube([[14, 29], [11, 30.5]], 1.6);
  const rad = [
    [0, 2.9],
    [0.5, 2],
    [0.85, 1.3],
    [1, 0.9],
  ];
  // 足(手前 5 本・奥 3 本)。先は小さく巻く。
  const armPts = [
    { z: 2, pts: [[17, 31], [11, 33], [7, 35], [5, 38.5], [7, 41], [9.5, 40], [8.5, 38]] },
    { z: 2, pts: [[20, 32], [16, 36.5], [14, 40.5], [16.5, 43], [19.5, 42], [19, 39.5]] },
    { z: 2, pts: [[23.5, 32.5], [25, 37], [28, 40.5], [31.5, 42], [33.5, 39.5], [31, 38]] },
    { z: 2, pts: [[27, 31], [32, 33], [37, 36.5], [41, 37], [42, 33.5], [39.5, 32.5]] },
    { z: 2, pts: [[15.5, 29.5], [10, 29], [6.5, 27], [5.5, 23], [8, 21.5], [9.5, 24]] },
    { z: 1, pts: [[21.5, 31], [21, 36], [22, 40], [24, 42], [26, 40.5]] },
    { z: 1, pts: [[26, 29], [33, 29], [39, 28.5], [43, 26], [42, 22.5], [39.5, 23.5]] },
    { z: 1, pts: [[18.5, 31], [14, 34], [10.5, 38], [10.5, 41.5], [13, 42.5]] },
  ];
  const arms = armPts.map((a) => ({ z: a.z, f: tube(a.pts, rad) }));
  const shape = (u, v) => {
    const m = mantle(u, v);
    if (m) return { id: "head", z: 4, ...m, u, v };
    const f = face(u, v);
    if (f) return { id: "head", z: 4, nx: f.nx, ny: f.ny, face: true };
    if (siphon(u, v)) return { id: "siphon", z: 3 };
    for (const z of [2, 1])
      for (let i = 0; i < arms.length; i++) {
        if (arms[i].z !== z) continue;
        const h = arms[i].f(u, v);
        if (h) return { id: `arm${i}`, z, ...h, back: z === 1 };
      }
    return null;
  };
  const joined = (p, n) => p.id.startsWith("arm") && n.id === "head";
  const paint = (p, x, y) => {
    if (p.id === "siphon") return "mid";
    if (p.id === "head") {
      const l = lit(p.nx, p.ny);
      if (!p.face && (x * 7 + y * 13) % 11 === 0 && l < 0.6) return "spot";
      if (l > 0.65) return "hi";
      if (l > 0.2) return "light";
      if (l > -0.45) return "mid";
      return "dark";
    }
    // 足:片側に吸盤(2 マスおき)、反対側は暗い。
    if (p.s > 0.25 && p.t > 0.12 && Math.floor(p.t * 28) % 2 === 0) return p.back ? "suckerDark" : "sucker";
    if (p.back) return p.s < -0.3 ? "dark" : "mid";
    if (p.s < -0.4) return "mid";
    return "light";
  };
  const post = (out, { set, eye }) => {
    // 大きな目(白目、横長の黒目、光)。
    eye(17.5, 25.5, 3.6, { ring: "outline", fill: "eyeWhite", pupil: "pupil", hi: "eyeHi", pupilR: 1.6 });
    // 口のあたりの線。
    set(13, 27, "dark");
  };
  return { colors, grid: build({ shape, paint, post, joined }), crownX: 29, sparkles: [[44, 5], [3, 13], [44, 44]] };
}

// ---- 4. いか:長い胴とその先のひれ、目、8 本の腕と 2 本の長い触腕。白っぽい薄桃色に、墨の濃い色。 ----
function ika() {
  const colors = {
    outline: "#3a1830",
    ink: "#241028",
    body: "#f4dede",
    shade: "#dcaab6",
    shade2: "#b07890",
    hi: "#ffffff",
    dot: "#c0503c",
    dotDark: "#7a2a30",
    fin: "#ecc4cc",
    finEdge: "#a8708a",
    eyeRing: "#e0b050",
    eyeHi: "#ffffff",
  };
  const mantle = tube(
    [
      [18, 27],
      [26, 26],
      [34, 25],
      [42.5, 24.5],
    ],
    [
      [0, 5.6],
      [0.25, 6.4],
      [0.65, 5],
      [0.9, 2.6],
      [1, 0.8],
    ],
  );
  const finTop = [
    [31, 23],
    [38.5, 15.5],
    [44, 21.5],
    [43.5, 25],
  ];
  const finBot = [
    [31, 26.5],
    [38.5, 34],
    [44, 28],
    [43.5, 24.5],
  ];
  const head = ellipse(15, 28, 5.2, 4.6);
  const armR = [
    [0, 1.3],
    [0.7, 0.9],
    [1, 0.6],
  ];
  const armPts = [
    [[11.5, 25.5], [7.5, 22], [4, 19.5]],
    [[11, 27], [7, 25.5], [3.5, 24.5]],
    [[11, 28.5], [7, 29], [3.5, 29.5]],
    [[11, 30], [7, 32], [4, 34]],
    [[11.5, 31], [9, 35], [7.5, 38.5]],
  ];
  const arms = armPts.map((p) => tube(p, armR));
  // 触腕(長い 2 本):1 本は上へ、1 本は下へ回りこみ、先にふくらみ(こん棒の形)。
  const tentacles = [
    tube([[10.5, 26], [8, 18], [9, 12], [13, 9.5]], [[0, 1.2], [1, 0.8]]),
    tube([[11, 30.5], [12, 37], [15, 41.5], [21, 42.5]], [[0, 1.2], [1, 0.8]]),
  ];
  const clubs = [ellipse(15.5, 9.3, 2.6, 1.7, -10), ellipse(23.5, 42, 2.8, 1.7, 0)];
  const shape = (u, v) => {
    const h = head(u, v);
    if (h) return { id: "head", z: 4, ...h };
    const m = mantle(u, v);
    if (m) return { id: "mantle", z: 3, ...m };
    if (inPoly(u, v, finTop) || inPoly(u, v, finBot)) return { id: "fin", z: 2, u, v };
    for (let i = 0; i < arms.length; i++) {
      const a = arms[i](u, v);
      if (a) return { id: `arm${i}`, z: i % 2 ? 1 : 2, ...a };
    }
    for (let i = 0; i < 2; i++) {
      if (clubs[i](u, v)) return { id: `club${i}`, z: 2, club: true };
      const t = tentacles[i](u, v);
      if (t) return { id: `ten${i}`, z: 1, ...t };
    }
    return null;
  };
  const joined = (p, n) => (p.id === "mantle" && n.id === "head") || (p.id.startsWith("ten") && n.id.startsWith("club"));
  const paint = (p, x, y) => {
    if (p.id === "fin") {
      const edge = Math.abs(p.v - 24.8) > 6.5 || p.u > 42;
      if (edge) return "finEdge";
      // ひれのすじ。
      return Math.abs(Math.sin((p.u - p.v * 0.15) * 1.3)) < 0.18 ? "shade" : "fin";
    }
    if (p.id === "mantle") {
      if (p.s < -0.2 && (x * 3 + y * 5) % 7 === 0) return p.s < -0.6 ? "dotDark" : "dot";
      if (p.s > 0.2 && (x * 3 + y * 5) % 13 === 0) return "dot";
      if (p.s < -0.55) return "shade";
      if (p.s < -0.25 && p.t > 0.1 && p.t < 0.6) return "hi";
      if (p.s > 0.6) return "shade";
      return "body";
    }
    if (p.id === "head") {
      if ((x * 3 + y * 5) % 7 === 0) return "dot";
      return lit(p.nx, p.ny) > 0.3 ? "body" : "shade";
    }
    if (p.club) return (x + y) % 2 ? "shade2" : "dot";
    if (p.id.startsWith("ten")) return "shade";
    // 腕は輪郭なしで、1 本おきに色を変えて分ける。
    return Number(p.id.slice(3)) % 2 ? "shade2" : "dot";
  };
  const noOutline = (p) => p.id.startsWith("arm");
  const post = (out, { cell, eye }) => {
    // 大きな目(金色の輪、墨色の瞳、光)。
    eye(14.5, 26.5, 3.2, { ring: "eyeRing", fill: "ink", pupil: "ink", hi: "eyeHi" });
    // 墨の筋(胴の背に 1 本)。
    for (let x = Math.round(22 * K); x <= 35 * K; x++) if (x % 4 !== 0) cell(x, Math.round(21.5 * K), "dotDark");
  };
  return { colors, grid: build({ shape, paint, post, joined, noOutline }), crownX: 26, sparkles: [[44, 6], [3, 44], [44, 42]] };
}

// ---- 書き出し ----

const defs = [
  ["ebi", "kourin-ebi", "降臨・大エビ", ebi],
  ["kani", "kourin-kani", "降臨・大ガニ", kani],
  ["tako", "kourin-tako", "降臨・大ダコ", tako],
  ["ika", "kourin-ika", "降臨・大イカ", ika],
];
const arts = [];
for (const [key, id, name, make] of defs) {
  const c = make();
  for (const row of c.grid) for (const n of row) if (n && !(n in c.colors)) throw new Error(`${id}:色の表にない名前「${n}」`);
  // 体と冠が端から 4 マス以上はなれているか(光ともやが切れないように)。
  const { grid } = decorate(c.grid, c.colors, c.crownX, c.sparkles);
  let minX = S,
    maxX = 0,
    minY = S,
    maxY = 0;
  const body = c.grid.map((r) => r.map((n) => n !== null));
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++)
      if (body[y][x] || [DECO.gold, DECO.goldDark].includes(grid[y][x])) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
  const art = encode(grid, id, name);
  const problems = checkArt(art);
  const colors = art.palette.length - 1;
  if (colors > 24) problems.push(`${id}:色数 ${colors} が 24 をこえる`);
  if (minX < 3 || minY < 3 || maxX > S - 4 || maxY > S - 4) problems.push(`${id}:端に近い(x ${minX}〜${maxX}、y ${minY}〜${maxY})`);
  console.log(`${id}:${colors} 色、体と冠 x ${minX}〜${maxX} y ${minY}〜${maxY}${problems.length ? `、問題:${problems.join(" / ")}` : ""}`);
  arts.push([key, art]);
}

const lines = [
  "// @ts-check",
  "// 降臨(レイド:D-396)の大きな相手 4 体のドット絵(64 × 64 マス、紫の冠と光を含む。24 色まで)。",
  "// scripts/art/kourin_chars.mjs が書き出す(手で直さない)。色番号 0 は透明。1 行 = 1 つの文字列、1 マス = 1 文字。",
  "",
  '/** @type {Readonly<Record<string, import("./pixel.js").PixelArt>>} */',
  "export const KOURIN_CHARS = Object.freeze({",
  ...arts.map(([key, a]) => artLines(a).replace(/^ {2}"[^"]+":/, `  ${key}:`)),
  "});",
  "",
];
writeFileSync(OUT_FILE, lines.join("\n"));
console.log(`書き出し:${OUT_FILE}`);
if (SHEET_DIR) writeSheet(SHEET_DIR);

// ---- 見本の画像(夜の海の色の上に 4 体を横に並べる。1 マス = 5 画素)----
/** @param {string} dir */
function writeSheet(dir) {
  mkdirSync(dir, { recursive: true });
  const DOT = 5;
  const PAD = 24;
  const W = PAD + arts.length * (S * DOT + PAD);
  const H = S * DOT + PAD * 2;
  const px = Buffer.alloc(W * H * 3);
  const bg = [0x0e, 0x18, 0x38];
  for (let i = 0; i < W * H; i++) px.set(bg, i * 3);
  arts.forEach(([, a], k) => {
    const ox = PAD + k * (S * DOT + PAD);
    a.rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        const ci = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".indexOf(ch);
        if (ci <= 0) return;
        const n = parseInt(a.palette[ci].slice(1), 16);
        const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        for (let dy = 0; dy < DOT; dy++) for (let dx = 0; dx < DOT; dx++) px.set(rgb, ((PAD + y * DOT + dy) * W + ox + x * DOT + dx) * 3);
      }),
    );
  });
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  writeFileSync(
    join(dir, "sheet.png"),
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]),
  );
  console.log(`見本:${join(dir, "sheet.png")}`);
}
