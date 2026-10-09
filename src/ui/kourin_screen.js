// @ts-check
// 降臨の画面(全画面:D-396・D-397・D-403・D-409)。ウロコパワー・4 キャラ(注入する・挑む。呼んでいる相手は残りの体力も)・お守り(付ける)。
// 文字は kourin_view.js が作る。変えたら保存して、画面を作り直す。挑むとメイン画面に戻り、夜の戦いが始まる。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { equipCharm } from "../core/charms.js";
import { refreshCombat, startRaid } from "../core/fishing.js";
import { convertScales, injectPower } from "../core/kourin.js";
import { kourinView } from "./kourin_view.js";
import { button, el } from "./list_view.js";

/** 最後の知らせ(作り直しても残す)。 */
let lastMessage = "";

/** 横長のバー(割合 0〜1)。 @param {number} ratio @param {string} className */
function bar(ratio, className) {
  const outer = el("div", `kourin-bar ${className}`);
  const inner = el("div", "kourin-bar-fill");
  inner.style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 1000) / 10}%`;
  outer.append(inner);
  return outer;
}

/**
 * 降臨の画面を作る。
 * @param {HTMLElement} container
 * @param {{ game: any, rerender: () => void, backToMain: () => void, storage: { save: (progress: any) => boolean } }} ctx
 */
export function mountKourin(container, ctx) {
  const { game } = ctx;
  const view = kourinView(game);
  const message = el("p", "gacha-message kourin-message", lastMessage);
  message.setAttribute("role", "status");
  lastMessage = "";
  container.append(message);
  /** 変えたあと:保存して作り直す。 @param {string} text */
  const done = (text) => {
    ctx.storage.save(game.progress);
    lastMessage = text;
    ctx.rerender();
  };

  if (!view.unlocked) {
    container.append(el("div", "screen-header", view.lockedText));
    return;
  }

  // 貯めているウロコパワー。
  const power = el("section", "crate-card kourin-card kourin-gauge");
  const convert = button(view.power.convertLabel, "secondary-button kourin-convert");
  convert.disabled = !view.power.canConvert;
  convert.addEventListener("click", () => {
    const r = convertScales(game.progress, game.content, game.config.kourin);
    if (r.power > 0) done(`鱗 ${r.scales} 枚をウロコパワーに替えました`);
  });
  power.append(el("h2", "crate-name", view.power.text), el("p", "crate-price", view.power.scaleText), convert, el("p", "pull-note", view.power.note));
  container.append(power);

  // 4 キャラ(注入する・挑む:D-409)。呼んでいる相手は、残りの体力と挑戦の回数。
  const list = el("section", "kourin-chars");
  for (const ch of view.chars) {
    const card = el("div", ch.current ? "crate-card kourin-card kourin-char current" : "crate-card kourin-card kourin-char");
    card.dataset.char = ch.id;
    const head = el("div", "crate-head");
    head.append(el("h3", "crate-name", `${ch.name} ${ch.levelText}`), el("span", "kourin-quirk", ch.current ? ch.triesText : ch.quirkText));
    card.append(head, el("p", "crate-price", `${ch.charmText}・${ch.clearedText}`));
    if (ch.current) card.append(bar(ch.hpRatio, "hp"), el("p", "crate-price", `${ch.hpText}・${ch.stepsText}`));
    else card.append(bar(ch.ratio, "gauge"), el("p", "crate-price", ch.fillText));
    const row = el("div", "kourin-buttons");
    if (!ch.current) {
      const inject = button(ch.injectLabel, "secondary-button kourin-inject");
      inject.disabled = !ch.canInject;
      inject.addEventListener("click", () => {
        if (injectPower(game.progress, game.content, ch.id, game.config.kourin) > 0) done(`${ch.name}にウロコパワーを注入しました`);
      });
      row.append(inject);
    }
    const go = button("挑む", "primary-button kourin-challenge");
    go.disabled = !ch.canStart;
    go.addEventListener("click", () => {
      if (!startRaid(game, ch.id)) return;
      ctx.storage.save(game.progress);
      ctx.backToMain();
    });
    row.append(go);
    card.append(row);
    if (ch.startNote) card.append(el("p", "pull-note", ch.startNote));
    list.append(card);
  }
  container.append(list);

  // お守り(付ける・外す)。効くのは付けている 1 つだけ。
  if (view.charms.length > 0) {
    const box = el("section", "crate-card kourin-card kourin-charms");
    box.append(el("h2", "crate-name", "お守り(付けている 1 つだけ効く)"));
    const ul = el("ul", "menu-list");
    for (const ch of view.charms) {
      const li = el("li", "kourin-charm");
      li.dataset.charm = ch.id;
      const text = el("span", "kourin-charm-text", `${ch.name} ${ch.levelText}:${ch.effectText}`);
      const b = button(ch.equipped ? "外す" : "付ける", ch.equipped ? "kourin-charm-button equipped" : "kourin-charm-button");
      b.setAttribute("aria-pressed", String(ch.equipped));
      b.addEventListener("click", () => {
        equipCharm(/** @type {any} */ (game.progress.charms), ch.equipped ? null : ch.id);
        refreshCombat(game);
        done(ch.equipped ? `${ch.name}を外しました` : `${ch.name}を付けました`);
      });
      li.append(text, b);
      ul.append(li);
    }
    box.append(ul);
    container.append(box);
  }
}
