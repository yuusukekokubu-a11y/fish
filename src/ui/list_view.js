// @ts-check
// 一覧の画面(素材・ステータス)の描き方(D-152)。中身は screen_views.js の部品が { header, sections } で作る。
// 行は 1 つずつ並べ、押すとその下に詳細が開く(2 段構え:D-130)。説明の文章は置かない。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/**
 * 一覧の中身。行の detail は押すと出る [見出し, 中身] の一覧(null なら押せない)。
 * @typedef {object} ListView
 * @property {string | null} header
 * @property {{ title: string, rows: { label: string, value: string, detail: string[][] | null }[] }[]} sections
 */

/**
 * @param {string} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElement}
 */
export function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** @param {string} text @param {string} [className] @returns {HTMLButtonElement} */
export function button(text, className = "") {
  const b = /** @type {HTMLButtonElement} */ (el("button", className, text));
  b.type = "button";
  return b;
}

/** 一覧を container に描く。 @param {HTMLElement} container @param {ListView} view */
export function renderListView(container, view) {
  if (view.header) container.append(el("div", "screen-header", view.header));
  for (const section of view.sections) {
    const box = el("section", "screen-section");
    if (section.title) box.append(el("h2", "section-title", section.title));
    const list = el("ul", "menu-list");
    for (const row of section.rows) {
      const item = el("li");
      const head = button("", "menu-row");
      head.append(el("span", "menu-label", row.label), el("span", "menu-value", row.value));
      item.append(head);
      if (row.detail) {
        const detail = el("dl", "menu-detail");
        detail.hidden = true;
        for (const [key, value] of row.detail) detail.append(el("dt", "", key), el("dd", "", value));
        item.append(detail);
        head.setAttribute("aria-expanded", "false");
        head.addEventListener("click", () => {
          detail.hidden = !detail.hidden;
          head.setAttribute("aria-expanded", String(!detail.hidden));
        });
      } else {
        head.disabled = true;
      }
      list.append(item);
    }
    box.append(list);
    container.append(box);
  }
}

/**
 * 一覧の画面の部品を作る。viewFn は ctx から { header, sections } を作る関数。
 * @param {(ctx: any) => ListView} viewFn
 * @returns {(container: HTMLElement, ctx: any) => void}
 */
export function mountList(viewFn) {
  return (container, ctx) => renderListView(container, viewFn(ctx));
}
