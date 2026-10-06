// @ts-check
// 釣り場の見せ方(画面に触らない部分:D-272〜D-278)。釣り場の画面の一覧、竿の段階の言い方(「磯 段階 2」)、
// 解放の知らせ、古い釣り場での製作・ヌシ・餌の短い表示、クレートと素材の釣り場ごとのグループ、絵の色。
// 画面は area_screen.js・main.js・crate_screen.js・list_view.js。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { areaOfStage, areaPosition, currentArea, inNewestArea, isAreaUnlocked, newestArea } from "../core/areas.js";

/** @typedef {import("../core/areas.js").AreaRow} AreaRow */
/** @typedef {{ progress: { rodStage: number, area?: string }, content: { areas: readonly AreaRow[] } }} AreaGame */

/** 未解放の釣り場の解放の条件(D-273)。 */
export const UNLOCK_NOTE = "前の釣り場の最後のヌシを倒す";

/** 通し番号 g の言い方(例:「磯 段階 2」)。 @param {{ areas: readonly AreaRow[] }} content @param {number} g */
export function stageLabel(content, g) {
  return `${areaOfStage(content, g).name} 段階 ${areaPosition(content, g)}`;
}

/**
 * 釣り場の画面の一覧(表の順)。解放済みは名前・色・いまいる印・(いちばん新しい釣り場だけ)進み具合。未解放は「???」と条件。
 * @param {AreaGame} game
 */
export function areaRows(game) {
  const { progress, content } = game;
  const here = currentArea(progress, content);
  const newest = newestArea(progress, content);
  return content.areas.map((a) => {
    const unlocked = isAreaUnlocked(progress, a);
    return {
      id: a.id,
      name: unlocked ? a.name : "???",
      unlocked,
      current: a === here,
      newest: a === newest,
      progressText: a === newest ? `段階 ${areaPosition(content, progress.rodStage)}/${a.stages}` : "",
      note: unlocked ? "" : UNLOCK_NOTE,
      sky: unlocked ? a.sky : null,
      sea: unlocked ? a.sea : null,
    };
  });
}

/** 解放の知らせ(D-273)。 @param {AreaRow | null | undefined} area */
export function unlockMessage(area) {
  return area ? `${area.name}が解放された!${area.name}に移りました` : "";
}

/**
 * 古い釣り場にいるときの短い表示(D-274)。いちばん新しい釣り場なら null。
 * @param {AreaGame} game
 */
export function oldAreaNotes(game) {
  if (inNewestArea(game.progress, game.content)) return null;
  const name = newestArea(game.progress, game.content).name;
  return { name, rod: `${name}で製作・ヌシ戦ができます` };
}

/** いまいる釣り場の、空と海の色(絵に使う:D-278)。 @param {AreaGame} game */
export function sceneColors(game) {
  const a = currentArea(game.progress, game.content);
  return { sky: a.sky, sea: a.sea };
}

/**
 * 段階ごとのもの(クレート・鱗)を、釣り場ごとのグループにまとめる(表の順)。いちばん新しい釣り場だけ開く(D-272)。
 * 未解放の釣り場は名前を「???」にする。
 * @template T
 * @param {AreaGame} game @param {readonly T[]} items @param {(item: T) => number} stageOf
 * @param {{ skipEmpty?: boolean }} [options]
 * @returns {{ id: string, title: string, open: boolean, items: T[] }[]}
 */
export function groupByArea(game, items, stageOf, options = {}) {
  const { progress, content } = game;
  const newest = newestArea(progress, content);
  const groups = content.areas.map((a) => ({
    id: a.id,
    title: isAreaUnlocked(progress, a) ? a.name : "???",
    open: a === newest,
    items: items.filter((it) => areaOfStage(content, stageOf(it)) === a),
  }));
  return options.skipEmpty ? groups.filter((g) => g.items.length > 0) : groups;
}

/** "#rrggbb" を [r, g, b] に。 @param {string} hex */
function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * 釣り場を移ったときの色の切り替え(D-278)。from から to へ、t(0〜1)だけ混ぜた色。
 * @param {{ sky: readonly string[], sea: readonly string[] }} from @param {{ sky: readonly string[], sea: readonly string[] }} to @param {number} t
 * @returns {{ sky: string[], sea: string[] }}
 */
export function mixColors(from, to, t) {
  const k = Math.min(1, Math.max(0, t));
  /** @param {string} a @param {string} b */
  const mix = (a, b) => {
    const [x, y] = [rgb(a), rgb(b)];
    return `#${x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, "0")).join("")}`;
  };
  return { sky: from.sky.map((c, i) => mix(c, to.sky[i])), sea: from.sea.map((c, i) => mix(c, to.sea[i])) };
}

/** 色の切り替えの長さ(ミリ秒)。 */
export const COLOR_FADE_MS = 500;
