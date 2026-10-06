// 重いテスト:クレートガチャの排出率と、クレート 1 回分が貯まる時間(②-4a の受け入れ条件 3・6、戦闘の調整の条件 8:D-147・D-253・D-259)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { makeContent } from "../../src/core/fish.js";
import { createGame, update } from "../../src/core/fishing.js";
import { emptyGear, EQUIP_KIND_ROWS, makeCrates, pullCrate } from "../../src/core/gear.js";
import { progressAt, stage6Content } from "../helpers.js";
import { averageItems, progressWith } from "./builds.js";
import { policyOf, SKILLED, SLOPPY } from "./policy.js";

const GACHA = DEFAULT_CONFIG.gacha;

test("排出率:各クレートで 1 万回(1 回引きと 10 連をまぜる)引くと、レア度の割合が表示の排出率 ±2 ポイントに収まる", () => {
  // 回数は 2000 回以上(依頼の条件)。2000 回だと、ノーマル 70% のばらつき(標準偏差)が約 1 ポイントで、
  // ±2 ポイントを偶然はみ出すことがあるので、1 万回(標準偏差 約 0.46 ポイント)にした。
  const crates = makeCrates(makeContent(), DEFAULT_CONFIG);
  const lines = [];
  for (const crate of crates) {
    const progress = progressAt(crate.stage, "none", { coins: Number.MAX_SAFE_INTEGER, gear: { ...emptyGear(), seed: 1000 + crate.stage } });
    const counts = Object.fromEntries(crate.rarities.map((r) => [r.id, 0]));
    let total = 0;
    while (total < 10000) {
      const n = total % 3 === 0 ? 1 : 10; // 1 回引きと 10 連をまぜる
      const r = pullCrate(progress, crate, n, EQUIP_KIND_ROWS, GACHA);
      assert.equal(r.ok, true);
      for (const it of r.items) counts[it.rarity] += 1;
      total += n;
      progress.gear.items = []; // 持ち物の上限に当たらないように、数えたら片づける
    }
    const shares = crate.rarities.map((r) => {
      const share = (counts[r.id] / total) * 100;
      assert.ok(Math.abs(share - r.rate / 10) <= 2, `${crate.name} ${r.name}:${share.toFixed(2)}% / 表示 ${r.rate / 10}%`);
      return `${r.name} ${share.toFixed(1)}%`;
    });
    lines.push(`${crate.name}(${total} 回):${shares.join("、")}`);
  }
  console.log(lines.join("\n"));
});

/** 段階 stage で、ウロコイン 0 から price が貯まるまでの時間(秒)。平均的な装備で、上手・ときどき失敗の遊び方で。 */
function secondsToEarn(content, stage, price, style, seed) {
  const g = createGame(seed, { content, progress: progressWith(stage, averageItems(content, stage)) });
  const policy = policyOf(style, seed);
  for (let t = 16; t <= 1800000; t += 16) {
    update(g, 16);
    policy(g);
    if (g.progress.coins >= price) return t / 1000;
  }
  return Infinity;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function measure(content) {
  const crates = makeCrates(content, DEFAULT_CONFIG);
  return crates.map((crate) => {
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    const skilled = median(seeds.map((s) => secondsToEarn(content, crate.stage, crate.price, SKILLED, s)));
    const sloppy = median(seeds.map((s) => secondsToEarn(content, crate.stage, crate.price, SLOPPY, s)));
    return { crate, skilled, sloppy };
  });
}

test("価格と時間:各段階で、上手なら 30〜90 秒、ときどき失敗でも 120 秒以内に 1 回分が貯まる(平均的な装備、シード 12 個の真ん中の値)", () => {
  const rows = measure(makeContent());
  console.log(rows.map((r) => `${r.crate.name} ${r.crate.price}:上手 ${r.skilled.toFixed(0)} 秒、ときどき失敗 ${r.sloppy.toFixed(0)} 秒`).join("\n"));
  for (const r of rows) {
    assert.ok(r.skilled >= 30 && r.skilled <= 90, `${r.crate.name}:上手 ${r.skilled} 秒`);
    assert.ok(r.sloppy <= 120, `${r.crate.name}:ときどき失敗 ${r.sloppy} 秒`);
  }
});

test("段階 6 を表に足しても、数式のままで 30〜90 秒(ときどき失敗 120 秒以内)に収まる", () => {
  const content = stage6Content();
  const six = measure(content).at(-1);
  console.log(`段階 6:${six.crate.name} ${six.crate.price}:上手 ${six.skilled.toFixed(0)} 秒、ときどき失敗 ${six.sloppy.toFixed(0)} 秒`);
  assert.ok(six.skilled >= 30 && six.skilled <= 90);
  assert.ok(six.sloppy <= 120);
});
