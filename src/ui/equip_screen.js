// @ts-check
// 装備の画面(全画面:D-152・D-155・D-162)。
// - 上:装着中の枠を 2 列のグリッドで並べる(枠の数は装備の種類の表から。7 枠でも 4 段に収まる)。
// - 下:持ち物のカード。並べ替え(レア度順/新しい順)と、種類ごとの絞り込み、まとめて分解。
// - カードか枠を押すと、下から詳細のシートが出る(いまの装備との差、付ける・外す・分解)。
// 数と文字は gear_view.js が作る。操作は計算本体(gear.js)の関数を呼ぶ。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { dismantleItem, dismantleRarity, equipItem, makeCrates, unequipKind } from "../core/gear.js";
import { formatCount } from "./format.js";
import { bulkDismantleRows, inventoryLabel, inventoryRows, slotRows } from "./gear_view.js";
import { button, el } from "./list_view.js";
import { confirmSheet, openSheet } from "./sheet.js";

/** @typedef {import("./gear_view.js").GameLike} GameLike */
/** @typedef {ReturnType<typeof import("./gear_view.js").itemView>} ItemView */
/** @typedef {ReturnType<typeof makeCrates>} Crates */

/**
 * 画面の部品に渡すもの(main.js が作る)。
 * @typedef {object} ScreenContext
 * @property {GameLike} game
 * @property {HTMLElement} app 画面全体(シートや演出を重ねる場所)
 * @property {() => void} rerender 今の画面を作り直す(スクロールの位置は保つ)
 * @property {() => void} onGearChanged 装備が変わったとき(戦闘の数値の表を作り直して保存する)
 * @property {(id: string) => void} navigate 別の画面に移る
 */

// 並べ方と絞り込み(画面を作り直しても保つ)。
/** @type {"rarity" | "new"} */
let sortOrder = "rarity";
/** @type {string | null} */
let kindFilter = null;

/** レア度の印(★と名前を、その色で)。 @param {{ stars: string, rarity: string, color: string }} v */
function rarityBadge(v) {
  const badge = el("span", "rarity-badge", `${v.stars} ${v.rarity}`);
  badge.style.setProperty("color", v.color);
  return badge;
}

/** 装備 1 個のカード(持ち物の一覧)。 @param {ItemView} v */
function itemCard(v) {
  const card = button("", "item-card");
  card.dataset.item = String(v.id);
  card.style.setProperty("--rarity", v.color);
  const top = el("div", "item-card-top");
  top.append(rarityBadge(v), el("span", "item-kind", v.kindName));
  if (v.equipped) top.append(el("span", "item-tag", "装着中"));
  if (v.better) top.append(el("span", "item-better", "▲"));
  card.append(top, el("div", "item-name", v.name), el("div", "item-effect", v.effect));
  // スキルの欄(最大 3 行)。空なら何も出さない(D-155)。
  if (v.skills.length > 0) {
    const skills = el("ul", "item-skills");
    for (const s of v.skills) skills.append(el("li", "", s));
    card.append(skills);
  }
  return card;
}

/**
 * 装備 1 個の詳細のシート(いまの装備との差、付ける・外す・分解)。
 * @param {ScreenContext} ctx @param {ItemView} v @param {Crates} crates
 */
function openItemSheet(ctx, v, crates) {
  const { game } = ctx;
  openSheet(
    ctx.app,
    (panel, close) => {
      panel.dataset.item = String(v.id);
      panel.append(el("h2", "sheet-title", v.name), rarityBadge(v));
      const dl = el("dl", "sheet-list");
      for (const [k, val] of /** @type {[string, string][]} */ ([
        ["種類", v.kindName],
        ["グレード", String(v.grade)],
        ["基本効果", v.effect],
        ...v.skills.map((s) => /** @type {[string, string]} */ (["スキル", s])),
      ])) {
        dl.append(el("dt", "", k), el("dd", "", val));
      }
      panel.append(dl);
      const diffText = v.equipped ? "装着中" : `いまの装備との差 ${v.diff}`;
      panel.append(el("p", `item-diff ${v.diffSign > 0 ? "up" : v.diffSign < 0 ? "down" : ""}`, diffText));
      const row = el("div", "sheet-buttons");
      const toggle = button(v.equipped ? "外す" : "付ける", "primary-button item-equip");
      toggle.addEventListener("click", () => {
        const item = game.progress.gear.items.find((it) => it.id === v.id);
        if (!item) return;
        if (v.equipped) unequipKind(game.progress.gear, item.kind);
        else equipItem(game.progress.gear, item.id);
        ctx.onGearChanged();
        close();
        ctx.rerender();
      });
      const scrap = button(`分解 +${formatCount(v.refund)}`, "secondary-button item-dismantle");
      scrap.addEventListener("click", () => {
        const run = () => {
          dismantleItem(game.progress, v.id, crates, Number.MAX_SAFE_INTEGER);
          ctx.onGearChanged();
          ctx.rerender();
        };
        close();
        // 装着中のものを分解するときは確かめる。
        if (v.equipped) confirmSheet(ctx.app, "装着中の装備を分解します", [v.name, `+${formatCount(v.refund)} ウロコイン`], "分解する", run);
        else run();
      });
      const cancel = button("閉じる", "secondary-button sheet-close");
      cancel.addEventListener("click", close);
      row.append(scrap, toggle);
      panel.append(row, cancel);
    },
    "item-sheet",
  );
}

