// @ts-check
// デバッグ画面(全画面:D-214)。?debug のときだけ、画面の表に行が足される(screens.js)。
// 中身の計算は debug_view.js。ここは入力欄とボタンを並べるだけ。
// - 決める:ウロコイン・魚ごとの鱗・竿の段階と工程。
// - 装備を作る:種類・レア度・グレード・値・スキル(最大 3 個)。すぐ装着もできる。
// - プリセット・すぐ戦う・クリティカルの確率とシード(URL を変えて開き直す)・デバッグのデータを消す。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { EQUIP_KIND_ROWS, RARITY_ROWS } from "../core/gear.js";
import { SKILL_ROWS } from "../core/skills.js";
import {
  addDebugItem,
  applyPreset,
  DEBUG_PRESETS,
  debugFields,
  debugLevelMax,
  quickFightTargets,
  setDebugField,
  startQuickFight,
} from "./debug_view.js";
import { button, el } from "./list_view.js";
import { readUrlOptions, withUrlOptions } from "./url_params.js";

/**
 * @typedef {object} DebugContext
 * @property {any} game
 * @property {HTMLElement} app
 * @property {{ save: (progress: any) => boolean, clear: () => void }} storage
 * @property {() => void} reload
 * @property {() => void} rerender
 * @property {() => void} onGearChanged
 * @property {() => void} backToMain
 */

/** @param {string} title */
function section(title) {
  const box = el("section", "screen-section debug-section");
  box.append(el("h2", "section-title", title));
  return box;
}

/** ラベルつきの入力欄。 @param {string} label @param {HTMLElement} input */
function field(label, input) {
  const wrap = el("label", "debug-field");
  wrap.append(el("span", "debug-label", label), input);
  return wrap;
}

/** @param {string} value @param {string} [type] */
function input(value, type = "text") {
  const node = /** @type {HTMLInputElement} */ (el("input", "debug-input"));
  node.type = type;
  node.value = value;
  if (type === "number") node.inputMode = "numeric";
  return node;
}

/** @param {[string, string][]} options @param {string} [value] */
function select(options, value) {
  const node = /** @type {HTMLSelectElement} */ (el("select", "debug-input"));
  for (const [v, label] of options) {
    const o = /** @type {HTMLOptionElement} */ (el("option", "", label));
    o.value = v;
    node.append(o);
  }
  if (value !== undefined) node.value = value;
  return node;
}

/**
 * デバッグ画面を作る。
 * @param {HTMLElement} container @param {DebugContext} ctx
 */
