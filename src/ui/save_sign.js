// @ts-check
// セーブコードの書き出しと読み込みで使う鍵を決める(D-292・D-293)。
// - ふだん:書き出しはいまの鍵(公開では k1、手元では dev)。読めるのも、いまの鍵だけ。
//   デバッグ用(debug)のコードは「デバッグ用のコードは、本番では読めません」で拒否する。
// - ?debug のとき:書き出しはデバッグ用の鍵。読めるのは、いまの鍵とデバッグ用の鍵。
// デバッグ用の鍵は仮の鍵で、秘密ではない(デバッグ用のコードを本番で読ませないための印)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { DEBUG_KEY_ID, readSaveCode, signSaveCode } from "../core/signed_code.js";
import { SIGNING_KEY_ID, SIGNING_KEY_SECRET } from "../save_key.js";

/** @typedef {import("../core/signed_code.js").SigningKey} SigningKey */

/** いまの鍵(公開では本番の鍵、手元では仮の鍵)。 @type {SigningKey} */
export const CURRENT_KEY = Object.freeze({ id: SIGNING_KEY_ID, secret: SIGNING_KEY_SECRET });

/** デバッグ用の鍵(仮の鍵。秘密ではない)。 @type {SigningKey} */
export const DEBUG_KEY = Object.freeze({ id: DEBUG_KEY_ID, secret: "debug-placeholder-key-not-secret" });

/**
 * 書き出しの鍵と、読める鍵の一覧。
 * @param {{ debug: boolean }} options @param {SigningKey} [current]
 * @returns {{ signKey: SigningKey, keys: readonly SigningKey[] }}
 */
export function signingKeys(options, current = CURRENT_KEY) {
  return options.debug ? { signKey: DEBUG_KEY, keys: [current, DEBUG_KEY] } : { signKey: current, keys: [current] };
}

/**
 * 設定の画面に渡す、書き出しと読み込み(非同期)。
 * @param {{ debug: boolean }} options @param {any} [content] @param {any} [config]
 */
export function makeSaveCode(options, content, config) {
  const { signKey, keys } = signingKeys(options);
  return {
    /** @param {any} progress */
    encode: (progress) => signSaveCode(progress, signKey, content),
    /** @param {unknown} text */
    decode: (text) => readSaveCode(text, { keys, content, config }),
  };
}
