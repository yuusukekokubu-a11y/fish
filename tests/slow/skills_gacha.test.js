// 重いテスト:ガチャのスキル(②-4b の条件 7、D-166・D-168・D-177)。
// 10 万回引いて、レア度ごとのスキルの数・重複なし・ポイントの範囲・スキルの出やすさの偏り・表示との一致を確かめる。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { makeContent } from "../../src/core/fish.js";
import { emptyGear, EQUIP_KIND_ROWS, makeCrates, pullCrate, RARITY_ROWS } from "../../src/core/gear.js";
import { pointsRange, SKILL_ROWS } from "../../src/core/skills.js";
import { crateCards } from "../../src/ui/gear_view.js";
import { createGame } from "../../src/core/fishing.js";
import { progressAt } from "../helpers.js";

const GACHA = DEFAULT_CONFIG.gacha;

test("10 万回引くと:スキルの数はレア度どおり、重複なし、ポイントは範囲の中、どのスキルも同じくらい出る", () => {
  const crates = makeCrates(makeContent(), DEFAULT_CONFIG);
  const skillCount = Object.fromEntries(RARITY_ROWS.map((r) => [r.id, r.skillCount]));
  const appear = Object.fromEntries(SKILL_ROWS.map((s) => [s.id, 0]));
  let slots = 0;
  let total = 0;
  const pointsSeen = {};
  for (const crate of crates) {
    const progress = progressAt(crate.stage, "none", { coins: Number.MAX_SAFE_INTEGER, gear: { ...emptyGear(), seed: 500 + crate.stage } });
    while (total < (crate.stage * 100000) / crates.length) {
      const r = pullCrate(progress, crate, 10, EQUIP_KIND_ROWS, GACHA);
      assert.equal(r.ok, true);
      for (const it of r.items) {
        assert.equal(it.skills.length, skillCount[it.rarity], it.rarity);
        assert.equal(new Set(it.skills.map((s) => s.id)).size, it.skills.length, "重複なし");
        const pr = pointsRange(it.rarity, it.grade, DEFAULT_CONFIG.skills);
        for (const s of it.skills) {
          assert.ok(s.points >= pr.min && s.points <= pr.max, `${it.rarity} ${it.grade} ${s.points}`);
          appear[s.id] += 1;
          slots += 1;
          const key = `${it.rarity}/${it.grade}`;
          pointsSeen[key] ??= new Set();
          pointsSeen[key].add(s.points);
        }
      }
      total += r.items.length;
      progress.gear.items = [];
    }
  }
  assert.ok(total >= 100000, `${total} 回`);
  const shares = SKILL_ROWS.map((s) => {
    const share = (appear[s.id] / slots) * 100;
    // 10 個から選ぶので 10%。±1 ポイント(付いたスキルは約 4 万個。標準偏差 約 0.15 ポイント)。
    assert.ok(Math.abs(share - 10) <= 1, `${s.name} ${share.toFixed(2)}%`);
    return `${s.name} ${share.toFixed(1)}%`;
  });
  // ポイントは範囲の端まで出る。
  for (const [key, set] of Object.entries(pointsSeen)) {
    const [rarity, grade] = key.split("/");
    const pr = pointsRange(rarity, Number(grade), DEFAULT_CONFIG.skills);
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
