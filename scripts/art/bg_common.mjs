// 背景のドット絵を作る共通の道具(D-383・D-384)。幅 130 × 高さ 280 マス、水平線は上から 118 マス(ゲームの水面 0.42)。
// 釣り場ごとのスクリプト(scripts/art/bg_*.mjs)が、色の表と形の決まりを渡して使う。
// - 塗る:set・rect・bandFill(帯を点描でなじませる)・cloud(丸の集まりの雲)・flyingGull(飛ぶ鳥)
// - 乱数:決まった種の小さな乱数(何度書き出しても同じ絵になる)
// - 書き出し:使った色だけを明るさの順でパレットにし、src/art/bg/<id>.js に書く(手で直さない)

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
