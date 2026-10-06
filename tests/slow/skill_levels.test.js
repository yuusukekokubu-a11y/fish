// 重いテスト:装備のレベルと、最大レベルへの届きやすさ(②-4b3 の条件 3、D-195・D-207)。
// 段階 n のクレートで引いた装備から、同じスキルを持つ装備を 3 個そろえたとき、
//  - 最大のレベルの装備 3 個なら、段階の最大(2 + n)に届く。
//  - 平均的な装備(引いた装備からでたらめに 3 個)では、届かない(目安:最大の 6〜7 割。段階 1〜3 は、最低 Lv1 のぶん高め)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { makeContent } from "../../src/core/fish.js";
import { emptyGear, EQUIP_KIND_ROWS, makeCrates, pullCrate } from "../../src/core/gear.js";
import { createRng } from "../../src/core/rng.js";
import { levelRange } from "../../src/core/skills.js";
import { progressAt } from "../helpers.js";

const SK = DEFAULT_CONFIG.skills;

test("段階ごとに:最大のレベルの装備 3 個で最大に届き、平均的な装備 3 個では最大の 6〜7 割前後", () => {
  const crates = makeCrates(makeContent(), DEFAULT_CONFIG);
  const lines = [];
  for (const crate of crates) {
    const stageMax = SK.growthMaxBase + SK.growthMaxPerStage * crate.stage;
    const progress = progressAt(crate.stage, "none", { coins: Number.MAX_SAFE_INTEGER, gear: { ...emptyGear(), seed: 900 + crate.stage } });
    /** @type {number[]} */
    const levels = [];
    for (let i = 0; i < 2000; i++) {
      pullCrate(progress, crate, 10, EQUIP_KIND_ROWS, DEFAULT_CONFIG.gacha);
      for (const it of progress.gear.items) for (const s of it.skills) levels.push(s.level);
      progress.gear.items = [];
    }
    const r = createRng(crate.stage);
    let reach = 0;
    let sum = 0;
    const trials = 20000;
    for (let t = 0; t < trials; t++) {
      const total = levels[Math.floor(r() * levels.length)] + levels[Math.floor(r() * levels.length)] + levels[Math.floor(r() * levels.length)];
      sum += Math.min(total, stageMax);
      if (total >= stageMax) reach += 1;
    }
    const best = 3 * levelRange("legend", crate.grade, SK).max;
    const avg = sum / trials / stageMax;
    const ranges = ["rare", "epic", "legend"].map((id) => {
      const lr = levelRange(id, crate.grade, SK);
      return `${id === "rare" ? "レア" : id === "epic" ? "エピック" : "レジェンド"} ${lr.min}〜${lr.max}`;
    });
    lines.push(
      `段階 ${crate.stage}(最大 Lv${stageMax}):${ranges.join("・")}、最良 3 個で Lv${best}、` +
        `平均的な 3 個で 最大の ${(avg * 100).toFixed(0)}%(届く割合 ${((reach / trials) * 100).toFixed(0)}%)`,
    );
    assert.ok(best >= stageMax, `段階 ${crate.stage}:最大のレベルの装備 3 個で届く`);
    if (crate.stage >= 3) {
      assert.ok(avg >= 0.5 && avg <= 0.8, `段階 ${crate.stage}:平均 ${avg}`);
      assert.ok(reach / trials < 0.35, `段階 ${crate.stage}:平均的な装備では、たいてい届かない`);
    }
  }
  console.log(lines.join("\n"));
});
