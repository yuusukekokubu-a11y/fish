// 魚のドット絵(32 × 32 マス、16 色まで)を作る共通の道具(D-372・D-386)。クロダイ(scripts/art/kurodai.mjs)の
// 32 マスの作り方を、魚ごとの「形の数」と「色の決まり」で使い回せるようにしたもの。
// - 形:魚の長さを 1 とした座標(u は口先 0 〜 尾の端 1、v は体の中心線からの縦。下が +)。
//   背の線 top と腹の線 bot(点を結ぶなめらかな線)、体の終わり bodyEnd、尾びれ・背びれ・しりびれ・腹びれ・胸びれの多角形。
// - 塗り:1 マスを 3 × 3 に分けて、どの部分か多数決で決める(輪郭のがたつきを減らす)。体は、背が暗く腹が明るい段。
//   魚ごとの模様(pattern)で上書きし、外に面したマスを輪郭の色にする。目・口・えらぶたの線を置く。
// - ヌシ(D-386):強い魚の絵のまわりに飾りの縁と冠を足した 36 × 36 マスの絵(画面では 2 倍の大きさで出す)。
// 特定のゲームの絵や画像は参照しない。画像生成 AI は使わない。実在の魚の特徴(一般的な図鑑の知識)から形と色を決める。

export const N = 32;
const CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** なめらかな補間(単調な 3 次。行き過ぎない)。points は [u, v] の並び(u の小さい順)。 */
export function pchip(points) {
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

/** 点が多角形の中か。 */
export function inPoly(u, v, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > v !== yj > v && u < ((xj - xi) * (v - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 魚 1 匹を描く。返すのは色の名前の並び(N × N、空は null)。
 * spec:
 * - top・bot:背と腹の線([u, v] の並び)。bodyEnd:体の終わり(尾の付け根)。
 * - tail:尾びれの多角形。fins:{ poly, kind } の並び(kind は "fin"〔体の外のひれ〕か "over"〔体の上に重なる胸びれ〕)。
 * - eye:{ u, v, size }(size は 1 か 2:瞳の大きさのマス)。mouth:{ u, v }(暗い 1 マス)。gill:えらぶたの線の u(なければ省く)。
 * - tones:体の段の色の名前(背 → 腹)と、その境目(0〜1 の並び、tones より 1 つ少ない)。
 * - pattern(info):模様の色の名前(なければ null)。info は { u, v, t〔体の上下の割合 0〜1〕, x, y }。
 * - colors:outline・fin・finDark・pupil・eyeRing・eyeHi・mouth・gill の名前 → 色。ほかの名前の色もここに入れる。
 * - fins の 1 つに color(色の名前)を書くと、そのひれはその色 1 色で、輪郭を付けない(ナマズのひげ:D-388)。
 * - scale:魚の長さのマス数(既定 30)。cx・cy:口先の x(既定 1)と中心線の y(既定 16)。flatTail:尾の筋を描かない。
 * - vScale:縦の強調(既定 1.35)。細い魚が 32 マスで糸のようにならないよう、少しふっくら描く(荒めで可愛い:D-372)。
 */
export function renderFish(spec) {
  const L = spec.scale ?? 30;
  const ox = spec.cx ?? 1;
  const oy = spec.cy ?? 16;
  const vs = spec.vScale ?? 1.35;
  const TOP = pchip(spec.top);
  const BOT = pchip(spec.bot);
  const bodyEnd = spec.bodyEnd;
  const region = (u, v) => {
    if (u >= 0 && u <= bodyEnd && v >= TOP(u) && v <= BOT(u)) return "body";
    if (inPoly(u, v, spec.tail)) return "tail";
    for (const f of spec.fins ?? []) if (f.kind !== "over" && inPoly(u, v, f.poly)) return f.color ? `fin:${f.color}` : "fin";
    return null;
  };
  // 1 マスを 3 × 3 に分けて多数決(5 つ以上が魚なら魚。部分は、いちばん多いもの)。
  const grid = Array.from({ length: N }, () => new Array(N).fill(null));
  const info = Array.from({ length: N }, () => new Array(N).fill(null));
  // 色を決めたひれ(ナマズのひげなど:color を書いたひれ)のマスの色。輪郭も付けない。
  const own = Array.from({ length: N }, () => new Array(N).fill(null));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const count = {};
      let total = 0;
      for (let sy = 0; sy < 3; sy++) {
        for (let sx = 0; sx < 3; sx++) {
          const u = (x + (sx + 0.5) / 3 - ox) / L;
          const v = (y + (sy + 0.5) / 3 - oy) / L / vs;
          const r = region(u, v);
          if (r) {
            count[r] = (count[r] ?? 0) + 1;
            total++;
          }
        }
      }
      if (total < 5) continue;
      const r = Object.keys(count).sort((a, b) => count[b] - count[a] || (a === "body" ? -1 : b === "body" ? 1 : 0))[0];
      grid[y][x] = r.startsWith("fin:") ? "fin" : r;
      if (r.startsWith("fin:")) own[y][x] = r.slice(4);
      const u = (x + 0.5 - ox) / L;
      const v = (y + 0.5 - oy) / L / vs;
      const top = TOP(Math.min(u, bodyEnd));
      const bot = BOT(Math.min(u, bodyEnd));
      info[y][x] = { u, v, t: (v - top) / Math.max(1e-6, bot - top), x, y, region: r };
    }
  }
  const at = (x, y) => x >= 0 && x < N && y >= 0 && y < N && grid[y][x] !== null;
  // ---- 色 ----
  const out = grid.map((row) => row.map(() => null));
  const cuts = spec.toneCuts;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const r = grid[y][x];
      if (!r) continue;
      const i = info[y][x];
      let c;
      if (r === "body") {
        let k = 0;
        while (k < cuts.length && i.t > cuts[k]) k++;
        c = spec.tones[k];
      } else {
        // ひれと尾:筋(1 列おき)を少し暗く。
        c = !spec.flatTail && (r === "tail" ? x % 2 === 0 : (x + y) % 3 === 0) ? "finDark" : "fin";
      }
      // 胸びれ(体の上に重なる)。
      for (const f of spec.fins ?? []) if (f.kind === "over" && inPoly(i.u, i.v, f.poly)) c = f.color ?? "fin";
      const p = spec.pattern?.({ ...i, region: r });
      if (p) c = p;
      out[y][x] = own[y][x] ?? c;
    }
  }
  // えらぶたの線:体の上 2 割〜下 8 割を、縦に 1 本。
  if (spec.gill !== undefined) {
    const gx = Math.round(ox + spec.gill * L - 0.5);
    for (let y = 0; y < N; y++) {
      const i = info[y][gx];
      if (i && grid[y][gx] === "body" && i.t > 0.2 && i.t < 0.85) out[y][gx] = "gill";
    }
  }
  // 輪郭:外に面したマス。
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (!grid[y][x] || own[y][x]) continue;
      if (!at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1)) out[y][x] = spec.outlineOf?.(grid[y][x], out[y][x]) ?? "outline";
    }
  }
  // 目:瞳(1〜3 マス四方)、まわりの輪、光の点。
  if (spec.eye) {
    const ex = Math.round(ox + spec.eye.u * L - 0.5);
    const ey = Math.round(oy + spec.eye.v * L * vs - 0.5);
    const s = spec.eye.size ?? 2;
    const set = (x, y, c) => {
      if (at(x, y)) out[y][x] = c;
    };
    if (s >= 2) {
      // s × s の瞳と、そのまわりの 1 マスの輪(メバルのような大きな目は s = 3)。
      for (let dy = -1; dy <= s; dy++) for (let dx = -1; dx <= s; dx++) set(ex + dx, ey + dy, dx < 0 || dy < 0 || dx >= s || dy >= s ? "eyeRing" : "pupil");
      set(ex, ey, "eyeHi");
    } else {
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) set(ex + dx, ey + dy, "eyeRing");
      set(ex, ey, "pupil");
    }
    for (const e of spec.extraEyes ?? []) {
      const x2 = Math.round(ox + e.u * L - 0.5);
      const y2 = Math.round(oy + e.v * L * vs - 0.5);
      set(x2 - 1, y2, "eyeRing");
      set(x2 + 1, y2, "eyeRing");
      set(x2, y2 - 1, "eyeRing");
      set(x2, y2 + 1, "eyeRing");
      set(x2, y2, "pupil");
    }
  }
  if (spec.mouth) {
    const mx = Math.round(ox + spec.mouth.u * L - 0.5);
    const my = Math.round(oy + spec.mouth.v * L * vs - 0.5);
    if (at(mx, my)) out[my][mx] = "mouth";
  }
  return out;
}

