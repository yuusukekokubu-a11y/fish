// @ts-check
// スキルの画面(全画面:D-179・D-195・D-299)。
// - 発動中(Lv1 以上)のスキルだけを、レベルの高い順に 1 つの一覧で並べる(グループの見出しは出さない)。
//   1 行に、名前・「Lv 5 / 7」・レベルの細い棒・次のレベルでの増分。頭打ち型で最大のものには MAX の印。
//   行を押すと、今の効果・装備ごとのレベルの内訳・各レベルの効果が開く。
// - 発動中のスキルがなければ「スキルなし」とだけ出す。未発動のスキルの数・名前は出さない。
// - ?debug のときだけ「全スキルを見る」の切り替え。入れると、全部のスキルを 3 つのグループ(D-221)で出す。
// 数と文字は skill_view.js が作る。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { button, el } from "./list_view.js";
import { activeSkillRows, NO_SKILLS, skillGroups } from "./skill_view.js";

// ?debug の「全スキルを見る」(画面を作り直しても保つ)。
let showAll = false;

/**
 * スキルの画面を作る。
 * @param {HTMLElement} container @param {{ game: import("./skill_view.js").SkillGame, debug?: boolean, rerender?: () => void }} ctx
 */
export function mountSkills(container, ctx) {
  if (ctx.debug) {
    const toggle = button(showAll ? "全スキルを見る:入" : "全スキルを見る:切", "chip skill-show-all");
    toggle.setAttribute("aria-pressed", String(showAll));
    toggle.addEventListener("click", () => {
      showAll = !showAll;
      if (ctx.rerender) ctx.rerender();
    });
    container.append(toggle);
    if (showAll) {
      mountAllSkills(container, ctx);
      return;
    }
  }
  const rows = activeSkillRows(ctx.game);
  const box = el("section", "screen-section skill-active");
  if (rows.length === 0) box.append(el("p", "screen-empty skill-none", NO_SKILLS));
  else box.append(mountSkillList(rows));
  container.append(box);
}

/** 全部のスキルを、3 つのグループで(?debug の確かめ用)。 @param {HTMLElement} container @param {{ game: import("./skill_view.js").SkillGame }} ctx */
function mountAllSkills(container, ctx) {
  for (const group of skillGroups(ctx.game)) {
    const box = el("section", "screen-section skill-group");
    box.dataset.group = group.id;
    const head = button("", "skill-group-head");
    head.append(el("span", "section-title", group.title), el("span", "skill-group-count", `${group.count} / ${group.total}`));
    head.setAttribute("aria-expanded", String(group.open));
    const list = mountSkillList(group.rows);
    list.hidden = !group.open;
    head.addEventListener("click", () => {
      list.hidden = !list.hidden;
      head.setAttribute("aria-expanded", String(!list.hidden));
    });
    box.append(head, list);
    container.append(box);
  }
}

/** グループの中のスキルの一覧。 @param {ReturnType<typeof import("./skill_view.js").skillRows>} rows */
function mountSkillList(rows) {
  const list = el("ul", "menu-list skill-list");
  for (const row of rows) {
    const item = el("li");
    item.dataset.skill = row.id;
    const head = button("", "menu-row skill-row");
    const top = el("span", "skill-top");
    top.append(el("span", "menu-label", row.name), el("span", "menu-value skill-level", row.label));
    if (row.capped) top.append(el("span", "skill-max", "MAX"));
    const bar = el("span", "skill-bar");
    bar.setAttribute("role", "progressbar");
    bar.setAttribute("aria-valuemin", "0");
    bar.setAttribute("aria-valuemax", "100");
    bar.setAttribute("aria-valuenow", String(Math.round(row.progress * 100)));
    const fill = el("span", "skill-bar-fill");
    fill.style.setProperty("width", `${Math.round(row.progress * 100)}%`);
    bar.append(fill);
    head.append(top, bar);
    if (row.next) head.append(el("span", "skill-next", row.next));

    const detail = el("dl", "menu-detail");
    detail.hidden = true;
    /** @type {[string, string][]} */
    const lines = [["今の効果", row.effect], ["説明", row.description]];
    if (row.breakdown.length === 0) lines.push(["内訳", "装着中の装備にこのスキルはありません"]);
    for (const b of row.breakdown) lines.push(["内訳", `${b.name} Lv${b.level}`]);
    if (row.over > 0) lines.push(["余り", `Lv${row.over}`]);
    for (const l of row.levels) lines.push([`Lv${l.level}`, l.effect]);
    for (const [k, v] of lines) detail.append(el("dt", "", k), el("dd", "", v));
    head.setAttribute("aria-expanded", "false");
    head.addEventListener("click", () => {
      detail.hidden = !detail.hidden;
      head.setAttribute("aria-expanded", String(!detail.hidden));
    });
    item.append(head, detail);
    list.append(item);
  }
  return list;
}
