// @ts-check
// URL の「?」のあとの指定(確認用の仕組み:D-215)。URL の指定を読むのは、このファイルだけにする。
// - 読んでよい名前は URL_PARAMS の表にあるものだけ。表は SPEC の「確認用の仕組みの一覧」と同じ(テストが確かめる)。
// - ?debug がないときは、どの指定も本番に効かない(seed と crit は ?debug のときだけ読む)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/**
 * 確認用の URL の指定 1 つ。
 * @typedef {object} UrlParam
 * @property {string} name 名前(?name=)
 * @property {string} use できること
 * @property {boolean} debugOnly ?debug のときだけ効くか
 */

/** @type {readonly UrlParam[]} */
export const URL_PARAMS = Object.freeze([
  { name: "debug", use: "デバッグ画面・DEBUG の印・デバッグ専用の保存場所・自動操作用の窓口を出す", debugOnly: true },
  { name: "seed", use: "魚の並びのシードと、デバッグのデータを作るときのガチャの種を決める", debugOnly: true },
  { name: "crit", use: "クリティカルの確率(%)を決める", debugOnly: true },
  { name: "stages", use: "魚の表を、段階 n まで(段階ごとに 3 匹)の大きな確かめ用の表に切り替える(1〜200)", debugOnly: true },
]);

/** ?debug&stages= で選べる段階の数の上限。 */
export const MAX_DEBUG_STAGES = 200;

/**
 * URL の指定の読んだ結果。
 * @typedef {object} UrlOptions
 * @property {boolean} debug ?debug が付いているか
 * @property {string | null} seed ?debug&seed= の値(なければ null)
 * @property {number | null} crit ?debug&crit= の値(%。数でなければ null)
 * @property {number | null} stages ?debug&stages= の値(1〜200 の整数。ちがえば null)
 */

/**
 * URL の「?」のあと(location.search)を読む。?debug がなければ、seed と crit は読まない(本番に効かない:D-215)。
 * @param {string} search 例:"?debug&seed=42" @returns {UrlOptions}
 */
export function readUrlOptions(search) {
  const params = new URLSearchParams(search);
  const debug = params.has("debug");
  if (!debug) return { debug: false, seed: null, crit: null, stages: null };
  const seed = params.get("seed");
  const critText = params.get("crit");
  const crit = critText === null || critText === "" ? null : Number(critText);
  const stagesText = params.get("stages");
  const stagesValue = stagesText === null || stagesText === "" ? NaN : Number(stagesText);
  const stages = Number.isSafeInteger(stagesValue) && stagesValue >= 1 && stagesValue <= MAX_DEBUG_STAGES ? stagesValue : null;
  return { debug, seed: seed === null || seed === "" ? null : seed, crit: crit !== null && Number.isFinite(crit) ? crit : null, stages };
}

/**
 * URL の指定を変えた「?」のあと(デバッグ画面でシードやクリティカルを決めて開き直すとき)。null は消す。
 * @param {string} search @param {Record<string, string | null>} changes @returns {string}
 */
export function withUrlOptions(search, changes) {
  const params = new URLSearchParams(search);
  for (const [k, v] of Object.entries(changes)) {
    if (!URL_PARAMS.some((p) => p.name === k)) continue;
    if (v === null || v === "") params.delete(k);
    else params.set(k, v);
  }
  // 「debug=」のように空の = が付かないよう、値のない debug は名前だけにする。
  const text = params.toString().replace(/(^|&)debug=(?=&|$)/, "$1debug");
  return text === "" ? "" : `?${text}`;
}
