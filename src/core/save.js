// 保存の形式(D-065)。ブラウザに保存するのは UI の役目で、ここは形の変換と点検だけを行う。
// 版 2 の形:{ version: 2, progress: { coins, material, rodStage, seen: [魚の id, ...] } }
// ②-3 の装備は、progress と並べて足す。
// 版 1 の形:{ version: 1, coins, material, rodStage, seen }(読み込むときに版 2 に読み替える)

import { fishById } from "./fish.js";

export const SAVE_VERSION = 2;
export const SAVE_KEY = "fish:save";

/** 初めて遊ぶときの進み具合。 */
export function initialProgress() {
  return { coins: 0, material: 0, rodStage: 1, seen: [] };
}

/** 進み具合を、保存する形(版 2)にする。 */
export function toSaveData(progress) {
  return {
    version: SAVE_VERSION,
    progress: {
      coins: progress.coins,
      material: progress.material,
      rodStage: progress.rodStage,
      seen: [...progress.seen],
    },
  };
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** 古い版を、版 2 の形に読み替える。知らない版なら null。 */
function migrate(data) {
  if (data.version === 2) return data;
  if (data.version === 1) {
    const { coins, material, rodStage, seen } = data;
    return { version: 2, progress: { coins, material, rodStage, seen } };
  }
  return null;
}

/**
 * 保存の形(オブジェクト)を点検して、進み具合を取り出す。
 * 成功:{ ok: true, progress }。失敗:{ ok: false, error: "version" | "content" }。
 */
export function readSaveData(data, rodConfig) {
  if (!isPlainObject(data)) return { ok: false, error: "content" };
  const current = migrate(data);
  if (!current) return { ok: false, error: "version" };
  if (!isPlainObject(current.progress)) return { ok: false, error: "content" };
  const { coins, material, rodStage, seen } = current.progress;
  if (!isCount(coins) || !isCount(material)) return { ok: false, error: "content" };
  if (!Number.isSafeInteger(rodStage) || rodStage < 1 || rodStage > rodConfig.maxStage) {
    return { ok: false, error: "content" };
  }
  if (!Array.isArray(seen) || !seen.every((id) => typeof id === "string")) return { ok: false, error: "content" };
  // 知らない魚の id(将来消した魚など)は捨て、重なりも除く。
  const known = [...new Set(seen.filter((id) => fishById(id)))];
  return { ok: true, progress: { coins, material, rodStage, seen: known } };
}

/**
 * ブラウザに保存された文字列を読む。壊れている・形がちがう・版がちがうときは、初めの状態を返す。
 * エラーは投げない。
 */
export function parseSave(text, rodConfig) {
  if (typeof text !== "string" || text === "") return initialProgress();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return initialProgress();
  }
  const result = readSaveData(data, rodConfig);
  return result.ok ? result.progress : initialProgress();
}
