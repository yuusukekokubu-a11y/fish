// 保存の版 6 とセーブコード FISH6 の、装備・スキル・ガチャのまとまりのテスト(②-4a の条件 11・②-4b の条件 9・②-4b2 の条件 9)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { effectRange, emptyGear, EQUIP_KIND_ROWS, equipItem, makeCrates, pullCrate, rarityById, RARITY_ROWS } from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { initialProgress, parseSave, readSaveData, toSaveData } from "../src/core/save.js";
import { checksum, decodeSaveCode, encodeSaveCode } from "../src/core/savecode.js";
import { legacyKinds } from "../src/core/gear_save.js";
import { pointsRange, SKILL_ROWS } from "../src/core/skills.js";
import { progressAt } from "./helpers.js";

const GACHA = DEFAULT_CONFIG.gacha;
const CRATES = makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG);

/** ガチャを何回か引いて、いくつか付けた進み具合。 */
function sample(pulls = 3) {
  const p = progressAt(5, ROD_STEPS.CRAFTED, {
    coins: 1e9,
    scales: { maguro: 2 },
    seen: ["aji"],
    gear: { ...emptyGear(), seed: 4242 },
  });
  for (let i = 0; i < pulls; i++) pullCrate(p, CRATES[i % 5], 10, EQUIP_KIND_ROWS, GACHA);
  for (const kind of ["line", "reel", "lure"]) {
    const item = p.gear.items.find((it) => it.kind === kind);
    if (item) equipItem(p.gear, item.id);
  }
  return p;
}

const LURE = EQUIP_KIND_ROWS.find((k) => k.id === "lure");
const OLD_LURE = legacyKinds([LURE])[0];
const rangeOf = (kind, it) => effectRange(kind, rarityById(it.rarity, RARITY_ROWS), it.grade, GACHA.gradeGrowth);

/** 新しいルアーの値を、前の範囲の同じ位置(min / max / 真ん中)の値にする(版 5 までのデータを作るため)。 */
function oldLureValue(it) {
  const to = rangeOf(LURE, it);
  const from = rangeOf(OLD_LURE, it);
  if (it.value === to.min) return from.min;
  if (it.value === to.max) return from.max;
  return Math.round((from.min + from.max) / 2);
}
/** 版 5 まで(ルアーは前の範囲の値)の装備。 */
const oldItems = (p) => p.gear.items.map((it) => (it.kind === "lure" ? { ...it, value: oldLureValue(it) } : it));

/** 版 4 の形(オブジェクト。スキルは空。ルアーは前の値)のデータ。 */
function v4Data(p) {
  const v6 = toSaveData(p);
  const g = p.gear;
  return {
    version: 4,
    progress: {
      ...v6.progress,
      gear: { items: oldItems(p).map((it) => ({ ...it, skills: [] })), equipped: { ...g.equipped }, draws: g.draws, seed: g.seed, nextId: g.nextId },
    },
  };
}

/** 版 5 の形(短い配列。ルアーは前の値)のデータ。 */
function v5Data(p) {
  const v6 = toSaveData({ ...p, gear: { ...p.gear, items: oldItems(p) } });
  return { ...v6, version: 5 };
}

