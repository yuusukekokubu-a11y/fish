// 画面の情報量を減らす依頼のテスト(受け入れ条件 1〜3・5:D-299〜D-301・D-304・D-307)。
// 発動中だけのスキル画面、出会ったスキルと NEW、保存の版 5、装備画面の並べ替えと絞り込みの保存場所。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { createGame } from "../src/core/fishing.js";
import { autoScrap, emptyGear, makeCrates, pullCrate, setAutoScrap } from "../src/core/gear.js";
import { encodeSave, initialProgress, SAVE_VERSION } from "../src/core/save.js";
import { checksum, decodeSaveCode, encodeSaveCode, parseSave } from "../src/core/savecode.js";
import { readSaveCode, signSaveCode } from "../src/core/signed_code.js";
import { SKILL_ROWS } from "../src/core/skills.js";
import { hasSeenSkill, noteSkillsSeen } from "../src/core/skills_seen.js";
import { cleanPrefs, DEBUG_EQUIP_VIEW_KEY, defaultPrefs, EQUIP_VIEW_KEY, equipViewKeyFor, loadPrefs, savePrefs } from "../src/ui/equip_prefs.js";
import { inventoryRows, pullResultView, SORT_CHOICES } from "../src/ui/gear_view.js";
import { CURRENT_KEY } from "../src/ui/save_sign.js";
import { activeSkillRows, NO_SKILLS } from "../src/ui/skill_view.js";
import { progressAt, readText } from "./helpers.js";

const KINDS = DEFAULT_CONTENT.equipKinds;
const crates = makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG);

/** 装備をいくつか持たせたゲーム。 @param {any[]} items @param {Record<string, number>} [equipped] */
function gameWith(items, equipped = {}) {
  const game = createGame(1, { progress: progressAt(5) });
  game.progress.gear = { ...emptyGear(), items, equipped, nextId: items.length + 1, seed: 7 };
  return game;
}

test("スキル画面:装備なしは発動中がなく「スキルなし」。1 つ発動すると、その 1 行だけ(Lv0 のスキルは入らない)", () => {
  assert.equal(NO_SKILLS, "スキルなし");
  assert.deepEqual(activeSkillRows(gameWith([])), []);
  const one = gameWith([{ id: 1, kind: "reel", rarity: "rare", grade: 1, value: 3, skills: [{ id: "power", level: 2 }] }], { reel: 1 });
  const rows = activeSkillRows(one);
  assert.deepEqual(rows.map((r) => [r.id, r.level]), [["power", 2]]);
  // 未発動のスキルの名前は、行のどの文字にも出ない。
  const text = JSON.stringify(rows);
  for (const s of SKILL_ROWS.filter((x) => x.id !== "power")) assert.ok(!text.includes(`"${s.name}"`), s.name);
  // 装着していない装備のスキルは発動しない。
  assert.deepEqual(activeSkillRows(gameWith([{ id: 1, kind: "reel", rarity: "rare", grade: 1, value: 3, skills: [{ id: "power", level: 2 }] }])), []);
});

test("スキル画面:発動中のスキルはレベルの高い順(同じならスキルの表の順)", () => {
  const game = gameWith(
    [
      { id: 1, kind: "reel", rarity: "epic", grade: 1, value: 3, skills: [{ id: "crit-rate", level: 1 }, { id: "power", level: 1 }] },
      { id: 2, kind: "line", rarity: "rare", grade: 1, value: 700, skills: [{ id: "recovery", level: 1 }] },
      { id: 3, kind: "lure", rarity: "rare", grade: 1, value: 5, skills: [{ id: "crit-rate", level: 1 }] },
    ],
    { reel: 1, line: 2, lure: 3 },
  );
  assert.deepEqual(activeSkillRows(game).map((r) => [r.id, r.level]), [["crit-rate", 2], ["power", 1], ["recovery", 1]]);
});

test("出会ったスキル:初めてのスキルを記録して NEW を返す。2 回目以降は NEW なし。同じ回の中では最初の装備だけ", () => {
  const p = initialProgress();
  const a = { id: 1, kind: "reel", rarity: "epic", grade: 1, value: 3, skills: [{ id: "power", level: 1 }, { id: "crit-rate", level: 1 }] };
  const b = { id: 2, kind: "line", rarity: "rare", grade: 1, value: 700, skills: [{ id: "power", level: 1 }] };
  assert.deepEqual(noteSkillsSeen(p, [a, b]), [["power", "crit-rate"], []]);
  assert.deepEqual(p.skillsSeen, ["power", "crit-rate"], "スキルの表の順");
  assert.deepEqual(noteSkillsSeen(p, [a, b]), [[], []], "2 回目は NEW なし");
  assert.equal(hasSeenSkill(p, "power"), true);
  // スキルのない装備だけなら、欄を持たない。
  const q = initialProgress();
  noteSkillsSeen(q, [{ id: 1, kind: "lure", rarity: "normal", grade: 1, value: 5, skills: [] }]);
  assert.equal("skillsSeen" in q, false);
});

