// @ts-check
// 降臨の戦いの見た目(D-396):夜の背景にするか・文の言葉・結果の報酬の文字。見た目だけで、計算本体の結果には触れない。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { charmName, kourinById } from "../core/kourin.js";
import { gloveName } from "../core/glove.js";
import { itemName, rarityById } from "../core/gear.js";
import { addBurst } from "./effects.js";
import { formatCount } from "./format.js";
import { rarityStars } from "./gear_view.js";
import { el } from "./list_view.js";
import { openSheet } from "./sheet.js";

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
    effects.banner = { text: "討伐!", start: now, ms: 1800, color: "#d9c2ff" };
    effects.shake = { start: now, ms: 500, amplitude: 10 };
    // 紫と金の粒を大きく散らす(キャラは画面の真ん中あたり)。
    addBurst(effects, 0.5, 0.42, now, { count: 24, colors: ["#9b5cff", "#c9a6ff", "#ffd166", "#ffffff"], speed: 280, size: 7, ms: 1100, gravity: 180 });
  } else {
    effects.flash = { color: "155,92,255", start: now, ms: 350 };
    addBurst(effects, 0.5, 0.42, now, { count: 8, colors: ["#9b5cff", "#c9a6ff"], speed: 160, size: 5, ms: 600 });
  }
  r.rewards.forEach((/** @type {any} */ reward, /** @type {number} */ i) => {
    effects.floats.push({ text: rewardText(reward, content), start: now + i * 250, ms: 1800, y: 0.4 + i * 0.045, size: 20, color: "#d9c2ff" });
  });
}

/** 持ち物がいっぱいでウロコインに替わったときの一言。 */
const FULL_NOTE = /** @type {Record<string, string>} */ ({ gear: "装備の持ち物がいっぱいのため", glove: "グローブの保管がいっぱいのため" });

/**
 * 挑戦の終わりに出す「報酬の一覧」の中身(画面に触らない)。
 * rows は報酬 1 つにつき 1 行:種類の札・中身・色(レア度など)・補足。報酬がなければ、次の区切りまでの残りを出す。
 * @param {any} raid 結果の raid(settleRaid の戻り値) @param {any} content @param {number} steps 区切りの数
 */
export function raidResultView(raid, content, steps) {
  const name = `${kourinById(raid.char)?.name ?? raid.char} Lv${raid.level}`;
  const title = raid.defeated ? `${name}を討伐!` : `${name}に挑戦`;
  const dealt = raid.maxHp > 0 ? (raid.maxHp - raid.hpLeft) / raid.maxHp : 1;
  const left = Math.max(1, Math.round((raid.hpLeft / raid.maxHp) * 100));
  const sub = raid.defeated ? `${formatCount(raid.damage)} ダメージで討伐した` : `${formatCount(raid.damage)} ダメージ(残り ${left}%)`;
  const rows = raid.rewards.map((/** @type {any} */ r) => {
    switch (r.type) {
      case "charm":
        return { tag: "お守り", text: r.fresh ? `${charmName(r.charm)}を授かった!` : `${charmName(r.charm)} が Lv${r.level} に`, color: "#c9a6ff", note: "" };
      case "glove":
        return { tag: "グローブ", text: gloveName(r.glove), color: "#ffd166", note: `グレード ${r.glove.grade}` };
      case "item": {
        const rarity = rarityById(r.item.rarity);
        return {
          tag: "クレート",
          text: `${rarityStars(r.item.rarity)} ${itemName(r.item, content)}`,
          color: rarity?.color ?? "#ffffff",
          note: r.scrapped ? `自動分解 +${formatCount(r.scrapCoins ?? 0)} ウロコイン` : "",
        };
      }
      default:
        return { tag: "ウロコイン", text: `+${formatCount(r.coins)} ウロコイン`, color: "#ffd166", note: r.full ? FULL_NOTE[r.full] ?? "" : "" };
    }
  });
  // 次の区切りまでの残り(討伐していなくて、報酬がなかったとき)。
  const next = Math.ceil((Math.floor(dealt * steps + 1e-9) + 1) * (100 / steps) - dealt * 100);
  const empty = rows.length > 0 ? "" : raid.defeated ? "" : `今回の報酬はなし(次の報酬まで あと ${Math.max(1, next)}%)`;
  return { title, sub, rows, empty, defeated: raid.defeated };
}

/**
 * 報酬の一覧のシートを開く(挑戦の終わりに 1 回)。閉じたら onClose を呼ぶ。
 * @param {HTMLElement} root @param {ReturnType<typeof raidResultView>} view @param {() => void} onClose
 */
export function openRaidResult(root, view, onClose) {
  return openSheet(
    root,
    (panel, close) => {
      panel.append(el("h2", "sheet-title raid-result-title", view.title), el("p", "sheet-line raid-result-sub", view.sub));
      if (view.rows.length > 0) {
        const list = el("ul", "raid-result-list");
        for (const row of view.rows) {
          const li = el("li", "raid-result-row");
          li.style.setProperty("--rarity", row.color);
          const text = el("div", "raid-result-text");
          text.append(el("span", "raid-result-name", row.text));
          if (row.note) text.append(el("span", "raid-result-note", row.note));
          li.append(el("span", "raid-result-tag", row.tag), text);
          list.append(li);
        }
        panel.append(el("p", "section-title", "もらった報酬"), list);
      } else if (view.empty) {
        panel.append(el("p", "screen-empty", view.empty));
      }
      const ok = el("button", "primary-button sheet-close", "OK");
      ok.setAttribute("type", "button");
      ok.addEventListener("click", close);
      panel.append(ok);
    },
    view.defeated ? "raid-result defeated" : "raid-result",
    onClose,
  );
}
