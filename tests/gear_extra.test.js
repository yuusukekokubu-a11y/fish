// おもり・浮き・おまもり(装備 6 枠:D-320・D-321・D-327)のテスト。
// - おもり:印の速さを −n%(基準の 50% より遅くしない)。浮き:合わせの成功帯とジャスト帯を +n%(上限つき)。
// - おまもり:ウロコイン +n%(豊漁と足し算)。効果は拮抗型(付けるほど伸びが小さくなる)。
// - ガチャの種類は 6 つから同じ確率で、乱数を引く回数は前と同じ。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { normalizeCombat, widenRing } from "../src/core/combat.js";
import { DEFAULT_CONTENT, FISH_KINDS } from "../src/core/fish.js";
import { createGame, currentHookTiming, fightSweepMs, refreshCombat } from "../src/core/fishing.js";
import { BASE_KIND_IDS, drawItem, effectRange, EQUIP_KIND_ROWS, formatEffect, gachaKinds, kindById, kindEffect, makeCrates, pullCrate, RARITY_ROWS } from "../src/core/gear.js";
import { SAVE_VERSION } from "../src/core/save.js";
import { checksum, decodeSaveCode, encodeSaveCode, parseSave } from "../src/core/savecode.js";
import { readSaveCode, signSaveCode } from "../src/core/signed_code.js";
import { startQuickFight } from "../src/ui/debug_view.js";
import { CURRENT_KEY } from "../src/ui/save_sign.js";
import { progressAt, readText, toV8 } from "./helpers.js";

const LIMITS = DEFAULT_CONFIG.combatLimits;
const kind = (id) => kindById(id, EQUIP_KIND_ROWS);

/** 装備 1 個(id 1)を付けた、段階 g のゲーム。 */
function gameWith(g, items) {
  const own = items.map((it, i) => ({ id: i + 1, rarity: "rare", grade: g, skills: [], ...it }));
  const gear = { items: own, equipped: Object.fromEntries(own.map((it) => [it.kind, it.id])), draws: 0, seed: 1, nextId: own.length + 1 };
  return createGame(1, { progress: progressAt(g, "none", { gear }) });
}

test("種類の表:糸・リール・ルアーのあとに、おもり・浮き・お守り(表の番号は保存に使うので並べ替えない)。お守りはガチャで出ない(D-392)", () => {
  assert.deepEqual(EQUIP_KIND_ROWS.map((k) => k.id), ["line", "reel", "lure", "weight", "float", "charm"]);
  assert.deepEqual(EQUIP_KIND_ROWS.map((k) => k.name), ["糸", "リール", "ルアー", "おもり", "浮き", "お守り"]);
  assert.deepEqual([...BASE_KIND_IDS], ["line", "reel", "lure"]);
  assert.deepEqual(gachaKinds(EQUIP_KIND_ROWS).map((k) => k.id), ["line", "reel", "lure", "weight", "float"]);
  // おもりは、版 7 までのおまもりと同じ値の範囲と曲線(持ち物の値がそのまま使える)。
  const [w, c] = [kind("weight"), kind("charm")];
  assert.deepEqual([w.stat, w.base, w.step, w.curve], [c.stat, c.base, c.step, c.curve]);
});

test("拮抗型の効果:cap × v ÷ (v + k)。付けるほど伸びが小さくなり、cap をこえない", () => {
  for (const id of ["weight", "float"]) {
    const k = kind(id);
    assert.equal(kindEffect(k, 0), 0);
    let prev = 0;
    let prevInc = Infinity;
    for (let v = 10; v <= 1000; v += 10) {
      const e = kindEffect(k, v);
      assert.ok(e > prev && e < k.curve.cap, `${id} ${v}`);
      assert.ok(e - prev <= prevInc + 1e-12, `${id} ${v} の伸びは前以下`);
      prevInc = e - prev;
      prev = e;
    }
    assert.equal(kindEffect(k, k.curve.k), k.curve.cap / 2, "k のときにちょうど半分");
  }
  // 拮抗型でない種類は、値そのまま。
  assert.equal(kindEffect(kind("reel"), 7), 7);
  assert.equal(formatEffect(kind("weight"), 112), "ウロコイン +30%");
  assert.equal(formatEffect(kind("float"), 60), "合わせの帯 +30%");
});

