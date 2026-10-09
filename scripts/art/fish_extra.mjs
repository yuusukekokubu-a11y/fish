// 各段階に足した弱い魚 30 匹のドット絵の形と色(D-406)。釣り場ごとの台本(fish_minato.mjs など)が読み込んで、その釣り場の絵に足す。
// 形は fish_common.mjs の renderFish の spec。体の形の型(紡錘・体高・ハゼ・細長いなど)を数個の数で作り、魚ごとに色と模様を決める。
// 形と色は、実在の魚の特徴(一般的な図鑑の知識)から決めた。特定のゲームの絵や画像は参照しない。画像生成 AI は使わない。

/** どの魚にも使う目と口の色。 */
const EYE = { pupil: "#14161c", eyeRing: "#d9dde0", eyeHi: "#ffffff", mouth: "#3a2a2a" };

/**
 * 体の形の型。h は体の高さ(長さに対する、背と腹それぞれの最大)、peak は一番高いところの u、end は体の終わり(尾の付け根)、
 * snout は口先の太さ、belly は腹の張り(1 で背と同じ)、tail は "fork"(二股)・"round"(丸い)・"cut"(まっすぐ)・"none"(とがって終わる)。
 * @param {{ h: number, peak?: number, end?: number, snout?: number, belly?: number, tail?: string, tailH?: number, stalk?: number }} o
 */
function body(o) {
  const peak = o.peak ?? 0.38;
  const end = o.end ?? 0.8;
  const h = o.h;
  const b = h * (o.belly ?? 0.95);
  const sn = o.snout ?? 0.25;
  const st = o.stalk ?? 0.28;
  // 線の点(u の小さい順。同じ u が 2 つあると線がこわれるので、間をあけて並べる)。
  const us = [0, 0.04, peak * 0.55, peak, (peak + end) / 2, end - 0.08, end].filter((u, i, a) => i === 0 || u > a[i - 1] + 0.01);
  const prof = (u) => {
    if (u <= peak) return sn + (1 - sn) * Math.sin(((u / peak) * Math.PI) / 2);
    const t = (u - peak) / (end - peak);
    return st + (1 - st) * Math.cos((t * Math.PI) / 2);
  };
  const top = us.map((u) => [u, -h * prof(u)]);
  const bot = us.map((u) => [u, b * prof(u) + h * 0.06 * (1 - u)]);
  const th = o.tailH ?? h * 1.4;
  const e = end - 0.02;
  const sTop = -h * st;
  const sBot = b * st;
  const kind = o.tail ?? "fork";
  const tail =
    kind === "fork"
      ? [[e, sTop], [end + 0.07, -th * 0.55], [end + 0.15, -th * 0.95], [end + 0.2, -th], [end + 0.16, -th * 0.5], [end + 0.11, -th * 0.15], [end + 0.09, 0], [end + 0.11, th * 0.15], [end + 0.16, th * 0.5], [end + 0.2, th], [end + 0.15, th * 0.95], [end + 0.07, th * 0.55], [e, sBot]]
      : kind === "round"
        ? [[e, sTop], [end + 0.05, -th * 0.75], [end + 0.12, -th * 0.85], [end + 0.17, -th * 0.55], [end + 0.19, 0], [end + 0.17, th * 0.55], [end + 0.12, th * 0.85], [end + 0.05, th * 0.75], [e, sBot]]
        : kind === "cut"
          ? [[e, sTop], [end + 0.06, -th * 0.8], [end + 0.16, -th * 0.95], [end + 0.17, 0], [end + 0.16, th * 0.95], [end + 0.06, th * 0.8], [e, sBot]]
          : [[e, sTop], [end + 0.1, -h * 0.05], [end + 0.16, 0], [end + 0.1, h * 0.05], [e, sBot]];
  return { top, bot, bodyEnd: end, tail };
}

/** 背びれ(u0〜u1、高さ fh)。 @param {number} u0 @param {number} u1 @param {number} y 背の線の高さ @param {number} fh */
const dorsal = (u0, u1, y, fh) => ({ kind: "fin", poly: [[u0, y], [u0 + (u1 - u0) * 0.25, y - fh], [u1 - (u1 - u0) * 0.2, y - fh * 0.8], [u1, y + 0.005]] });
/** しりびれ。 */
const anal = (u0, u1, y, fh) => ({ kind: "fin", poly: [[u0, y], [u0 + (u1 - u0) * 0.25, y + fh], [u1 - (u1 - u0) * 0.2, y + fh * 0.8], [u1, y - 0.005]] });
/** 胸びれ(体の上に重なる)。 */
const pec = (u, v, w = 0.12, hh = 0.03) => ({ kind: "over", poly: [[u, v], [u + w, v - hh * 0.4], [u + w * 1.1, v + hh * 0.5], [u + w * 0.3, v + hh]] });

/** 体の段の 5 色の決まり(背 → 腹)。 */
const TONES = { tones: ["back", "back2", "side", "belly", "bellyHi"], toneCuts: [0.25, 0.42, 0.66, 0.86] };

/** 色の組を作る。 @param {Record<string, string>} c */
const pal = (c) => ({ ...EYE, ...c });

// ================= 港 =================

