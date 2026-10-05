// 保存の形式(D-065・D-104・D-117)。ブラウザに保存するのは UI の役目で、ここは形の変換と点検だけを行う。
// 版 3 の形:
//   { version: 3, progress: { coins, scales: { 魚の id: 数 }, rod: { stage, step }, seen: [魚の id, ...] } }
// 古い版は、版ごとの小さな関数(MIGRATIONS)で 1 つずつ新しい版に読み替える。版を足すときは、
// SAVE_VERSION を上げ、「前の版 → 新しい版」の関数を 1 つ足す。
// 魚や段階が増えても形は変わらない(鱗は魚の id をキーにした表)。表にない魚の鱗や id は、
// 消さずに持ち続ける(画面では使わない)。

import { DEFAULT_CONTENT } from "./fish.js";
import { COUNT_MAX, ROD_STEPS } from "./rod.js";

export const SAVE_VERSION = 3;
export const SAVE_KEY = "fish:save";

// 鱗の表の大きさの上限(壊れたデータで大きくなりすぎないように)。
const MAX_SCALE_KINDS = 1000;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** 初めて遊ぶときの進み具合。 */
export function initialProgress() {
  return { coins: 0, scales: {}, rodStage: 1, rodStep: ROD_STEPS.NONE, seen: [] };
}

/** 進み具合を、保存する形(版 3)にする。 */
export function toSaveData(progress) {
  return {
    version: SAVE_VERSION,
    progress: {
      coins: progress.coins,
      scales: { ...progress.scales },
      rod: { stage: progress.rodStage, step: progress.rodStep },
      seen: [...progress.seen],
    },
  };
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= COUNT_MAX;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * 版ごとの読み替え。キーは「元の版」、値は「1 つ新しい版の形」を返す関数。
 * 形がおかしくて読み替えられないときは null を返す。
 */
export const MIGRATIONS = Object.freeze({
  // 版 1 → 版 2:進み具合を progress の下に入れる。
  1: (data) => {
    const { coins, material, rodStage, seen } = data;
    return { version: 2, progress: { coins, material, rodStage, seen } };
  },
  // 版 2 → 版 3:前の素材は、同じ数のウロコインに換えて足す(損をしないように)。
  // 竿の段階 n は、段階 n の「未製作」にする。鱗は 0 から。
  2: (data) => {
    if (!isPlainObject(data.progress)) return null;
    const { coins, material, rodStage, seen } = data.progress;
    if (!isCount(coins) || !isCount(material)) return null;
    return {
      version: 3,
      progress: {
        coins: Math.min(COUNT_MAX, coins + material),
        scales: {},
        rod: { stage: rodStage, step: ROD_STEPS.NONE },
        seen,
      },
    };
  },
});

/** 古い版を、今の版の形まで順に読み替える。知らない版や読み替えられないときは null。 */
export function migrate(data) {
  let current = data;
  while (isPlainObject(current) && current.version !== SAVE_VERSION) {
    const step = MIGRATIONS[current.version];
    if (!step) return null;
    current = step(current);
  }
  return isPlainObject(current) ? current : null;
}

function readScales(scales) {
  if (!isPlainObject(scales)) return null;
  const entries = Object.entries(scales);
  if (entries.length > MAX_SCALE_KINDS) return null;
  for (const [id, n] of entries) {
    if (!ID_PATTERN.test(id) || !isCount(n)) return null;
  }
  return Object.fromEntries(entries);
}

/**
 * 保存の形(オブジェクト)を点検して、進み具合を取り出す。
 * 成功:{ ok: true, progress }。失敗:{ ok: false, error: "version" | "content" }。
 */
export function readSaveData(data, content = DEFAULT_CONTENT) {
  if (!isPlainObject(data)) return { ok: false, error: "content" };
  const known = MIGRATIONS[data.version] || data.version === SAVE_VERSION;
  if (!known) return { ok: false, error: "version" };
  const current = migrate(data);
  if (!current || !isPlainObject(current.progress)) return { ok: false, error: "content" };
  const { coins, scales, rod, seen } = current.progress;
  if (!isCount(coins)) return { ok: false, error: "content" };
  const ownScales = readScales(scales);
  if (!ownScales) return { ok: false, error: "content" };
  if (!isPlainObject(rod)) return { ok: false, error: "content" };
  const { stage, step } = rod;
  if (!Number.isSafeInteger(stage) || stage < 1 || stage > content.maxStage) return { ok: false, error: "content" };
  if (!Object.values(ROD_STEPS).includes(step)) return { ok: false, error: "content" };
  // 「進化済み」は、表の最後の段階でだけありうる。
  if (step === ROD_STEPS.EVOLVED && stage !== content.maxStage) return { ok: false, error: "content" };
  if (!Array.isArray(seen) || !seen.every((id) => typeof id === "string" && ID_PATTERN.test(id))) {
    return { ok: false, error: "content" };
  }
  return {
    ok: true,
    progress: { coins, scales: ownScales, rodStage: stage, rodStep: step, seen: [...new Set(seen)] },
  };
}

/**
 * ブラウザに保存された文字列を読む。壊れている・形がちがう・版がちがうときは、初めの状態を返す。
 * エラーは投げない。
 */
export function parseSave(text, content = DEFAULT_CONTENT) {
  if (typeof text !== "string" || text === "") return initialProgress();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return initialProgress();
  }
  const result = readSaveData(data, content);
  return result.ok ? result.progress : initialProgress();
}