/**
 * まとめて分解:レア度を選ぶと、何個・いくら戻るかを確かめてから分解する(装着中は除く)。
 * @param {ScreenContext} ctx @param {Crates} crates
 */
function openBulkSheet(ctx, crates) {
  const { game } = ctx;
  openSheet(
    ctx.app,
    (panel, close) => {
      panel.append(el("h2", "sheet-title", "まとめて分解"), el("p", "sheet-line", "装着中のものは含めません"));
      const list = el("div", "bulk-list");
      for (const r of bulkDismantleRows(game, crates)) {
        const b = button("", "bulk-button");
        b.dataset.rarity = r.id;
        b.style.setProperty("--rarity", r.color);
        const name = el("span", "rarity-badge", `${r.stars} ${r.name}`);
        name.style.setProperty("color", r.color);
        b.append(name, el("span", "bulk-count", `${r.count} 個 / +${formatCount(r.coins)}`));
        b.disabled = r.count === 0;
        b.addEventListener("click", () => {
          close();
          confirmSheet(
            ctx.app,
            `${r.name}をまとめて分解します`,
            [`${r.count} 個`, `+${formatCount(r.coins)} ウロコイン`],
            "分解する",
            () => {
              dismantleRarity(game.progress, r.id, crates, Number.MAX_SAFE_INTEGER);
              ctx.onGearChanged();
              ctx.rerender();
            },
          );
        });
        list.append(b);
      }
      const cancel = button("閉じる", "secondary-button sheet-close");
      cancel.addEventListener("click", close);
      panel.append(list, cancel);
    },
    "bulk-sheet",
  );
}

/**
 * 装備の画面を作る。
 * @param {HTMLElement} container @param {ScreenContext} ctx
 */
export function mountEquipment(container, ctx) {
  const { game } = ctx;
  const crates = makeCrates(game.content, /** @type {any} */ (game.config));

  const slots = el("section", "screen-section");
  slots.append(el("h2", "section-title", "装着中"));
  const grid = el("div", "slot-grid");
  for (const slot of slotRows(game, crates)) {
    const cell = button("", slot.item ? "slot-cell" : "slot-cell empty");
    cell.dataset.slot = slot.kind;
    cell.append(el("span", "slot-kind", slot.kindName));
    if (slot.item) {
      const item = slot.item;
      cell.style.setProperty("--rarity", item.color);
      cell.append(rarityBadge(item), el("span", "slot-name", item.name), el("span", "slot-effect", item.effect));
      cell.addEventListener("click", () => openItemSheet(ctx, item, crates));
    } else {
      // 空の枠を押すと、その種類で持ち物を絞り込む。
      cell.append(el("span", "slot-empty", "空き"));
      cell.addEventListener("click", () => {
        kindFilter = slot.kind;
        ctx.rerender();
      });
    }
    grid.append(cell);
  }
  slots.append(grid);

  const bag = el("section", "screen-section");
  const head = el("div", "bag-head");
  head.append(el("h2", "section-title", inventoryLabel(game)));
  const bulk = button("まとめて分解", "secondary-button bulk-open");
  bulk.addEventListener("click", () => openBulkSheet(ctx, crates));
  head.append(bulk);

  const sorts = el("div", "chip-row");
  for (const [id, label] of /** @type {["rarity" | "new", string][]} */ ([
    ["rarity", "レア度順"],
    ["new", "新しい順"],
  ])) {
    const b = button(label, `chip${sortOrder === id ? " active" : ""}`);
    b.dataset.sort = id;
    b.setAttribute("aria-pressed", String(sortOrder === id));
    b.addEventListener("click", () => {
      sortOrder = id;
      ctx.rerender();
    });
    sorts.append(b);
  }
  const filters = el("div", "chip-row");
  for (const [id, label] of [[null, "すべて"], ...game.content.equipKinds.map((k) => [k.id, k.name])]) {
    const b = button(/** @type {string} */ (label), `chip${kindFilter === id ? " active" : ""}`);
    b.dataset.filter = id ?? "all";
    b.setAttribute("aria-pressed", String(kindFilter === id));
    b.addEventListener("click", () => {
      kindFilter = /** @type {string | null} */ (id);
      ctx.rerender();
    });
    filters.append(b);
  }
  bag.append(head, sorts, filters);

  const list = el("div", "item-list");
  const rows = inventoryRows(game, crates, sortOrder, kindFilter);
  if (rows.length === 0) list.append(el("p", "screen-empty", "装備がありません"));
  for (const v of rows) {
    const card = itemCard(v);
    card.addEventListener("click", () => openItemSheet(ctx, v, crates));
    list.append(card);
  }
  bag.append(list);
  container.append(slots, bag);
}