/** ハゼ(マハゼ):頭が大きく、目が上寄り。体は砂色に茶の斑点。背びれ 2 つ、尾は丸い。 */
const HAZE = {
  id: "haze",
  name: "ハゼ",
  ...body({ h: 0.1, peak: 0.25, end: 0.8, snout: 0.6, belly: 0.9, tail: "round", tailH: 0.12, stalk: 0.45 }),
  fins: [dorsal(0.3, 0.42, -0.095, 0.07), dorsal(0.47, 0.72, -0.085, 0.06), anal(0.5, 0.72, 0.085, 0.05), pec(0.2, 0.02, 0.12, 0.05)],
  eye: { u: 0.1, v: -0.05, size: 2 },
  mouth: { u: 0.0, v: 0.02 },
  gill: 0.2,
  ...TONES,
  pattern: (i) => (i.region === "body" && i.t < 0.75 && (Math.sin(i.u * 55) + Math.sin(i.t * 13 + i.u * 20)) > 1.2 ? "spot" : null),
  colors: pal({ outline: "#3a2e1f", back: "#8a7353", back2: "#a48c69", side: "#c2a878", belly: "#e1d2b2", bellyHi: "#f1e8d4", fin: "#c9b48e", finDark: "#a8936c", gill: "#8a7353", spot: "#5e4a31" }),
};

/** サッパ:平たいニシンの仲間。背は青、腹は銀で、腹の縁はとがる。背びれは真ん中に 1 つ。二股の尾。 */
const SAPPA = {
  id: "sappa",
  name: "サッパ",
  ...body({ h: 0.13, peak: 0.36, end: 0.8, snout: 0.3, belly: 1.05 }),
  fins: [dorsal(0.38, 0.52, -0.125, 0.06), anal(0.58, 0.74, 0.07, 0.035)],
  eye: { u: 0.08, v: -0.025, size: 2 },
  mouth: { u: 0.0, v: 0.0 },
  gill: 0.19,
  ...TONES,
  pattern: (i) => (i.region === "body" && Math.abs(i.t - 0.4) < 0.04 && i.u > 0.2 ? "line" : null),
  colors: pal({ outline: "#1f3448", back: "#3c6a94", back2: "#6390b4", side: "#c3d0db", belly: "#e3e9ee", bellyHi: "#f6f8fa", fin: "#c0ccd6", finDark: "#97a6b3", gill: "#7d8fa0", line: "#9fb6c9" }),
};

