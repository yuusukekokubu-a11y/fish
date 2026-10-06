// デバッグ画面と確認用の仕組みのテスト(②-4b4 の条件 2・3・5:D-214・D-215・D-219・D-220)。

import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createGame, PHASES, tap, update } from "../src/core/fishing.js";
import { emptyGear } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { encodeSaveCode, parseSave } from "../src/core/savecode.js";
import { skillStates } from "../src/core/skills.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import {
  addDebugItem,
  applyPreset,
  DEBUG_PRESETS,
  debugFields,
  parseDebugSave,
  setDebugField,
  startQuickFight,
} from "../src/ui/debug_view.js";
import {
  DEBUG_SAVE_KEY,
  OLD_DATA_MESSAGE,
  OLD_SAVE_KEYS,
  SAVE_KEY,
  shouldShowOldDataNotice,
  storeKeyFor,
} from "../src/ui/save_store.js";
import { drawerItems, SCREENS, screensFor } from "../src/ui/screens.js";
import { readUrlOptions, URL_PARAMS, withUrlOptions } from "../src/ui/url_params.js";
import { progressAt, readText, ROOT } from "./helpers.js";

function freshGame(stage = 1) {
  return createGame(7, { progress: progressAt(stage, ROD_STEPS.NONE, { gear: { ...emptyGear(), seed: 1 } }) });
}

/** 次の魚まで進める(合わせはしない。休みになったら再開する)。 */
function nextFish(game) {
  const count = game.castCount;
  while (game.castCount === count) {
    if (game.phase === PHASES.RESTING) tap(game);
    else update(game, 250);
  }
}

/** 保存して読み直す(再読み込みと同じ)。 */
const reload = (game) => parseDebugSave(encodeSaveCode(game.progress));

test("?debug がないときは、デバッグの行も、seed・crit も出ない(本番に影響しない)", () => {
  assert.equal(screensFor(false), SCREENS);
  assert.ok(!SCREENS.some((s) => s.id === "debug"));
  assert.ok(!drawerItems(screensFor(false)).some((i) => i.label === "デバッグ"));
  assert.deepEqual(readUrlOptions("?seed=42&crit=100&stages=100"), { debug: false, seed: null, crit: null, stages: null });
  assert.deepEqual(readUrlOptions(""), { debug: false, seed: null, crit: null, stages: null });
});

test("?debug のときだけ、目次の最後に「デバッグ」。seed と crit を読む", () => {
  const items = drawerItems(screensFor(true));
  assert.equal(items.at(-1).label, "デバッグ");
  assert.equal(items.length, SCREENS.length + 1);
  assert.deepEqual(readUrlOptions("?debug&seed=42&crit=100&stages=100"), { debug: true, seed: "42", crit: 100, stages: 100 });
  assert.deepEqual(readUrlOptions("?debug&crit=abc&stages=0"), { debug: true, seed: null, crit: null, stages: null });
  assert.equal(readUrlOptions("?debug&stages=201").stages, null);
  assert.equal(readUrlOptions("?debug&stages=2.5").stages, null);
  assert.equal(withUrlOptions("?debug&seed=1", { crit: "50", seed: "" }), "?debug&crit=50");
  assert.equal(withUrlOptions("?debug", { other: "1" }), "?debug");
});

test("保存場所は本番とデバッグで別。互換性を切る前の場所(fish:save)は使わない", () => {
  assert.notEqual(DEBUG_SAVE_KEY, SAVE_KEY);
  assert.equal(storeKeyFor({ debug: false, stages: null }), SAVE_KEY);
  assert.equal(storeKeyFor({ debug: true, stages: null }), DEBUG_SAVE_KEY);
  assert.equal(storeKeyFor({ debug: true, stages: 100 }), `${DEBUG_SAVE_KEY}:stages-100`);
  for (const key of [SAVE_KEY, DEBUG_SAVE_KEY]) assert.ok(!Object.values(OLD_SAVE_KEYS).includes(key));
  const main = readText("src/ui/main.js");
  // 保存の読み書きは、選んだ場所(STORE_KEY)だけを使う。localStorage を直接読み書きしない。
  assert.equal((main.match(/localStorage\.\w+\(/g) ?? []).length, 0);
  assert.match(main, /const STORE_KEY = storeKeyFor\(URL_OPTIONS\);/);
});

test("古い版のデータの案内:新しいデータがなく古いデータだけがあるときに 1 回だけ。古いデータは消さない", () => {
  const store = new Map();
  const storage = { getItem: (k) => (store.has(k) ? store.get(k) : null) };
  assert.equal(shouldShowOldDataNotice(storage, SAVE_KEY, OLD_SAVE_KEYS.main), false, "どちらもない");
  store.set(OLD_SAVE_KEYS.main, '{"version":7}');
  assert.equal(shouldShowOldDataNotice(storage, SAVE_KEY, OLD_SAVE_KEYS.main), true, "古いものだけ");
  store.set(SAVE_KEY, encodeSaveCode(freshGame().progress));
  assert.equal(shouldShowOldDataNotice(storage, SAVE_KEY, OLD_SAVE_KEYS.main), false, "新しいデータを保存したあとは出ない");
  assert.equal(store.get(OLD_SAVE_KEYS.main), '{"version":7}');
  assert.equal(OLD_DATA_MESSAGE, "古い版のデータは読めません。新しく始まります");
  const throwing = { getItem: () => { throw new Error("使えない"); } };
  assert.equal(shouldShowOldDataNotice(throwing, SAVE_KEY, OLD_SAVE_KEYS.main), false);
});

/** src の中の .js を全部。 */
function sourceFiles(dir = join(ROOT, "src")) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : path.endsWith(".js") ? [path] : [];
  });
}

