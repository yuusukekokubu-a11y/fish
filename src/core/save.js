// 保存の形式(D-050)。ブラウザに保存するのは UI の役目で、ここは形の変換と点検だけを行う。
// 形:{ version: 1, coins, material, rodStage, seen: [魚の id, ...] }

import { fishById } from "./fish.js";

export const SAVE_VERSION = 1;
export const SAVE_KEY = "fish:save";

/** 初めて遊ぶときの進み具合。 */
export function initialProgress() {
  return { coins: 0, material: 0, rodStage: 1, seen: [] };
}

/** 進み具合を、保存する形にする。 */
export function toSaveData(progress) {
  return {
    version: SAVE_VERSION,
    coins: progress.coins,
    material: progress.material,
    rodStage: progress.rodStage,
    seen: [...progress.seen],
  };
}

function isCount(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * 保存された文字列を読む。壊れている・形がちがう・版がちがうときは、初めの状態を返す。
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
  if (data === null || typeof data !== "object" || data.version !== SAVE_VERSION) return initialProgress();
  const { coins, material, rodStage, seen } = data;
  if (!isCount(coins) || !isCount(material)) return initialProgress();
  if (!Number.isSafeInteger(rodStage) || rodStage < 1 || rodStage > rodConfig.maxStage) return initialProgress();
  if (!Array.isArray(seen)) return initialProgress();
  // 知らない魚の id(将来消した魚など)は捨て、重なりも除く。
  const known = [...new Set(seen.filter((id) => typeof id === "string" && fishById(id)))];
  return { coins, material, rodStage, seen: known };
}