/** 色の並びの色の名前を、色(#rrggbb)に置き換える。表にない名前があれば止める。 */
export function toColors(grid, colors, id) {
  return grid.map((row) =>
    row.map((c) => {
      if (c === null) return null;
      if (!(c in colors)) throw new Error(`${id}:色の表にない名前「${c}」`);
      return colors[c];
    }),
  );
}

/**
 * ヌシの絵(D-386):魚の絵(色の並び)のまわりに、飾りの縁(1 マス)と、頭の上の冠を足す。36 × 36 マス。
 * deco:{ glow:縁の色、gold・goldDark・jewel:冠の色、crownU:冠の真ん中の列(0〜31。頭の上)、sparkle:光の点の色 }
 */
export function decorateBoss(fishColors, deco) {
  const S = 36;
  const dx = 2;
  const dy = 4;
  const grid = Array.from({ length: S }, () => new Array(S).fill(null));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (fishColors[y][x]) grid[y + dy][x + dx] = fishColors[y][x];
  const filled = (x, y) => x >= 0 && x < S && y >= 0 && y < S && grid[y][x] !== null;
  // 縁:魚に 4 方向で接する空のマス。
  const ring = [];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (!filled(x, y) && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) ring.push([x, y]);
  for (const [x, y] of ring) grid[y][x] = deco.glow;
  // 冠:頭の上(冠の列で、いちばん上の魚のマスのすぐ上に置く)。
  const cx = deco.crownU + dx;
  let topY = S;
  for (let x = cx - 3; x <= cx + 3; x++) for (let y = 0; y < S; y++) if (grid[y][x] && grid[y][x] !== deco.glow) {
    topY = Math.min(topY, y);
    break;
  }
  const crown = ["g.g.g.g", "gg.g.gg", "ggggggg", "GjGkGjG", "GGGGGGG"];
  const cy0 = topY - crown.length - 1;
  crown.forEach((row, ry) => {
    [...row].forEach((ch, rx) => {
      const x = cx - 3 + rx;
      const y = cy0 + ry;
      if (x < 0 || x >= S || y < 0) return;
      if (ch === "g") grid[y][x] = deco.gold;
      if (ch === "G") grid[y][x] = deco.goldDark;
      if (ch === "j") grid[y][x] = deco.jewel;
      if (ch === "k") grid[y][x] = deco.jewel2 ?? deco.jewel;
    });
  });
  // 光の点(右上と左下に 1 つずつ、十字)。
  for (const [sx, sy] of deco.sparkles ?? [
    [S - 4, 4],
    [3, S - 5],
  ]) {
    for (const [ex, ey] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) if (!grid[sy + ey]?.[sx + ex]) grid[sy + ey][sx + ex] = deco.sparkle;
  }
  return grid;
}

