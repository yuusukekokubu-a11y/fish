// 背景のドット絵を作る共通の道具(D-383・D-384)。幅 130 × 高さ 280 マス、水平線は上から 118 マス(ゲームの水面 0.42)。
// 釣り場ごとのスクリプト(scripts/art/bg_*.mjs)が、色の表と形の決まりを渡して使う。
// - 塗る:set・rect・bandFill(帯を点描でなじませる)・cloud(丸の集まりの雲)・flyingGull(飛ぶ鳥)
// - 乱数:決まった種の小さな乱数(何度書き出しても同じ絵になる)
// - 書き出し:使った色だけを明るさの順でパレットにし、src/art/bg/<id>.js に書く(手で直さない)
// - 夜:同じ絵の色を夜の色に置き換え、月と星を足して、src/art/bg/<id>_night.js にも書く(降臨の戦いだけで使う:D-392)

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const W = 130;
export const H = 280;
export const HORIZON = 118;
const CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 新しい絵(色の名前の並び)と、塗る道具。 */
export function makeScene() {
  const grid = Array.from({ length: H }, () => new Array(W).fill(null));
  const set = (x, y, c) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix >= 0 && ix < W && iy >= 0 && iy < H) grid[iy][ix] = c;
  };
  const rect = (x0, y0, x1, y1, c) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
  };
  const get = (x, y) => (x >= 0 && x < W && y >= 0 && y < H ? grid[y][x] : null);

  /**
   * 段(帯)で塗る。bands は [始まりの行, 色]。境目の手前 4 行は、次の色の割合を 1/4・1/2・1/2・3/4 と増やす
   * 決まった模様(順序つきの点描)でまぜる(荒めのドット絵らしく、段の線が硬く見えないように)。
   */
  function bandFill(y0, y1, bands) {
    // 2 × 2 の順序つきの点描の表(しきい値 0〜3)。
    const order = [
      [0, 2],
      [3, 1],
    ];
    for (let y = y0; y <= y1; y++) {
      let k = 0;
      while (k + 1 < bands.length && y >= bands[k + 1][0]) k++;
      const next = bands[k + 1];
      const step = next ? 4 - (next[0] - y) : -1; // 0〜3:次の帯に近いほど大きい
      for (let x = 0; x < W; x++) {
        const mix = step >= 0 && order[y % 2][x % 2] < [1, 2, 2, 3][step];
        set(x, y, mix ? next[1] : bands[k][1]);
      }
    }
  }

  /**
   * 雲:丸のかたまり(中心と半径の並び)。下の縁に影を 2 段。平らな底。colors は [明るい, 薄い影, 濃い影]。
   */
  function cloud(puffs, bottom, colors = ["cloud", "cloudShade", "cloudShade2"]) {
    const inside = (x, y) => y <= bottom && puffs.some(([cx, cy, r]) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
    const xs = puffs.map(([cx, , r]) => [cx - r, cx + r]).flat();
    const ys = puffs.map(([, cy, r]) => cy - r);
    for (let y = Math.floor(Math.min(...ys)); y <= bottom; y++) {
      for (let x = Math.floor(Math.min(...xs)); x <= Math.ceil(Math.max(...xs)); x++) {
        if (!inside(x + 0.5, y + 0.5)) continue;
        // 影:下から 1 行目は濃い影、2 行目は薄い影。上の右寄りも少し影(光は左上から)。
        const below = !inside(x + 0.5, y + 1.5);
        const below2 = !inside(x + 0.5, y + 2.5);
        const right = !inside(x + 1.5, y + 0.5);
        set(x, y, below ? colors[2] : below2 || right ? colors[1] : colors[0]);
      }
    }
  }

  /** 飛ぶ鳥:白い体と、「へ」の字の翼(先は灰色)。幅 11 マス。 */
  function flyingGull(x, y, body = "cloud", tip = "gull") {
    const shape = ["g.........g", "ww.......ww", ".ww.....ww.", "..wwwgwww..", "....wwww..."];
    shape.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        if (ch === "w") set(x + dx - 5, y + dy, body);
        if (ch === "g") set(x + dx - 5, y + dy, tip);
      });
    });
  }

  return { grid, set, rect, get, bandFill, cloud, flyingGull };
}

/** 決まった種の小さな乱数(0〜1)。 @param {number} seed */
export function makeRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

/**
 * 絵を書き出す。塗っていないマス・使っていない色があれば止める。
 * @param {{ id: string, name: string, constName: string, file: string, decision: string, script: string, P: Record<string, string>, grid: (string | null)[][], extra?: string[] }} o
 */