test("出会ったスキル:10 連でも、自動分解された装備でも記録され、結果の見せ方に NEW が付く(ガチャの結果は変わらない)", () => {
  // 強い装備を付けておく(▲ の装備は自動分解しないため)。
  const strong = KINDS.map((k, i) => ({ id: i + 1, kind: k.id, rarity: "normal", grade: 1, value: 1e9, skills: [] }));
  const start = () =>
    progressAt(10, "none", {
      coins: 1e9,
      gear: { ...emptyGear(), seed: 42, items: structuredClone(strong), equipped: Object.fromEntries(strong.map((it) => [it.kind, it.id])), nextId: strong.length + 1 },
    });
  const plain = createGame(3, { progress: start() });
  const game = createGame(3, { progress: start() });
  setAutoScrap(game.progress, "epic");
  const crate = crates.find((c) => c.stage === 10);
  const before = structuredClone(plain.progress.gear);
  const r = pullCrate(game.progress, crate, 10, KINDS, DEFAULT_CONFIG.gacha);
  const r0 = pullCrate(plain.progress, crate, 10, KINDS, DEFAULT_CONFIG.gacha);
  assert.ok(r.ok && r0.ok);
  assert.deepEqual(r.items, r0.items, "記録してもガチャの結果は同じ");
  assert.notDeepEqual(before, plain.progress.gear);
  const fresh = noteSkillsSeen(game.progress, r.items);
  const scrap = autoScrap(game.progress, r.items, crates, Number.MAX_SAFE_INTEGER);
  assert.ok(scrap.items.length > 0, "自動分解された装備がある");
  const scrappedSkills = scrap.items.flatMap((it) => it.skills.map((s) => s.id));
  for (const id of scrappedSkills) assert.ok(hasSeenSkill(game.progress, id), `自動分解された装備のスキル ${id} も出会った`);
  const view = pullResultView(game, r.items, crates, fresh);
  const newCount = view.items.flatMap((v) => v.skills).filter((s) => s.isNew).length;
  assert.equal(newCount, new Set(r.items.flatMap((it) => it.skills.map((s) => s.id))).size, "出会ったスキル 1 つにつき NEW 1 つ");
  // もう一度引くと、出会い済みのスキルには NEW が付かない。
  const r2 = pullCrate(game.progress, crate, 10, KINDS, DEFAULT_CONFIG.gacha);
  assert.ok(r2.ok);
  const fresh2 = noteSkillsSeen(game.progress, r2.items);
  for (const [i, ids] of fresh2.entries()) for (const id of ids) assert.ok(!r.items.some((it) => it.skills.some((s) => s.id === id)), `${i}:${id}`);
});

test("保存の版 5〜10:出会ったスキルが往復で元に戻る(保存・セーブコード・署名つき TSURI5-k1-12-)", async () => {
  assert.equal(SAVE_VERSION, 12);
  const p = initialProgress();
  p.skillsSeen = ["power", "penetration", "combo-pen"];
  assert.deepEqual(parseSave(encodeSaveCode(p)), p);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p)), { ok: true, progress: p });
  const k1 = { id: "k1", secret: "test-only-production-like-key" };
  const code = await signSaveCode(p, k1);
  assert.match(code, /^TSURI5-k1-12-/);
  assert.deepEqual((await readSaveCode(code, { keys: [k1] })).progress, p);
  // 署名なしの形(ブラウザの中の保存と同じ形)は、読み込みでは拒否する(②-5a から:D-324)。ブラウザの保存としては読める。
  const unsigned = await readSaveCode(encodeSaveCode(p), { keys: [k1] });
  assert.deepEqual([unsigned.ok, unsigned.ok ? "" : unsigned.error], [false, "unsigned"]);
});

test("保存の版 5:セーブコードの増えは 30 文字以内(全部のスキルに出会っても)", () => {
  const p = initialProgress();
  // 版 5 の 11 の欄だけで比べる(版 7 のグローブの欄は除く)。
  const v5 = (/** @type {any} */ x) => encodeSave(x).split("~").slice(0, 11).join("~");
  const empty = v5(p).length;
  p.skillsSeen = SKILL_ROWS.map((s) => s.id);
  const v4Length = encodeSave(initialProgress()).split("~").slice(0, 10).join("~").length;
  assert.ok(v5(p).length - v4Length <= 30, `${v5(p).length - v4Length}`);
  assert.ok(empty - v4Length <= 2, "出会ったスキルなしは「~0」の 2 文字");
});

test("保存の版 5:壊れた出会ったスキルの欄は拒否し、ブラウザの保存は初めの状態になる(いまの保存データは変えない)", () => {
  const fixture = JSON.parse(readText("tests/fixtures/compat_save_v5.json"));
  for (const c of fixture.rejected) {
    const r = decodeSaveCode(c.code);
    assert.deepEqual([r.ok, r.ok ? "" : r.error], [false, c.error], c.name);
    assert.deepEqual(parseSave(c.code), initialProgress(), c.name);
  }
});

