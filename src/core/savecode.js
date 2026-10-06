// @ts-check
// セーブコード(D-059・D-223・D-232):進み具合を 1 行の文字列に書き出し、読み込む。ブラウザの保存も同じ文字列を使う。
// 形:TSURI1-(本文)-(印)
// - 本文:保存の形(版 1。save.js)。英数字と「. , : ~ -」だけで書く(コピーしても崩れない)。
// - 印:本文から計算する 8 けたの 16 進数(FNV-1a)。壊れたコードを見つけるためのもの。
// - 先頭の名前は、②-4c で互換性を切る前の「FISH」と区別するため「TSURI」にした。FISH で始まるコードは「古い版のコードは読めません」。
// 暗号化はしない。改ざんの防止は目的にしない。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { DEFAULT_CONFIG } from "./config.js";
import { DEFAULT_CONTENT } from "./fish.js";
import { decodeSave, encodeSave, initialProgress, SAVE_VERSION } from "./save.js";

/** @typedef {import("./save.js").Progress} Progress */
/** @typedef {import("./save.js").SaveContent} SaveContent */

export const CODE_PREFIX = "TSURI";
// 長さの上限(D-232)。持ち物 100 個(全部スキル 3 つ)・鱗 20 種類で約 2000 文字。魚 300 種類を全部持っても約 1 万文字。
export const MAX_CODE_LENGTH = 50000;
const PATTERN = /^TSURI(\d+)-(.+)-([0-9a-f]{8})$/;
const OLD_PATTERN = /^FISH\d+-/;

// 読み込みに失敗したときの短い文(画面に出す)。
export const SAVE_CODE_ERRORS = Object.freeze({
  empty: "コードが空です",
  old: "古い版のコードは読めません",
  format: "コードの形がちがいます",
  checksum: "コードが壊れています",
  version: "コードの版がちがいます",
  content: "コードの中身が正しくありません",
});

/** 文字列から 8 けたの 16 進数の印を作る(FNV-1a)。 @param {string} text */
export function checksum(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** 進み具合をセーブコードにする。 @param {Progress} progress @param {SaveContent} [content] */
export function encodeSaveCode(progress, content = DEFAULT_CONTENT) {
  const body = encodeSave(progress, content);
  return `${CODE_PREFIX}${SAVE_VERSION}-${body}-${checksum(body)}`;
}

/** @param {keyof typeof SAVE_CODE_ERRORS} error */
function fail(error) {
  return /** @type {const} */ ({ ok: false, error, message: SAVE_CODE_ERRORS[error] });
}

/**
 * セーブコードを読む。成功:{ ok: true, progress }。失敗:{ ok: false, error, message }。
 * 前後の空白や途中の改行は取り除いてから読む。エラーは投げない。
 * @param {unknown} text @param {SaveContent} [content] @param {typeof DEFAULT_CONFIG} [config]
 */
export function decodeSaveCode(text, content = DEFAULT_CONTENT, config = DEFAULT_CONFIG) {
  if (typeof text !== "string") return fail("empty");
  const code = text.replace(/\s+/g, "");
  if (code === "") return fail("empty");
  if (OLD_PATTERN.test(code)) return fail("old");
  if (code.length > MAX_CODE_LENGTH) return fail("format");
  const m = code.match(PATTERN);
  if (!m) return fail("format");
  const [, codeVersion, body, sum] = m;
  if (checksum(body) !== sum) return fail("checksum");
  if (Number(codeVersion) !== SAVE_VERSION) return fail("version");
  const result = decodeSave(body, content, config);
  return result.ok ? /** @type {const} */ ({ ok: true, progress: result.progress }) : fail("content");
}

/**
 * ブラウザに保存された文字列を読む。壊れている・形がちがう・版がちがうときは、初めの状態を返す。エラーは投げない。
 * @param {string | null} text @param {SaveContent} [content] @param {typeof DEFAULT_CONFIG} [config]
 * @returns {Progress}
 */
export function parseSave(text, content = DEFAULT_CONTENT, config = DEFAULT_CONFIG) {
  if (typeof text !== "string" || text === "") return initialProgress();
  const result = decodeSaveCode(text, content, config);
  return result.ok ? result.progress : initialProgress();
}
