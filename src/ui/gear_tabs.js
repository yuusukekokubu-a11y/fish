// @ts-check
// ドロワーの「クレート」タブと「装備」タブの画面(D-139・D-151)。
// 数と文字は gear_view.js が作り、ここはボタンと行を並べる。操作は計算本体(gear.js)の関数を呼ぶ。
// どの操作も、メニューを開いている間(釣りが止まっている間)だけ行える。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144)。

import { dismantleItem, dismantleRarity, equipItem, makeCrates, pullCrate, RARITY_ROWS, unequipKind } from "../core/gear.js";
import { formatCount } from "./format.js";
import { playPull } from "./gacha_fx.js";
import {
  bulkDismantlePreview,
  crateCards,
  inventoryLabel,
  inventoryRows,
  PULL_MESSAGES,
  pullResultView,
  slotRows,
} from "./gear_view.js";

/** @typedef {import("./gear_view.js").GameLike} GameLike */
/** @typedef {ReturnType<typeof import("./gear_view.js").itemView>} ItemView */

/**
 * タブの部品に渡すもの(main.js が作る)。
 * @typedef {object} TabContext
 * @property {GameLike & { combat: unknown }} game
 * @property {{ save: (progress: any) => boolean }} storage
 * @property {HTMLElement} app 画面全体(演出を重ねる場所)
 * @property {() => void} rerender 今のタブを作り直す(スクロールの位置は保つ)
 * @property {() => void} onGearChanged 装備が変わったとき(戦闘の数値の表を作り直して保存する)
 */

// 持ち物の並べ方(タブを作り直しても保つ)。
/** @type {"rarity" | "new"} */
let inventorySort = "rarity";

/**
 * @param {string} tag @param {string} [className] @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** @param {string} text @param {string} [className] @returns {HTMLButtonElement} */
function button(text, className = "") {
  const b = /** @type {HTMLButtonElement} */ (el("button", className, text));
  b.type = "button";
  return b;
}

/** 行と、押すと開く詳細(2 段構え)。 @param {HTMLElement} head @param {HTMLElement} detail */
function expandable(head, detail) {
  const item = el("li");
  detail.hidden = true;
  head.setAttribute("aria-expanded", "false");
  head.addEventListener("click", () => {
    detail.hidden = !detail.hidden;
    head.setAttribute("aria-expanded", String(!detail.hidden));
  });
  item.append(head, detail);
  return item;
}

/** @param {[string, string][]} pairs */
function detailList(pairs) {
  const dl = el("dl", "menu-detail-list");
  for (const [k, v] of pairs) dl.append(el("dt", "", k), el("dd", "", v));
  return dl;
}

/**
 * クレートタブ:解放済みのクレートを段階の新しい順に。1 回引く・10 連のボタン。
 * @param {HTMLElement} container @param {TabContext} ctx
 */
export function mountCrates(container, ctx) {
  const { game } = ctx;
  const crates = makeCrates(game.content, /** @type {any} */ (game.config));
  const head = el("div", "menu-header", `ウロコイン ${formatCount(game.progress.coins)}`);
  const sub = el("div", "menu-sub", inventoryLabel(game));
  const message = el("div", "gacha-message");
  message.setAttribute("role", "status");
  container.append(head, sub, message);

  const list = el("ul", "menu-list");
  for (const card of crateCards(game, crates)) {
    const box = el("li", "crate-card");
    const top = button("", "menu-row crate-head");
    top.append(el("span", "menu-label", card.name), el("span", "menu-value", `1 回 ${card.price.one}`));
    const detail = el("div", "menu-detail gear-detail");
    detail.hidden = true;
    const rates = detailList(card.rates.map((r) => [r.name, r.rate]));
    rates.querySelectorAll("dt").forEach((dt, i) => /** @type {HTMLElement} */ (dt).style.setProperty("color", card.rates[i].color));
    detail.append(el("div", "menu-detail-title", "排出率"), rates);
    detail.append(el("div", "menu-detail-title", "装備の種類と基本効果の範囲"), detailList(card.kinds.map((k) => [k.name, k.range])));
    top.addEventListener("click", () => {
      detail.hidden = !detail.hidden;
      top.setAttribute("aria-expanded", String(!detail.hidden));
    });
    const buttons = el("div", "crate-buttons");
    for (const [count, label, blocker] of /** @type {[number, string, string | null][]} */ ([
      [1, `1 回引く(${card.price.one})`, card.blockers.one],
      [10, `10 連(${card.price.ten})`, card.blockers.ten],
    ])) {
      const b = button(label, "pull-button");
      b.dataset.count = String(count);
      // ウロコインが足りないときは押せない見た目。持ち物がいっぱいのときは押すと理由を出す。
      if (blocker === "coins" || blocker === "locked" || blocker === "seed") b.disabled = true;
      b.addEventListener("click", () => {
        const result = pullCrate(game.progress, card.crate, count, game.content.equipKinds, game.config.gacha);
        if (!result.ok) {
          message.textContent = PULL_MESSAGES[/** @type {keyof typeof PULL_MESSAGES} */ (result.reason)] ?? "引けません";
          message.classList.add("error");
          return;
        }
        // 結果は演出の前に確定し、保存してから見せる(再読み込みしても引き直せない)。
        ctx.storage.save(game.progress);
        playPull(ctx.app, pullResultView(game, result.items, crates), card.name, () => ctx.rerender());
      });
      buttons.append(b);
    }
    box.append(top, detail, buttons);
    list.append(box);
  }
  container.append(list);
}