function codeWith(data, prefix = "FISH6") {
  const body = btoa(JSON.stringify(data)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
  return `${prefix}-${body}-${checksum(body)}`;
}

test("版 6 の保存とセーブコード(FISH6)は、往復で元に戻る(スキルつきの装備も)", () => {
  for (const p of [progressAt(1), sample(1), sample(10)]) {
    assert.deepEqual(parseSave(JSON.stringify(toSaveData(p))), p);
    const code = encodeSaveCode(p);
    assert.match(code, /^FISH6-/);
    assert.deepEqual(decodeSaveCode(code), { ok: true, progress: p });
  }
  assert.ok(sample(10).gear.items.some((it) => it.skills.length > 0));
});

test("版 6 の装備は、表の番号の短い配列で書く", () => {
  const p = sample(1);
  const g = toSaveData(p).progress.gear;
  const it = p.gear.items[0];
  const row = g.items[0];
  assert.equal(row[0], it.id);
  assert.equal(EQUIP_KIND_ROWS[row[1]].id, it.kind);
  assert.equal(RARITY_ROWS[row[2]].id, it.rarity);
  assert.deepEqual(row.slice(3, 5), [it.grade, it.value]);
  assert.deepEqual(row[5], it.skills.flatMap((s) => [SKILL_ROWS.findIndex((r) => r.id === s.id), s.points]));
  assert.ok(Array.isArray(g.equipped));
});

test("版 1〜5 から版 6 に読み替える。旧装備はスキルなし(版 4)、ルアーは範囲の中の位置を保って読み替える", () => {
  const v1 = { version: 1, coins: 5, material: 2, rodStage: 2, seen: ["aji"] };
  const v2 = { version: 2, progress: { coins: 5, material: 2, rodStage: 2, seen: ["aji"] } };
  const v3 = { version: 3, progress: { coins: 7, scales: { suzuki: 3 }, rod: { stage: 2, step: "crafted" }, seen: ["aji"] } };
  for (const data of [v1, v2]) {
    assert.deepEqual(readSaveData(data), { ok: true, progress: progressAt(2, ROD_STEPS.NONE, { coins: 7, seen: ["aji"] }) });
  }
  const r = readSaveData(v3);
  assert.deepEqual(r, { ok: true, progress: progressAt(2, ROD_STEPS.CRAFTED, { coins: 7, scales: { suzuki: 3 }, seen: ["aji"] }) });
  assert.deepEqual(r.progress.gear, { items: [], equipped: {}, draws: 0, seed: null, nextId: 1 });
  assert.deepEqual(initialProgress().gear, emptyGear());

  const p = sample(3);
  const r4 = readSaveData(v4Data(p));
  assert.equal(r4.ok, true);
  assert.equal(r4.progress.gear.items.length, p.gear.items.length);
  assert.ok(r4.progress.gear.items.every((it) => it.skills.length === 0));
  assert.deepEqual(r4.progress.gear.equipped, p.gear.equipped);
  assert.deepEqual(decodeSaveCode(codeWith(v4Data(p), "FISH4")), r4);
  // 版 5:ウロコイン・鱗・竿・装備(スキルつき)・装着はそのまま。ルアーは前の範囲の端なら新しい範囲の端へ。
  const r5 = readSaveData(v5Data(p));
  assert.equal(r5.ok, true);
  assert.deepEqual({ ...r5.progress, gear: null }, { ...p, gear: null });
  assert.deepEqual(r5.progress.gear.equipped, p.gear.equipped);
  for (const [i, it] of p.gear.items.entries()) {
    const got = r5.progress.gear.items[i];
    assert.deepEqual({ ...got, value: 0 }, { ...it, value: 0 });
    if (it.kind !== "lure") assert.equal(got.value, it.value);
    else {
      const to = rangeOf(LURE, it);
      assert.ok(got.value >= to.min && got.value <= to.max);
      if (it.value === to.min || it.value === to.max) assert.equal(got.value, it.value, "端は端へ");
    }
  }
  assert.deepEqual(decodeSaveCode(codeWith(v5Data(p), "FISH5")), r5);
});

test("旧ルアーの読み替え:前の範囲の位置(0・真ん中・1)を、新しい範囲の同じ位置にする", () => {
  for (const rarity of RARITY_ROWS) {
    for (const grade of [1, 3, 5]) {
      const it = { id: 1, kind: "lure", rarity: rarity.id, grade, value: 0, skills: [] };
      const from = rangeOf(OLD_LURE, it);
      const to = rangeOf(LURE, it);
      for (const [v, want] of [
        [from.min, to.min],
        [from.max, to.max],
      ]) {
        const p = progressAt(5, ROD_STEPS.NONE, { gear: { ...emptyGear(), seed: 1, items: [{ ...it, value: v }], equipped: { lure: 1 }, nextId: 2 } });
        const data = { ...toSaveData(p), version: 5 };
        assert.equal(readSaveData(data).progress.gear.items[0].value, want, `${rarity.id} ${grade} ${v}`);
      }
      // 前の範囲の外の値は拒否する。
      const bad = progressAt(5, ROD_STEPS.NONE, { gear: { ...emptyGear(), seed: 1, items: [{ ...it, value: from.max + 1 }], equipped: {}, nextId: 2 } });
      assert.equal(readSaveData({ ...toSaveData(bad), version: 5 }).ok, false);
    }
  }
});

test("版 4 の形がおかしいデータ(スキルが入っている等)は拒否する", () => {
  const good = v4Data(sample(2));
  const g = good.progress.gear;
  const withGear = (over) => ({ ...good, progress: { ...good.progress, gear: { ...g, ...over } } });
  const withItem = (over) => withGear({ items: [{ ...g.items[0], ...over }, ...g.items.slice(1)], equipped: {} });
  for (const data of [withItem({ skills: ["power"] }), withItem({ skills: null }), withItem({ kind: "rod" }), withGear({ equipped: [] })]) {
    assert.equal(decodeSaveCode(codeWith(data, "FISH4")).error, "content");
    assert.deepEqual(parseSave(JSON.stringify(data)), initialProgress());
  }
});

test("壊れた・範囲外・表にない種類やレア度やスキル・重複スキル・ポイント範囲外・持ち物にない装着のコードは拒否し、何も変えない", () => {
  const p = sample(2);
  const good = toSaveData(p);
  const g = good.progress.gear;
  // スキルつきのエピック以上の装備を先頭に使う。
  const idx = p.gear.items.findIndex((it) => it.skills.length >= 2);
  assert.ok(idx >= 0);
  const item0 = g.items[idx];
  const others = g.items.filter((_, i) => i !== idx);
  const withGear = (over) => ({ ...good, progress: { ...good.progress, gear: { ...g, ...over } } });
  const withItem = (row) => withGear({ items: [row, ...others], equipped: [] });
  const set = (i, v) => item0.map((x, j) => (j === i ? v : x));
  const it = p.gear.items[idx];
  const pr = pointsRange(it.rarity, it.grade, DEFAULT_CONFIG.skills);
  const sk = item0[5];
  const normalRow = g.items.find((r) => RARITY_ROWS[r[2]].id === "normal");
  const bad = [
    set(1, 3), // 表にない種類
    set(1, -1),
    set(2, 4), // 表にないレア度
    set(3, 0),
    set(3, 6),
    set(3, 1.5),
    set(4, 0),
    set(4, 1e9),
    set(4, "3"),
    set(0, 0),
    set(0, others[0][0]), // 同じ番号
    set(5, null),
    set(5, [sk[0]]), // 組になっていない
    set(5, [SKILL_ROWS.length, pr.min]), // 表にないスキル
    set(5, [sk[0], sk[1], sk[0], sk[1]]), // 同じスキルが 2 つ
    set(5, [sk[0], pr.min - 1]), // ポイントが範囲外
    set(5, [sk[0], pr.max + 1]),
    set(5, [sk[0], 1.5]),
    set(5, [0, pr.min, 1, pr.min, 2, pr.min, 3, pr.min, 4, pr.min]), // レア度の数より多い
    item0.slice(0, 5), // 長さがちがう
    { ...item0 },
  ];
  const data = bad.map(withItem);
  if (normalRow) {
    // ノーマルはスキルなし。
    const n = normalRow.map((x, j) => (j === 5 ? [0, 2] : x));
    data.push(withGear({ items: g.items.map((r) => (r === normalRow ? n : r)), equipped: [] }));
  }
  // ルアーの値が、新しい範囲(命中範囲 +n%)の外。
  const lureRow = g.items.find((row) => EQUIP_KIND_ROWS[row[1]].id === "lure");
  assert.ok(lureRow);
  const lureIt = p.gear.items.find((it) => it.id === lureRow[0]);
  const lr = effectRange(EQUIP_KIND_ROWS[lureRow[1]], rarityById(lureIt.rarity, RARITY_ROWS), lureIt.grade, GACHA.gradeGrowth);
  for (const v of [lr.min - 1, lr.max + 1]) {
    data.push(withGear({ items: g.items.map((row) => (row === lureRow ? row.map((x, j) => (j === 4 ? v : x)) : row)), equipped: [] }));
  }
  data.push(
    withGear({ items: "x" }),
    withGear({ items: Array.from({ length: GACHA.inventoryMax + 1 }, (_, i) => set(0, i + 1)), nextId: 9999 }),
    withGear({ equipped: [[0, 99999]] }),
    withGear({ equipped: [[7, item0[0]]] }),
    withGear({ equipped: [[(item0[1] + 1) % 3, item0[0]]] }),
    withGear({ equipped: [[item0[1], item0[0]], [item0[1], item0[0]]] }),
    withGear({ equipped: { line: item0[0] } }),
    withGear({ equipped: [[item0[1]]] }),
    withGear({ draws: -1 }),
    withGear({ seed: -1 }),
    withGear({ seed: 2 ** 32 }),
    withGear({ seed: "1" }),
    withGear({ nextId: Math.max(...g.items.map((r) => r[0])) }),
    withGear({ nextId: 0 }),
    { ...good, progress: { ...good.progress, gear: null } },
    { ...good, progress: { ...good.progress, gear: undefined } },
  );
  for (const d of data) {
    const result = decodeSaveCode(codeWith(d));
    assert.equal(result.ok, false, String(JSON.stringify(d.progress.gear)).slice(0, 160));
    assert.equal(result.error, "content");
    assert.deepEqual(parseSave(JSON.stringify(d)), initialProgress());
  }
  // 途中で切れたコードも拒否する。
  const code = encodeSaveCode(p);
  for (const cut of [10, Math.floor(code.length / 2), code.length - 1]) assert.equal(decodeSaveCode(code.slice(0, cut)).ok, false);
});

test("FISH3 以前のコードも読める", () => {
  const v3 = { version: 3, progress: { coins: 1, scales: {}, rod: { stage: 1, step: "none" }, seen: [] } };
  assert.deepEqual(decodeSaveCode(codeWith(v3, "FISH3")), { ok: true, progress: progressAt(1, ROD_STEPS.NONE, { coins: 1 }) });
});

/** 持ち物 100 個がすべてレジェンド・スキル 3 つ・値もポイントも最大の、一番長くなる進み具合。 */
function longestProgress() {
  const legend = rarityById("legend", RARITY_ROWS);
  const grade = DEFAULT_CONTENT.maxStage;
  const pr = pointsRange("legend", grade, DEFAULT_CONFIG.skills);
  const items = Array.from({ length: GACHA.inventoryMax }, (_, i) => {
    const kind = EQUIP_KIND_ROWS[i % 3];
    return {
      id: 100000 + i,
      kind: kind.id,
      rarity: "legend",
      grade,
      value: effectRange(kind, legend, grade, GACHA.gradeGrowth).max,
      skills: [7, 8, 9].map((s) => ({ id: SKILL_ROWS[s].id, points: pr.max })),
    };
  });
  return progressAt(grade, ROD_STEPS.CRAFTED, {
    coins: Number.MAX_SAFE_INTEGER,
    gear: { items, equipped: { line: 100000, reel: 100001, lure: 100002 }, draws: 1e12, seed: 4294967295, nextId: 200000 },
  });
}

test("セーブコードの長さ:持ち物 100 個・全部スキル 3 つでも 1 万文字以内(上限 2 万文字)", () => {
  const full = longestProgress();
  const code = encodeSaveCode(full);
  assert.ok(code.length <= 10000, `${code.length} 文字`);
  assert.deepEqual(decodeSaveCode(code), { ok: true, progress: full });
  const sampled = sample(GACHA.inventoryMax / 10);
  assert.equal(sampled.gear.items.length, GACHA.inventoryMax);
  assert.ok(encodeSaveCode(sampled).length <= 10000);
});