export function writeBackground(o) {
  const { P, grid } = o;
  if (grid.some((r) => r.some((c) => !c))) throw new Error(`${o.id}:塗っていないマスがある`);
  const used = [];
  for (const r of grid) for (const c of r) if (!used.includes(c)) used.push(c);
  const missing = used.filter((k) => !(k in P));
  if (missing.length) throw new Error(`${o.id}:表にない色:${missing.join("・")}`);
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
  };
  used.sort((a, b) => lum(P[a]) - lum(P[b]));
  const unused = Object.keys(P).filter((k) => !used.includes(k));
  if (unused.length) throw new Error(`${o.id}:使っていない色:${unused.join("・")}`);
  if (used.length > 32) throw new Error(`${o.id}:色数 ${used.length} が 32 をこえる`);
  const palette = ["", ...used.map((k) => P[k])];
  const rows = grid.map((r) => r.map((c) => CHARS[used.indexOf(c) + 1]).join(""));
  const lines = [
    "// @ts-check",
    `// ${o.name}の背景のドット絵(130 × 280 マス:${o.decision})。${o.script} が書き出す(手で直さない)。`,
    "// 背景なので透明のマスはない。1 行 = 1 つの文字列、1 マス = 1 文字(src/art/pixel.js の PIXEL_CHARS)。",
    "",
    ...(o.extra ?? []),
    '/** @type {import("../pixel.js").PixelArt} */',
    `export const ${o.constName} = Object.freeze({`,
    `  id: ${JSON.stringify(o.id)},`,
    `  name: ${JSON.stringify(o.name)},`,
    '  kind: "background",',
    `  width: ${W},`,
    `  height: ${H},`,
    `  palette: Object.freeze(${JSON.stringify(palette)}),`,
    "  rows: Object.freeze([",
    ...rows.map((r) => `    ${JSON.stringify(r)},`),
    "  ]),",
    "});",
    "",
  ];
  const out = join(dirname(fileURLToPath(import.meta.url)), "../../src/art/bg", o.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, lines.join("\n"));
  console.log(`${o.id}:${palette.length - 1} 色`);
  if (o.night !== false) writeNightBackground(o, o.night ?? {});
}

// ---- 夜の背景(降臨の戦いのときだけ使う:D-392) ----

/** 夜でも明るいままの色(灯り)。名前 → 夜の色。表にない名前は、ふつうの夜の色にする。 */
const NIGHT_LIGHTS = {
  glass: "#ffe590",
  window: "#ffd76a",
  shipLight: "#ffd47e",
  lure: "#fff3a8",
  lureHalo: "#b39f55",
  glow: "#8ff3e3",
  glowMid: "#3fb3aa",
  sun: "#f6f2d8",
  sunHalo: "#5d6688",
  glint: "#c9cfba",
  glintMid: "#6f8c98",
};
/** 夜空の色(上の段 → 水平線の近く)。 */
const NIGHT_SKY = ["#0a1230", "#111b3e", "#18244c", "#202d5a", "#2a3868", "#334276"];
/** 月と星の色(夜だけの色)。 */
const NIGHT_EXTRA = { moon: "#f4f0d6", moonShade: "#c9c4a4", star: "#e8ecff" };

