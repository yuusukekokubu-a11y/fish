// @ts-check
// 店の画面(全画面:D-263・D-269)。いまの段階の餌(「クロダイの餌」)を、1 個・10 個・上限まで買える。
// 価格と所持数/上限を出し、ウロコインが足りない・上限のときはボタンを押せなくする。「段階が進むと払い戻されます」の一言。
// 文字は bait_view.js が作る。買ったら保存して、画面を作り直す。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { buyBait } from "../core/bait.js";
import { BAIT_MESSAGES, shopView } from "./bait_view.js";
import { formatCount } from "./format.js";
import { button, el } from "./list_view.js";

/** 最後の知らせ(作り直しても残す)。 */
let lastMessage = "";

/**
 * 店の画面を作る。
 * @param {HTMLElement} container
 * @param {{ game: any, rerender: () => void, storage: { save: (progress: any) => boolean } }} ctx
 */
export function mountShop(container, ctx) {
  const { game } = ctx;
  const view = shopView(game);
  const message = el("p", "gacha-message shop-message", lastMessage);
  message.setAttribute("role", "status");
  lastMessage = "";

  const box = el("section", "crate-card shop-card");
  const head = el("div", "crate-head");
  head.append(el("h2", "crate-name shop-name", view.name), el("span", "shop-count", view.countText));
  box.append(head, el("p", "crate-price shop-price", view.priceText));
  const buttons = el("div", "crate-buttons shop-buttons");
  for (const b of view.buttons) {
    const label = b.count > 0 ? `${b.label}(${formatCount(b.cost)})` : b.label;
    const btn = button(label, "primary-button shop-buy");
    btn.dataset.count = String(b.count);
    btn.disabled = b.disabled;
    btn.addEventListener("click", () => {
      const r = buyBait(game.progress, b.count, game.config);
      if (!r.ok) {
        message.textContent = BAIT_MESSAGES[/** @type {keyof typeof BAIT_MESSAGES} */ (r.reason)] ?? "買えません";
        message.classList.add("error");
        return;
      }
      ctx.storage.save(game.progress);
      lastMessage = `${view.name}を ${r.count} 個買いました(-${formatCount(r.cost)})`;
      ctx.rerender();
    });
    buttons.append(btn);
  }
  box.append(buttons, el("p", "pull-note shop-note", view.note));
  container.append(message, box);
}
