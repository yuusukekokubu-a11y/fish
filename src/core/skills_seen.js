// @ts-check
// 出会ったスキル(D-300・D-301)。ガチャで引いた装備に付いていたスキルを、進み具合の skillsSeen に記録する。
// 引いた結果が確定したとき(自動分解より前)に呼ぶ。自動分解された装備のスキルも「出会った」になる。
// 初めて出会ったスキルは、その装備の NEW として返す(同じ回の中では、引いた順で最初の装備だけ)。
// ゲームの結果(乱数・戦闘・報酬)には使わない。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { SKILL_ROWS } from "./skills.js";

/** @typedef {import("./gear.js").Item} Item */

/**
 * 引いた装備のスキルを、出会ったスキルに記録する。返り値は、装備ごと(items の順)の、初めて出会ったスキルの id の一覧。
 * skillsSeen はスキルの表の順に並べ、1 つもなければ欄を持たない。
 * @param {{ skillsSeen?: string[] }} progress @param {readonly Item[]} items @param {readonly { id: string }[]} [skills]
 * @returns {string[][]}
 */
export function noteSkillsSeen(progress, items, skills = SKILL_ROWS) {
  const seen = new Set(progress.skillsSeen ?? []);
  const fresh = items.map((it) => {
    /** @type {string[]} */
    const own = [];
    for (const s of it.skills) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      own.push(s.id);
    }
    return own;
  });
  const ordered = skills.map((s) => s.id).filter((id) => seen.has(id));
  if (ordered.length > 0) progress.skillsSeen = ordered;
  return fresh;
}

/** 出会ったスキルか。 @param {{ skillsSeen?: string[] }} progress @param {string} id */
export function hasSeenSkill(progress, id) {
  return (progress.skillsSeen ?? []).includes(id);
}
