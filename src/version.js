// バージョン(D-085・D-091)。画面の右下に出すだけで、ゲームの結果や保存には使わない。
// VERSION:手で決める番号。形は「0.依頼の通し番号.直しの番号」。依頼ごとに真ん中を 1 上げる。
// BUILD:取り込みの識別番号(commit の頭 7 文字)。公開の処理(scripts/stamp_version.mjs)が
//        公開用のファイルにだけ書き込む。リポジトリと手元では "dev" のまま。
export const VERSION = "0.29.0";
export const BUILD = "dev";

/** 画面に出す文字(例:v0.6.0・abc1234)。 */
export function versionLabel(version = VERSION, build = BUILD) {
  return `v${version}・${build}`;
}