test("印を遅くする道(markerSlow):版 8 では装備から入らない(お守りの「静め」で使う:D-392)。印の速さ −n% は端から端の時間が 1 ÷ (1 − n) 倍。表の上限 50% より遅くしない", () => {
  const g = 3;
  const plain = gameWith(g, []);
  const value = effectRange(kind("weight"), RARITY_ROWS[3], g, DEFAULT_CONFIG.gacha.gradeGrowth).max;
  const game = gameWith(g, [{ kind: "weight", rarity: "legend", value }]);
  assert.equal(game.combat.markerSlow, 0, "おもりは印を遅くしない");
  const slow = 0.25;
  game.combat = { ...game.combat, markerSlow: slow };
  const strong = DEFAULT_CONTENT.fish.find((f) => f.stage === g && f.kind === FISH_KINDS.STRONG);
  for (const gm of [plain, game]) assert.equal(startQuickFight(gm, strong.id, "good").ok, true);
  assert.equal(fightSweepMs(plain), strong.minigame.sweepMs, "おもりなしは魚の値のまま");
  assert.ok(Math.abs(fightSweepMs(game) - strong.minigame.sweepMs / (1 - slow)) < 1e-9);
  // 表の上限:どれだけ足しても 50%(端から端の時間は 2 倍まで)。
  assert.equal(normalizeCombat({ ...DEFAULT_CONFIG.combat, markerSlow: 0.9 }, DEFAULT_CONFIG.combat, LIMITS).markerSlow, LIMITS.maxMarkerSlow);
  game.combat = { ...game.combat, markerSlow: 0.9 };
  assert.equal(fightSweepMs(game), strong.minigame.sweepMs * 2);
});

test("浮き:合わせの成功帯とジャスト帯を +n%。成功帯は輪の 60%、ジャスト帯は成功帯の 50% まで(元から広い分は狭めない)", () => {
  const ring = { ringMs: 1200, successMs: 400, justMs: 140 };
  assert.equal(widenRing(ring, 0, LIMITS), ring, "0 ならそのまま");
  const w = widenRing(ring, 0.3, LIMITS);
  assert.ok(Math.abs(w.successMs - 520) < 1e-9 && Math.abs(w.justMs - 182) < 1e-9);
  const big = widenRing(ring, 10, LIMITS);
  assert.ok(Math.abs(big.successMs - 720) < 1e-9, "輪の 60%");
  assert.ok(Math.abs(big.justMs - 360) < 1e-9, "成功帯の 50%");
  // スキルで既に上限をこえていれば、狭めない。
  const wide = { ringMs: 1000, successMs: 800, justMs: 500 };
  assert.deepEqual(widenRing(wide, 0.5, LIMITS), { ringMs: 1000, successMs: 800, justMs: 500 });
  // 画面と判定の区切りも広がる(輪の終わりは同じ)。
  const plain = gameWith(1, []);
  const game = gameWith(1, [{ kind: "float", value: 60 }]);
  for (const gm of [plain, game]) {
    gm.phase = "bite";
    gm.cast = { ...gm.cast, kind: FISH_KINDS.STRONG };
  }
  const a = currentHookTiming(plain);
  const b = currentHookTiming(game);
  assert.equal(a.ringMs, b.ringMs);
  assert.ok(b.successStart < a.successStart && b.justEnd - b.justStart > a.justEnd - a.justStart);
});

test("おもり(版 8:D-392):ウロコイン +n%(豊漁と足し算)。付けていなければ倍率は前と同じ 1。お守りの種類の装備は効かない", () => {
  const plain = gameWith(1, []);
  assert.equal(plain.rates.coins, 1);
  assert.equal(plain.combat.coinBonus, 0);
  const game = gameWith(1, [{ kind: "weight", value: 112 }]);
  assert.ok(Math.abs(game.rates.coins - 1.3) < 1e-12);
  assert.equal(gameWith(1, [{ kind: "charm", value: 112 }]).rates.coins, 1, "特別な枠の装備は効かない");
  // 豊漁(ウロコイン +n%)と足し算。
  const both = gameWith(5, [
    { kind: "weight", value: 112 },
    { kind: "reel", value: 1, skills: [{ id: "fortune", level: 1 }] },
  ]);
  const fortuneOnly = gameWith(5, [{ kind: "reel", value: 1, skills: [{ id: "fortune", level: 1 }] }]);
  assert.ok(Math.abs(both.rates.coins - (fortuneOnly.rates.coins + 0.3)) < 1e-12);
  refreshCombat(both);
  assert.ok(Math.abs(both.rates.coins - (fortuneOnly.rates.coins + 0.3)) < 1e-12, "計算し直しても二重に足さない");
});

test("ガチャの種類:6 つから同じ確率(10 万回で各 1/6 ± 1%)。1 個に引く乱数の数は前と同じ(種類は 1 回)", () => {
  const crate = makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG)[2];
  const counts = Object.fromEntries(EQUIP_KIND_ROWS.map((k) => [k.id, 0]));
  const N = 100000;
  for (let i = 0; i < N; i++) counts[drawItem(7, i, crate, EQUIP_KIND_ROWS, DEFAULT_CONFIG.gacha.gradeGrowth).kind] += 1;
  for (const [id, n] of Object.entries(counts)) assert.ok(Math.abs(n / N - 1 / 6) < 0.01, `${id}:${n}`);
  // 種類の表が 3 つでも 6 つでも、レア度(1 回目の乱数)は同じ。
  for (let i = 0; i < 200; i++) {
    const three = drawItem(7, i, crate, EQUIP_KIND_ROWS.slice(0, 3), DEFAULT_CONFIG.gacha.gradeGrowth);
    const six = drawItem(7, i, crate, EQUIP_KIND_ROWS, DEFAULT_CONFIG.gacha.gradeGrowth);
    assert.equal(three.rarity, six.rarity);
    assert.equal(three.skills.length, six.skills.length);
  }
});

