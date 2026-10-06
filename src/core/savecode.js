// セーブコード(D-059・D-065・D-117):進み具合を 1 行の文字列に書き出し、読み込む。
// 形:FISH7-(中身)-(印)(D-188・D-199・D-208)
// - 中身:保存の形(版 7。装備は表の番号の短い配列)の JSON を base64url(英数字と「-」「_」だけの書き方)にしたもの。
//   前に書き出した FISH2〜FISH6 のコードも読める(版 7 に読み替える。旧ルアーは値を、旧スキルはポイントをレベルに読み替える)。
// - 印:中身から計算する 8 けたの 16 進数(FNV-1a)。壊れたコードを見つけるためのもの。
// 暗号化はしない。改ざんの防止は目的にしない。

import { DEFAULT_CONTENT } from "./fish.js";
import { readSaveData, SAVE_VERSION, toSaveData } from "./save.js";

const PREFIX = "FISH";
// 長さの上限(D-208)。持ち物 100 個(全部スキル 3 つ)でも約 5000 文字。FISH4 の 100 個(約 1 万文字)も読める。
const MAX_LENGTH = 20000;
// 読めるコードの版(FISH2 から)。
const MIN_CODE_VERSION = 2;
const PATTERN = /^FISH(\d+)-([A-Za-z0-9_-]+)-([0-9a-f]{8})$/;

// 読み込みに失敗したときの短い文(画面に出す)。
export const SAVE_CODE_ERRORS = Object.freeze({
  empty: "コードが空です",
  format: "コードの形がちがいます",
  checksum: "コードが壊れています",
  version: "コードの版がちがいます",
  content: "コードの中身が正しくありません",
});

/** 文字列から 8 けたの 16 進数の印を作る(FNV-1a)。 */
export function checksum(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function toBase64Url(text) {
  return btoa(text).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const b64 = text.replaceAll("-", "+").replaceAll("_", "/");
  return atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
}

/** 進み具合をセーブコードにする。 */
export function encodeSaveCode(progress, content = DEFAULT_CONTENT) {
  const body = toBase64Url(JSON.stringify(toSaveData(progress, content)));
  return `${PREFIX}${SAVE_VERSION}-${body}-${checksum(body)}`;
}

function fail(error) {
  return { ok: false, error, message: SAVE_CODE_ERRORS[error] };
}

/**
 * セーブコードを読む。成功:{ ok: true, progress }。失敗:{ ok: false, error, message }。
 * 前後の空白や途中の改行は取り除いてから読む。エラーは投げない。
 */
export function decodeSaveCode(text, content = DEFAULT_CONTENT) {
  if (typeof text !== "string") return fail("empty");
  const code = text.replace(/\s+/g, "");
  if (code === "") return fail("empty");
  if (code.length > MAX_LENGTH) return fail("format");
  const m = code.match(PATTERN);
  if (!m) return fail("format");
  const [, codeVersion, body, sum] = m;
  if (checksum(body) !== sum) return fail("checksum");
  const version = Number(codeVersion);
  if (version < MIN_CODE_VERSION || version > SAVE_VERSION) return fail("version");
  let data;
  try {
    data = JSON.parse(fromBase64Url(body));
  } catch {
    return fail("format");
  }
  // 先頭の版と、中身の版がそろっていること。
  if (data?.version !== version) return fail("version");
  const result = readSaveData(data, content);
  return result.ok ? { ok: true, progress: result.progress } : fail(result.error);
}
