// @ts-check
// スキルの見せ方(画面に触らない部分:D-179・D-195)。
// スキルの画面の行、装備のカードのスキルの行、付け替えたときのスキルレベルの変化を作る。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { DEFAULT_CONFIG } from "../core/config.js";
import { itemName } from "../core/gear.js";
import { formatSkillEffect, SKILL_ROWS, skillById, skillStates } from "../core/skills.js";

/** @typedef {import("../core/gear.js").Item} Item */
/** @typedef {import("../core/gear.js").Gear} Gear */
/** @typedef {import("../core/skills.js").SkillRow} SkillRow */
/** @typedef {import("../core/skills.js").SkillState} SkillState */

/**
 * スキルの見せ方で読むゲームの状態。
 * @typedef {object} SkillGame
 * @property {{ rodStage: number, gear: Gear }} progress
 * @property {import("../core/gear.js").ContentLike} content
 * @property {{ skills?: import("../core/skills.js").SkillConfig }} config
 */

/** @param {SkillGame} game */
function tables(game) {
  return { skills: game.content.skills ?? SKILL_ROWS, config: game.config.skills ?? DEFAULT_CONFIG.skills };
}

/** 今の装着でのスキルの状態。 @param {SkillGame} game @param {Gear} [gear] */
export function currentStates(game, gear = game.progress.gear) {
  const { skills, config } = tables(game);
  return skillStates(gear, game.progress.rodStage, config, skills);
}

/**
 * 効果の文(レベル 0 は「効果なし」)。条件発動型は条件の短い言い方つき(例:「連続命中 1 段ごとにダメージ +2(最大 10 段)」)。
 * @param {SkillRow} skill @param {number} level @param {import("../core/skills.js").SkillConfig} config
 */
function effectText(skill, level, config) {
  return level === 0 ? "効果なし" : formatSkillEffect(skill, level, config);
}

/**
 * スキルの画面の行(表の順)。
 * - label:「Lv 5 / 7」。progress:最大に対する今のレベルの割合(細い棒)。
 * - capped:頭打ち型で最大(MAX の印)。over:最大をこえて無駄になっているレベル。
 * - breakdown:装着中の装備ごとのレベルの内訳。levels:各レベルの効果。
 * @param {SkillGame} game
 */
export function skillRows(game) {
  const { skills, config } = tables(game);
  const states = currentStates(game);
  const gear = game.progress.gear;
  const equipped = Object.values(gear.equipped)
    .map((id) => gear.items.find((it) => it.id === id))
    .filter((it) => it !== undefined);
  return skills.map((skill) => {
    const s = states[skill.id];
    const isMax = s.level >= s.max;
    return {
      id: skill.id,
      name: skill.name,
      level: s.level,
      max: s.max,
      total: s.total,
      label: `Lv ${s.level} / ${s.max}`,
      isMax,
      capped: skill.type === "capped" && isMax,
      growth: skill.type === "growth",
      progress: s.max > 0 ? Math.max(0, Math.min(1, s.level / s.max)) : 0,
      over: Math.max(0, s.total - s.max),
      effect: effectText(skill, s.level, config),
      // 条件発動型か(数値型と同じ一覧に出す:D-191)。
      triggered: skill.target.kind === "trigger",
      description: skill.description,
      breakdown: equipped
        .map((it) => ({ name: itemName(it, game.content), level: it.skills.find((x) => x.id === skill.id)?.level ?? 0 }))
        .filter((b) => b.level > 0),
      levels: Array.from({ length: s.max }, (_, i) => ({ level: i + 1, effect: formatSkillEffect(skill, i + 1, config) })),
    };
  });
}

/**
 * 装備 1 個のスキルの行(最大 3 行。例:「会心率 Lv2」:D-195)。
 * @param {Item} item @param {readonly SkillRow[]} [skills]
 */
export function itemSkillLines(item, skills = SKILL_ROWS) {
  return item.skills.slice(0, 3).map((s) => {
    const row = skillById(s.id, skills);
    const name = row ? row.name : s.id;
    return { id: s.id, name, level: s.level, text: `${name} Lv${s.level}` };
  });
}

/**
 * その装備を付けた(外した)ときの、スキルレベルの変化(例:「会心率 Lv2→Lv3」)。変わるものだけ。
 * @param {SkillGame} game @param {Item} item
 */
export function skillLevelChanges(game, item) {
  const { skills } = tables(game);
  const gear = game.progress.gear;
  const equipped = { ...gear.equipped };
  if (equipped[item.kind] === item.id) delete equipped[item.kind];
  else equipped[item.kind] = item.id;
  const before = currentStates(game);
  const after = currentStates(game, { ...gear, equipped });
  return skills
    .filter((s) => before[s.id].level !== after[s.id].level)
    .map((s) => {
      const from = before[s.id].level;
      const to = after[s.id].level;
      return { id: s.id, up: to > from, text: `${s.name} Lv${from}→Lv${to}` };
    });
}
