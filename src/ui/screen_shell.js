// @ts-check
// 全画面の枠(D-152・D-153・D-161)。上にバー(戻る・タイトル・ウロコイン)、下に中身。
// - 画面の識別は URL の「#」のあと(#equipment など)。移るたびに履歴を 1 つ足す(history.pushState)。
// - スマホの「戻る」(ブラウザの履歴)で、前の画面に戻る(popstate)。
// - バーの「戻る」は、メイン画面(釣り)まで一度に戻る(足した履歴の数だけ戻る)。
// - 再読み込みしたときは、その画面を開き直す。履歴は「メイン画面 → その画面」に作り直すので、戻るでメイン画面に戻れる。
// - 画面の中のタップは、釣りの操作に届かない。端の安全領域(ノッチ・ホームバー)には、CSS で余白を取る。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { button, el } from "./list_view.js";
import { hashFor, screenFromHash } from "./screens.js";

/** @typedef {import("./screens.js").Screen} Screen */

/** 履歴に入れる印。depth は、メイン画面から数えて何枚目の画面か。 @typedef {{ screen: string, depth: number }} HistoryMark */

/** @returns {HistoryMark | null} */
function currentMark() {
  const s = history.state;
  return s && typeof s.screen === "string" && Number.isSafeInteger(s.depth) ? s : null;
}

/** メイン画面の URL(「#」より前)。 */
function baseUrl() {
  return `${location.pathname}${location.search}`;
}

/**
 * 全画面の枠を作る。
 * @param {object} options
 * @param {HTMLElement} options.app 画面全体
 * @param {readonly Screen[]} options.screens 画面の表
 * @param {Record<string, any>} options.ctx 画面の部品に渡すもの(rerender と navigate はここで足す)
 * @param {(screen: string | null) => void} options.onChange 開いている画面が変わったとき(null はメイン画面)
 */
export function createScreenShell({ app, screens, ctx, onChange }) {
  const root = el("section", "screen");
  root.id = "screen";
  root.hidden = true;
  const bar = el("header", "screen-bar");
  const back = button("←", "screen-back");
  back.setAttribute("aria-label", "戻る");
  const title = el("h1", "screen-title");
  const coins = el("span", "screen-coins");
  bar.append(back, title, coins);
  const body = el("div", "screen-body");
  root.append(bar, body);
  app.append(root);

  /** @type {string | null} */
  let current = null;

  /** @param {string | null} id @param {boolean} [keepScroll] */
  function render(id, keepScroll = false) {
    const scroll = body.scrollTop;
    const changed = id !== current;
    current = id;
    // 画面が変わったら、開いていたシートは閉じる。
    if (changed) app.querySelectorAll(".sheet-backdrop").forEach((n) => n.remove());
    const screen = screens.find((s) => s.id === id);
    root.hidden = !screen;
    body.replaceChildren();
    if (screen) {
      title.textContent = screen.title;
      root.dataset.screen = screen.id;
      screen.mount(body, ctx);
      body.scrollTop = keepScroll ? scroll : 0;
    }
    if (changed) onChange(current);
  }

  /**
   * 画面に移る(履歴を 1 つ足す)。replace なら、今の履歴(目次を開いたときのもの)を置き換える(D-173)。
   * @param {string} id @param {{ replace?: boolean }} [options]
   */
  function navigate(id, options = {}) {
    if (!screens.some((s) => s.id === id)) return;
    const depth = (currentMark()?.depth ?? 0) + 1;
    const url = `${baseUrl()}${hashFor(id)}`;
    if (options.replace) history.replaceState({ screen: id, depth }, "", url);
    else history.pushState({ screen: id, depth }, "", url);
    render(id);
  }

  /** メイン画面まで戻る。 */
  function backToMain() {
    const mark = currentMark();
    if (mark) history.go(-mark.depth);
    else {
      history.replaceState(null, "", baseUrl());
      render(null);
    }
  }

  ctx.navigate = (/** @type {string} */ id) => navigate(id);
  ctx.rerender = () => render(current, true);
  back.addEventListener("click", backToMain);
  window.addEventListener("popstate", () => render(screenFromHash(location.hash, screens)));
  // 画面の中のタップは、下の釣りの絵やボタンに届かない。
  root.addEventListener("pointerdown", (event) => event.stopPropagation());

  // 再読み込みしたとき:URL に画面があれば、メイン画面の上にその画面を積み直して開く。
  const first = screenFromHash(location.hash, screens);
  if (first) {
    history.replaceState(null, "", baseUrl());
    history.pushState({ screen: first, depth: 1 }, "", `${baseUrl()}${hashFor(first)}`);
    render(first);
  } else if (location.hash) {
    history.replaceState(null, "", baseUrl());
  }

  return {
    navigate,
    backToMain,
    current: () => current,
    /** バーのウロコインの表示を更新する。 @param {string} text */
    setCoins(text) {
      if (coins.textContent !== text) coins.textContent = text;
    },
  };
}
