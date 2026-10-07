// @ts-check
// クレートの画面(全画面:D-139・D-152・D-162)。
// - 上に持ち物の空き(「あと 12 個」)。クレートを釣り場ごとのグループ(新しい釣り場が上。いちばん新しい釣り場だけ開く:D-272)に、
//   段階の新しい順で、名前・価格(1 回/10 連)・引くボタン(D-314)。
// - 名前の横の「排出率」で、排出率・装備の種類・基本効果の範囲を、下から出るシートで見せる(D-314)。
// - 引く演出は gacha_fx.js(今のまま)。結果の下に「装備を見る」を置き、装備の画面に移れる。
// - 引くボタンの上に自動分解の設定を 1 行のプルダウン(オフ・ノーマルまで・レアまで・エピックまで:D-266・D-314)。
//   説明は「?」を押したときだけ出す。引いた直後に分解して保存する。
// 結果は演出の前に確定し、保存してから見せる(D-148)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { DEFAULT_CONFIG } from "../core/config.js";
import { autoScrap, makeCrates, pullCrate, setAutoScrap } from "../core/gear.js";
import { SKILL_ROWS } from "../core/skills.js";
import { noteSkillsSeen } from "../core/skills_seen.js";
import { groupByArea } from "./area_view.js";
import { autoScrapChoices, autoScrapText } from "./bait_view.js";
import { playPull } from "./gacha_fx.js";
import { crateCards, inventorySpaceLabel, inventoryWarning, PULL_MESSAGES, pullResultView } from "./gear_view.js";
import { button, el } from "./list_view.js";
import { openSheet } from "./sheet.js";

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
  const groups = groupByArea(game, crateCards(game, crates), (card) => card.crate.stage, { skipEmpty: true }).reverse();
  for (const group of groups) {
    const box = el("section", "crate-group group");
    box.dataset.area = group.id;
    const head = button("", "group-head crate-group-head");
    head.append(el("span", "section-title", group.title), el("span", "group-mark", ""));
    head.setAttribute("aria-expanded", String(group.open));
    const list = el("div", "crate-list");
    list.hidden = !group.open;
    head.addEventListener("click", () => {
      list.hidden = !list.hidden;
      head.setAttribute("aria-expanded", String(!list.hidden));
    });
    for (const card of group.items) list.append(crateCard(card));
    box.append(head, list);
    container.append(box);
  }

  /** 排出率のシート(D-314):排出率とレア度ごとのスキルの数、装備の種類と基本効果の範囲。 @param {ReturnType<typeof crateCards>[number]} card */
  function openRates(card) {
    openSheet(
      ctx.app,
      (panel, close) => {
        panel.dataset.crate = card.crate.id;
        panel.append(el("h2", "sheet-title", card.name));
        const rates = detailList(card.rates.map((r) => [`${r.stars} ${r.name}`, `${r.rate}・${r.skillsText}`]));
        rates.querySelectorAll("dt").forEach((dt, i) => /** @type {HTMLElement} */ (dt).style.setProperty("color", card.rates[i].color));
        panel.append(el("h3", "detail-title", "排出率"), rates);
        panel.append(el("h3", "detail-title", "装備の種類と基本効果の範囲"), detailList(card.kinds.map((k) => [k.name, k.range])));
        const closeButton = button("閉じる", "secondary-button sheet-close");
        closeButton.addEventListener("click", close);
        panel.append(closeButton);
      },
      "rates-sheet",
    );
  }

  /** クレート 1 枚(名前・価格・引くボタン)。 @param {ReturnType<typeof crateCards>[number]} card */
  function crateCard(card) {
    const box = el("section", "crate-card");
    box.dataset.crate = card.crate.id;
    const head = el("div", "crate-head");
    head.append(el("h2", "crate-name", card.name));
    const more = button("排出率", "chip crate-more");
    more.addEventListener("click", () => openRates(card));
    head.append(more);
    const price = el("p", "crate-price", `1 回 ${card.price.one} ・ 10 連 ${card.price.ten}`);

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
        // 出会ったスキルは、結果が確定したとき(自動分解より前)に記録する。初めてのスキルに NEW(D-300・D-301)。
        const fresh = noteSkillsSeen(/** @type {{ skillsSeen?: string[] }} */ (game.progress), result.items, skillDraw.skills);
        // 見せ方(▲ など)は分解の前に作る。引いた直後に自動分解して、まとめて保存する(D-266)。
        const view = pullResultView(game, result.items, crates, fresh);
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
    return box;
  }
}

/** 自動分解の説明(「?」を押したときだけ出す:D-314)。 */
// ▲ の意味も書く(D-318)。
export const AUTO_SCRAP_HELP =
  "引いた直後に、選んだレア度以下の装備を、自動で分解します。レジェンド・ロック中・装着中・▲の付く装備は対象外です。▲=いま付けている同じ種類より、基本効果が高い";

/**
 * 自動分解の設定(D-266・D-314)。1 行のプルダウンで 4 つから選ぶ。選んだら保存する。説明は「?」で開く。
 * @param {ScreenContext & { storage: { save: (progress: any) => boolean } }} ctx
 */
function autoScrapBox(ctx) {
  const box = el("section", "auto-scrap");
  const row = el("div", "auto-scrap-row");
  const select = /** @type {HTMLSelectElement} */ (document.createElement("select"));
  select.className = "equip-select auto-scrap-select";
  select.name = "auto-scrap";
  select.setAttribute("aria-label", "自動分解(引いた直後)");
  for (const c of autoScrapChoices(ctx.game)) {
    const o = document.createElement("option");
    o.value = c.id;
    o.textContent = `自動分解:${c.label}`;
    if (c.selected) o.selected = true;
    select.append(o);
  }
  select.addEventListener("change", () => {
    setAutoScrap(ctx.game.progress, select.value);
    ctx.storage.save(ctx.game.progress);
    ctx.rerender();
  });
  const help = button("?", "chip auto-scrap-help");
  help.setAttribute("aria-label", "自動分解の説明");
  help.setAttribute("aria-expanded", "false");
  const note = el("p", "auto-scrap-note", AUTO_SCRAP_HELP);
  note.hidden = true;
  help.addEventListener("click", () => {
    note.hidden = !note.hidden;
    help.setAttribute("aria-expanded", String(!note.hidden));
  });
  row.append(select, help);
  box.append(row, note);
  return box;
}
