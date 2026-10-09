// @ts-check
// 降臨の戦いの見た目(D-396):夜の背景にするか・文の言葉・結果の報酬の文字。見た目だけで、計算本体の結果には触れない。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { charmName } from "../core/kourin.js";
import { gloveName } from "../core/glove.js";
import { formatCount } from "./format.js";

/** 夜の背景が読めないときの、夜の色の段(空・海)。 */
export const NIGHT_COLORS = Object.freeze({ sky: Object.freeze(["#0b1026", "#1b2550"]), sea: Object.freeze(["#0a1a3a", "#020818"]) });

/**
 * 夜の背景にするか:降臨の戦いと、その結果の間だけ(D-396)。
 * @param {any} game
 */
export function raidNight(game) {
  return Boolean(game.cast?.raid) && (game.phase === "minigame" || game.phase === "result");
}

/**
 * 降臨の戦い・結果の文(降臨でなければ null)。
 * @param {any} game
 */
export function raidMessage(game) {
  if (!game.cast?.raid) return null;
  const name = `${game.cast.fish.name} Lv${game.cast.raid.level}`;
  if (game.phase === "minigame") return `${name}との勝負!`;
  const r = game.lastResult?.raid;
  if (game.phase !== "result" || !r) return null;
  if (r.defeated) return `${name}を討伐した!`;
  const left = Math.max(1, Math.round((r.hpLeft / r.maxHp) * 100));
  return `${formatCount(r.damage)} ダメージ!(残り ${left}%)`;
}

/**
 * 区切りの報酬 1 つの文。
 * @param {any} reward @param {any} content
 */
export function rewardText(reward, content) {
  switch (reward.type) {
    case "charm":
      return reward.fresh ? `${charmName(reward.charm)}を授かった!` : `${charmName(reward.charm)} Lv${reward.level}`;
    case "glove":
      return `グローブ:${gloveName(reward.glove)}`;
    case "item": {
      const kind = content.equipKinds.find((/** @type {{ id: string }} */ k) => k.id === reward.item.kind);
      return `クレート 1 回:${kind?.name ?? reward.item.kind}${reward.scrapped ? "(自動分解)" : ""}`;
    }
    default:
      return `+${formatCount(reward.coins)} ウロコイン`;
  }
}

/**
 * 降臨の結果の演出:討伐は金色の帯、区切りの報酬は文字で順に浮かべる。
 * @param {any} effects @param {any} result @param {number} now @param {any} content
 */
export function addRaidEffects(effects, result, now, content) {
  const r = result.raid;
  if (r.defeated) {
    effects.flash = { color: "155,92,255", start: now, ms: 700 };
    effects.banner = { text: "討伐!", start: now, ms: 1800 };
  } else {
    effects.flash = { color: "155,92,255", start: now, ms: 350 };
  }
  r.rewards.forEach((/** @type {any} */ reward, /** @type {number} */ i) => {
    effects.floats.push({ text: rewardText(reward, content), start: now + i * 250, ms: 1800, y: 0.4 + i * 0.045, size: 20, color: "#d9c2ff" });
  });
}
