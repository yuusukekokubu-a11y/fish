// @ts-check
// クレートの画面(全画面:D-139・D-152・D-162)。
// - 上に持ち物の空き(「あと 12 個」)。クレートを段階の新しい順に、名前・価格(1 回/10 連)・引くボタン。
// - 「くわしく」で、排出率・装備の種類・基本効果の範囲が開く。
// - 引く演出は gacha_fx.js(今のまま)。結果の下に「装備を見る」を置き、装備の画面に移れる。
// - 引くボタンの上に自動分解の設定(オフ・ノーマルまで・レアまで・エピックまで:D-266)。引いた直後に分解して保存する。
// 結果は演出の前に確定し、保存してから見せる(D-148)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { DEFAULT_CONFIG } from "../core/config.js";
import { autoScrap, makeCrates, pullCrate, setAutoScrap } from "../core/gear.js";
import { SKILL_ROWS } from "../core/skills.js";
import { autoScrapChoices, autoScrapText } from "./bait_view.js";
import { playPull } from "./gacha_fx.js";
import { crateCards, inventorySpaceLabel, inventoryWarning, PULL_MESSAGES, pullResultView } from "./gear_view.js";
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
  container.append(space);
  // 持ち物の空きの警告(D-216):空き 10 以下は黄、0 は赤と「装備へ(分解する)」。
  const warning = inventoryWarning(game);
  if (warning.level) {
    const box = el("div", `space-warning ${warning.level}`);
    box.setAttribute("role", "alert");
    box.append(el("p", "space-warning-text", warning.text));
    // ロック中の数(D-246)。
    if (warning.lockedText) box.append(el("p", "space-warning-locked", `🔒 ${warning.lockedText}`));
    if (warning.level === "full") {
      const go = button("装備へ(分解する)", "primary-button space-warning-go");
      go.addEventListener("click", () => ctx.navigate("equipment"));
      box.append(go);
    }
    container.append(box);
  }
  container.append(message);
  container.append(autoScrapBox(ctx));

  // スキルの抽選に使う表と数値(ゲームの表を使う:D-207)。
  const skillDraw = { skills: game.content.skills ?? SKILL_ROWS, config: game.config.skills ?? DEFAULT_CONFIG.skills };
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
    const rates = detailList(card.rates.map((r) => [`${r.stars} ${r.name}`, `${r.rate}・${r.skillsText}`]));
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
      // ウロコインが足りないとき・空きが足りないとき(10 連は空き 10、1 回は空き 1:D-216)は押せない。
      if (blocker === "coins" || blocker === "locked" || blocker === "seed") b.disabled = true;
      if (count === 1 ? warning.oneBlocked : warning.tenBlocked) b.disabled = true;
      b.addEventListener("click", () => {
        const result = pullCrate(game.progress, card.crate, count, game.content.equipKinds, game.config.gacha, skillDraw);
        if (!result.ok) {
          message.textContent = PULL_MESSAGES[/** @type {keyof typeof PULL_MESSAGES} */ (result.reason)] ?? "引けません";
          message.classList.add("error");
          return;
        }
        // 見せ方(▲ など)は分解の前に作る。引いた直後に自動分解して、まとめて保存する(D-266)。
        const view = pullResultView(game, result.items, crates);
        const scrap = autoScrap(game.progress, result.items, crates, Number.MAX_SAFE_INTEGER);
        ctx.storage.save(game.progress);
        const scrapped = new Set(scrap.items.map((it) => it.id));
        playPull(ctx.app, view, card.name, () => ctx.rerender(), {
          label: "装備を見る",
          onClick: () => ctx.navigate("equipment"),
        }, { text: autoScrapText(scrap), ids: result.items.map((it) => scrapped.has(it.id)) });
      });
      buttons.append(b);
    }
    box.append(head, price, buttons);
    if (warning.tenNote) box.append(el("p", "pull-note", warning.tenNote));
    box.append(detail);
    list.append(box);
  }
  container.append(list);
}

/**
 * 自動分解の設定(D-266)。4 つのボタンから 1 つを選ぶ。選んだら保存する。
 * @param {ScreenContext & { storage: { save: (progress: any) => boolean } }} ctx
 */
function autoScrapBox(ctx) {
  const box = el("section", "auto-scrap");
  box.append(el("h2", "auto-scrap-title", "自動分解(引いた直後)"));
  const row = el("div", "auto-scrap-choices");
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "自動分解");
  for (const c of autoScrapChoices(ctx.game)) {
    const b = button(c.label, "chip auto-scrap-choice");
    b.dataset.scrap = c.id;
    b.setAttribute("aria-pressed", String(c.selected));
    b.addEventListener("click", () => {
      setAutoScrap(ctx.game.progress, c.id);
      ctx.storage.save(ctx.game.progress);
      ctx.rerender();
    });
    row.append(b);
  }
  box.append(row, el("p", "auto-scrap-note", "レジェンド・ロック中・装着中・▲は分解しません"));
  return box;
}
