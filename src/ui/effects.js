// 手応えの演出(D-042・D-051・D-092・D-401)。見た目だけで、計算本体の結果には触れない。
// 時刻 now(ミリ秒)を受け取り、演出ごとの残り時間で描く。
// 部品:光(flash:画面全体の色)・揺れ(shake)・浮かぶ文字(floats:黒い影つき、出た瞬間に少し大きい)・帯(banner:ドット絵の箱)・
// 粒(particles:四角のドットが飛び散る。クリティカル・釣り上げ・ジャスト・討伐)。粒の向きは決まった並びで、乱数は使わない。

import { scaleName } from "../core/fish.js";
import { formatCount } from "./format.js";
import { PX_COLORS, pxBox, pxText } from "./px_draw.js";

const FLASH_MS = 350;
const SHAKE_MS = 300;
const FLOAT_MS = 1100;
const BANNER_MS = 1600;
/** 浮かぶ文字が出た瞬間に大きく見える時間(そのあと元の大きさに)。 */
const POP_MS = 140;

export function createEffects() {
  return { flash: null, shake: null, floats: [], banner: null, particles: [] };
}

/**
 * 粒を飛び散らせる。中心 (x, y) は画面の幅・高さに対する割合、dy は画素のずれ。
 * count 個を等しい角度に並べ(少しずつ回す)、speed(画素/秒)で飛ばす。色は colors を順に。
 * @param {any} effects @param {number} x @param {number} y @param {number} now
 * @param {{ count: number, colors: string[], speed: number, size?: number, ms?: number, dy?: number, gravity?: number, spin?: number }} o
 */
export function addBurst(effects, x, y, now, o) {
  const ms = o.ms ?? 700;
  for (let i = 0; i < o.count; i++) {
    const a = (i / o.count) * Math.PI * 2 + (o.spin ?? 0) + (i % 2) * 0.35;
    const v = o.speed * (0.7 + 0.3 * ((i * 7) % 5) / 4);
    effects.particles.push({
      x,
      y,
      dy: o.dy ?? 0,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      gravity: o.gravity ?? 0,
      size: o.size ?? 6,
      color: o.colors[i % o.colors.length],
      start: now + (i % 3) * 20,
      ms,
    });
  }
}

/** 戦いの魚の位置(draw.js の target と同じ:幅の 0.4、水面 + 高さの 0.08 + 60px)。 */
const FIGHT_FISH = Object.freeze({ x: 0.4, y: 0.5, dy: 60 });
/** 釣れたあとの大きな魚の位置(幅の 0.5、高さの 0.55)。 */
const CAUGHT_FISH = Object.freeze({ x: 0.5, y: 0.55, dy: 0 });

/** 魚の結果が出たときの演出を足す。 */
export function addResultEffects(effects, result, now, content = undefined) {
  const caught = result.outcome === "caught";
  if (result.firstCatch) {
    effects.flash = { color: "255,209,102", start: now, ms: FLASH_MS * 2 };
    effects.banner = { text: "はじめて!", start: now, ms: BANNER_MS, color: PX_COLORS.gold };
    // 金の粒を大きく散らす(初めての魚)。
    addBurst(effects, CAUGHT_FISH.x, CAUGHT_FISH.y, now, { count: 18, colors: [PX_COLORS.gold, PX_COLORS.goldHi, PX_COLORS.white], speed: 240, size: 7, ms: 900, gravity: 160 });
  } else {
    effects.flash = { color: caught ? "82,183,136" : "230,57,70", start: now, ms: FLASH_MS };
  }
  if (!caught) {
    effects.shake = { start: now, ms: SHAKE_MS };
    return;
  }
  // 釣り上げ:魚のまわりに水しぶき(白と水色の粒)。
  addBurst(effects, CAUGHT_FISH.x, CAUGHT_FISH.y, now, { count: 10, colors: [PX_COLORS.white, "#a9dcef"], speed: 170, size: 5, ms: 600, gravity: 300, spin: 0.2 });
  const lines = [];
  // 初撃で釣り上げたときは「一撃!」(D-256)。
  if (result.reason === "strike") effects.floats.push({ text: "一撃!", start: now, ms: 1100, y: 0.22, size: 36, color: PX_COLORS.gold });
  // 弱い魚のジャストは、ウロコインの倍率の印を付ける(例:「+12 ウロコイン ×1.5」:D-258)。
  const just = result.justCoinRate ? ` ×${result.justCoinRate}` : "";
  if (result.reward.coins > 0) lines.push(`+${formatCount(result.reward.coins)} ウロコイン${just}`);
  if (result.reward.scales > 0) lines.push(`+${formatCount(result.reward.scales)} ${scaleName(result.fishId, content)}`);
  // 報酬の文字は空のあたりに出す(ダメージや「CRITICAL!」と重ならないように。帯の下)。
  lines.forEach((text, i) => effects.floats.push({ text, start: now + i * 120, ms: FLOAT_MS, y: 0.36 + i * 0.05 }));
}