test("互換の正解データ(compat_save_v5.json):保存の版 5 の署名なしと署名つきのコードが、読めて決まった結果になる", async () => {
  const fixture = JSON.parse(readText("tests/fixtures/compat_save_v5.json"));
  assert.equal(fixture.version, 5);
  for (const c of fixture.cases) {
    assert.deepEqual(decodeSaveCode(c.code), { ok: true, progress: c.progress }, c.name);
    assert.deepEqual(parseSave(c.code), c.progress, `${c.name}:ブラウザの保存としても読める`);
    // 書き出すと保存の版 8(本文はグローブ・降臨・お守りの欄が空で足される:D-335・D-392)。
    const tail = "~0.1..0~~0.......~.~";
    assert.equal(encodeSaveCode(c.progress), c.code.replace(/^TSURI5-(.*)-([0-9a-f]{8})$/, (_, body) => `TSURI12-${body}${tail}-${checksum(`${body}${tail}`)}`), `${c.name}:書き出しは版 8`);
    assert.deepEqual(await readSaveCode(c.signed, { keys: [CURRENT_KEY] }), { ok: true, progress: c.progress, signed: true, keyId: "dev", warning: null }, c.name);
    const again = await signSaveCode(c.progress, CURRENT_KEY);
    assert.equal(again.replace("-dev-12-", "-dev-5-").slice(0, -23), `${c.signed.slice(0, -23)}${tail}`, `${c.name}:署名つきの書き出しは版 8`);
  }
});

test("装備画面:並べ替え(レア度・新しい・種類・ロック中を上に)と、種類・レア度・ロックの絞り込み", () => {
  const game = gameWith([
    { id: 1, kind: "lure", rarity: "rare", grade: 1, value: 5, skills: [{ id: "power", level: 1 }] },
    { id: 2, kind: "reel", rarity: "legend", grade: 1, value: 4, skills: [], locked: true },
    { id: 3, kind: "line", rarity: "normal", grade: 1, value: 800, skills: [] },
    { id: 4, kind: "line", rarity: "rare", grade: 1, value: 900, skills: [{ id: "power", level: 1 }] },
  ]);
  assert.deepEqual(SORT_CHOICES.map((c) => c.id), ["rarity", "new", "kind", "locked"]);
  const ids = (sort, kind = null, lock = null, rarity = null) => inventoryRows(game, crates, sort, kind, lock, rarity).map((v) => v.id);
  assert.deepEqual(ids("rarity"), [2, 4, 1, 3]);
  assert.deepEqual(ids("new"), [4, 3, 2, 1]);
  assert.deepEqual(ids("kind"), KINDS.flatMap((k) => (k.id === "line" ? [4, 3] : k.id === "reel" ? [2] : k.id === "lure" ? [1] : [])));
  assert.deepEqual(ids("locked"), [2, 4, 1, 3]);
  assert.deepEqual(ids("new", null, null, "rare"), [4, 1]);
  assert.deepEqual(ids("new", "line", null, "rare"), [4]);
  assert.deepEqual(ids("new", null, "locked"), [2]);
});

test("装備画面:並べ替えと絞り込みは別の保存場所(本番とデバッグで別)。ゲームの保存とセーブコードは変わらない", () => {
  assert.equal(equipViewKeyFor({ debug: false }), EQUIP_VIEW_KEY);
  assert.equal(equipViewKeyFor({ debug: true }), DEBUG_EQUIP_VIEW_KEY);
  assert.notEqual(EQUIP_VIEW_KEY, DEBUG_EQUIP_VIEW_KEY);
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  assert.deepEqual(loadPrefs(storage, EQUIP_VIEW_KEY, KINDS), defaultPrefs());
  const game = gameWith([]);
  const code = encodeSaveCode(game.progress);
  const prefs = { sort: "kind", kind: "line", rarity: "epic", lock: "locked" };
  savePrefs(storage, EQUIP_VIEW_KEY, prefs);
  assert.deepEqual(loadPrefs(storage, EQUIP_VIEW_KEY, KINDS), prefs);
  assert.deepEqual(loadPrefs(storage, DEBUG_EQUIP_VIEW_KEY, KINDS), defaultPrefs(), "デバッグは別");
  assert.equal(encodeSaveCode(game.progress), code, "セーブコードには入らない");
  // 壊れた値・知らない値は初めの値に。
  assert.deepEqual(cleanPrefs({ sort: "x", kind: "glove", rarity: "mythic", lock: "maybe" }, KINDS), defaultPrefs());
  store.set(EQUIP_VIEW_KEY, "{oops");
  assert.deepEqual(loadPrefs(storage, EQUIP_VIEW_KEY, KINDS), defaultPrefs());
  const broken = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(loadPrefs(broken, EQUIP_VIEW_KEY, KINDS), defaultPrefs());
  assert.doesNotThrow(() => savePrefs(broken, EQUIP_VIEW_KEY, prefs));
});
