// @ts-check
// 下から出るシート(装備の詳細・まとめて分解・確認:D-162)。全画面の上に重ねる。
// 外側(暗いところ)か「閉じる」で閉じる。シートの中と外のタップは、下の画面や釣りに伝えない。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { button, el } from "./list_view.js";

/**
 * シートを開く。build で中身を作り、閉じる関数を受け取る。返り値も閉じる関数。
 * @param {HTMLElement} root 画面全体 @param {(panel: HTMLElement, close: () => void) => void} build
 * @param {string} [className]
 */
export function openSheet(root, build, className = "") {
  const backdrop = el("div", "sheet-backdrop");
  const panel = el("div", `sheet ${className}`.trim());
  panel.setAttribute("role", "dialog");
  backdrop.append(panel);
  root.append(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener("pointerdown", (event) => event.stopPropagation());
  backdrop.addEventListener("click", (event) => {
    event.stopPropagation();
    if (event.target === backdrop) close();
  });
  build(panel, close);
  return close;
}

/**
 * 確認のシート。「はい」の文字と、押したときの処理を渡す。
 * @param {HTMLElement} root @param {string} title @param {string[]} lines @param {string} okLabel
 * @param {() => void} onOk
 */
export function confirmSheet(root, title, lines, okLabel, onOk) {
  return openSheet(
    root,
    (panel, close) => {
      panel.append(el("h2", "sheet-title", title));
      for (const line of lines) panel.append(el("p", "sheet-line", line));
      const row = el("div", "sheet-buttons");
      const ok = button(okLabel, "primary-button confirm-ok");
      const cancel = button("やめる", "secondary-button confirm-cancel");
      ok.addEventListener("click", () => {
        close();
        onOk();
      });
      cancel.addEventListener("click", close);
      row.append(cancel, ok);
      panel.append(row);
    },
    "confirm-sheet",
  );
}
