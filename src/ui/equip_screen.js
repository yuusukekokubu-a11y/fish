// @ts-check
// 装備の画面(全画面:D-152・D-155・D-162)。
// - 上:装着中の枠を、小さめの 3 列のグリッドで並べ、上に固定する(持ち物だけが動く:D-179)。
//   枠の数は装備の種類の表から(7 枠でも 3 段)。
// - 下:持ち物のカード(スキルの行つき)。並べ替えと、種類・レア度・ロックの絞り込みはプルダウン(D-304)。
//   まとめて分解と、絞り込み中の装備のまとめてロック・解除(D-246)は、「操作」メニューにまとめる。
//   選んだ並べ替えと絞り込みは ctx.equipView で覚える(ゲームの保存データとは別の場所。なければ画面を作り直す間だけ)。
// - カードか枠を押すと、下から詳細のシートが出る(D-314):名前の横に種類とグレード。いまの装備との差とスキルレベルの変化は
//   変わるときだけ 1 行。「付ける/外す」を大きく、分解とロックを小さく。
// - ロック中の装備は、カードと枠に鍵の印(🔒。色だけでなく形で分かる)。分解のボタンは押せない(D-246)。
// - グローブ(特殊枠:D-332):6 枠の下に横長の枠を 1 つ。持ち物は「装備 / グローブ」の切り替えで別の一覧(glove_screen.js)。
// 数と文字は gear_view.js が作る。操作は計算本体(gear.js)の関数を呼ぶ。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { charmById } from "../core/charms.js";
import { dismantleItem, dismantleRarity, equipItem, gachaKinds, makeCrates, RARITY_ROWS, setLocked, unequipKind } from "../core/gear.js";
import { formatCount } from "./format.js";
import { defaultPrefs } from "./equip_prefs.js";
import { bulkDismantleRows, bulkLockPreview, inventoryLabel, inventoryRows, slotRows, SORT_CHOICES } from "./gear_view.js";
import { button, el } from "./list_view.js";
import { gloveList, gloveSlot } from "./glove_screen.js";
import { gloveSpace } from "./glove_view.js";
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
 * @property {(items: readonly { rarity: string }[]) => void} [onPull] ガチャで引いたとき(遊びの記録にレア度を数える:D-368)
 * @property {(id: string) => void} navigate 別の画面に移る
 * @property {{ get: () => import("./equip_prefs.js").EquipPrefs, set: (p: import("./equip_prefs.js").EquipPrefs) => void }} [equipView]
 *   並べ替えと絞り込みを覚える場所(D-304)
 */

// ctx.equipView がないとき(テストなど)の並べ替えと絞り込み(画面を作り直しても保つ)。
let memoryPrefs = defaultPrefs();
// 持ち物の一覧の切り替え(装備 / グローブ)。画面を作り直しても保つ(保存はしない)。
let listMode = /** @type {"gear" | "glove"} */ ("gear");

/** @param {ScreenContext} ctx */
function getPrefs(ctx) {
  return ctx.equipView ? ctx.equipView.get() : { ...memoryPrefs };
}

/** @param {ScreenContext} ctx @param {import("./equip_prefs.js").EquipPrefs} prefs */
function setPrefs(ctx, prefs) {
  if (ctx.equipView) ctx.equipView.set(prefs);
  else memoryPrefs = { ...prefs };
}

