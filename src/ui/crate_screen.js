// @ts-check
// クレートの画面(全画面:D-139・D-152・D-162)。
// - 上に持ち物の空き(「あと 12 個」)。クレートを段階の新しい順に、名前・価格(1 回/10 連)・引くボタン。
// - 「くわしく」で、排出率・装備の種類・基本効果の範囲が開く。
// - 引く演出は gacha_fx.js(今のまま)。結果の下に「装備を見る」を置き、装備の画面に移れる。
// 結果は演出の前に確定し、保存してから見せる(D-148)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { makeCrates, pullCrate } from "../core/gear.js";
import { playPull } from "./gacha_fx.js";
import { crateCards, inventorySpaceLabel, PULL_MESSAGES, pullResultView } from "./gear_view.js";
import { button, el } from "./list_view.js";

/** @typedef {import("./equip_screen.js").ScreenContext} ScreenContext */

/** @param {[string, string][]} pairs */
function detailList(pairs) {
  const dl = el("dl", "sheet-list");
  for (const [k, v] of pairs) dl.append(el("dt", "", k), el("dd", "", v));
  return dl;
}

/**
 * クレートの画面を作る。
 * @param {HTMLElement} container
 * @param {ScreenContext & { storage: { save: (progress: any) => boolean } }} ctx
 */
export function mountCrates(container, ctx) {
  const { game } = ctx;
  const crates = makeCrates(game.content, /** @type {any} */ (game.config));
  const space = el("div", "screen-header crate-space", inventorySpaceLabel(game));
  const message = el("p", "gacha-message");
  message.setAttribute("role", "status");
  container.append(space, message);

  const list = el("div", "crate-list");
  for (const card of crateCards(game, crates)) {
    const box = el("section", "crate-card");
    box.dataset.crate = card.crate.id;
    const head = el("div", "crate-head");
    head.append(el("h2", "crate-name", card.name));
    const more = button("くわしく", "chip crate-more");
    head.append(more);
    const price = el("p", "crate-price", `1 回 ${card.price.one} ・ 10 連 ${card.price.ten}`);
    const detail = el("div", "crate-detail");
    detail.hidden = true;
    const rates = detailList(card.rates.map((r) => [`${r.stars} ${r.name}`, r.rate]));
    rates.querySelectorAll("dt").forEach((dt, i) => /** @type {HTMLElement} */ (dt).style.setProperty("color", card.rates[i].color));
    detail.append(el("h3", "detail-title", "排出率"), rates);
    detail.append(el("h3", "detail-title", "装備の種類と基本効果の範囲"), detailList(card.kinds.map((k) => [k.name, k.range])));
    more.setAttribute("aria-expanded", "false");
    more.addEventListener("click", () => {
      detail.hidden = !detail.hidden;
      more.setAttribute("aria-expanded", String(!detail.hidden));
    });

    const buttons = el("div", "crate-buttons");
    for (const [count, label, blocker] of /** @type {[number, string, string | null][]} */ ([
      [1, `1 回引く(${card.price.one})`, card.blockers.one],
      [10, `10 連(${card.price.ten})`, card.blockers.ten],
    ])) {
      const b = button(label, "primary-button pull-button");
      b.dataset.count = String(count);
      // ウロコインが足りないときは押せない見た目。持ち物がいっぱいのときは、押すと理由を出す(前と同じ)。
      if (blocker === "coins" || blocker === "locked" || blocker === "seed") b.disabled = true;
      b.addEventListener("click", () => {
        const result = pullCrate(game.progress, card.crate, count, game.content.equipKinds, game.config.gacha);
        if (!result.ok) {
          message.textContent = PULL_MESSAGES[/** @type {keyof typeof PULL_MESSAGES} */ (result.reason)] ?? "引けません";
          message.classList.add("error");
          return;
        }
        ctx.storage.save(game.progress);
        playPull(ctx.app, pullResultView(game, result.items, crates), card.name, () => ctx.rerender(), {
          label: "装備を見る",
          onClick: () => ctx.navigate("equipment"),
        });
      });
      buttons.append(b);
    }
    box.append(head, price, buttons, detail);
    list.append(box);
  }
  container.append(list);
}