test("URL の指定を読むのは url_params.js だけで、名前は SPEC の一覧と同じ", () => {
  for (const file of sourceFiles()) {
    if (file.endsWith("url_params.js")) continue;
    const text = readFileSync(file, "utf8");
    assert.ok(!/URLSearchParams|searchParams/.test(text), `${file} が URL の指定を直接読んでいる`);
  }
  const code = readText("src/ui/url_params.js");
  const read = new Set([...code.matchAll(/params\.(?:get|has)\("(\w+)"\)/g)].map((m) => m[1]));
  const table = URL_PARAMS.map((p) => p.name);
  assert.deepEqual([...read].sort(), [...table].sort());
  const spec = readText("docs/SPEC.md");
  const section = spec.slice(spec.indexOf("### 5.11 確認用の仕組みの一覧"), spec.indexOf("## 6."));
  const listed = [...section.matchAll(/^\| `\?(\w+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual(listed.sort(), [...table].sort());
  assert.ok(URL_PARAMS.every((p) => p.debugOnly));
  // 自動操作用の窓口も一覧にある。
  for (const name of ["fishDebug", "fishSession", "fishNav"]) assert.match(section, new RegExp(`window\\.${name}`));
});

test("数を決める:範囲の外は直し、数でなければ受け付けない。保存して読み直しても残る", () => {
  const game = freshGame();
  assert.deepEqual(setDebugField(game, "coins", "-5"), { ok: true, value: 0 });
  assert.deepEqual(setDebugField(game, "coins", "12345"), { ok: true, value: 12345 });
  assert.equal(setDebugField(game, "coins", "abc").ok, false);
  assert.equal(setDebugField(game, "coins", "").ok, false);
  assert.deepEqual(setDebugField(game, "rodStage", 99), { ok: true, value: game.content.maxStage });
  assert.deepEqual(setDebugField(game, "rodStep", 9), { ok: true, value: 3 });
  assert.equal(game.progress.rodStep, ROD_STEPS.EVOLVED);
  // 進化済みは最後の段階だけ。段階を下げると撃破済みに戻す(保存の点検を通る形)。
  setDebugField(game, "rodStage", 2);
  assert.equal(game.progress.rodStep, ROD_STEPS.DEFEATED);
  assert.deepEqual(setDebugField(game, "scale:nushi-kurodai", 3), { ok: true, value: 3 });
  assert.ok(debugFields().some((f) => f.id === "scale:kurodai"));
  assert.ok(!debugFields().some((f) => f.id === "scale:aji"), "鱗を落とさない魚はない");
  const back = reload(game);
  assert.equal(back.coins, 12345);
  assert.equal(back.rodStage, 2);
  assert.equal(back.scales["nushi-kurodai"], 3);
});

test("装備を作る:種類・レア度・グレード・値・スキル(最大まで)。すぐ装着でき、読み直しても残る。本番の点検は変えない", () => {
  const game = freshGame(5);
  const r = addDebugItem(game, {
    kind: "reel",
    rarity: "legend",
    grade: 5,
    value: "max",
    skills: [{ id: "crit-rate", level: 99 }, { id: "power", level: 7 }, { id: "core", level: 0 }],
    equip: true,
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.item.skills, [{ id: "crit-rate", level: 7 }, { id: "power", level: 7 }, { id: "core", level: 1 }]);
  assert.equal(game.progress.gear.equipped.reel, r.item.id);
  assert.equal(game.skills["crit-rate"].level, 7);
  const back = reload(game);
  assert.deepEqual(back.gear.items, game.progress.gear.items);
  assert.equal(back.gear.equipped.reel, r.item.id);
  // 本番の点検では、レジェンド・グレード 5 のレベルの上限(5)をこえるので読まない(前のまま)。
  assert.equal(parseSave(encodeSaveCode(game.progress)).gear.items.length, 0);
  // レア度のスキルの数をこえると作らない。値は最小・真ん中も選べる。
  assert.equal(addDebugItem(game, { kind: "line", rarity: "rare", grade: 1, value: "min", skills: [{ id: "power", level: 1 }, { id: "fortune", level: 1 }] }).ok, false);
  const low = addDebugItem(game, { kind: "line", rarity: "normal", grade: 1, value: "min", skills: [] });
  assert.equal(low.item.value, 500);
  const mid = addDebugItem(game, { kind: "line", rarity: "normal", grade: 1, value: "mid", skills: [] });
  assert.ok(mid.item.value >= 500 && mid.item.value <= 1000 && mid.item.value % 100 === 0);
});

test("プリセット:表の行ごとに 3 個作って装着。追加クリティカルは会心率が 100% をこえ、最強の装備は数値型が全部最大", () => {
  assert.deepEqual(DEBUG_PRESETS.map((p) => p.name), ["連撃", "先手とジャスト", "芯と縁", "追加クリティカル", "最強の装備"]);
  for (const p of DEBUG_PRESETS) {
    const game = freshGame(5);
    assert.equal(applyPreset(game, p.id).ok, true, p.id);
    assert.equal(Object.keys(game.progress.gear.equipped).length, 3);
    for (const sid of p.skills) assert.equal(game.skills[sid].level, game.skills[sid].max, `${p.id} ${sid}`);
    assert.deepEqual(reload(game).gear, game.progress.gear, "読み直しても残る");
  }
  const crit = freshGame(1);
  applyPreset(crit, "extra-crit");
  assert.equal(crit.progress.rodStage, crit.content.maxStage);
  assert.ok(crit.combat.critChance > 1, `会心率 ${crit.combat.critChance}`);
  const best = freshGame(5);
  applyPreset(best, "best");
  const states = skillStates(best.progress.gear, 5, DEFAULT_CONFIG.skills);
  for (const id of DEBUG_PRESETS.at(-1).skills) assert.equal(states[id].level, states[id].max, id);
  // 持ち物の空きが足りないと当てない。
  const full = freshGame(5);
  full.progress.gear.items = Array.from({ length: 99 }, (_, i) => ({ id: i + 1, kind: "line", rarity: "normal", grade: 1, value: 500, skills: [] }));
  full.progress.gear.nextId = 100;
  assert.equal(applyPreset(full, "combo").ok, false);
  assert.equal(full.progress.gear.items.length, 99);
});

test("すぐ戦う:選んだ魚と合わせの結果で始まり、戦いのあとは釣りに戻る。魚の並びは変わらない", () => {
  const plain = freshGame(1);
  const game = freshGame(1);
  const before = plain.cast;
  assert.equal(startQuickFight(game, "kurodai", "just").ok, true);
  assert.equal(game.phase, PHASES.MINIGAME);
  assert.equal(game.cast.fish.id, "kurodai");
  assert.equal(game.hookGrade, "just");
  assert.ok(game.fight.boosts.some((b) => b.id === "just"));
  assert.equal(startQuickFight(game, "kurodai", "good").ok, false, "戦いの間は始められない");
  // 時間切れまで進めると、待っていた魚から続く。
  update(game, game.fight.timeLimitMs + game.config.resultMs + 1);
  assert.equal(game.phase, PHASES.CASTING);
  assert.deepEqual(game.cast, before, "待っていた魚から続く");
  // そのあとの並びも、すぐ戦うをしなかったときと同じ。
  for (let i = 0; i < 20; i += 1) {
    nextFish(plain);
    nextFish(game);
    assert.deepEqual(game.cast, plain.cast, `${i} 匹目`);
  }
  // ヌシ・成功も選べる。弱い魚とは戦えない。
  const boss = freshGame(1);
  assert.equal(startQuickFight(boss, "nushi-kurodai", "good").ok, true);
  assert.equal(boss.hookGrade, "good");
  assert.equal(boss.cast.kind, "boss");
  assert.equal(startQuickFight(freshGame(1), "aji", "good").ok, false);
});
