// @ts-check
// 装備の画面の中のグローブ(特殊枠:D-332)。装着の枠(6 枠とは見た目を分ける)、持ち物の一覧、詳細のシート。
// - 保管がいっぱいのときだけ、枠に小さな「いっぱい」(釣れるクレートが出ない理由の説明は置かない:D-333)。
// - 詳細:能力の名前と一文の説明、効果、レア度、グレードと対応段階。付け替えの差は 1 行。付ける・外す・分解・ロック。
// - 分解するとグローブの欠片 1 個。一覧の上に欠片の数と「グローブのクレートを開ける」(欠片 5 個で 1 回:D-410)。
// 数と文字は glove_view.js が作る。操作は計算本体(glove.js)の関数を呼ぶ。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { dismantleGlove, equipGlove, openFragmentCrate, setGloveLocked, unequipGlove } from "../core/glove.js";
import { ensureGloveBag } from "../core/glove_play.js";
import { playPull } from "./gacha_fx.js";
import { fragmentView, glovePullView, gloveRows, gloveSpace, gloveSwapText } from "./glove_view.js";
import { button, el } from "./list_view.js";
import { confirmSheet, openSheet } from "./sheet.js";

/** @typedef {ReturnType<typeof import("./glove_view.js").gloveView>} GloveView */
/** @typedef {import("./equip_screen.js").ScreenContext} ScreenContext */
/** @typedef {readonly { grade: number, price: number }[]} Crates */

/** レア度の印(★と名前を、その色で)。 @param {GloveView} v */
function rarityBadge(v) {
  const badge = el("span", "rarity-badge", `${v.stars} ${v.rarity}`);
  badge.style.setProperty("color", v.color);
  return badge;
}

/** 鍵の印。 */
function lockMark() {
  const mark = el("span", "item-lock", "🔒");
  mark.setAttribute("aria-label", "ロック中");
  return mark;
}

/**
 * グローブの装着の枠(6 枠の下に、横長に 1 つ)。押すと、装着中なら詳細、空きなら持ち物の一覧へ。
 * @param {ScreenContext} ctx @param {Crates} crates @param {() => void} showList
 */
export function gloveSlot(ctx, crates, showList) {
  const worn = gloveRows(ctx.game, crates).find((v) => v.equipped) ?? null;
  const space = gloveSpace(ctx.game);
  const cell = button("", worn ? "glove-slot" : "glove-slot empty");
  cell.dataset.slot = "glove";
  const head = el("span", "glove-slot-kind", "グローブ");
  cell.append(head);
  if (worn) {
    cell.style.setProperty("--rarity", worn.color);
    const stars = el("span", "slot-stars", worn.stars);
    stars.style.setProperty("color", worn.color);
    stars.setAttribute("aria-label", worn.rarity);
    cell.append(stars, el("span", "glove-slot-name", worn.abilityName));
    if (worn.locked) cell.append(lockMark());
    cell.addEventListener("click", () => openGloveSheet(ctx, worn, crates));
  } else {
    cell.append(el("span", "slot-empty", "空き"));
    cell.addEventListener("click", showList);
  }
  // 保管がいっぱいのときだけ、小さな警告(D-333)。
  if (space.full) cell.append(el("span", "glove-full", "いっぱい"));
  return cell;
}

/**
 * グローブの持ち物の一覧。
 * @param {ScreenContext} ctx @param {Crates} crates
 */
