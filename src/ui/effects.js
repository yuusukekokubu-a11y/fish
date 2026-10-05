// 手応えの演出(D-042・D-051)。見た目だけで、計算本体の結果には触れない。
// 時刻 now(ミリ秒)を受け取り、演出ごとの残り時間で描く。

const FLASH_MS = 350;
const SHAKE_MS = 300;
const FLOAT_MS = 1100;
const BANNER_MS = 1600;

export function createEffects() {
  return { flash: null, shake: null, floats: [], banner: null };
}

/** 魚の結果が出たときの演出を足す。 */
export function addResultEffects(effects, result, now) {
  const caught = result.outcome === "caught";
  if (result.firstCatch) {
    effects.flash = { color: "255,209,102", start: now, ms: FLASH_MS * 2 };
    effects.banner = { text: "はじめて!", start: now, ms: BANNER_MS };
  } else {
    effects.flash = { color: caught ? "82,183,136" : "230,57,70", start: now, ms: FLASH_MS };
  }
  if (!caught) {
    effects.shake = { start: now, ms: SHAKE_MS };
    return;
  }
  const lines = [];
  if (result.reward.coins > 0) lines.push(`+${result.reward.coins} ウロコイン`);
  if (result.reward.material > 0) lines.push(`+${result.reward.material} 素材`);
  lines.forEach((text, i) => effects.floats.push({ text, start: now + i * 120, ms: FLOAT_MS }));
}

/** 竿を強化したときの演出を足す。 */
export function addUpgradeEffects(effects, rodStage, now) {
  effects.flash = { color: "255,209,102", start: now, ms: FLASH_MS };
  effects.banner = { text: `竿が段階${rodStage}に!`, start: now, ms: BANNER_MS };
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
  return Math.sin(p * Math.PI * 8) * 10 * (1 - p);
}

/** 光・浮かぶ文字・帯を描く。 */
export function drawEffects(ctx, w, h, effects, now) {
  const flash = progressOf(effects.flash, now);
  if (flash !== null) {
    ctx.fillStyle = `rgba(${effects.flash.color},${0.45 * (1 - flash)})`;
    ctx.fillRect(0, 0, w, h);
  }

  effects.floats = effects.floats.filter((f) => now - f.start < f.ms);
  ctx.textAlign = "center";
  effects.floats.forEach((f, i) => {
    const p = progressOf(f, now);
    if (p === null) return;
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 22px system-ui, sans-serif";
    ctx.fillText(f.text, w / 2, h * 0.42 + i * 28 - p * 60);
    ctx.globalAlpha = 1;
  });

  const banner = progressOf(effects.banner, now);
  if (banner !== null) {
    const alpha = banner < 0.8 ? 1 : (1 - banner) / 0.2;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, h * 0.24, w, 48);
    ctx.fillStyle = "#ffd166";
    ctx.font = "bold 26px system-ui, sans-serif";
    ctx.fillText(effects.banner.text, w / 2, h * 0.24 + 33);
    ctx.globalAlpha = 1;
  }
}
