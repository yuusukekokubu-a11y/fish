// @ts-check
// スキルの画面(全画面:D-179・D-195)。スキルの表の順に、名前・「Lv 5 / 7」・レベルの細い棒・今の効果を並べる。
// 頭打ち型で最大のものには MAX の印。行を押すと、装備ごとのレベルの内訳と、各レベルの効果が開く。
// スキルは 3 つのグループ(数値型・条件発動型・ゲージ系)に分け、見出しを押すと閉じる・開く(D-217)。
// 数と文字は skill_view.js が作る。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { button, el } from "./list_view.js";
import { skillGroups } from "./skill_view.js";

/** 成長型の最大レベルが伸びることの一言。 */
export const GROWTH_NOTE = "成長型のスキルは、竿の段階が上がると最大レベルが伸びます。";

/**
 * スキルの画面を作る。
 * @param {HTMLElement} container @param {{ game: import("./skill_view.js").SkillGame }} ctx
 */
export function mountSkills(container, ctx) {
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
    head.append(top, bar, el("span", "skill-effect", row.effect));

    const detail = el("dl", "menu-detail");
    detail.hidden = true;
    /** @type {[string, string][]} */
    const lines = [["説明", row.description]];
    if (row.breakdown.length === 0) lines.push(["内訳", "装着中の装備にこのスキルはありません"]);
    for (const b of row.breakdown) lines.push(["内訳", `${b.name} Lv${b.level}`]);
    if (row.over > 0) lines.push(["余り", `Lv${row.over}(最大をこえた分は無駄になります)`]);
    for (const l of row.levels) lines.push([`Lv${l.level}`, l.effect]);
    if (row.growth) lines.push(["最大", GROWTH_NOTE]);
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