export function gloveList(ctx, crates) {
  const box = el("div", "item-list glove-list");
  // グローブの欠片と、欠片のクレート(D-410)。開けたら、出たグローブの詳細を開く。
  const frag = fragmentView(ctx.game);
  const fragBox = el("div", "glove-fragments");
  const open = button(frag.label, "primary-button glove-fragment-open");
  open.disabled = !frag.canOpen;
  open.addEventListener("click", () => {
    const { game } = ctx;
    const c = /** @type {any} */ (game.config).glove;
    const glove = openFragmentCrate(ensureGloveBag(game.progress), Number(game.progress.gear.seed), game.progress.rodStage, c.fragmentsPerCrate, c.max);
    if (!glove) return;
    ctx.onGearChanged();
    ctx.rerender();
    // 開封の演出(D-414)。釣れるクレートと同じ演出で、結果の下の「詳細を見る」で詳細を開く。
    const v = gloveRows(game, crates).find((r) => r.id === glove.id);
    const link = v ? { label: "詳細を見る", onClick: () => openGloveSheet(ctx, v, crates) } : null;
    // glovePullView は演出に要る項目だけを持つ(装備の結果の形の一部)。
    playPull(ctx.app, /** @type {any} */ (glovePullView(game, glove)),"欠片のクレート", () => ctx.rerender(), link);
  });
  fragBox.append(el("p", "glove-fragment-count", frag.text), open, el("p", "pull-note", frag.note));
  box.append(fragBox);
  const rows = gloveRows(ctx.game, crates);
  if (rows.length === 0) box.append(el("p", "screen-empty", "グローブがありません"));
  for (const v of rows) {
    const card = button("", "item-card glove-card");
    card.dataset.glove = String(v.id);
    card.style.setProperty("--rarity", v.color);
    const top = el("div", "item-card-top");
    top.append(rarityBadge(v), el("span", "item-kind", `G${v.grade}`));
    if (v.locked) {
      card.classList.add("locked");
      top.append(lockMark());
    }
    if (v.equipped) top.append(el("span", "item-tag", "装着中"));
    card.append(top, el("div", "item-name", v.name), el("div", "item-effect", v.effect), el("div", "glove-cover", v.cover));
    card.addEventListener("click", () => openGloveSheet(ctx, v, crates));
    box.append(card);
  }
  return box;
}

/**
 * グローブ 1 個の詳細のシート。
 * @param {ScreenContext} ctx @param {GloveView} v @param {Crates} _crates(分解がウロコインだったころの名残:D-410 から使わない)
 */
export function openGloveSheet(ctx, v, _crates) {
  const { game } = ctx;
  openSheet(
    ctx.app,
    (panel, close) => {
      panel.dataset.glove = String(v.id);
      const title = el("h2", "sheet-title item-sheet-title");
      title.append(el("span", "", v.name), el("span", "item-meta", `・グローブ・G${v.grade}`));
      const badges = el("div", "item-sheet-badges");
      badges.append(rarityBadge(v));
      if (v.equipped) badges.append(el("span", "item-tag", "装着中"));
      panel.append(title, badges);
      const dl = el("dl", "sheet-list");
      for (const [k, val] of /** @type {[string, string][]} */ ([
        ["能力", v.abilityName],
        ["説明", v.abilityText],
        ["効果", v.effect],
        ["対応", v.cover],
      ])) {
        dl.append(el("dt", "", k), el("dd", "", val));
      }
      panel.append(dl);
      const glove = ensureGloveBag(game.progress).items.find((g) => g.id === v.id);
      const swap = glove && !v.equipped ? gloveSwapText(game, glove) : null;
      if (swap) panel.append(el("p", "glove-swap", swap));
      const toggle = button(v.equipped ? "外す" : "付ける", "primary-button item-equip");
      toggle.addEventListener("click", () => {
        const bag = ensureGloveBag(game.progress);
        if (v.equipped) unequipGlove(bag);
        else equipGlove(bag, v.id);
        ctx.onGearChanged();
        close();
        ctx.rerender();
      });
      const scrap = button(v.locked ? "分解(ロック中)" : "分解 +欠片 1", "secondary-button item-small item-dismantle");
      scrap.disabled = v.locked;
      scrap.addEventListener("click", () => {
        if (v.locked) return;
        const run = () => {
          dismantleGlove(ensureGloveBag(game.progress), v.id);
          ctx.onGearChanged();
          ctx.rerender();
        };
        close();
        confirmSheet(ctx.app, v.equipped ? "装着中のグローブを分解します" : "グローブを分解します", [v.name, "+グローブの欠片 1 個"], "分解する", run);
      });
      const lock = button(v.locked ? "🔒 外す" : "🔒 ロック", "secondary-button item-small item-lock-toggle");
      lock.setAttribute("aria-pressed", String(v.locked));
      lock.setAttribute("aria-label", v.locked ? "ロックを外す" : "ロックする");
      lock.addEventListener("click", () => {
        setGloveLocked(ensureGloveBag(game.progress), v.id, !v.locked);
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
    "item-sheet glove-sheet",
  );
}
