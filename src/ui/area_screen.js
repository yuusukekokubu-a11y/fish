// @ts-check
// 釣り場の画面(全画面:D-273)。解放済みの釣り場の一覧(名前・色の見本・進み具合・いまいる印)。押すとその釣り場に移って
// メイン画面に戻る。未解放は「???」と解放の条件。文字は area_view.js が作る。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { moveArea } from "../core/fishing.js";
import { areaRows } from "./area_view.js";
import { button, el } from "./list_view.js";

/**
 * 釣り場の画面を作る。
 * @param {HTMLElement} container
 * @param {{ game: any, backToMain: () => void, storage: { save: (progress: any) => boolean } }} ctx
 */
export function mountAreas(container, ctx) {
  const { game } = ctx;
  const list = el("ul", "menu-list area-list");
  for (const row of areaRows(game)) {
    const item = el("li");
    item.dataset.area = row.id;
    const b = button("", "menu-row area-row");
    b.dataset.area = row.id;
    const swatch = el("span", "area-swatch");
    if (row.sky && row.sea) swatch.style.setProperty("background", `linear-gradient(${row.sky[0]}, ${row.sky[1]} 50%, ${row.sea[0]} 50%, ${row.sea[1]})`);
    else swatch.classList.add("locked");
    const text = el("span", "area-text");
    text.append(el("span", "menu-label area-name", row.name));
    if (row.progressText) text.append(el("span", "area-progress", row.progressText));
    if (row.note) text.append(el("span", "area-note", row.note));
    b.append(swatch, text);
    // いまいる釣り場は、色だけでなく文字と印でも分かるようにする。
    if (row.current) {
      b.append(el("span", "area-here", "● いまいる"));
      b.setAttribute("aria-current", "true");
    }
    if (!row.unlocked) b.disabled = true;
    b.addEventListener("click", () => {
      if (!row.unlocked) return;
      if (!row.current && moveArea(game, row.id)) ctx.storage.save(game.progress);
      ctx.backToMain();
    });
    item.append(b);
    list.append(item);
  }
  container.append(el("div", "screen-header", "いまいる釣り場の魚が釣れます。製作・ヌシ戦・餌は、いちばん新しい釣り場で"), list);
}
