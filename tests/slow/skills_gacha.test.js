// 重いテスト:ガチャのスキル(②-4b の条件 7・②-4b2 の条件 8・②-4b3 の条件 3・4・8、D-177・D-195・D-198)。
// 10 万回引いて、レア度ごとのスキルの数・重複なし・ポイントの範囲・スキルの出やすさの偏り・表示との一致を確かめる。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { makeContent } from "../../src/core/fish.js";
import { effectRange, emptyGear, EQUIP_KIND_ROWS, makeCrates, pullCrate, RARITY_ROWS } from "../../src/core/gear.js";
import { levelRange, SKILL_ROWS } from "../../src/core/skills.js";
import { crateCards } from "../../src/ui/gear_view.js";
import { createGame } from "../../src/core/fishing.js";
import { progressAt } from "../helpers.js";

const GACHA = DEFAULT_CONFIG.gacha;

test("10 万回引くと:スキルの数はレア度どおり、重複なし、レベルは範囲の中、18 個がほぼ均等(各 5.6% ± 0.4)", () => {
  const crates = makeCrates(makeContent(), DEFAULT_CONFIG);
  const skillCount = Object.fromEntries(RARITY_ROWS.map((r) => [r.id, r.skillCount]));
  const appear = Object.fromEntries(SKILL_ROWS.map((s) => [s.id, 0]));
  let slots = 0;
  let total = 0;
  const levelsSeen = {};
  for (const crate of crates) {
    const progress = progressAt(crate.stage, "none", { coins: Number.MAX_SAFE_INTEGER, gear: { ...emptyGear(), seed: 500 + crate.stage } });
    while (total < (crate.stage * 100000) / crates.length) {
      const r = pullCrate(progress, crate, 10, EQUIP_KIND_ROWS, GACHA);
      assert.equal(r.ok, true);
      for (const it of r.items) {
        assert.equal(it.skills.length, skillCount[it.rarity], it.rarity);
        // 基本効果(ルアーの命中範囲の割合を含む)は、範囲の中。
        const er = effectRange(EQUIP_KIND_ROWS.find((k) => k.id === it.kind), RARITY_ROWS.find((x) => x.id === it.rarity), it.grade, GACHA.gradeGrowth);
        assert.ok(it.value >= er.min && it.value <= er.max, `${it.kind} ${it.value}`);
        assert.equal(new Set(it.skills.map((s) => s.id)).size, it.skills.length, "重複なし");
        const pr = levelRange(it.rarity, it.grade, DEFAULT_CONFIG.skills);
        for (const s of it.skills) {
          assert.ok(s.level >= pr.min && s.level <= pr.max, `${it.rarity} ${it.grade} ${s.level}`);
          appear[s.id] += 1;
          slots += 1;
          const key = `${it.rarity}/${it.grade}`;
          levelsSeen[key] ??= new Set();
          levelsSeen[key].add(s.level);
        }
      }
      total += r.items.length;
      progress.gear.items = [];
    }
  }
  assert.ok(total >= 100000, `${total} 回`);
  const shares = SKILL_ROWS.map((s) => {
    const share = (appear[s.id] / slots) * 100;
    // 18 個から選ぶので約 5.6%。±0.4 ポイント(付いたスキルは約 4 万個。標準偏差 約 0.11 ポイント)。
    assert.ok(Math.abs(share - 100 / SKILL_ROWS.length) <= 0.4, `${s.name} ${share.toFixed(2)}%`);
    return `${s.name} ${share.toFixed(1)}%`;
  });
  // レベルは範囲の端まで出る。
  for (const [key, set] of Object.entries(levelsSeen)) {
    const [rarity, grade] = key.split("/");
    const pr = levelRange(rarity, Number(grade), DEFAULT_CONFIG.skills);
    assert.ok(set.has(pr.min) && set.has(pr.max), `${key} ${[...set]}`);
  }
  console.log(`${total} 回・スキル ${slots} 個:${shares.join("、")}`);
});

test("クレートの画面に出すスキルの数は、実際に付く数と同じ", () => {
  const game = createGame(1, { progress: progressAt(5, "none") });
  const crates = makeCrates(game.content, game.config);
  for (const card of crateCards(game, crates)) {
    for (const r of card.rates) assert.equal(r.skills, RARITY_ROWS.find((x) => x.id === r.id).skillCount);
  }
});

test("再現性:同じ種と引いた回数なら、同じ結果(スキル 18 個の抽選でも)", () => {
  const crates = makeCrates(makeContent(), DEFAULT_CONFIG);
  const run = () => {
    const progress = progressAt(5, "none", { coins: Number.MAX_SAFE_INTEGER, gear: { ...emptyGear(), seed: 77 } });
    for (let i = 0; i < 50; i++) pullCrate(progress, crates[4], 10, EQUIP_KIND_ROWS, GACHA);
    return progress.gear.items;
  };
  assert.deepEqual(run(), run());
});
