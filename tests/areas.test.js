// 釣り場のテスト(②-4d の条件 1〜5・9:D-272〜D-276・D-279)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { AREA_ROWS, areaPosition, currentArea, inNewestArea, isAreaLastStage, poolRange, setArea, unlockedAreas } from "../src/core/areas.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { checkContent, DEFAULT_CONTENT, FISH_KINDS } from "../src/core/fish.js";
import {
  canChallengeBoss,
  canCraftRod,
  canEvolveRod,
  challengeBoss,
  createGame,
  drawCast,
  evolveGameRod,
  moveArea,
  PHASES,
  tap,
  update,
} from "../src/core/fishing.js";
import { stagePosition } from "../src/core/formula.js";
import { drawItem, makeCrates } from "../src/core/gear.js";
import { createRng } from "../src/core/rng.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { SKILL_ROWS } from "../src/core/skills.js";
import { syntheticContent } from "../src/core/synthetic.js";
import { progressAt } from "./helpers.js";

const C = DEFAULT_CONTENT;

test("釣り場の表:港(g=1〜5)と磯(g=6〜10)。表の点検に問題がなく、位置と最後の段階は表から決まる", () => {
  assert.deepEqual(AREA_ROWS.map((a) => [a.id, a.name, a.firstStage, a.stages]), [["minato", "港", 1, 5], ["iso", "磯", 6, 5]]);
  assert.deepEqual(checkContent(C), []);
  assert.deepEqual(C.areas.map((a) => a.id), ["minato", "iso"]);
  assert.deepEqual([1, 5, 6, 10].map((g) => areaPosition(C, g)), [1, 5, 1, 5]);
  assert.deepEqual([4, 5, 6, 10].map((g) => isAreaLastStage(C, g)), [false, true, false, true]);
  // ヌシ戦の長さと防御の位置 s は、釣り場の中の位置(D-276)。限界の表(g=100・20 の釣り場)でも同じ。
  const big = syntheticContent(100);
  assert.equal(big.areas.length, 20);
  for (let g = 1; g <= 100; g++) assert.equal(stagePosition(g), areaPosition(big, g), `g=${g}`);
});

test("解放済みの釣り場と、いまいる釣り場:古い釣り場にいるときだけ欄を持つ", () => {
  const p = progressAt(7);
  assert.deepEqual(unlockedAreas(p, C).map((a) => a.id), ["minato", "iso"]);
  assert.equal(currentArea(p, C).id, "iso");
  assert.equal(setArea(p, "minato", C), true);
  assert.deepEqual([p.area, currentArea(p, C).id, inNewestArea(p, C)], ["minato", "minato", false]);
  assert.equal(setArea(p, "iso", C), true);
  assert.equal("area" in p, false);
  assert.equal(setArea(progressAt(5), "iso", C), false, "未解放には移れない");
  assert.equal(setArea(p, "kawa", C), false, "表にない釣り場");
});

test("魚のプール:いる釣り場の魚だけ。新しい釣り場は解放済みの段階まで、古い釣り場は全段階(D-275)", () => {
  const draw = (progress, n, seed = 3) => {
    const rng = createRng(seed);
    const range = poolRange(progress, C);
    return Array.from({ length: n }, () => drawCast(rng, DEFAULT_CONFIG, progress.rodStage, { fish: C.fish, range }));
  };
  const stages = (casts) => new Set(casts.map((c) => c.fish.stage));
  // 磯の段階 2(g=7)にいる:磯の段階 1〜2 だけ。
  assert.deepEqual([...stages(draw(progressAt(7), 3000))].sort(), [6, 7]);
  // 磯まで進んで港にいる:港の全段階。
  assert.deepEqual([...stages(draw(progressAt(7, ROD_STEPS.NONE, { area: "minato" }), 3000))].sort(), [1, 2, 3, 4, 5]);
  // 港の段階 3 にいる(磯は未解放):港の段階 1〜3。
  assert.deepEqual([...stages(draw(progressAt(3), 3000))].sort(), [1, 2, 3]);
  // ヌシは出ない。強い魚 10%±2 ポイント、待ち時間の平均 3〜6 秒(全ての釣り場と位置)。
  for (const p of [progressAt(1), progressAt(5), progressAt(6), progressAt(10), progressAt(10, ROD_STEPS.NONE, { area: "minato" })]) {
    for (const seed of [1, 2, 3]) {
      const casts = draw(p, 2000, seed);
      assert.ok(casts.every((c) => c.kind !== FISH_KINDS.BOSS));
      const strong = casts.filter((c) => c.kind === FISH_KINDS.STRONG).length / 2000;
      const wait = casts.reduce((s, c) => s + c.waitMs, 0) / 2000;
      assert.ok(Math.abs(strong - 0.1) <= 0.02 && wait >= 3000 && wait <= 6000, `${p.rodStage} ${p.area ?? ""}:${strong} ${wait}`);
    }
  }
});

