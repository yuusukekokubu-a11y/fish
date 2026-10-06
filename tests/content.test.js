// データ駆動のテスト(受け入れ条件 12・D-093・D-111)。
// コードを変えずに、設定表に 6 段階目と新しい魚(弱い・強い・ヌシ)を足しただけで、全部が動くか。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { checkContent } from "../src/core/fish.js";
import { craftCount, fishCoins } from "../src/core/formula.js";
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
import { decodeSaveCode, encodeSaveCode, parseSave } from "../src/core/savecode.js";
import { materialsView } from "../src/ui/screen_views.js";
import { hookJust, makeAimCenter, makePlayer, progressAt, stage6Content } from "./helpers.js";

const play = makePlayer({ update, tap, PHASES });
const aimCenter = makeAimCenter(currentMarker);
const SKILLED = { hook: hookJust, fight: aimCenter, resume: true };

// 足すのは、魚の表の行だけ(魚 3 種類。名前・区分・段階・見た目。段階と数値は式から作る:D-225)。
const CONTENT = stage6Content();

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
  assert.ok(ids.has("kasago") && ids.has("kanpachi"));
  assert.ok(!ids.has("nushi-kanpachi"), "ヌシは出ない");
  const rng5 = createRng(4);
  for (let i = 0; i < 3000; i++) assert.ok(drawCast(rng5, DEFAULT_CONFIG, 5, options).fish.stage <= 5);
});

test("段階 5 を進化すると段階 6 へ進み、段階 6 の製作 → ヌシ戦 → 進化まで動き、最後は進化済みで止まる", () => {
  const game = createGame(12, {
    content: CONTENT,
    progress: progressAt(5, ROD_STEPS.DEFEATED, { scales: { "nushi-buri": 1 } }),
  });
  assert.equal(evolveGameRod(game), true);
  assert.deepEqual([game.progress.rodStage, game.progress.rodStep], [6, ROD_STEPS.NONE]);
  // 段階 6 の強い魚の鱗を貯める。
  const need = craftCount(6);
  for (let i = 0; i < 80 && (game.progress.scales.kanpachi ?? 0) < need; i++) play(game, 120000, SKILLED);
  assert.ok(game.results.some((r) => r.fishId === "kasago"), "新しい弱い魚が釣れる");
  assert.ok(game.progress.scales.kanpachi >= need, "新しい強い魚の鱗");
  // 報酬は式から(ジャストなら × 1.5:D-258)。
  const kasago = game.results.find((r) => r.fishId === "kasago");
  assert.equal(kasago.reward.coins, Math.round(fishCoins("weak", 6) * (kasago.hook === "just" ? 1.5 : 1)), "報酬は式から");
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
  const p = progressAt(6, ROD_STEPS.CRAFTED, { scales: { kanpachi: 1 } });
  assert.deepEqual(parseSave(encodeSaveCode(p, CONTENT), CONTENT), p);
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
  assert.deepEqual(kanpachi.detail.at(-1), ["使い道", `カンパチの釣竿の製作に使う(${craftCount(6)} 枚)`]);
  assert.deepEqual(nushi.detail, [
    ["入手元", "ヌシ・カンパチ(段階 6 のヌシ)"],
    ["使い道", "ヌシ・カンパチの釣竿への進化に使う(1 枚)"],
  ]);
});
