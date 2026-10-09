// @ts-check
// デバッグ画面(全画面:D-214)。?debug のときだけ、画面の表に行が足される(screens.js)。
// 中身の計算は debug_view.js。ここは入力欄とボタンを並べるだけ。
// - 決める:ウロコイン・魚ごとの鱗・竿の段階と工程・餌の所持数。餌のスイッチと自動分解の設定(D-263・D-266)。
// - 装備を作る:種類・レア度・グレード・値・スキル(最大 3 個)。すぐ装着もできる。
// - プリセット・すぐ戦う・クリティカルの確率とシード(URL を変えて開き直す)・デバッグのデータを消す。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { currentArea, unlockedAreas } from "../core/areas.js";
import { setUseBait } from "../core/bait.js";
import { moveArea, refreshCombat } from "../core/fishing.js";
import { CHARM_ROWS } from "../core/charms.js";
import { AUTO_SCRAP_ROWS, autoScrapSetting, EQUIP_KIND_ROWS, gachaKinds, RARITY_ROWS, setAutoScrap } from "../core/gear.js";
import { GLOVE_ABILITY_ROWS, GLOVE_RARITY_ROWS } from "../core/glove.js";
import { SKILL_ROWS } from "../core/skills.js";
import { coverText } from "./glove_view.js";
import {
  addDebugGlove,
  addDebugItem,
  applyPreset,
  debugCharmLevel,
  debugFillGauge,
  debugRaidHp,
  DEBUG_PRESETS,
  debugFields,
  debugLevelMax,
  quickFightTargets,
  setDebugField,
  startQuickFight,
} from "./debug_view.js";
import { button, el } from "./list_view.js";
import { fillPlayLogSection } from "./play_log_view.js";
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
 * @property {(hook: { grade: string, strike?: any }) => void} [showHook] 合わせの演出を出す(ジャストの初撃も)
 * @property {{ visible: () => boolean, setVisible: (on: boolean) => void }} [perf] 確かめ用の表示(D-286)
 * @property {{ main: () => any, debug: () => any, resetDebug: () => void, version: string }} [playLog] 遊びの記録(D-348)
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

  // 確かめ用の表示(D-286):入力の遅れとフレーム間隔を、メイン画面の左下に出す・消す。
  const perfBox = section("入力の遅れとフレーム間隔");
  const perf = /** @type {HTMLInputElement} */ (el("input"));
  perf.type = "checkbox";
  perf.dataset.field = "perf";
  perf.checked = ctx.perf ? ctx.perf.visible() : false;
  perf.addEventListener("change", () => ctx.perf?.setVisible(perf.checked));
  const perfLabel = el("label", "debug-check");
  perfLabel.append(perf, el("span", "", "メイン画面の左下に出す"));
  perfBox.append(
    perfLabel,
    el("p", "debug-note", "入力の遅れ:指が触れた瞬間から、処理が始まるまで(直近 20 回の平均と最大)。フレーム:描画の間隔(直近 120 回)。"),
  );

  // 釣り場(D-273):解放済みの釣り場から選ぶ。竿の段階を決めると、釣り場は自動で決まる(行けない釣り場からは外れる)。
  const areaBox = section("釣り場");
  const areaSelect = select(unlockedAreas(game.progress, game.content).map((a) => [a.id, a.name]), currentArea(game.progress, game.content).id);
  areaSelect.dataset.field = "area";
  const areaSet = button("移る", "chip debug-button");
  areaSet.addEventListener("click", () => {
    if (!moveArea(game, areaSelect.value)) return say("その釣り場には移れません", true);
    saved();
    say(`釣り場を「${currentArea(game.progress, game.content).name}」にしました`);
  });
  const areaRow = el("div", "debug-row");
  areaRow.append(field("いまいる釣り場", areaSelect), areaSet);
  areaBox.append(areaRow, el("p", "debug-note", "竿の段階を決めると、釣り場は自動で決まります(その段階の釣り場)。"));

  // 餌のスイッチと自動分解の設定(D-263・D-266)。
  const baitBox = section("餌と自動分解");
  const useBait = /** @type {HTMLInputElement} */ (el("input"));
  useBait.type = "checkbox";
  useBait.dataset.field = "useBait";
  useBait.checked = Boolean(game.progress.useBait);
  useBait.addEventListener("change", () => {
    setUseBait(game.progress, useBait.checked);
    saved();
    say(`餌を使う:${useBait.checked ? "オン" : "オフ"}にしました`);
  });
  const useBaitLabel = el("label", "debug-check");
  useBaitLabel.append(useBait, el("span", "", "餌を使う"));
  const scrap = select(AUTO_SCRAP_ROWS.map((r) => [r.id, r.label]), autoScrapSetting(game.progress));
  scrap.dataset.field = "autoScrap";
  const scrapSet = button("決める", "chip debug-button");
  scrapSet.addEventListener("click", () => {
    setAutoScrap(game.progress, scrap.value);
    saved();
    say(`自動分解を「${AUTO_SCRAP_ROWS.find((r) => r.id === scrap.value)?.label}」にしました`);
  });
  const scrapRow = el("div", "debug-row");
  scrapRow.append(field("自動分解", scrap), scrapSet);
  baitBox.append(useBaitLabel, scrapRow);

  // 装備を作る。
  const make = section("装備を作る");
  const kinds = gachaKinds(game.content.equipKinds ?? EQUIP_KIND_ROWS);
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

  // グローブを作る(D-334)と、釣れるクレートの出現率 100%(?debug のときだけ。保存しない)。
  const gloveBox = section("グローブを作る");
  const ability = select(GLOVE_ABILITY_ROWS.map((a) => [a.id, a.name]));
  ability.dataset.field = "gloveAbility";
  const gloveRarity = select(GLOVE_RARITY_ROWS.map((r) => [r.id, `${r.name}(対応 +${r.extend})`]), "legend");
  gloveRarity.dataset.field = "gloveRarity";
  const gloveGrade = input(String(game.progress.rodStage), "number");
  gloveGrade.dataset.field = "gloveGrade";
  const gloveEquip = /** @type {HTMLInputElement} */ (el("input"));
  gloveEquip.type = "checkbox";
  gloveEquip.checked = true;
  const gloveEquipLabel = el("label", "debug-check");
  gloveEquipLabel.append(gloveEquip, el("span", "", "すぐ装着する"));
  const makeGlove = button("グローブを作る", "primary-button debug-glove");
  makeGlove.addEventListener("click", () => {
    const r = addDebugGlove(game, { ability: ability.value, rarity: gloveRarity.value, grade: Number(gloveGrade.value), equip: gloveEquip.checked });
    if (!r.ok) return say(r.error, true);
    saved();
    say(`グローブを作りました(G${r.glove.grade}・対応 ${coverText(game.content, r.glove)})`);
  });
  const crate100 = /** @type {HTMLInputElement} */ (el("input"));
  crate100.type = "checkbox";
  crate100.dataset.field = "crate100";
  crate100.checked = game.crateChance === 1;
  crate100.addEventListener("change", () => {
    game.crateChance = crate100.checked ? 1 : null;
    say(crate100.checked ? "釣れるクレートの出現率を 100% にしました(条件を満たす弱い魚の投だけ)" : "出現率を元に戻しました");
  });
  const crateLabel = el("label", "debug-check");
  crateLabel.append(crate100, el("span", "", "釣れるクレートの出現率 100%"));
  gloveBox.append(field("能力", ability), field("レア度", gloveRarity), field(`グレード(1〜${game.content.maxStage})`, gloveGrade), gloveEquipLabel, makeGlove, crateLabel);

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

  // 降臨(D-397・D-403):全員に要る量まで注入・残りの体力・お守りのレベル。
  const kourinBox = section("降臨");
  const fill = button("全員に要る量まで注入する", "secondary-button debug-kourin-fill");
  fill.addEventListener("click", () => {
    debugFillGauge(game.progress, game.config);
    ctx.storage.save(game.progress);
    say("全員に要る量まで注入しました");
  });
  const hp = input("1", "number");
  const setHp = button("残りの体力を決める", "secondary-button debug-kourin-hp");
  setHp.addEventListener("click", () => {
    if (!debugRaidHp(game.progress, Number(hp.value))) return say("呼んでいないか、数がおかしい", true);
    ctx.storage.save(game.progress);
    say(`残りの体力を ${hp.value} にしました`);
  });
  const charm = select(CHARM_ROWS.map((c) => [c.id, c.name]));
  const charmLv = input("1", "number");
  const setCharm = button("お守りのレベルを決める", "secondary-button debug-kourin-charm");
  setCharm.addEventListener("click", () => {
    if (!debugCharmLevel(game.progress, charm.value, Number(charmLv.value))) return say("レベルがおかしい", true);
    refreshCombat(game);
    ctx.storage.save(game.progress);
    say("お守りのレベルを決めました(付けるのは降臨の画面で)");
  });
  kourinBox.append(fill, field("残りの体力", hp), setHp, field("お守り", charm), field("レベル(0 で持たない)", charmLv), setCharm);

  // すぐ戦う。
  const fight = section("すぐ戦う");
  const target = select(quickFightTargets(game.content).map((/** @type {{ id: string, label: string }} */ t) => [t.id, t.label]));
  const hook = select([["good", "合わせ成功"], ["just", "ジャスト"]]);
  const go = button("戦う", "primary-button debug-fight");
  go.addEventListener("click", () => {
    const r = startQuickFight(game, target.value, /** @type {"good" | "just"} */ (hook.value));
    if (!r.ok) return say(r.error ?? "始められません", true);
    ctx.backToMain();
    if (r.hook) ctx.showHook?.(r.hook);
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

  // 遊びの記録(D-348):本番の遊び(読むだけ)とデバッグの遊び。リセットはデバッグの記録だけ(確認つき)。
  const logBox = section("遊びの記録");
  const playLog = ctx.playLog;
  if (playLog) {
    fillPlayLogSection(logBox, {
      main: playLog.main(),
      debug: playLog.debug(),
      version: playLog.version,
      say,
      resetDebug: () => {
        if (!window.confirm("デバッグの遊びの記録を消します。本番の記録は消えません。よいですか?")) return;
        playLog.resetDebug();
        ctx.rerender();
        say("デバッグの遊びの記録を消しました");
      },
    });
  }

  // ドット絵の見本(D-362):専用のページへの入口はここだけ(ゲームの画面からはリンクしない)。
  const artBox = section("ドット絵の見本");
  const artLink = /** @type {HTMLAnchorElement} */ (el("a", "secondary-button debug-art-link", "ドット絵の見本を開く"));
  artLink.href = "src/art/samples.html";
  artBox.append(artLink);

  container.append(values, logBox, artBox, perfBox, areaBox, baitBox, kourinBox, make, gloveBox, presets, fight, url, reset);
}
