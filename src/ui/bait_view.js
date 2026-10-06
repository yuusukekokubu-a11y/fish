// @ts-check
// 餌と自動分解の見せ方(画面に触らない部分:D-263・D-266・D-269)。店の画面・メイン画面のスイッチ・
// 払い戻しの知らせ・自動分解の設定と結果の文字を作る。画面は shop_screen.js・main.js・crate_screen.js・gacha_fx.js。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { baitBlocker, baitCount, baitFish, currentBaitPrice, maxBuyable } from "../core/bait.js";
import { AUTO_SCRAP_ROWS, autoScrapSetting } from "../core/gear.js";
import { formatCount } from "./format.js";

/** 店の一言(D-263)。 */
export const REFUND_NOTE = "段階が進むと払い戻されます";

/** 買えない理由の文字。 */
export const BAIT_MESSAGES = Object.freeze({
  count: "買う数がちがいます",
  max: "これ以上は持てません",
  coins: "ウロコインが足りません",
});

/**
 * 店の画面の中身:餌の名前(「クロダイの餌」)・価格・所持数/上限・ボタン(1 / 10 / 上限まで)。
 * ボタンは、ウロコインが足りない・上限をこえるときは押せない(理由を持つ)。
 * @param {{ progress: any, config: any, content: any }} game
 */
export function shopView(game) {
  const p = game.progress;
  const fish = baitFish(game.content, p.rodStage);
  const max = game.config.bait.max;
  const price = currentBaitPrice(p, game.config.formula);
  const most = maxBuyable(p, game.config);
  /** @param {number} count @param {string} label */
  const row = (count, label) => {
    const reason = count > 0 ? baitBlocker(p, count, game.config) : baitCount(p) >= max ? "max" : "coins";
    return { count, label, cost: count * price, disabled: reason !== null, reason };
  };
  return {
    name: `${fish ? fish.name : "魚"}の餌`,
    price,
    priceText: `1 個 ${formatCount(price)} ウロコイン`,
    count: baitCount(p),
    max,
    countText: `${baitCount(p)} / ${max}`,
    buttons: [row(1, "1 個"), row(10, "10 個"), row(most, most > 0 ? `上限まで ${most} 個` : "上限まで")],
    note: REFUND_NOTE,
  };
}

/**
 * メイン画面の餌のボタン(釣りの絵の左上:D-271)。餌が 0 なら null(出さない)。
 * 入っている状態は、文字の印(✓)でも分かる。古い釣り場(newestName にいちばん新しい釣り場の名前)では押せない。
 * @param {{ progress: any }} game @param {string | null} [newestName]
 */
export function baitHud(game, newestName = null) {
  const n = baitCount(game.progress);
  if (n <= 0) return null;
  const on = Boolean(game.progress.useBait);
  if (newestName) return { countText: `餌 ${n}`, on, disabled: true, stateText: `${newestName}で使える` };
  return { countText: `餌 ${n}`, on, disabled: false, stateText: on ? "✓ 使う" : "使わない" };
}

/** 払い戻しの知らせ。払い戻しがなければ空。 @param {{ count: number, coins: number } | null | undefined} refund */
export function refundMessage(refund) {
  if (!refund || refund.count <= 0) return "";
  return `餌 ${refund.count} 個を払い戻しました +${formatCount(refund.coins)}`;
}

/** 自動分解の設定の選択肢(いまの設定に印)。 @param {{ progress: any }} game */
export function autoScrapChoices(game) {
  const now = autoScrapSetting(game.progress);
  return AUTO_SCRAP_ROWS.map((r) => ({ id: r.id, label: r.label, selected: r.id === now }));
}

/**
 * 自動分解の結果の見出し(「自動分解 3 個 +120」)。0 個なら空。
 * @param {{ items: readonly unknown[], coins: number }} scrap
 */
export function autoScrapText(scrap) {
  if (scrap.items.length === 0) return "";
  return `自動分解 ${scrap.items.length} 個 +${formatCount(scrap.coins)}`;
}