/**
 * 合わせたときの演出(D-082・D-092)。成功は「合わせ!」、ジャストは金色の「ジャスト!」と輪の粒。
 * 強い魚のジャストの初撃(strike:D-256)は、通常の命中より大きな数字と、大きめの光と揺れ。
 * 早すぎは結果の文(「早すぎ…」)だけで、ここでは何もしない。
 */
export function addHookEffects(effects, grade, now, strike = null) {
  if (grade === "just") {
    effects.flash = { color: "255,209,102", start: now, ms: 320, strength: strike ? 0.55 : 0.4 };
    effects.shake = { start: now, ms: strike ? 320 : 160, amplitude: strike ? 12 : 5 };
    effects.floats.push({ text: "ジャスト!", start: now, ms: 900, y: 0.3, size: strike ? 34 : 28, color: PX_COLORS.gold });
    // 浮きのまわりに金の粒(浮きは幅の 0.4、水面 + 高さの 0.08)。
    addBurst(effects, 0.4, 0.5, now, { count: 12, colors: [PX_COLORS.gold, PX_COLORS.goldHi], speed: 200, size: 6, ms: 600 });
    if (strike) effects.floats.push({ text: `-${formatCount(strike.damage)}`, start: now, ms: 1000, y: 0.58, size: STRIKE_SIZE, color: strike.defended ? DEFENDED_COLOR : PX_COLORS.gold });
    return;
  }
  if (grade === "good") {
    effects.flash = { color: "255,255,255", start: now, ms: 200, strength: 0.25 };
    effects.floats.push({ text: "合わせ!", start: now, ms: 700, y: 0.3, size: 20, color: PX_COLORS.white });
  }
}

/**
 * ミニゲームで命中したときの演出(D-092)。魚の近くにダメージの数字を浮かべる。
 * クリティカルは、大きなオレンジの数字と「CRITICAL!」、大きめの揺れ、オレンジの粒。
 * 追加クリティカル(2 段以上:D-169)は「CRITICAL ×2!」のように段数を出し、段数が多いほど少し大きく揺らし、粒も増やす。
 */
export function critLabel(stages) {
  return stages >= 2 ? `CRITICAL ×${stages}!` : "CRITICAL!";
}

/** 命中した帯の短い名前と色(芯・縁のスキルが効いたときだけ:D-209)。 */
export function bandLabel(hit) {
  if (hit.band === "core" && (hit.triggers ?? []).includes("core")) return { text: "芯", color: "#52d68a" };
  if (hit.band === "edge" && (hit.triggers ?? []).includes("edge")) return { text: "縁", color: "#e9c46a" };
  return null;
}

