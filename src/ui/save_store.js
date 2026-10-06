// @ts-check
// ブラウザの保存場所(localStorage)の読み書き(D-050・D-214・D-223・D-232)。
// - 本番は SAVE_KEY、?debug のときは DEBUG_SAVE_KEY(本番の保存データは読みも書きもしない)。
//   ?debug&stages=n(大きな表の確かめ)のときは、表ごとに別の場所。
// - ②-4c で互換性を切る前の保存場所(OLD_SAVE_KEYS)は読まない。新しいデータがまだなく、古いデータだけがあるときに
//   「古い版のデータは読めません。新しく始まります」と 1 回だけ案内する。古いデータは消さない。
// - ブラウザの設定で使えないときも、エラーで止めずに遊べるようにする。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

export const SAVE_KEY = "tsuri:save";
export const DEBUG_SAVE_KEY = "tsuri:debug-save";
/** 互換性を切る前の保存場所(本番・デバッグ)。読まない・消さない。 */
export const OLD_SAVE_KEYS = Object.freeze({ main: "fish:save", debug: "fish:debug-save" });
export const OLD_DATA_MESSAGE = "古い版のデータは読めません。新しく始まります";

/**
 * 使う保存場所。
 * @param {{ debug: boolean, stages: number | null }} options
 */
export function storeKeyFor(options) {
  if (!options.debug) return SAVE_KEY;
  return options.stages === null ? DEBUG_SAVE_KEY : `${DEBUG_SAVE_KEY}:stages-${options.stages}`;
}

/** @param {string} key @returns {string | null} */
export function loadText(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 保存する。できたら true。 @param {string} key @param {string} text */
export function saveText(key, text) {
  try {
    localStorage.setItem(key, text);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} key */
export function clearText(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // 消せなくても続ける。
  }
}

/**
 * 古い版のデータの案内を出すか。新しいデータがなく、古いデータがあるときだけ(新しいデータを保存すると、次からは出ない)。
 * @param {{ getItem: (key: string) => string | null }} storage @param {string} key 新しい保存場所 @param {string} oldKey
 */
export function shouldShowOldDataNotice(storage, key, oldKey) {
  try {
    return storage.getItem(key) === null && storage.getItem(oldKey) !== null;
  } catch {
    return false;
  }
}