test("保存の版 6(D-325):版 5 の本文はそのまま読め、新しい枠は空。ガチャの 5 枠を全部付けても、セーブコードの増えは 20 文字以内(版 8:D-392)", async () => {
  assert.equal(SAVE_VERSION, 9);
  const v5 = JSON.parse(readText("tests/fixtures/compat_save_v5.json"));
  for (const c of v5.cases) {
    const r = decodeSaveCode(c.code);
    assert.equal(r.ok, true, c.name);
    if (r.ok) assert.ok(!["weight", "float", "charm"].some((k) => k in r.progress.gear.equipped), "新しい枠は空");
  }
  // 糸・リール・ルアーだけを付けたときと、ガチャの 5 枠を全部付けたとき(装備は同じ 5 個。お守りは装備の個体を持たない)。
  const items = gachaKinds(EQUIP_KIND_ROWS).map((k, i) => ({
    id: i + 1,
    kind: k.id,
    rarity: "rare",
    grade: 3,
    value: effectRange(k, RARITY_ROWS[1], 3, DEFAULT_CONFIG.gacha.gradeGrowth).min,
    skills: [],
  }));
  const make = (ids) => progressAt(3, "none", { gear: { items, equipped: Object.fromEntries(items.filter((it) => ids.includes(it.kind)).map((it) => [it.kind, it.id])), draws: 6, seed: 1, nextId: 7 } });
  const three = make(BASE_KIND_IDS);
  const six = make(gachaKinds(EQUIP_KIND_ROWS).map((k) => k.id));
  assert.ok(encodeSaveCode(six).length - encodeSaveCode(three).length <= 20, `${encodeSaveCode(six).length - encodeSaveCode(three).length}`);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(six)), { ok: true, progress: six });
  const signed = await signSaveCode(six, CURRENT_KEY);
  assert.match(signed, /^TSURI5-dev-9-/);
  assert.deepEqual((await readSaveCode(signed, { keys: [CURRENT_KEY] })).progress, six);
});

test("互換の正解データ(compat_save_v6.json):保存の版 6 の署名なしと署名つきのコードが、読めて決まった結果になる", async () => {
  const fixture = JSON.parse(readText("tests/fixtures/compat_save_v6.json"));
  assert.equal(fixture.version, 6);
  for (const c of fixture.cases) {
    // 版 8 で読むと、おもりは払い戻しに、おまもりはおもりになる(D-392)。
    const want = await toV8(c.progress);
    assert.deepEqual(decodeSaveCode(c.code), { ok: true, progress: want }, c.name);
    assert.deepEqual(parseSave(c.code), want, `${c.name}:ブラウザの保存としても読める`);
    // 書き出すと保存の版 8(グローブ・降臨・お守りの欄が足される)。読み直すと同じ。
    assert.match(encodeSaveCode(want), /^TSURI9-.*~0\.1\.~~0\.0\.\.\.\.\.~\.-[0-9a-f]{8}$/, `${c.name}:書き出しは版 8`);
    assert.deepEqual(decodeSaveCode(encodeSaveCode(want)), { ok: true, progress: want }, c.name);
    assert.deepEqual(await readSaveCode(c.signed, { keys: [CURRENT_KEY] }), { ok: true, progress: want, signed: true, keyId: "dev", warning: null }, c.name);
    assert.match(await signSaveCode(want, CURRENT_KEY), /^TSURI5-dev-9-/, `${c.name}:署名つきの書き出しは版 8`);
    // 署名なしのコードは、読み込みでは拒否する(D-324)。
    const unsigned = await readSaveCode(c.code, { keys: [CURRENT_KEY] });
    assert.deepEqual([unsigned.ok, unsigned.ok ? "" : unsigned.error], [false, "unsigned"]);
  }
  for (const c of fixture.rejected) {
    const r = decodeSaveCode(c.code);
    assert.deepEqual([r.ok, r.ok ? "" : r.error], [false, c.error], c.name);
  }
});

test("ガチャはお守りを出さない(D-392):種類はガチャの 5 種類から選ぶ。表のすべてを渡しても同じ", () => {
  const crate = makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG)[2];
  const a = progressAt(3, "none", { coins: 1e9, gear: { items: [], equipped: {}, draws: 0, seed: 5, nextId: 1 } });
  const b = structuredClone(a);
  for (let i = 0; i < 10; i++) {
    pullCrate(a, crate, 10, EQUIP_KIND_ROWS, DEFAULT_CONFIG.gacha);
    pullCrate(b, crate, 10, gachaKinds(EQUIP_KIND_ROWS), DEFAULT_CONFIG.gacha);
  }
  assert.deepEqual(a.gear.items, b.gear.items);
  const kinds = new Set(a.gear.items.map((it) => it.kind));
  assert.deepEqual([...kinds].sort(), ["float", "line", "lure", "reel", "weight"]);
});