export function addHitEffects(effects, hit, now) {
  // 連撃加速で段数が追加で上がった(グローブ:D-340)。
  if (hit.accel) effects.floats.push({ text: "加速", start: now, ms: 600, y: 0.44, size: 20, color: PX_COLORS.info });
  // 防御:実効防御 100% 以上は「-1 防御」(貫通が足りない)。防御で減った命中は、数字を灰色がかった青にする(D-235)。
  if (hit.effDefense >= 1) {
    effects.shake = { start: now, ms: 120, amplitude: 2 };
    effects.floats.push({ text: "-1 防御", start: now, ms: 700, y: 0.58, size: 26, color: DEFENDED_COLOR });
    return;
  }
  const band = bandLabel(hit);
  if (band) effects.floats.push({ text: band.text, start: now, ms: 700, y: 0.44, size: 24, color: band.color });
  // 条件発動型が効いた命中は、数字の色を変える(ふつうは水色で少し大きく、クリティカルは少し明るいオレンジ:D-191)。
  const triggered = (hit.triggers ?? []).length > 0;
  if (hit.critical) {
    const stages = hit.critStages ?? 1;
    const extra = Math.min(3, stages - 1);
    effects.shake = { start: now, ms: 260 + 60 * extra, amplitude: 9 + 2 * extra };
    effects.flash = { color: "255,140,0", start: now, ms: 220, strength: 0.25 + 0.05 * extra };
    effects.floats.push({ text: critLabel(stages), start: now, ms: 800, y: 0.5, size: 22 + 2 * extra, color: PX_COLORS.gold });
    effects.floats.push({ text: `-${hit.damage}`, start: now, ms: 800, y: 0.58, size: 34 + 2 * extra, color: hit.defended ? DEFENDED_COLOR : band ? band.color : triggered ? "#ffb347" : "#ff8c00" });
    addBurst(effects, FIGHT_FISH.x, FIGHT_FISH.y, now, { count: 10 + 4 * extra, colors: ["#ff8c00", PX_COLORS.gold, PX_COLORS.goldHi], speed: 220 + 40 * extra, size: 6, ms: 650, dy: FIGHT_FISH.dy, spin: stages });
    return;
  }
  effects.shake = { start: now, ms: 150, amplitude: 4 };
  effects.floats.push({ text: `-${hit.damage}`, start: now, ms: 650, y: 0.58, size: triggered ? 28 : 24, color: hit.defended ? DEFENDED_COLOR : band ? band.color : triggered ? PX_COLORS.info : PX_COLORS.gold });
  // ふつうの命中も、小さな粒を少し。
  addBurst(effects, FIGHT_FISH.x, FIGHT_FISH.y, now, { count: 6, colors: [PX_COLORS.white, "#a9dcef"], speed: 160, size: 5, ms: 450, dy: FIGHT_FISH.dy, spin: (hit.combo ?? 0) * 0.7 });
}

/** 初撃の数字の大きさ(通常の命中 24、クリティカル 34 より大きい:D-256)。 */
export const STRIKE_SIZE = 44;

/** 防御で減ったダメージの数字の色(灰色がかった青)。 */
export const DEFENDED_COLOR = "#9fb7d9";

/**
 * ミニゲームでミスしたときの演出。回復した数を別の色で出す。
 * グローブ(D-334):保険で無効にしたミスは「保険」だけ。連撃の維持で段数が残ったら「維持 ×n」。
 */
export function addMissEffects(effects, miss, now) {
  if (miss.insured) {
    effects.floats.push({ text: "保険", start: now, ms: 650, y: 0.5, size: 22, color: PX_COLORS.info });
    return;
  }
  effects.flash = { color: "230,57,70", start: now, ms: 200, strength: 0.2 };
  effects.floats.push({ text: `+${miss.heal}`, start: now, ms: 650, y: 0.58, size: 24, color: PX_COLORS.redHi });
  if (miss.comboKept >= 2) effects.floats.push({ text: `維持 ×${miss.comboKept}`, start: now, ms: 650, y: 0.5, size: 20, color: PX_COLORS.gold });
}

/** かすり(グローブ:D-334)。小さな「かすり」と、ダメージの数字(防御で減ったら灰色がかった青)。 */
export function addGrazeEffects(effects, graze, now) {
  effects.floats.push({ text: "かすり", start: now, ms: 600, y: 0.5, size: 20, color: "#a9d6e5" });
  effects.floats.push({ text: `-${graze.damage}`, start: now, ms: 600, y: 0.58, size: 20, color: graze.defended ? DEFENDED_COLOR : "#a9d6e5" });
}

/** 短い知らせの文字(仕切り直し・自動合わせなど)。 @param {string} text */
export function addNoteEffects(effects, text, now) {
  effects.floats.push({ text, start: now, ms: 800, y: 0.3, size: 22, color: PX_COLORS.info });
}

