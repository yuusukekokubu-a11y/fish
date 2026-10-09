// @ts-check
// 降臨の画面(全画面:D-396・D-397・D-403)。ウロコパワー・呼んでいるキャラ(挑む)・4 キャラ(注入する・呼ぶ)・お守り(付ける)。
// 文字は kourin_view.js が作る。変えたら保存して、画面を作り直す。挑むとメイン画面に戻り、夜の戦いが始まる。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { equipCharm } from "../core/charms.js";
import { challengeRaid, refreshCombat } from "../core/fishing.js";
import { injectPower, summonRaid } from "../core/kourin.js";
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
  power.append(el("h2", "crate-name", view.power.text), el("p", "crate-price", view.power.scaleText), el("p", "pull-note", view.power.note));
  container.append(power);

  // 呼んでいるキャラ(挑む)。
  if (view.raid) {
    const r = view.raid;
    const box = el("section", "crate-card kourin-card kourin-raid");
    box.dataset.char = r.id;
    const head = el("div", "crate-head");
    head.append(el("h2", "crate-name", `${r.name} Lv${r.level}`), el("span", "kourin-tries", r.triesText));
    const go = button("挑む", "primary-button kourin-challenge");
    go.disabled = !r.canChallenge;
    go.addEventListener("click", () => {
      if (!challengeRaid(game)) return;
      ctx.storage.save(game.progress);
      ctx.backToMain();
    });
    box.append(head, bar(r.ratio, "hp"), el("p", "crate-price", `${r.hpText}・${r.stepsText}`), go, el("p", "pull-note", r.note));
    container.append(box);
  }

  // 4 キャラ(注入する・呼ぶ)。
  const list = el("section", "kourin-chars");
  for (const ch of view.chars) {
    const card = el("div", ch.current ? "crate-card kourin-card kourin-char current" : "crate-card kourin-card kourin-char");
    card.dataset.char = ch.id;
    const head = el("div", "crate-head");
    head.append(el("h3", "crate-name", `${ch.name} ${ch.levelText}`), el("span", "kourin-quirk", ch.quirkText));
    card.append(head, el("p", "crate-price", `${ch.charmText}・${ch.clearedText}`));
    if (ch.current) {
      card.append(el("p", "pull-note", "いま呼んでいます"));
    } else {
      card.append(bar(ch.ratio, "gauge"), el("p", "crate-price", `${ch.fillText}・${ch.scaleText}`));
      const row = el("div", "kourin-buttons");
      const inject = button(ch.injectLabel, "secondary-button kourin-inject");
      inject.disabled = !ch.canInject;
      inject.addEventListener("click", () => {
        const r = injectPower(game.progress, game.content, ch.id, game.config.kourin);
        if (r.fromScales + r.fromPower > 0) done(`${ch.name}にウロコパワーを注入しました`);
      });
      const call = button("呼ぶ", "primary-button kourin-summon");
      call.disabled = !ch.canSummon;
      call.addEventListener("click", () => {
        if (summonRaid(game.progress, ch.id, game.content, game.config)) done(`${ch.name}を呼びました`);
      });
      row.append(inject, call);
      card.append(row);
    }
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