/** ボラ:太い円筒形。背は灰青、腹は白。うろこの縦の筋。背びれ 2 つ、尾は浅い二股。 */
const BORA = {
  id: "bora",
  name: "ボラ",
  ...body({ h: 0.105, peak: 0.35, end: 0.8, snout: 0.45, belly: 0.95, stalk: 0.4, tailH: 0.13 }),
  fins: [dorsal(0.38, 0.46, -0.1, 0.06), dorsal(0.58, 0.68, -0.07, 0.05), anal(0.6, 0.7, 0.065, 0.04), pec(0.22, -0.02, 0.1, 0.04)],
  eye: { u: 0.075, v: -0.02, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.2,
  ...TONES,
  pattern: (i) => (i.region === "body" && i.t > 0.2 && i.t < 0.7 && Math.abs(((i.t * 9) % 1) - 0.5) < 0.12 ? "stripe" : null),
  colors: pal({ outline: "#25313a", back: "#4f6271", back2: "#6c7f8c", side: "#9aa5ad", belly: "#d9dfe2", bellyHi: "#f0f3f4", fin: "#8f9ca5", finDark: "#6f7c85", gill: "#5f6e79", stripe: "#7f8f9a" }),
};

/** メゴチ:平たく、頭が三角にとがる。砂色に白い点。大きな胸びれ。尾は丸い。 */
const MEGOCHI = {
  id: "megochi",
  name: "メゴチ",
  ...body({ h: 0.07, peak: 0.22, end: 0.78, snout: 0.25, belly: 0.75, tail: "round", tailH: 0.1, stalk: 0.5 }),
  fins: [dorsal(0.3, 0.38, -0.068, 0.06), dorsal(0.42, 0.72, -0.055, 0.05), anal(0.42, 0.72, 0.05, 0.035), { kind: "fin", poly: [[0.22, 0.03], [0.3, 0.1], [0.38, 0.08], [0.3, 0.04]] }],
  eye: { u: 0.12, v: -0.06, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.2,
  ...TONES,
  pattern: (i) => (i.region === "body" && i.t < 0.6 && (Math.sin(i.u * 70) * Math.sin(i.t * 25)) > 0.7 ? "dot" : null),
  colors: pal({ outline: "#3a3020", back: "#8e7a56", back2: "#a8946d", side: "#b59e7a", belly: "#ddd2b8", bellyHi: "#efe8d6", fin: "#c7b28a", finDark: "#a08b66", gill: "#7f6c4b", dot: "#efe6cc" }),
};

/** ウミタナゴ:体高のある楕円形。銀に赤みがあり、目の下に黒い線。背びれは長く 1 つ。尾は浅い二股。 */
const UMITANAGO = {
  id: "umitanago",
  name: "ウミタナゴ",
  ...body({ h: 0.17, peak: 0.4, end: 0.8, snout: 0.3, belly: 1.0, stalk: 0.22, tailH: 0.14 }),
  fins: [dorsal(0.32, 0.72, -0.15, 0.05), anal(0.52, 0.74, 0.12, 0.05)],
  eye: { u: 0.1, v: -0.04, size: 2 },
  mouth: { u: 0.01, v: 0.01 },
  gill: 0.22,
  ...TONES,
  pattern: (i) => (i.region === "body" && i.u > 0.08 && i.u < 0.14 && i.t > 0.45 && i.t < 0.62 ? "mark" : null),
  colors: pal({ outline: "#3a2a2c", back: "#7d6d70", back2: "#9c8a8a", side: "#c9b8b4", belly: "#e9dcd6", bellyHi: "#f6efeb", fin: "#c8a49a", finDark: "#a5837a", gill: "#8e7a76", mark: "#2c2224" }),
};

// ================= 磯 =================

/** スズメダイ:小さな卵形。黒っぽい灰色で、背びれの付け根の後ろに白い点。尾は深い二股。 */
const SUZUMEDAI = {
  id: "suzumedai",
  name: "スズメダイ",
  ...body({ h: 0.17, peak: 0.4, end: 0.78, snout: 0.35, stalk: 0.28, tailH: 0.17 }),
  fins: [dorsal(0.3, 0.72, -0.16, 0.05), anal(0.55, 0.74, 0.13, 0.06)],
  eye: { u: 0.1, v: -0.04, size: 2 },
  mouth: { u: 0.01, v: 0.0 },
  gill: 0.22,
  ...TONES,
  pattern: (i) => (i.region === "body" && i.u > 0.66 && i.u < 0.72 && i.t > 0.08 && i.t < 0.2 ? "white" : null),
  colors: pal({ outline: "#15191e", back: "#363d45", back2: "#4a525b", side: "#6f7f8f", belly: "#8d99a4", bellyHi: "#a9b3bb", fin: "#4e5762", finDark: "#3a424b", gill: "#2c333a", white: "#f2f4f6" }),
};

/** ネンブツダイ:小さく、目が大きい。うす桃色の体に、目を通る黒い線と尾の付け根の黒い点。尾は二股。 */
const NENBUTSUDAI = {
  id: "nenbutsudai",
  name: "ネンブツダイ",
  ...body({ h: 0.15, peak: 0.38, end: 0.78, snout: 0.4, stalk: 0.3 }),
  fins: [dorsal(0.32, 0.42, -0.14, 0.07), dorsal(0.48, 0.6, -0.12, 0.06), anal(0.52, 0.66, 0.12, 0.05)],
  eye: { u: 0.11, v: -0.03, size: 3 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.24,
  ...TONES,
  pattern: (i) => {
    if (i.region !== "body") return null;
    if (Math.abs(i.t - 0.42) < 0.06 && i.u < 0.3) return "band";
    if (i.u > 0.72 && Math.abs(i.t - 0.5) < 0.15) return "band";
    return null;
  },
  colors: pal({ outline: "#4a2a20", back: "#c9805e", back2: "#d99a7a", side: "#e8a87c", belly: "#f3cdb4", bellyHi: "#fae6d8", fin: "#efb898", finDark: "#d29878", gill: "#b77656", band: "#2a1a16" }),
};

/** クサフグ:丸い体。背は緑がかった茶に白い点、腹は白。小さな背びれとしりびれ、尾はまっすぐ。 */
const KUSAFUGU = {
  id: "kusafugu",
  name: "クサフグ",
  ...body({ h: 0.15, peak: 0.36, end: 0.78, snout: 0.5, belly: 1.15, tail: "cut", tailH: 0.1, stalk: 0.4 }),
  fins: [dorsal(0.58, 0.66, -0.09, 0.06), anal(0.6, 0.68, 0.1, 0.05), pec(0.26, -0.02, 0.08, 0.04)],
  eye: { u: 0.17, v: -0.06, size: 2 },
  mouth: { u: 0.0, v: 0.02 },
  ...TONES,
  toneCuts: [0.25, 0.42, 0.55, 0.8],
  pattern: (i) => (i.region === "body" && i.t < 0.5 && (Math.sin(i.u * 60) * Math.sin(i.t * 30)) > 0.65 ? "dot" : null),
  colors: pal({ outline: "#2c2e1c", back: "#6e6e44", back2: "#87865a", side: "#9c9b6c", belly: "#eceee4", bellyHi: "#f8f9f4", fin: "#b9b48a", finDark: "#958f68", gill: "#6e6e44", dot: "#e7e6c8" }),
};

/** ハオコゼ:小さく、背びれが高い(毒のとげ)。赤茶色にまだら。尾は丸い。 */
const HAOKOZE = {
  id: "haokoze",
  name: "ハオコゼ",
  ...body({ h: 0.13, peak: 0.3, end: 0.78, snout: 0.5, tail: "round", tailH: 0.12, stalk: 0.45 }),
  fins: [{ kind: "fin", poly: [[0.12, -0.12], [0.16, -0.24], [0.3, -0.22], [0.5, -0.17], [0.7, -0.12], [0.72, -0.06]] }, anal(0.52, 0.72, 0.1, 0.06), pec(0.2, 0.0, 0.12, 0.06)],
  eye: { u: 0.1, v: -0.06, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.2,
  ...TONES,
  pattern: (i) => ((i.region === "body" || i.region === "fin") && (Math.sin(i.u * 40 + i.t * 7) + Math.cos(i.t * 11 - i.u * 9)) > 1.1 ? "dark" : null),
  colors: pal({ outline: "#3a1810", back: "#7e3a2a", back2: "#93493a", side: "#a65e4a", belly: "#cf9a86", bellyHi: "#e6c4b6", fin: "#b56a52", finDark: "#8e4a36", gill: "#7e3a2a", dark: "#5a2418" }),
};

/** タカノハダイ:体高があり、口が小さい。白地に茶の斜めの帯、尾に白い点。胸びれが長い。 */
const TAKANOHADAI = {
  id: "takanohadai",
  name: "タカノハダイ",
  ...body({ h: 0.16, peak: 0.36, end: 0.78, snout: 0.3, stalk: 0.25, tail: "cut", tailH: 0.14 }),
  fins: [dorsal(0.28, 0.72, -0.15, 0.05), anal(0.55, 0.74, 0.12, 0.05), pec(0.22, 0.02, 0.18, 0.04)],
  eye: { u: 0.1, v: -0.04, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.22,
  ...TONES,
  pattern: (i) => {
    if (i.region === "tail") return (i.x + i.y) % 3 === 0 ? "white" : null;
    if (i.region !== "body") return null;
    return Math.abs((((i.u * 6 + i.t * 2.2) % 1) + 1) % 1 - 0.5) > 0.32 ? "band" : null;
  },
  colors: pal({ outline: "#2e2418", back: "#a8956e", back2: "#bca884", side: "#c9b48a", belly: "#ece4d2", bellyHi: "#f8f4ea", fin: "#c1ad86", finDark: "#9f8b64", gill: "#8c7a56", band: "#5c4630", white: "#f4efe3" }),
};

// ================= 川 =================

/** モツゴ:小さく細い。銀灰色で、体の真ん中に黒い縦の線。尾は二股。 */
const MOTSUGO = {
  id: "motsugo",
  name: "モツゴ",
  ...body({ h: 0.1, peak: 0.36, end: 0.8, snout: 0.35 }),
  fins: [dorsal(0.42, 0.54, -0.095, 0.06), anal(0.58, 0.7, 0.07, 0.04)],
  eye: { u: 0.08, v: -0.02, size: 2 },
  mouth: { u: 0.0, v: -0.005 },
  gill: 0.19,
  ...TONES,
  pattern: (i) => (i.region === "body" && Math.abs(i.t - 0.5) < 0.07 && i.u > 0.12 ? "line" : null),
  colors: pal({ outline: "#2a2e26", back: "#6d7058", back2: "#8b8e74", side: "#b7b39a", belly: "#dedbc8", bellyHi: "#efede2", fin: "#bfbaa0", finDark: "#9a957c", gill: "#7d7f68", line: "#2f3328" }),
};

/** タナゴ:平たく体高がある。銀色に、肩に青い点と、尾に向かう青い線。尾は二股。 */
const TANAGO = {
  id: "tanago",
  name: "タナゴ",
  ...body({ h: 0.15, peak: 0.38, end: 0.8, snout: 0.3, stalk: 0.25 }),
  fins: [dorsal(0.4, 0.6, -0.14, 0.06), anal(0.5, 0.7, 0.12, 0.05)],
  eye: { u: 0.08, v: -0.03, size: 2 },
  mouth: { u: 0.0, v: 0.0 },
  gill: 0.2,
  ...TONES,
  pattern: (i) => {
    if (i.region !== "body") return null;
    if (i.u > 0.22 && i.u < 0.28 && i.t > 0.25 && i.t < 0.4) return "blue";
    if (i.u > 0.5 && Math.abs(i.t - 0.5) < 0.06) return "blue";
    return null;
  },
  colors: pal({ outline: "#26303a", back: "#6c7c8a", back2: "#8999a6", side: "#a8b8c8", belly: "#d8e0e8", bellyHi: "#eef2f6", fin: "#c9b6a4", finDark: "#a99482", gill: "#7a8896", blue: "#3a6fb0" }),
};

/** カワムツ:細長く、口が大きい。オリーブ色で、体の横に太い黒っぽい縦の帯。尾は二股。 */
const KAWAMUTSU = {
  id: "kawamutsu",
  name: "カワムツ",
  ...body({ h: 0.11, peak: 0.36, end: 0.8, snout: 0.4 }),
  fins: [dorsal(0.44, 0.56, -0.1, 0.06), anal(0.58, 0.72, 0.08, 0.05), pec(0.2, 0.03, 0.1, 0.03)],
  eye: { u: 0.08, v: -0.02, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.19,
  ...TONES,
  pattern: (i) => (i.region === "body" && Math.abs(i.t - 0.45) < 0.1 && i.u > 0.15 ? "band" : null),
  colors: pal({ outline: "#26301e", back: "#596a46", back2: "#73855d", side: "#8fa38a", belly: "#d9dccb", bellyHi: "#eef0e6", fin: "#c99a6a", finDark: "#a77a4c", gill: "#5f6e4c", band: "#2f3a2a" }),
};

/** ヨシノボリ:小さなハゼ。頭が丸く、茶色にまだら。背びれ 2 つ、尾は丸い。 */
const YOSHINOBORI = {
  ...HAZE,
  id: "yoshinobori",
  name: "ヨシノボリ",
  ...body({ h: 0.11, peak: 0.22, end: 0.8, snout: 0.7, belly: 0.9, tail: "round", tailH: 0.12, stalk: 0.45 }),
  pattern: (i) => (i.region === "body" && (Math.sin(i.u * 40) + Math.sin(i.t * 9 + i.u * 15)) > 1.0 ? "spot" : null),
  colors: pal({ outline: "#2c2418", back: "#6a5a40", back2: "#7c6b4f", side: "#8c7a5c", belly: "#cfc2a6", bellyHi: "#e7ded0", fin: "#a8987c", finDark: "#887758", gill: "#6a5a40", spot: "#3f3324" }),
};

/** カジカ:頭が大きく平たい。暗い茶色にまだら。大きな胸びれ。尾は丸い。 */
const KAJIKA = {
  ...HAZE,
  id: "kajika",
  name: "カジカ",
  ...body({ h: 0.11, peak: 0.18, end: 0.8, snout: 0.75, belly: 0.85, tail: "round", tailH: 0.11, stalk: 0.45 }),
  fins: [dorsal(0.26, 0.4, -0.1, 0.06), dorsal(0.44, 0.74, -0.08, 0.06), anal(0.46, 0.74, 0.08, 0.05), { kind: "fin", poly: [[0.18, 0.02], [0.26, 0.12], [0.36, 0.1], [0.3, 0.03]] }],
  pattern: (i) => (i.region === "body" && (Math.sin(i.u * 30 + 1) + Math.sin(i.t * 8)) > 1.0 ? "spot" : null),
  colors: pal({ outline: "#221c14", back: "#5a4a36", back2: "#6a5a44", side: "#7a6a52", belly: "#bdb19c", bellyHi: "#d9d1c2", fin: "#8f8068", finDark: "#6f604a", gill: "#5a4a36", spot: "#2f271c" }),
};

// ================= 沖 =================

/** タカベ:紡錘形。青緑の背と、背から尾まで黄色い帯。尾は黄色の二股。 */
const TAKABE = {
  id: "takabe",
  name: "タカベ",
  ...body({ h: 0.12, peak: 0.36, end: 0.8, snout: 0.3 }),
  fins: [dorsal(0.36, 0.66, -0.115, 0.05), anal(0.56, 0.72, 0.08, 0.04)],
  eye: { u: 0.08, v: -0.025, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.19,
  ...TONES,
  pattern: (i) => (i.region === "body" && Math.abs(i.t - 0.22) < 0.07 && i.u > 0.1 ? "yellow" : null),
  colors: pal({ outline: "#1c3238", back: "#3e6e72", back2: "#5d8c8a", side: "#a9c0bc", belly: "#dfe7e4", bellyHi: "#f3f6f4", fin: "#d8c46a", finDark: "#b8a44a", gill: "#5d7c7a", yellow: "#e8d050" }),
};

/** イボダイ:平たい円形で、口が小さい。銀灰色で、えらの上に黒い点。尾は二股。 */
const IBODAI = {
  id: "ibodai",
  name: "イボダイ",
  ...body({ h: 0.17, peak: 0.38, end: 0.8, snout: 0.45, stalk: 0.22, tailH: 0.17 }),
  fins: [dorsal(0.36, 0.74, -0.15, 0.05), anal(0.44, 0.74, 0.14, 0.05)],
  eye: { u: 0.1, v: -0.03, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.22,
  ...TONES,
  pattern: (i) => (i.region === "body" && i.u > 0.22 && i.u < 0.27 && i.t > 0.12 && i.t < 0.24 ? "spot" : null),
  colors: pal({ outline: "#262c32", back: "#6d7880", back2: "#8b959c", side: "#c0c8d0", belly: "#e2e6ea", bellyHi: "#f4f6f8", fin: "#a9b2ba", finDark: "#87919a", gill: "#7a858d", spot: "#262c32" }),
};

/** シマアジ:体高のある紡錘形。青緑の背に、体の真ん中に黄色い縦の帯。尾は黄色の二股。 */
const SHIMAAJI = {
  id: "shimaaji",
  name: "シマアジ",
  ...body({ h: 0.14, peak: 0.38, end: 0.8, snout: 0.3 }),
  fins: [dorsal(0.36, 0.72, -0.13, 0.05), anal(0.52, 0.74, 0.1, 0.04), pec(0.22, 0.0, 0.14, 0.03)],
  eye: { u: 0.08, v: -0.03, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.2,
  ...TONES,
  pattern: (i) => (i.region === "body" && Math.abs(i.t - 0.45) < 0.06 && i.u > 0.1 ? "yellow" : null),
  colors: pal({ outline: "#1c3030", back: "#4a7a72", back2: "#6c968c", side: "#b8c8a8", belly: "#e2e8dc", bellyHi: "#f4f6f0", fin: "#d6c060", finDark: "#b2a042", gill: "#5e8078", yellow: "#e6cc48" }),
};

/** ヒメジ:細長く、あごに 2 本のひげ。うす赤色に、横に黄色い線。尾は二股。 */
const HIMEJI = {
  id: "himeji",
  name: "ヒメジ",
  ...body({ h: 0.11, peak: 0.34, end: 0.8, snout: 0.4, belly: 0.9 }),
  fins: [dorsal(0.3, 0.42, -0.105, 0.07), dorsal(0.52, 0.64, -0.09, 0.05), anal(0.54, 0.66, 0.08, 0.04), { kind: "fin", color: "barbel", poly: [[0.02, 0.05], [0.12, 0.13], [0.14, 0.12], [0.05, 0.04]] }],
  eye: { u: 0.1, v: -0.03, size: 2 },
  mouth: { u: 0.0, v: 0.02 },
  gill: 0.21,
  ...TONES,
  pattern: (i) => (i.region === "body" && Math.abs(i.t - 0.42) < 0.05 && i.u > 0.15 ? "yellow" : null),
  colors: pal({ outline: "#4a2418", back: "#c06a50", back2: "#d0826a", side: "#e0a080", belly: "#f3d8c8", bellyHi: "#faece4", fin: "#e8b098", finDark: "#c89078", gill: "#a85a40", yellow: "#f0c850", barbel: "#f3e2c8" }),
};

/** ホウボウ:頭が角ばり、大きな青い胸びれを広げる。赤い体。尾はまっすぐ。 */
const HOUBOU = {
  id: "houbou",
  name: "ホウボウ",
  ...body({ h: 0.11, peak: 0.22, end: 0.8, snout: 0.7, belly: 0.9, tail: "cut", tailH: 0.12, stalk: 0.35 }),
  fins: [dorsal(0.28, 0.4, -0.105, 0.06), dorsal(0.44, 0.74, -0.085, 0.05), anal(0.44, 0.74, 0.08, 0.04), { kind: "fin", color: "blue", poly: [[0.2, 0.02], [0.32, 0.18], [0.5, 0.17], [0.4, 0.05]] }],
  eye: { u: 0.1, v: -0.05, size: 2 },
  mouth: { u: 0.0, v: 0.02 },
  gill: 0.2,
  ...TONES,
  pattern: () => null,
  colors: pal({ outline: "#4a1a14", back: "#a8423a", back2: "#bc5848", side: "#d06a5a", belly: "#f0c8b8", bellyHi: "#f8e2d8", fin: "#d88a78", finDark: "#b86a58", gill: "#8e3a30", blue: "#3a8ad0" }),
};

// ================= 外洋 =================

/** ツムブリ:細長い紡錘形。背は濃い青で、体の横に水色の線が 2 本。黄色い帯。尾は二股。 */
const TSUMUBURI = {
  id: "tsumuburi",
  name: "ツムブリ",
  ...body({ h: 0.1, peak: 0.36, end: 0.8, snout: 0.3, stalk: 0.25 }),
  fins: [dorsal(0.34, 0.48, -0.1, 0.06), dorsal(0.54, 0.7, -0.07, 0.04), anal(0.56, 0.7, 0.065, 0.04)],
  eye: { u: 0.08, v: -0.02, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.19,
  ...TONES,
  pattern: (i) => {
    if (i.region !== "body" || i.u < 0.12) return null;
    if (Math.abs(i.t - 0.3) < 0.05 || Math.abs(i.t - 0.62) < 0.05) return "line";
    if (Math.abs(i.t - 0.46) < 0.05) return "yellow";
    return null;
  },
  colors: pal({ outline: "#142438", back: "#28507a", back2: "#3c6a96", side: "#6a9ac8", belly: "#dce6ee", bellyHi: "#f2f6f8", fin: "#d8c058", finDark: "#b8a040", gill: "#3c5a78", line: "#8cd0f0", yellow: "#e8c848" }),
};

/** アミモンガラ:平たく、口がとがる。灰色に網目の模様。背と腹のびれが後ろ寄り。尾はまっすぐ。 */
const AMIMONGARA = {
  id: "amimongara",
  name: "アミモンガラ",
  ...body({ h: 0.15, peak: 0.42, end: 0.78, snout: 0.3, stalk: 0.3, tail: "cut", tailH: 0.12 }),
  fins: [dorsal(0.22, 0.28, -0.13, 0.07), dorsal(0.5, 0.72, -0.12, 0.06), anal(0.52, 0.72, 0.12, 0.06)],
  eye: { u: 0.17, v: -0.05, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  ...TONES,
  pattern: (i) => (i.region === "body" && ((i.x + i.y) % 4 === 0 || (i.x - i.y + 32) % 4 === 0) ? "net" : null),
  colors: pal({ outline: "#262a30", back: "#6a6f78", back2: "#7c818a", side: "#8a8f9a", belly: "#c8ccd2", bellyHi: "#e2e4e8", fin: "#9aa0a8", finDark: "#7a8088", gill: "#6a6f78", net: "#5a5f68" }),
};

/** ハガツオ:細長いカツオ型で、口に鋭い歯。背に黒い縦の縞が何本も。尾は二股。 */
const HAGATSUO = {
  id: "hagatsuo",
  name: "ハガツオ",
  ...body({ h: 0.1, peak: 0.36, end: 0.8, snout: 0.3, stalk: 0.2, tailH: 0.15 }),
  fins: [dorsal(0.28, 0.5, -0.1, 0.05), anal(0.6, 0.7, 0.065, 0.04)],
  eye: { u: 0.08, v: -0.02, size: 2 },
  mouth: { u: 0.0, v: 0.005 },
  gill: 0.2,
  ...TONES,
  pattern: (i) => (i.region === "body" && i.t < 0.42 && i.u > 0.2 && Math.abs(((i.t * 8) % 1) - 0.5) < 0.15 ? "stripe" : null),
  colors: pal({ outline: "#16243a", back: "#2e4a6e", back2: "#48668a", side: "#7a98b8", belly: "#dfe6ee", bellyHi: "#f3f6f8", fin: "#5a7090", finDark: "#3e5470", gill: "#3a5272", stripe: "#1a2a40" }),
};

/** カイワリ:体高のあるひし形のアジの仲間。銀色で、体の後ろ半分に小さなとげのウロコ。尾は黄色の二股。 */
const KAIWARI = {
  id: "kaiwari",
  name: "カイワリ",
  ...body({ h: 0.18, peak: 0.4, end: 0.8, snout: 0.25, stalk: 0.2, tailH: 0.17 }),
  fins: [dorsal(0.36, 0.72, -0.16, 0.05), anal(0.5, 0.74, 0.15, 0.05), pec(0.22, 0.0, 0.16, 0.03)],
  eye: { u: 0.09, v: -0.04, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.21,
  ...TONES,
  pattern: (i) => (i.region === "body" && i.u > 0.55 && Math.abs(i.t - 0.5) < 0.06 ? "scute" : null),
  colors: pal({ outline: "#262c30", back: "#6c7880", back2: "#8c98a0", side: "#c8d0d8", belly: "#e6eaee", bellyHi: "#f6f8fa", fin: "#d8c868", finDark: "#b8a848", gill: "#7c868e", scute: "#9aa4ac" }),
};

/** マンボウ:丸く平たい体で、尾がなく、背びれとしりびれが高い。灰色。 */
const MANBOU = {
  id: "manbou",
  name: "マンボウ",
  top: [[0, -0.04], [0.05, -0.12], [0.15, -0.2], [0.3, -0.24], [0.45, -0.24], [0.6, -0.21], [0.7, -0.17], [0.76, -0.12]],
  bot: [[0, 0.04], [0.05, 0.12], [0.15, 0.2], [0.3, 0.24], [0.45, 0.24], [0.6, 0.21], [0.7, 0.17], [0.76, 0.12]],
  bodyEnd: 0.76,
  tail: [[0.74, -0.14], [0.82, -0.12], [0.84, 0], [0.82, 0.12], [0.74, 0.14]],
  fins: [{ kind: "fin", poly: [[0.55, -0.2], [0.6, -0.42], [0.7, -0.4], [0.72, -0.16]] }, { kind: "fin", poly: [[0.55, 0.2], [0.6, 0.42], [0.7, 0.4], [0.72, 0.16]] }, pec(0.28, -0.02, 0.06, 0.05)],
  eye: { u: 0.15, v: -0.04, size: 2 },
  mouth: { u: 0.0, v: 0.0 },
  gill: 0.26,
  flatTail: true,
  scale: 24,
  cx: 4,
  vScale: 1.0,
  ...TONES,
  toneCuts: [0.2, 0.38, 0.62, 0.84],
  pattern: (i) => (i.region === "body" && (Math.sin(i.u * 50) * Math.sin(i.t * 20)) > 0.8 ? "spot" : null),
  colors: pal({ outline: "#2a3036", back: "#6a747e", back2: "#86909a", side: "#a8b0b8", belly: "#d4d8dc", bellyHi: "#e8eaec", fin: "#7e8892", finDark: "#626c76", gill: "#6a747e", spot: "#c2c8ce" }),
};

// ================= 深海 =================

/** ゲンゲ:細長く、うなぎのような体。ぶよぶよのうす桃色。背びれとしりびれが尾までつながる。 */
const GENGE = {
  id: "genge",
  name: "ゲンゲ",
  ...body({ h: 0.075, peak: 0.25, end: 0.92, snout: 0.6, belly: 0.95, tail: "none", stalk: 0.25 }),
  fins: [{ kind: "fin", poly: [[0.25, -0.07], [0.3, -0.1], [0.9, -0.04], [1.0, 0.0], [0.9, -0.01]] }, { kind: "fin", poly: [[0.45, 0.07], [0.5, 0.1], [0.9, 0.04], [1.0, 0.0], [0.9, 0.01]] }],
  eye: { u: 0.08, v: -0.03, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.15,
  ...TONES,
  pattern: () => null,
  colors: pal({ outline: "#4a2e36", back: "#9e7c88", back2: "#b494a0", side: "#c8b0b8", belly: "#e6d8de", bellyHi: "#f4ecf0", fin: "#c0a0ac", finDark: "#a0808c", gill: "#8e6c78" }),
};

/** デメニギス:頭が透けて、緑の筒の目が上を向く。暗い茶色の体。尾は小さな二股。 */
const DEMENIGISU = {
  id: "demenigisu",
  name: "デメニギス",
  ...body({ h: 0.12, peak: 0.3, end: 0.8, snout: 0.5, stalk: 0.3 }),
  fins: [dorsal(0.5, 0.6, -0.1, 0.05), anal(0.6, 0.72, 0.08, 0.04), { kind: "fin", color: "clear", poly: [[0.05, -0.12], [0.08, -0.2], [0.28, -0.2], [0.3, -0.12]] }],
  eye: { u: 0.16, v: -0.13, size: 2 },
  mouth: { u: 0.0, v: 0.0 },
  gill: 0.3,
  ...TONES,
  pattern: (i) => (i.region === "body" && i.u > 0.12 && i.u < 0.2 && i.t < 0.4 ? "green" : null),
  colors: pal({ outline: "#141a1e", back: "#2c343c", back2: "#3a444e", side: "#4a5a6a", belly: "#6a7a8a", bellyHi: "#8a98a6", fin: "#4a5560", finDark: "#343e48", gill: "#2c343c", green: "#5ce08a", clear: "#a8e0e8" }),
};

/** オニキンメ:頭が大きく、口に長いきば。黒っぽい茶色で、鱗がごつごつ。尾は二股。 */
const ONIKINME = {
  id: "onikinme",
  name: "オニキンメ",
  ...body({ h: 0.14, peak: 0.22, end: 0.78, snout: 0.8, belly: 1.05, stalk: 0.3 }),
  fins: [dorsal(0.4, 0.62, -0.1, 0.05), anal(0.5, 0.66, 0.1, 0.04), { kind: "fin", color: "fang", poly: [[0.02, 0.0], [0.04, 0.1], [0.06, 0.0]] }, { kind: "fin", color: "fang", poly: [[0.08, 0.02], [0.1, 0.1], [0.12, 0.02]] }],
  eye: { u: 0.15, v: -0.06, size: 1 },
  mouth: { u: 0.0, v: 0.02 },
  gill: 0.26,
  ...TONES,
  pattern: (i) => (i.region === "body" && (i.x * 3 + i.y * 2) % 7 === 0 ? "rough" : null),
  colors: pal({ outline: "#1a0e0e", back: "#3a2424", back2: "#4a2e2e", side: "#5a3a3a", belly: "#7a5656", bellyHi: "#946e6e", fin: "#4e3434", finDark: "#3a2424", gill: "#2e1c1c", rough: "#6e4a4a", fang: "#f0ece0" }),
};

/** ホテイエソ:細長く黒い体に、光る点の列。あごの下に長いひげ。尾は小さい。 */
const HOTEIESO = {
  id: "hoteieso",
  name: "ホテイエソ",
  ...body({ h: 0.075, peak: 0.3, end: 0.84, snout: 0.6, stalk: 0.4, tailH: 0.08 }),
  fins: [dorsal(0.72, 0.8, -0.065, 0.05), anal(0.72, 0.8, 0.06, 0.04), { kind: "fin", color: "barbel", poly: [[0.08, 0.06], [0.1, 0.2], [0.13, 0.22], [0.11, 0.06]] }],
  eye: { u: 0.08, v: -0.02, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  ...TONES,
  pattern: (i) => (i.region === "body" && Math.abs(i.t - 0.78) < 0.08 && i.x % 2 === 0 ? "glow" : null),
  colors: pal({ outline: "#06080c", back: "#141c26", back2: "#1c2632", side: "#2a3a4a", belly: "#3a4a5a", bellyHi: "#4a5a6a", fin: "#1c2632", finDark: "#141c26", gill: "#141c26", glow: "#7ae0ff", barbel: "#9ae8ff" }),
};

/** ヨコエソ:小さく細い。黒い体に、腹に沿って光る点が 2 列。尾は二股。 */
const YOKOESO = {
  id: "yokoeso",
  name: "ヨコエソ",
  ...body({ h: 0.08, peak: 0.34, end: 0.8, snout: 0.4, stalk: 0.3 }),
  fins: [dorsal(0.42, 0.52, -0.075, 0.05), anal(0.5, 0.66, 0.065, 0.04)],
  eye: { u: 0.08, v: -0.02, size: 2 },
  mouth: { u: 0.0, v: 0.01 },
  gill: 0.18,
  ...TONES,
  pattern: (i) => (i.region === "body" && (Math.abs(i.t - 0.72) < 0.05 || Math.abs(i.t - 0.88) < 0.05) && i.x % 2 === 0 ? "glow" : null),
  colors: pal({ outline: "#0a0e14", back: "#1e2836", back2: "#2a3646", side: "#3a4a5a", belly: "#4a5a6a", bellyHi: "#5a6a7a", fin: "#2a3646", finDark: "#1e2836", gill: "#1e2836", glow: "#9cf0d8" }),
};

/** 釣り場ごとの、足した弱い魚(D-406)。 */
export const EXTRA_FISH = Object.freeze({
  minato: [HAZE, SAPPA, BORA, MEGOCHI, UMITANAGO],
  iso: [SUZUMEDAI, NENBUTSUDAI, KUSAFUGU, HAOKOZE, TAKANOHADAI],
  kawa: [MOTSUGO, TANAGO, KAWAMUTSU, YOSHINOBORI, KAJIKA],
  oki: [TAKABE, IBODAI, SHIMAAJI, HIMEJI, HOUBOU],
  gaiyou: [TSUMUBURI, AMIMONGARA, HAGATSUO, KAIWARI, MANBOU],
  shinkai: [GENGE, DEMENIGISU, ONIKINME, HOTEIESO, YOKOESO],
});