/**
 * 装備 1 個の詳細とボタン(付ける・外す・分解)。
 * @param {ItemView} v @param {TabContext} ctx @param {ReturnType<typeof makeCrates>} crates
 */
function itemDetail(v, ctx, crates) {
  const { game } = ctx;
  const detail = el("div", "menu-detail gear-detail");
  const diffText = v.equipped ? "装着中" : `いまの装備との差 ${v.diff}`;
  detail.append(
    detailList([
      ["レア度", v.rarity],
      ["グレード", String(v.grade)],
      ["基本効果", v.effect],
    ]),
  );
  const diff = el("div", `item-diff ${v.diffSign > 0 ? "up" : v.diffSign < 0 ? "down" : ""}`, diffText);
  const buttons = el("div", "item-buttons");
  const toggle = button(v.equipped ? "外す" : "付ける", "item-equip");
  toggle.addEventListener("click", () => {
    const item = game.progress.gear.items.find((it) => it.id === v.id);
    if (!item) return;
    if (v.equipped) unequipKind(game.progress.gear, item.kind);
    else equipItem(game.progress.gear, item.id);
    ctx.onGearChanged();
    ctx.rerender();
  });
  const scrap = button(`分解(+${formatCount(v.refund)})`, "item-dismantle");
  scrap.addEventListener("click", () => {
    if (v.equipped && !window.confirm(`装着中の「${v.name}」を分解しますか?`)) return;
    dismantleItem(game.progress, v.id, crates, Number.MAX_SAFE_INTEGER);
    ctx.onGearChanged();
    ctx.rerender();
  });
  buttons.append(toggle, scrap);
  detail.append(diff, buttons);
  return detail;
}

/** 装備の 1 行(名前・レア度の色・基本効果)。 @param {ItemView} v */
function itemRow(v) {
  const row = button("", "menu-row item-row");
  row.dataset.item = String(v.id);
  const name = el("span", "menu-label");
  const dot = el("span", "rarity-dot");
  dot.style.setProperty("background", v.color);
  name.append(dot, document.createTextNode(v.name));
  if (v.equipped) name.append(el("span", "item-tag", "装着中"));
  if (v.better) name.append(el("span", "item-better", "▲"));
  row.append(name, el("span", "menu-value", v.effect.replace(/^\S+ /, "")));
  return row;
}

/**
 * 装備タブ:上に装着中の 3 枠、下に持ち物の一覧(並べ替え・まとめて分解)。
 * @param {HTMLElement} container @param {TabContext} ctx
 */
export function mountEquipment(container, ctx) {
  const { game } = ctx;
  const crates = makeCrates(game.content, /** @type {any} */ (game.config));

  const slots = el("section", "menu-section");
  slots.append(el("h3", "", "装着中"));
  const slotList = el("ul", "menu-list");
  for (const slot of slotRows(game, crates)) {
    const row = button("", "menu-row slot-row");
    row.dataset.slot = slot.kind;
    const label = el("span", "menu-label");
    label.append(el("span", "slot-kind", slot.kindName));
    if (slot.item) {
      const dot = el("span", "rarity-dot");
      dot.style.setProperty("background", slot.item.color);
      label.append(dot, document.createTextNode(slot.item.name));
    } else {
      label.append(document.createTextNode("なし"));
    }
    row.append(label, el("span", "menu-value", slot.item ? slot.item.effect.replace(/^\S+ /, "") : ""));
    if (slot.item) slotList.append(expandable(row, itemDetail(slot.item, ctx, crates)));
    else {
      row.disabled = true;
      const li = el("li");
      li.append(row);
      slotList.append(li);
    }
  }
  slots.append(slotList);

  const bag = el("section", "menu-section");
  const title = el("h3", "", inventoryLabel(game));
  const controls = el("div", "bag-controls");
  for (const [id, label] of /** @type {["rarity" | "new", string][]} */ ([
    ["rarity", "レア度順"],
    ["new", "新しい順"],
  ])) {
    const b = button(label, `sort-button${inventorySort === id ? " active" : ""}`);
    b.dataset.sort = id;
    b.addEventListener("click", () => {
      inventorySort = id;
      ctx.rerender();
    });
    controls.append(b);
  }
  const bulk = el("div", "bulk-controls");
  bulk.append(el("span", "bulk-label", "まとめて分解"));
  for (const rarity of RARITY_ROWS) {
    const preview = bulkDismantlePreview(game, crates, rarity.id);
    const b = button(`${rarity.name} ${preview.count}`, "bulk-button");
    b.dataset.rarity = rarity.id;
    b.style.setProperty("--rarity", rarity.color);
    b.disabled = preview.count === 0;
    b.addEventListener("click", () => {
      const ok = window.confirm(
        `${rarity.name}を ${preview.count} 個分解します(+${formatCount(preview.coins)} ウロコイン)。装着中のものは残ります。`,
      );
      if (!ok) return;
      dismantleRarity(game.progress, rarity.id, crates, Number.MAX_SAFE_INTEGER);
      ctx.onGearChanged();
      ctx.rerender();
    });
    bulk.append(b);
  }
  bag.append(title, controls, bulk);
  const list = el("ul", "menu-list");
  const rows = inventoryRows(game, crates, inventorySort);
  if (rows.length === 0) list.append(el("li", "menu-empty", "まだ装備がありません。クレートタブで引けます"));
  for (const v of rows) list.append(expandable(itemRow(v), itemDetail(v, ctx, crates)));
  bag.append(list);
  container.append(slots, bag);
}