/** 竿を製作・進化したときの演出を足す(text は帯に出す文)。 */
export function addRodEffects(effects, text, now) {
  effects.flash = { color: "255,209,102", start: now, ms: FLASH_MS };
  effects.banner = { text, start: now, ms: BANNER_MS, color: PX_COLORS.gold };
  addBurst(effects, 0.5, 0.3, now, { count: 14, colors: [PX_COLORS.gold, PX_COLORS.goldHi, PX_COLORS.white], speed: 220, size: 6, ms: 800, gravity: 200 });
}

function progressOf(item, now) {
  if (!item) return null;
  const p = (now - item.start) / item.ms;
  return p >= 0 && p < 1 ? p : null;
}

/** 揺れの横のずれ(ピクセル)。揺れていないときは 0。 */
export function shakeOffset(effects, now) {
  const p = progressOf(effects.shake, now);
  if (p === null) return 0;
  return Math.sin(p * Math.PI * 8) * (effects.shake.amplitude ?? 10) * (1 - p);
}

/** 浮かぶ文字の大きさの倍率:出た瞬間は 1.5 倍で、すぐ元に戻る(手応え)。 */
function popScale(elapsedMs) {
  if (elapsedMs >= POP_MS) return 1;
  const t = elapsedMs / POP_MS;
  return 1.5 - 0.5 * t;
}

export function drawEffects(ctx, w, h, effects, now) {
  const flash = progressOf(effects.flash, now);
  if (flash !== null) {
    ctx.fillStyle = `rgba(${effects.flash.color},${(effects.flash.strength ?? 0.45) * (1 - flash)})`;
    ctx.fillRect(0, 0, w, h);
  }

  // 粒:直線に飛び、重さがあれば落ちる。終わりに近づくと小さくなる。
  effects.particles = effects.particles.filter((q) => now - q.start < q.ms);
  for (const q of effects.particles) {
    const t = (now - q.start) / 1000;
    if (t < 0) continue;
    const p = t * 1000 / q.ms;
    const x = w * q.x + q.vx * t;
    const y = h * q.y + q.dy + q.vy * t + 0.5 * q.gravity * t * t;
    const s = Math.max(1, Math.round(q.size * (1 - p * 0.6)));
    ctx.fillStyle = PX_COLORS.ink;
    ctx.fillRect(Math.round(x) - 1, Math.round(y) - 1, s + 2, s + 2);
    ctx.fillStyle = q.color;
    ctx.fillRect(Math.round(x), Math.round(y), s, s);
  }

  effects.floats = effects.floats.filter((f) => now - f.start < f.ms);
  effects.floats.forEach((f, i) => {
    const p = progressOf(f, now);
    if (p === null) return;
    ctx.globalAlpha = p < 0.7 ? 1 : (1 - p) / 0.3;
    const size = Math.round((f.size ?? 22) * popScale(now - f.start));
    const y = f.y === undefined ? h * 0.42 + i * 28 : h * f.y;
    pxText(ctx, f.text, Math.round(w / 2), Math.round(y - p * 60), { color: f.color ?? PX_COLORS.gold, font: `bold ${size}px system-ui, sans-serif` });
    ctx.globalAlpha = 1;
  });

  // 帯:ドット絵の箱に、大きな文字。出るときは右から少し滑り、消えるときは薄くなる。
  const banner = progressOf(effects.banner, now);
  if (banner !== null) {
    const alpha = banner < 0.8 ? 1 : (1 - banner) / 0.2;
    const slide = banner < 0.1 ? (1 - banner / 0.1) * 24 : 0;
    ctx.globalAlpha = alpha;
    const by = Math.round(h * 0.25);
    pxBox(ctx, -4 + slide, by, w + 8, 56, { fill: "rgba(42, 22, 8, 0.88)", hi: "rgba(255, 244, 220, 0.14)", lo: "rgba(0, 0, 0, 0.3)" });
    ctx.font = "bold 28px system-ui, sans-serif";
    // 長い文(竿の名前など)は、画面の幅に収まるように小さくする。
    const font = ctx.measureText(effects.banner.text).width > w - 32 ? "bold 20px system-ui, sans-serif" : "bold 28px system-ui, sans-serif";
    pxText(ctx, effects.banner.text, Math.round(w / 2 + slide), by + 38, { color: effects.banner.color ?? PX_COLORS.gold, font });
    ctx.globalAlpha = 1;
  }
}