/** 鍵の印(ロック中の装備:D-246)。 */
function lockMark() {
  const mark = el("span", "item-lock", "🔒");
  mark.setAttribute("aria-label", "ロック中");
  mark.title = "ロック中";
  return mark;
}

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
  if (v.locked) {
    card.classList.add("locked");
    top.append(lockMark());
  }
  if (v.equipped) top.append(el("span", "item-tag", "装着中"));
  if (v.better) top.append(el("span", "item-better", "▲"));
  card.append(top, el("div", "item-name", v.name), el("div", "item-effect", v.effect));
  // スキルの欄(最大 3 行。名前とポイント)。空なら何も出さない(D-155・D-179)。
  if (v.skills.length > 0) {
    const skills = el("ul", "item-skills");
    for (const s of v.skills) skills.append(el("li", "", s.text));
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
      // 名前の横に、種類とグレードを小さく(D-314)。
      const title = el("h2", "sheet-title item-sheet-title");
      title.append(el("span", "", v.name), el("span", "item-meta", `・${v.kindName}・G${v.grade}`));
      // レア度と「装着中」の札は 1 行に並べる(D-318)。
      const badges = el("div", "item-sheet-badges");
      badges.append(rarityBadge(v));
      if (v.equipped) badges.append(el("span", "item-tag", "装着中"));
      panel.append(title, badges);
      const dl = el("dl", "sheet-list");
      for (const [k, val] of /** @type {[string, string][]} */ ([
        ["基本効果", v.effect],
        ...v.skills.map((s) => /** @type {[string, string]} */ (["スキル", s.text])),
      ])) {
        dl.append(el("dt", "", k), el("dd", "", val));
      }
      panel.append(dl);
      // いまの装備との差と、付けた(外した)ときのスキルレベルの変化は、変わるときだけ 1 行で(D-314)。
      if (!v.equipped && v.diffSign !== 0) {
        panel.append(el("p", `item-diff ${v.diffSign > 0 ? "up" : "down"}`, `いまの装備との差 ${v.diff}`));
      }
      if (v.skillChanges.length > 0) {
        const line = el("p", "skill-changes");
        line.append(el("span", "skill-changes-title", v.equipped ? "外すと " : "付けると "));
        v.skillChanges.forEach((c, i) => {
          if (i > 0) line.append("・");
          line.append(el("span", `item-diff ${c.up ? "up" : "down"}`, c.text));
        });
        panel.append(line);
      }
      // 「付ける/外す」を大きく。分解とロックは小さく横に並べる(押せる場所は 44px 以上:D-314)。
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
      // ロック中は分解できない(押せない見た目と「ロック中」:D-246)。
      const scrap = button(v.locked ? "分解(ロック中)" : `分解 +${formatCount(v.refund)}`, "secondary-button item-small item-dismantle");
      scrap.disabled = v.locked;
      scrap.addEventListener("click", () => {
        if (v.locked) return;
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
      const lock = button(v.locked ? "🔒 外す" : "🔒 ロック", "secondary-button item-small item-lock-toggle");
      lock.setAttribute("aria-pressed", String(v.locked));
      lock.setAttribute("aria-label", v.locked ? "ロックを外す" : "ロックする");
      lock.addEventListener("click", () => {
        setLocked(game.progress.gear, [v.id], !v.locked);
        ctx.onGearChanged();
        close();
        ctx.rerender();
      });
      const cancel = button("閉じる", "secondary-button sheet-close");
      cancel.addEventListener("click", close);
      const small = el("div", "sheet-buttons item-small-row");
      small.append(scrap, lock);
      if (v.locked) panel.append(el("p", "item-locked-note", "ロック中:分解できません"));
      panel.append(toggle, small, cancel);
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
      panel.append(el("h2", "sheet-title", "まとめて分解"), el("p", "sheet-line", "装着中とロック中のものは含めません"));
      const list = el("div", "bulk-list");
      for (const r of bulkDismantleRows(game, crates)) {
        const b = button("", "bulk-button");
        b.dataset.rarity = r.id;
        b.style.setProperty("--rarity", r.color);
        const name = el("span", "rarity-badge", `${r.stars} ${r.name}`);
        name.style.setProperty("color", r.color);
        b.append(name, el("span", "bulk-count", `${r.count} 個 / +${formatCount(r.coins)}${r.locked > 0 ? `(ロック中 ${r.locked} 個は除く)` : ""}`));
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
 * 「操作」メニュー(D-304):まとめて分解・絞り込み中をまとめてロック・まとめて解除。確認はこれまでどおり(何個・いくら)。
 * @param {ScreenContext} ctx @param {Crates} crates @param {import("./equip_prefs.js").EquipPrefs} prefs
 */
function openActionSheet(ctx, crates, prefs) {
  const { game } = ctx;
  openSheet(
    ctx.app,
    (panel, close) => {
      panel.append(el("h2", "sheet-title", "操作"));
      const list = el("div", "action-list");
      const bulk = button("まとめて分解…", "secondary-button action-item bulk-open");
      bulk.addEventListener("click", () => {
        close();
        openBulkSheet(ctx, crates);
      });
      list.append(bulk);
      // 絞り込み中の装備を、まとめてロック・解除(確認つき。何個変わるかを出す:D-246)。
      for (const [locked, label] of /** @type {[boolean, string][]} */ ([
        [true, "絞り込み中をまとめてロック"],
        [false, "絞り込み中をまとめて解除"],
      ])) {
        const preview = bulkLockPreview(game, prefs.kind, prefs.lock, locked, prefs.rarity);
        const b = button(`${label}(${preview.count})`, "secondary-button action-item bulk-lock");
        b.dataset.lock = locked ? "on" : "off";
        b.disabled = preview.count === 0;
        b.addEventListener("click", () => {
          close();
          confirmSheet(
            ctx.app,
            locked ? "絞り込み中の装備をロックします" : "絞り込み中の装備のロックを外します",
            [`絞り込み中 ${preview.shown} 個のうち ${preview.count} 個が変わります`, locked ? "ロック中は分解できません" : "外すと分解できるようになります"],
            locked ? "ロックする" : "外す",
            () => {
              setLocked(game.progress.gear, preview.ids, locked);
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
    "action-sheet",
  );
}

/**
 * プルダウン 1 つ(高さ 44px 以上:D-304)。
 * @param {string} name @param {string} label 読み上げ用の名前 @param {[string, string][]} options [値, 文字] @param {string} value
 * @param {(v: string) => void} onChange
 */
function select(name, label, options, value, onChange) {
  const box = /** @type {HTMLSelectElement} */ (document.createElement("select"));
  box.className = "equip-select";
  box.name = name;
  box.dataset.select = name;
  box.setAttribute("aria-label", label);
  for (const [v, text] of options) {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = text;
    if (v === value) o.selected = true;
    box.append(o);
  }
  box.addEventListener("change", () => onChange(box.value));
  return box;
}

/**
 * 装備の画面を作る。
 * @param {HTMLElement} container @param {ScreenContext} ctx
 */
export function mountEquipment(container, ctx) {
  const { game } = ctx;
  const crates = makeCrates(game.content, /** @type {any} */ (game.config));
  const prefs = getPrefs(ctx);
  /** @param {Partial<import("./equip_prefs.js").EquipPrefs>} change */
  const update = (change) => {
    setPrefs(ctx, { ...prefs, ...change });
    ctx.rerender();
  };

  const slots = el("section", "screen-section slots-fixed");
  slots.append(el("h2", "section-title", "装着中"));
  const grid = el("div", "slot-grid");
  for (const slot of slotRows(game, crates)) {
    const cell = button("", slot.item ? "slot-cell" : "slot-cell empty");
    cell.dataset.slot = slot.kind;
    cell.append(el("span", "slot-kind", slot.kindName));
    if (slot.item) {
      const item = slot.item;
      cell.style.setProperty("--rarity", item.color);
      const stars = el("span", "slot-stars", item.stars);
      stars.style.setProperty("color", item.color);
      stars.setAttribute("aria-label", item.rarity);
      cell.append(stars, el("span", "slot-effect", item.effect));
      if (item.locked) cell.append(lockMark());
      cell.addEventListener("click", () => openItemSheet(ctx, item, crates));
    } else {
      // 空の枠を押すと、その種類で持ち物を絞り込む。
      cell.append(el("span", "slot-empty", "空き"));
      cell.addEventListener("click", () => update({ kind: slot.kind }));
    }
    grid.append(cell);
  }
  slots.append(grid);
  // グローブの枠(特殊枠。6 枠とは見た目を分ける:D-332)。
  slots.append(
    gloveSlot(ctx, crates, () => {
      listMode = "glove";
      ctx.rerender();
    }),
  );
  // お守りの枠(降臨専用。ガチャでは出ない:D-392)。付け替えは降臨の画面で行う。
  slots.append(charmSlot(game));

  // 持ち物の切り替え(装備 / グローブ)。
  const tabs = el("div", "bag-tabs");
  tabs.setAttribute("role", "tablist");
  for (const [mode, label] of /** @type {["gear" | "glove", string][]} */ ([
    ["gear", "装備"],
    ["glove", gloveSpace(game).label],
  ])) {
    const tab = button(label, `bag-tab${listMode === mode ? " active" : ""}`);
    tab.dataset.tab = mode;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(listMode === mode));
    tab.addEventListener("click", () => {
      listMode = mode;
      ctx.rerender();
    });
    tabs.append(tab);
  }
  if (listMode === "glove") {
    const gloves = el("section", "screen-section");
    gloves.append(tabs, gloveList(ctx, crates));
    container.append(slots, gloves);
    return;
  }

  const bag = el("section", "screen-section");
  const head = el("div", "bag-head");
  head.append(el("h2", "section-title", inventoryLabel(game)));
  const actions = button("操作", "secondary-button action-open");
  actions.addEventListener("click", () => openActionSheet(ctx, crates, prefs));
  head.append(actions);

  // 並べ替えと絞り込みのプルダウン(2 列に並べる。幅 360px でもはみ出さない:D-304)。
  const controls = el("div", "equip-controls");
  controls.append(
    select("sort", "並べ替え", SORT_CHOICES.map((c) => [c.id, `並び:${c.label}`]), prefs.sort, (v) =>
      update({ sort: /** @type {import("./gear_view.js").SortId} */ (v) }),
    ),
    select("kind", "種類の絞り込み", [["all", "種類:すべて"], ...gachaKinds(game.content.equipKinds).map((k) => /** @type {[string, string]} */ ([k.id, k.name]))], prefs.kind ?? "all", (v) =>
      update({ kind: v === "all" ? null : v }),
    ),
    select("rarity", "レア度の絞り込み", [["all", "レア度:すべて"], ...RARITY_ROWS.map((r) => /** @type {[string, string]} */ ([r.id, r.name]))], prefs.rarity ?? "all", (v) =>
      update({ rarity: v === "all" ? null : v }),
    ),
    select("lock", "ロックの絞り込み", [["all", "ロック:すべて"], ["locked", "🔒 ロック中"], ["unlocked", "ロックなし"]], prefs.lock ?? "all", (v) =>
      update({ lock: v === "all" ? null : /** @type {import("./gear_view.js").LockFilter} */ (v) }),
    ),
  );
  bag.append(tabs, head, controls);

  const list = el("div", "item-list");
  const rows = inventoryRows(game, crates, prefs.sort, prefs.kind, prefs.lock, prefs.rarity);
  if (rows.length === 0) list.append(el("p", "screen-empty", "装備がありません"));
  for (const v of rows) {
    const card = itemCard(v);
    card.addEventListener("click", () => openItemSheet(ctx, v, crates));
    list.append(card);
  }
  bag.append(list);
  container.append(slots, bag);
}

/**
 * お守りの枠(D-392)。付けていれば名前とレベル、なければ「降臨で授かる」。
 * @param {any} game
 */
function charmSlot(game) {
  const bag = game.progress.charms ?? null;
  const row = bag?.equipped ? charmById(bag.equipped) : undefined;
  const box = el("div", row ? "glove-slot charm-slot" : "glove-slot charm-slot empty");
  box.dataset.slot = "charm";
  box.append(el("span", "glove-slot-kind", "お守り"));
  if (row && bag) box.append(el("span", "glove-slot-name", `${row.name} Lv${bag.levels[row.id]}`));
  else box.append(el("span", "slot-empty", "空き(降臨で授かる)"));
  return box;
}
