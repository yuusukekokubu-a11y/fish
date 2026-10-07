// @ts-check
// セーブコードの共有(D-315)。ブラウザの共有の仕組み(Web Share API の navigator.share)が使えるときだけ使う。
// 共有するのは、書き出した署名つきのセーブコードの文字列だけ。画面に触らない(navigator は引数で受け取る)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/** @typedef {{ share?: (data: { text: string }) => Promise<void>, canShare?: (data: { text: string }) => boolean }} ShareNavigator */

/**
 * 文字を共有できるか(navigator.share があり、canShare があれば文字を渡せると答える)。
 * @param {ShareNavigator | undefined} nav @param {string} [text]
 */
export function canShareText(nav, text = "TSURI") {
  if (!nav || typeof nav.share !== "function") return false;
  if (typeof nav.canShare === "function") {
    try {
      return nav.canShare({ text });
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * 文字を共有する。結果:"shared"(共有した)・"cancelled"(やめた)・"failed"(使えない・失敗)。エラーは投げない。
 * @param {ShareNavigator | undefined} nav @param {string} text
 * @returns {Promise<"shared" | "cancelled" | "failed">}
 */
export async function shareText(nav, text) {
  if (!canShareText(nav, text) || !nav?.share) return "failed";
  try {
    await nav.share({ text });
    return "shared";
  } catch (e) {
    // 共有メニューを閉じた(やめた)ときは AbortError。
    return e instanceof Error && e.name === "AbortError" ? "cancelled" : "failed";
  }
}
