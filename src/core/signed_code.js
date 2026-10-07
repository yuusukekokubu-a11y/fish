// @ts-check
// 署名つきのセーブコード(TSURI5:D-291〜D-294)。書き出して人に渡すコードに、鍵の番号と署名を付ける。
// 形:TSURI5-(鍵の番号)-(保存の版)-(本文)-(署名)
// - 本文:これまでの本文(保存の版 4。save.js)のまま。保存の版を中に書くので、あとで保存の版が上がっても読み分けられる。
// - 署名:「TSURI5-…-(本文)」までの文字を、鍵で HMAC-SHA256(合言葉の鍵で作る、改ざんを見つける印)にかけ、
//   先頭の 16 バイト(128 ビット)を URL に安全な文字(英数字と - _)22 文字で書く。1 文字でも変えると合わなくなる。
// - 鍵の番号:英小文字で始まる 1〜8 文字(本番 k1・手元 dev・デバッグ debug:D-293)。
// - 署名なしの古い形式(TSURI1〜4)は、config.saveCode.acceptUnsigned が true なら注意つきで読む(D-294)。
// 目的は、書き換えの手軽さを下げること。鍵は公開ページの中にあるので、本物の不正防止ではない。
// 鍵そのものは知らない(読む側が渡す)。計算はブラウザと Node の Web Crypto(crypto.subtle)で、非同期になる。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { DEFAULT_CONFIG } from "./config.js";
import { DEFAULT_CONTENT } from "./fish.js";
import { encodeSave, SAVE_VERSION } from "./save.js";
import { decodeBody, decodeSaveCode, MAX_CODE_LENGTH, SAVE_CODE_ERRORS } from "./savecode.js";

/** @typedef {import("./save.js").Progress} Progress */
/** @typedef {import("./save.js").SaveContent} SaveContent */

/**
 * 署名の鍵。
 * @typedef {object} SigningKey
 * @property {string} id 鍵の番号(コードに書く)
 * @property {string} secret 鍵(文字列。UTF-8 のバイトを HMAC の鍵にする)
 */

export const SIGNED_PREFIX = "TSURI5";
/** 署名の文字数(16 バイトを URL に安全な文字で)。 */
export const SIGNATURE_LENGTH = 22;
/** デバッグ用の鍵の番号(本番では拒否する:D-293)。 */
export const DEBUG_KEY_ID = "debug";
const KEY_ID = /^[a-z][a-z0-9]{0,7}$/;
const SIGNED = /^TSURI5-([a-z][a-z0-9]{0,7})-(\d{1,3})-(.+)-([A-Za-z0-9_-]{22})$/;
// 署名つきの形の先頭(鍵の番号のあとに「-」)。署名なしの保存の版 5 のコード(TSURI5-本文-印)は、本文がウロコインの数と「~」で
// 始まるので、ここには当たらない(D-307)。
const SIGNED_HEAD = /^TSURI5-[a-z][a-z0-9]{0,7}-/;

/** 読み込みに失敗したときの短い文(署名に関わるもの。ほかは savecode.js の SAVE_CODE_ERRORS)。 */
export const SIGNED_CODE_ERRORS = Object.freeze({
  ...SAVE_CODE_ERRORS,
  signature: "署名が合いません。コピーし直してください",
  unknownKey: "知らない鍵のコードです",
  debugKey: "デバッグ用のコードは、本番では読めません",
  unsigned: "署名がないコードは読めません(古い形式です)",
});

/** 署名なしの古い形式を読んだときの注意(D-294)。 */
export const UNSIGNED_WARNING = "署名がありません(古い形式です)";

/** @param {keyof typeof SIGNED_CODE_ERRORS} error */
function fail(error) {
  return /** @type {const} */ ({ ok: false, error, message: SIGNED_CODE_ERRORS[error] });
}

/** バイト列を、URL に安全な文字(英数字と - _、= なし)にする。 @param {Uint8Array} bytes */
export function base64url(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** HMAC-SHA256 の先頭 16 バイトを、22 文字にしたもの。 @param {string} secret @param {string} message */
export async function signature(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return base64url(mac.slice(0, 16));
}

/** 長さが同じ 2 つの文字列を、途中で止めずに比べる。 @param {string} a @param {string} b */
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * 進み具合を、署名つきのセーブコードにする。
 * @param {Progress} progress @param {SigningKey} key @param {SaveContent} [content]
 */
export async function signSaveCode(progress, key, content = DEFAULT_CONTENT) {
  if (!KEY_ID.test(key.id)) throw new Error(`鍵の番号の形がちがいます:${key.id}`);
  const head = `${SIGNED_PREFIX}-${key.id}-${SAVE_VERSION}-${encodeSave(progress, content)}`;
  return `${head}-${await signature(key.secret, head)}`;
}

/**
 * 読み込みの設定。
 * @typedef {object} ReadOptions
 * @property {readonly SigningKey[]} keys 読める鍵(本番は k1、?debug のときは debug も)
 * @property {SaveContent} [content]
 * @property {typeof DEFAULT_CONFIG} [config] 中身の点検と acceptUnsigned に使う
 */

/**
 * セーブコードを読む(署名つきと、署名なしの古い形式)。エラーは投げない。
 * 成功:{ ok: true, progress, signed, keyId, warning }(署名なしは signed: false で warning に注意の文)。
 * 失敗:{ ok: false, error, message }。
 * @param {unknown} text @param {ReadOptions} options
 */
export async function readSaveCode(text, { keys, content = DEFAULT_CONTENT, config = DEFAULT_CONFIG }) {
  if (typeof text !== "string") return fail("empty");
  const code = text.replace(/\s+/g, "");
  if (code === "") return fail("empty");
  if (!SIGNED_HEAD.test(code)) {
    const r = decodeSaveCode(code, content, config);
    if (!r.ok) return r;
    if (!(config.saveCode?.acceptUnsigned ?? true)) return fail("unsigned");
    return /** @type {const} */ ({ ok: true, progress: r.progress, signed: false, keyId: null, warning: UNSIGNED_WARNING });
  }
  if (code.length > MAX_CODE_LENGTH) return fail("format");
  const m = code.match(SIGNED);
  if (!m) return fail("format");
  const [, keyId, version, , sig] = m;
  const key = keys.find((k) => k.id === keyId);
  if (!key) return fail(keyId === DEBUG_KEY_ID ? "debugKey" : "unknownKey");
  const head = code.slice(0, code.length - SIGNATURE_LENGTH - 1);
  if (!sameText(await signature(key.secret, head), sig)) return fail("signature");
  const r = decodeBody(m[3], Number(version), content, config);
  if (!r.ok) return r;
  return /** @type {const} */ ({ ok: true, progress: r.progress, signed: true, keyId, warning: null });
}
