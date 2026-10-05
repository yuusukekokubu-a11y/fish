// データ駆動のテスト(受け入れ条件 12・D-093・D-111)。
// コードを変えずに、設定表に 6 段階目と新しい魚(弱い・強い・ヌシ)を足しただけで、全部が動くか。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { checkContent, defineFish, defineStage, FISH_ROWS, makeContent, STAGE_ROWS } from "../src/core/fish.js";
import {
  challengeBoss,
  craftGameRod,
  createGame,
  currentMarker,
  drawCast,
  evolveGameRod,
  OUTCOMES,
  PHASES,
  tap,
  update,
} from "../src/core/fishing.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { createRng } from "../src/core/rng.js";
import { parseSave, toSaveData } from "../src/core/save.js";
import { decodeSaveCode, encodeSaveCode } from "../src/core/savecode.js";
import { materialsView } from "../src/ui/menu_tabs.js";
import { hookJust, makeAimCenter, makePlayer, progressAt } from "./helpers.js";

const play = makePlayer({ update, tap, PHASES });
const aimCenter = makeAimCenter(currentMarker);
const SKILLED = { hook: hookJust, fight: aimCenter, resume: true };

// 足すのは、表の行だけ(魚 3 種類と段階 1 つ)。項目名つきの行(D-136)。
const EXTRA_FISH_ROWS = [
  { id: "kisu", name: "キス", kind: "weak", stage: 6, coins: 120, scales: 0, color: "#fefae0", size: 26 },
  {
    id: "kanpachi", name: "カンパチ", kind: "strong", stage: 6, coins: 600, scales: 1, color: "#bc6c25", size: 46,
    minigame: { sweepMs: 480, zoneWidth: 0.1, hp: 70, timeLimitMs: 13000 },
  },
  {
    id: "nushi-kanpachi", name: "ヌシ・カンパチ", kind: "boss", stage: 6, coins: 6000, scales: 1, color: "#7f4f24", size: 62,
    minigame: { sweepMs: 460, zoneWidth: 0.1, hp: 245, timeLimitMs: 55000 },
  },
];
const EXTRA_STAGE_ROW = { stage: 6, craft: { scale: "kanpachi", count: 2 }, boss: "nushi-kanpachi", evolve: { count: 1 } };
const CONTENT = makeContent(
  [...FISH_ROWS, ...EXTRA_FISH_ROWS].map(defineFish),
  [...STAGE_ROWS, EXTRA_STAGE_ROW].map(defineStage),
);

test("足した表の形に問題がなく、段階の数は表の行の数で決まる", () => {
  assert.deepEqual(checkContent(CONTENT), []);
  assert.equal(CONTENT.maxStage, 6);
});

test("段階 6 の魚は、段階 6 でだけ出る。魚の抽選の乱数の引く数と順番は変わらない", () => {
  const options = { fish: CONTENT.fish };
  const rngA = createRng(3);
  const rngB = createRng(3);
  const ids = new Set();
  for (let i = 0; i < 4000; i++) {
    const a = drawCast(rngA, DEFAULT_CONFIG, 5); // 元の表
    const b = drawCast(rngB, DEFAULT_CONFIG, 6, options); // 足した表
    // 待ち時間と区分は同じ乱数から決まるので、表を足しても並びが同じ(引く数が同じ)。
    assert.equal(a.waitMs, b.waitMs);
    assert.equal(a.kind, b.kind);
    assert.equal(a.minigameSeed, b.minigameSeed);
    ids.add(b.fish.id);
  }
  assert.ok(ids.has("kisu") && ids.has("kanpachi"));
  assert.ok(!ids.has("nushi-kanpachi"), "ヌシは出ない");
  const rng5 = createRng(4);
  for (let i = 0; i < 3000; i++) assert.ok(drawCast(rng5, DEFAULT_CONFIG, 5, options).fish.stage <= 5);
});

test("段階 5 を進化すると段階 6 へ進み、段階 6 の製作 → ヌシ戦 → 進化まで動き、最後は進化済みで止まる", () => {
  const game = createGame(12, {
    content: CONTENT,
    progress: progressAt(5, ROD_STEPS.DEFEATED, { scales: { "nushi-maguro": 1 } }),
  });
  assert.equal(evolveGameRod(game), true);
  assert.deepEqual([game.progress.rodStage, game.progress.rodStep], [6, ROD_STEPS.NONE]);
  // 段階 6 の強い魚の鱗を貯める。
  for (let i = 0; i < 40 && (game.progress.scales.kanpachi ?? 0) < 2; i++) play(game, 120000, SKILLED);
  assert.ok(game.results.some((r) => r.fishId === "kisu"), "新しい弱い魚が釣れる");
  assert.ok(game.progress.scales.kanpachi >= 2, "新しい強い魚の鱗");
  assert.equal(game.results.find((r) => r.fishId === "kisu").reward.coins, 120);
  assert.equal(craftGameRod(game), true);
  while (![PHASES.CASTING, PHASES.WAITING].includes(game.phase)) update(game, 16);
  assert.equal(challengeBoss(game), true);
  assert.equal(game.cast.fish.id, "nushi-kanpachi");
  play(game, 60000, SKILLED);
  assert.equal(game.results.find((r) => r.fishId === "nushi-kanpachi").outcome, OUTCOMES.CAUGHT);
  assert.equal(game.progress.rodStep, ROD_STEPS.DEFEATED);
  assert.equal(evolveGameRod(game), true);
  assert.deepEqual([game.progress.rodStage, game.progress.rodStep], [6, ROD_STEPS.EVOLVED]);
});

test("段階 6 の進み具合も、保存とセーブコードで往復でき、元の表では範囲外として拒否される", () => {
  const p = progressAt(6, ROD_STEPS.CRAFTED, { scales: { kanpachi: 1, "nushi-kanpachi": 0 } });
  assert.deepEqual(parseSave(JSON.stringify(toSaveData(p)), CONTENT), p);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p), CONTENT), { ok: true, progress: p });
  assert.equal(decodeSaveCode(encodeSaveCode(p)).ok, false, "元の表には段階 6 がない");
});

test("素材タブ:表に段階 6 の魚を足すだけで、一覧に自動で出る(未入手は「?」、入手すると名前と使い道)", () => {
  const game = createGame(1, { content: CONTENT, progress: progressAt(6, ROD_STEPS.NONE) });
  const view = materialsView({ game });
  assert.deepEqual(view.sections.map((s) => s.title).at(-1), "段階 6");
  assert.deepEqual(view.sections.at(-1).rows, [
    { label: "?", value: "", detail: null },
    { label: "?", value: "", detail: null },
  ]);
  game.progress.scales.kanpachi = 1;
  game.progress.seen.push("nushi-kanpachi");
  const [kanpachi, nushi] = materialsView({ game }).sections.at(-1).rows;
  assert.deepEqual([kanpachi.label, kanpachi.value], ["カンパチの鱗", "1"]);
  assert.deepEqual(kanpachi.detail.at(-1), ["使い道", "カンパチの釣竿の製作に使う(2 枚)"]);
  assert.deepEqual(nushi.detail, [
    ["入手元", "ヌシ・カンパチ(段階 6 のヌシ)"],
    ["使い道", "ヌシ・カンパチの釣竿への進化に使う(1 枚)"],
  ]);
});