test("乱数:釣り場を移っても、魚の乱数の引く数と順番は変わらない(待ち時間・区分・ミニゲームの種が同じ)", () => {
  const plain = createGame(5, { progress: progressAt(8) });
  const moved = createGame(5, { progress: progressAt(8) });
  const rows = (g) => [g.cast.waitMs, g.cast.kind, g.cast.minigameSeed];
  for (let i = 0; i < 40; i++) {
    // 投げている間に、港と磯を行き来する。
    if (i % 3 === 0) assert.equal(moveArea(moved, i % 2 === 0 ? "minato" : "iso"), true);
    assert.deepEqual(rows(moved), rows(plain), `${i} 投目`);
    if (moved.progress.area === "minato") assert.ok(moved.cast.fish.stage <= 5);
    else assert.ok(moved.cast.fish.stage >= 6 && moved.cast.fish.stage <= 8);
    for (const g of [plain, moved]) {
      const n = g.results.length;
      while (g.results.length === n) {
        update(g, 100);
        if (g.phase === PHASES.RESTING) tap(g);
      }
      while (g.phase !== PHASES.CASTING) g.phase === PHASES.RESTING ? tap(g) : update(g, 100);
    }
  }
});

test("製作・ヌシ戦・進化・餌は、いちばん新しい釣り場でだけ(古い釣り場では押せない)(D-274)", () => {
  const craft = createGame(1, { progress: progressAt(6, ROD_STEPS.NONE, { scales: { mejina: 9 } }) });
  assert.equal(canCraftRod(craft), true);
  moveArea(craft, "minato");
  assert.equal(canCraftRod(craft), false);
  const boss = createGame(1, { progress: progressAt(6, ROD_STEPS.CRAFTED, { area: "minato" }) });
  assert.equal(canChallengeBoss(boss), false);
  assert.equal(challengeBoss(boss), false);
  moveArea(boss, "iso");
  assert.equal(canChallengeBoss(boss), true);
  const evolve = createGame(1, { progress: progressAt(6, ROD_STEPS.DEFEATED, { scales: { "nushi-mejina": 1 }, area: "minato" }) });
  assert.equal(canEvolveRod(evolve), false);
  assert.equal(evolveGameRod(evolve), false);
  // 餌:古い釣り場では使わない(数も減らない)。
  const bait = createGame(1, { progress: progressAt(7, ROD_STEPS.NONE, { bait: 3, useBait: true, area: "minato" }) });
  update(bait, bait.config.castMs);
  assert.deepEqual([bait.cast.bait, bait.progress.bait, bait.cast.fish.stage <= 5], [undefined, 3, true]);
});

test("解放:港の 5 段階目の進化で磯が解放され、自動で移る(投げている投も磯の魚に)。磯の 5 段階目のあとは止まる", () => {
  const game = createGame(2, { progress: progressAt(5, ROD_STEPS.DEFEATED, { scales: { "nushi-buri": 1 } }) });
  assert.equal(evolveGameRod(game), true);
  assert.deepEqual([game.progress.rodStage, game.areaUnlocked?.id, currentArea(game.progress, C).id], [6, "iso", "iso"]);
  assert.equal(game.cast.fish.stage, 6, "投げている投も、磯の魚に決め直す");
  const last = createGame(2, { progress: progressAt(10, ROD_STEPS.DEFEATED, { scales: { "nushi-kue": 1 } }) });
  assert.equal(evolveGameRod(last), true);
  assert.deepEqual([last.progress.rodStage, last.progress.rodStep, last.areaUnlocked], [10, ROD_STEPS.EVOLVED, null]);
  // 段階の途中の進化は、釣り場を変えない。
  const mid = createGame(2, { progress: progressAt(6, ROD_STEPS.DEFEATED, { scales: { "nushi-mejina": 1 } }) });
  evolveGameRod(mid);
  assert.deepEqual([mid.progress.rodStage, mid.areaUnlocked], [7, null]);
});

test("頭打ち型:ガチャで引くとレベルは 1。乱数を引く数は同じで、ほかのスキルとあとの抽選の結果は変わらない(D-279)", () => {
  const crate = makeCrates(C, DEFAULT_CONFIG)[9];
  const asGrowth = SKILL_ROWS.map((s) => ({ ...s, type: "growth" }));
  const draw = (skills) => Array.from({ length: 400 }, (_, i) => drawItem(11, i, crate, C.equipKinds, DEFAULT_CONFIG.gacha.gradeGrowth, { skills, config: DEFAULT_CONFIG.skills }));
  const now = draw(SKILL_ROWS);
  const before = draw(asGrowth);
  let capped = 0;
  now.forEach((it, i) => {
    const old = before[i];
    assert.deepEqual([it.kind, it.rarity, it.value, it.skills.map((s) => s.id)], [old.kind, old.rarity, old.value, old.skills.map((s) => s.id)]);
    it.skills.forEach((s, j) => {
      if (SKILL_ROWS.find((x) => x.id === s.id).type === "capped") {
        assert.equal(s.level, 1);
        capped += 1;
      } else assert.equal(s.level, old.skills[j].level);
    });
  });
  assert.ok(capped > 20, "頭打ち型が何度も出ている");
  assert.ok(before.some((it) => it.skills.some((s) => SKILL_ROWS.find((x) => x.id === s.id).type === "capped" && s.level > 1)), "前は 2 以上もあった");
});