/** 色(#rrggbb)の並び → パレットと文字の行。使った色だけを、暗い順に並べる。 */
export function encode(grid, id, name) {
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

/** 書き出す行(1 枚)。 */
export function artLines(a) {
  return `  ${JSON.stringify(a.id)}: Object.freeze({\n    id: ${JSON.stringify(a.id)},\n    name: ${JSON.stringify(a.name)},\n    width: ${a.width},\n    height: ${a.height},\n    palette: Object.freeze(${JSON.stringify(a.palette)}),\n    rows: Object.freeze([\n${a.rows.map((r) => `      ${JSON.stringify(r)},`).join("\n")}\n    ]),\n  }),`;
}

/** ヌシの冠の色(どの釣り場も同じ:金の冠、赤と青の宝石、光の点)。 */
export const GOLD = Object.freeze({ gold: "#f2c43c", goldDark: "#b8862a", jewel: "#e63946", jewel2: "#3a86ff", sparkle: "#fff3b0" });

/**
 * 釣り場の魚の絵を描いて、src/art/fish/<file> に書き出す(D-386)。
 * fish:魚の並び(弱い魚 → 強い魚の順)。それぞれ renderFish の spec、または { id, name, grid〔色の並び〕}。
 * bosses:[強い魚の id, 縁の色(魚の表のヌシの色), 冠の列] の並び。
 * @param {{ file: string, constName: string, areaName: string, script: string, decision: string, fish: any[], bosses: [string, string, number][] }} o
 */
export async function writeFishModule(o) {
  const { writeFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const grids = new Map();
  for (const f of o.fish) grids.set(f.id, { name: f.name, grid: f.grid ?? toColors(renderFish(f), f.colors, f.id) });
  const arts = o.fish.map((f) => encode(grids.get(f.id).grid, f.id, f.name));
  for (const [id, glow, crownU] of o.bosses) {
    const f = grids.get(id);
    arts.push(encode(decorateBoss(f.grid, { ...GOLD, glow, crownU }), `nushi-${id}`, `ヌシ・${f.name}`));
  }
  for (const a of arts) {
    const colors = a.palette.length - 1;
    const limit = a.width === N ? 16 : 24;
    if (colors > limit) throw new Error(`${a.id}:色数 ${colors} が ${limit} をこえる`);
  }
  const lines = [
    "// @ts-check",
    `// ${o.areaName}の魚のドット絵(弱い魚 5・強い魚 5 は 32 × 32 マス、ヌシ 5 は飾りつきの 36 × 36 マス:${o.decision})。`,
    `// ${o.script} が書き出す(手で直さない)。色番号 0 は透明。1 行 = 1 つの文字列、1 マス = 1 文字。`,
    "",
    '/** @type {Readonly<Record<string, import("../pixel.js").PixelArt>>} */',
    `export const ${o.constName} = Object.freeze({`,
    ...arts.map(artLines),
    "});",
    "",
  ];
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src/art/fish", o.file), lines.join("\n"));
  console.log(arts.map((a) => `${a.id}:${a.palette.length - 1} 色`).join("、"));
}