export function mountDebug(container, ctx) {
  const { game } = ctx;
  const message = el("p", "gacha-message debug-message");
  message.setAttribute("role", "status");
  /** @param {string} text @param {boolean} [error] */
  const say = (text, error = false) => {
    message.textContent = text;
    message.classList.toggle("error", error);
  };
  container.append(el("div", "screen-header", "デバッグ用のデータです(本番の保存データとは別)"), message);
  const saved = () => {
    ctx.onGearChanged();
    ctx.storage.save(game.progress);
  };

  // 決める:ウロコイン・鱗・竿。範囲の外は範囲の中に直す。
  const values = section("数を決める");
  for (const f of debugFields(game.content)) {
    const box = input(String(f.get(game.progress)), "number");
    box.dataset.field = f.id;
    const set = button("決める", "chip debug-button");
    set.addEventListener("click", () => {
      const r = setDebugField(game, f.id, box.value);
      if (!r.ok) return say(`${f.label}:数を入れてください`, true);
      box.value = String(r.value);
      saved();
      say(`${f.label}を ${r.value} にしました(範囲 ${f.min}〜${f.max})`);
    });
    const row = el("div", "debug-row");
    row.append(field(f.label, box), set);
    values.append(row);
  }

  // 装備を作る。
  const make = section("装備を作る");
  const kinds = game.content.equipKinds ?? EQUIP_KIND_ROWS;
  const kind = select(kinds.map((/** @type {{ id: string, name: string }} */ k) => [k.id, k.name]));
  const rarity = select(RARITY_ROWS.map((r) => [r.id, `${r.name}(スキル ${r.skillCount} 個まで)`]), RARITY_ROWS[RARITY_ROWS.length - 1].id);
  const grade = input(String(game.content.maxStage), "number");
  const value = select([["max", "最大"], ["mid", "真ん中"], ["min", "最小"]]);
  const skills = game.content.skills ?? SKILL_ROWS;
  const skillOptions = /** @type {[string, string][]} */ ([["", "なし"], ...skills.map((/** @type {{ id: string, name: string }} */ s) => [s.id, s.name])]);
  const skillInputs = [0, 1, 2].map((i) => {
    const s = select(skillOptions);
    s.dataset.slot = String(i);
    const lv = input(String(debugLevelMax(game.content.maxStage)), "number");
    lv.dataset.slot = String(i);
    const row = el("div", "debug-row");
    row.append(field(`スキル ${i + 1}`, s), field("レベル", lv));
    return { s, lv, row };
  });
  const equip = /** @type {HTMLInputElement} */ (el("input"));
  equip.type = "checkbox";
  equip.checked = true;
  const equipLabel = el("label", "debug-check");
  equipLabel.append(equip, el("span", "", "すぐ装着する"));
  // ロックして作る(D-246)。
  const lock = /** @type {HTMLInputElement} */ (el("input"));
  lock.type = "checkbox";
  lock.dataset.field = "lock";
  const lockLabel = el("label", "debug-check");
  lockLabel.append(lock, el("span", "", "ロックする"));
  const create = button("作る", "primary-button debug-create");
  create.addEventListener("click", () => {
    const r = addDebugItem(game, {
      kind: kind.value,
      rarity: rarity.value,
      grade: Number(grade.value),
      value: /** @type {"max" | "mid" | "min"} */ (value.value),
      skills: skillInputs.filter((x) => x.s.value !== "").map((x) => ({ id: x.s.value, level: Number(x.lv.value) })),
      equip: equip.checked,
      lock: lock.checked,
    });
    if (!r.ok) return say(r.error, true);
    saved();
    say(`装備を作りました(${r.item.locked ? "ロック中・" : ""}グレード ${r.item.grade}・値 ${r.item.value}・スキル ${r.item.skills.map((s) => `${s.id} Lv${s.level}`).join("・") || "なし"})`);
  });
  make.append(field("種類", kind), field("レア度", rarity), field(`グレード(1〜${game.content.maxStage})`, grade), field("値", value));
  for (const x of skillInputs) make.append(x.row);
  make.append(el("p", "debug-note", `レベルはグレードごとに 1〜(2 + グレード)。範囲の外は範囲の中に直します。`), equipLabel, lockLabel, create);

  // プリセット。
  const presets = section("プリセット(レジェンド・最大で作って装着)");
  for (const p of DEBUG_PRESETS) {
    const b = button(`${p.name}`, "menu-row debug-preset");
    b.dataset.preset = p.id;
    b.append(el("span", "debug-note", p.note));
    b.addEventListener("click", () => {
      const r = applyPreset(game, p.id);
      if (!r.ok) return say(r.error ?? "当てられません", true);
      saved();
      say(`プリセット「${p.name}」を装着しました`);
    });
    presets.append(b);
  }

  // すぐ戦う。
  const fight = section("すぐ戦う");
  const target = select(quickFightTargets(game.content).map((/** @type {{ id: string, label: string }} */ t) => [t.id, t.label]));
  const hook = select([["good", "合わせ成功"], ["just", "ジャスト"]]);
  const go = button("戦う", "primary-button debug-fight");
  go.addEventListener("click", () => {
    const r = startQuickFight(game, target.value, /** @type {"good" | "just"} */ (hook.value));
    if (!r.ok) return say(r.error ?? "始められません", true);
    ctx.backToMain();
  });
  fight.append(field("相手", target), field("合わせの結果", hook), el("p", "debug-note", "戦いのあとは釣りに戻ります。報酬はデバッグのデータに入ります。"), go);

  // クリティカルの確率とシード(URL を変えて開き直す)。
  const url = section("クリティカルの確率とシード(開き直す)");
  const options = readUrlOptions(location.search);
  const crit = input(options.crit === null ? "" : String(options.crit), "number");
  const seed = input(options.seed ?? String(game.seed), "text");
  const apply = button("決めて開き直す", "primary-button debug-url");
  apply.addEventListener("click", () => {
    location.search = withUrlOptions(location.search, { crit: crit.value.trim(), seed: seed.value.trim() });
  });
  url.append(field("クリティカルの確率(%。空なら表の値)", crit), field("シード", seed), apply);

  // デバッグのデータを消す。
  const reset = section("デバッグのデータを消す");
  const clear = button("デバッグのデータを消す", "secondary-button debug-reset");
  clear.addEventListener("click", () => {
    if (!window.confirm("デバッグのデータを消します。本番のデータは消えません。よいですか?")) return;
    ctx.storage.clear();
    ctx.reload();
  });
  reset.append(clear);

  container.append(values, make, presets, fight, url, reset);
}