/** 昼の色を夜の色にする:暗く、青に寄せる。 */
function nightColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[c(r * 0.26 + 6), c(g * 0.32 + 12), c(b * 0.46 + 36)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** 決まった数(0〜1):星の位置に使う(乱数は使わない)。 */
function hash01(x, y) {
  const h = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * 夜の背景を書き出す(昼の絵の色を置き換え、月と星を足す)。src/art/bg/<file>_night.js。
 * night:{ moon:[中心 x, 中心 y, 半径] | null(月を描かない。外洋は太陽が月になる)}
 * 色が 32 をこえるときは、いちばん近い 2 色をまとめる(同じ色はひとつにする)。
 */
function writeNightBackground(o, night) {
  const skyNames = Object.keys(o.P).filter((k) => /^sky\d+$/.test(k)).sort((a, b) => Number(a.slice(3)) - Number(b.slice(3)));
  const color = (name) => {
    if (name in NIGHT_EXTRA) return NIGHT_EXTRA[name];
    if (name in NIGHT_LIGHTS) return NIGHT_LIGHTS[name];
    const i = skyNames.indexOf(name);
    if (i >= 0) return NIGHT_SKY[Math.round((i / Math.max(1, skyNames.length - 1)) * (NIGHT_SKY.length - 1))];
    return nightColor(o.P[name]);
  };
  const grid = o.grid.map((r) => [...r]);
  const isSky = (x, y) => y < HORIZON && skyNames.includes(o.grid[y][x]);
  // 星:空のマスに、まばらに(上ほど多い)。
  for (let y = 0; y < HORIZON - 12; y++) {
    for (let x = 0; x < W; x++) {
      if (!isSky(x, y)) continue;
      const f = hash01(x, y);
      if (f < 0.012 * (1 - y / HORIZON) + 0.002) grid[y][x] = "star";
    }
  }
  // 月:丸と、右下の影。
  const moon = night.moon === undefined ? [24, 26, 7] : night.moon;
  if (moon) {
    const [cx, cy, r] = moon;
    for (let y = cy - r - 1; y <= cy + r + 1; y++) {
      for (let x = cx - r - 1; x <= cx + r + 1; x++) {
        if (y < 0 || x < 0 || x >= W || !isSky(x, y)) continue;
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d > r) continue;
        grid[y][x] = d > r - 1.6 && x + 0.5 - cx + (y + 0.5 - cy) > r * 0.6 ? "moonShade" : "moon";
      }
    }
  }
  // 名前 → 夜の色。同じ色はひとつに、32 をこえたら近い色をまとめる。
  let hexGrid = grid.map((r) => r.map(color));
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  for (;;) {
    const used = [...new Set(hexGrid.flat())];
    if (used.length <= 32) break;
    let best = null;
    for (let i = 0; i < used.length; i++) {
      for (let j = i + 1; j < used.length; j++) {
        const a = rgb(used[i]);
        const b = rgb(used[j]);
        const d = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
        if (!best || d < best.d) best = { d, from: used[j], to: used[i] };
      }
    }
    hexGrid = hexGrid.map((r) => r.map((h) => (h === best.from ? best.to : h)));
  }
  const lum = (hex) => {
    const [r, g, b] = rgb(hex);
    return r * 0.299 + g * 0.587 + b * 0.114;
  };
  const used = [...new Set(hexGrid.flat())].sort((a, b) => lum(a) - lum(b));
  const palette = ["", ...used];
  const rows = hexGrid.map((r) => r.map((h) => CHARS[used.indexOf(h) + 1]).join(""));
  const name = o.name.replace("(昼)", "(夜)");
  const lines = [
    "// @ts-check",
    `// ${name}の背景のドット絵(130 × 280 マス:D-392)。${o.script} が、昼の絵の色を夜の色に置き換え、月と星を足して書き出す(手で直さない)。`,
    "// 降臨の戦いのときだけ使う。背景なので透明のマスはない。1 行 = 1 つの文字列、1 マス = 1 文字(src/art/pixel.js の PIXEL_CHARS)。",
    "",
    '/** @type {import("../pixel.js").PixelArt} */',
    `export const ${o.constName}_NIGHT = Object.freeze({`,
    `  id: ${JSON.stringify(`${o.id}-night`)},`,
    `  name: ${JSON.stringify(name)},`,
    '  kind: "background",',
    `  width: ${W},`,
    `  height: ${H},`,
    `  palette: Object.freeze(${JSON.stringify(palette)}),`,
    "  rows: Object.freeze([",
    ...rows.map((r) => `    ${JSON.stringify(r)},`),
    "  ]),",
    "});",
    "",
  ];
  const out = join(dirname(fileURLToPath(import.meta.url)), "../../src/art/bg", o.file.replace(/\.js$/, "_night.js"));
  writeFileSync(out, lines.join("\n"));
  console.log(`${o.id}-night:${palette.length - 1} 色`);
}

/**
 * 波の線:短い横線。水平線の近くは細かく多め、手前ほど長く少なく。右の竿のまわり(x > 74・y > 150)は空ける。
 * isWater(色の名前)が真のマスにだけ描く。
 * @param {ReturnType<typeof makeScene>} sc @param {() => number} rand
 * @param {{ hi: string, mid: string, isWater: (c: string | null) => boolean, end?: number, count?: number, step?: number }} o
 */
export function seaWaves(sc, rand, o) {
  const end = o.end ?? 206;
  const count0 = o.count ?? 9;
  for (let y = HORIZON + 3; y < end; y += o.step ?? 3) {
    const t = (y - HORIZON) / (end - HORIZON);
    const count = Math.round(count0 - (count0 * 5 * t) / 9);
    const len = Math.round(2 + 4 * t);
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rand() * (W - len));
      if (x > 74 && y > 150) continue;
      const c = t < 0.35 || rand() < 0.4 ? o.hi : o.mid;
      for (let k = 0; k < len; k++) if (o.isWater(sc.get(x + k, y))) sc.set(x + k, y, c);
      if (len >= 4) for (let k = 1; k < len - 1; k++) if (o.isWater(sc.get(x + k, y + 1))) sc.set(x + k, y + 1, o.mid);
    }
  }
}

/**
 * 深いところの、うすいさざなみ:1 段明るい色の短い線を少しだけ。ゲージと体力のあたり(y = 208〜244)は空ける。
 * lighter(色の名前)が 1 段明るい色を返す(なければ null)。
 * @param {ReturnType<typeof makeScene>} sc @param {() => number} rand @param {(c: string | null) => string | null} lighter
 */
export function deepRipples(sc, rand, lighter) {
  for (let y = 200; y < H - 2; y += 4) {
    if (y >= 208 && y <= 244) continue;
    for (let i = 0; i < 4; i++) {
      const len = 3 + Math.floor(rand() * 4);
      const x = Math.floor(rand() * (W - len));
      const here = sc.get(x, y);
      const l = lighter(here);
      if (l) for (let k = 0; k < len; k++) if (sc.get(x + k, y) === here) sc.set(x + k, y, l);
    }
  }
}
