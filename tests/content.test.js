// データ駆動のテスト(D-093・D-111・D-272。②-4d の受け入れ条件 11)。
// コードを変えずに、釣り場の表に 1 行(川)と、魚の表に 15 行を足しただけで、解放・切り替え・プール・保存・素材が動くか。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { currentArea } from "../src/core/areas.js";
import { checkContent } from "../src/core/fish.js";
import { craftCount, fishCoins } from "../src/core/formula.js";
import {
  challengeBoss,
  craftGameRod,
  createGame,
  currentMarker,
  drawCast,
  evolveGameRod,
  moveArea,
  OUTCOMES,
  PHASES,
  tap,
  update,
} from "../src/core/fishing.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { createRng } from "../src/core/rng.js";
import { decodeSaveCode, encodeSaveCode, parseSave } from "../src/core/savecode.js";
import { materialsView } from "../src/ui/screen_views.js";
import { hookJust, makeAimCenter, makePlayer, progressAt, riverContent } from "./helpers.js";

const play = makePlayer({ update, tap, PHASES });
const aimCenter = makeAimCenter(currentMarker);
const SKILLED = { hook: hookJust, fight: aimCenter, resume: true };

// 足すのは、釣り場の表 1 行と魚の表 15 行だけ(名前・区分・段階・見た目。数値は式から作る:D-225)。
const CONTENT = riverContent();

test("足した表の形に問題がなく、段階の数と釣り場は表の行で決まる", () => {
  assert.deepEqual(checkContent(CONTENT), []);
  assert.equal(CONTENT.maxStage, 15);
  assert.deepEqual(CONTENT.areas.map((a) => [a.id, a.name, a.firstStage]), [["minato", "港", 1], ["iso", "磯", 6], ["kawa", "川", 11]]);
});

test("川の魚は、川にいるときだけ出る。魚の抽選の乱数の引く数と順番は変わらない", () => {
  const rngA = createRng(3);
  const rngB = createRng(3);
  const ids = new Set();
  for (let i = 0; i < 4000; i++) {
    const a = drawCast(rngA, DEFAULT_CONFIG, 5); // 元の表の港
    const b = drawCast(rngB, DEFAULT_CONFIG, 13, { fish: CONTENT.fish, range: { min: 11, max: 13 } }); // 川の段階 3
    // 待ち時間と区分は同じ乱数から決まるので、表を足しても並びが同じ(引く数が同じ)。
    assert.equal(a.waitMs, b.waitMs);
    assert.equal(a.kind, b.kind);
    assert.equal(a.minigameSeed, b.minigameSeed);
    assert.ok(b.fish.stage >= 11 && b.fish.stage <= 13, b.fish.id);
    ids.add(b.fish.id);
  }
  assert.deepEqual([...ids].sort(), ["ayu", "funa", "namazu", "oikawa", "ugui", "yamame"]);
});

test("磯の 5 段階目を進化すると川が解放されて移り、川の製作 → ヌシ戦 → 進化まで動く。港と磯に戻れる", () => {
  const game = createGame(12, { content: CONTENT, progress: progressAt(10, ROD_STEPS.DEFEATED, { scales: { "nushi-kue": 1 } }) });
  assert.equal(evolveGameRod(game), true);
  assert.deepEqual([game.progress.rodStage, game.progress.rodStep, game.areaUnlocked.id], [11, ROD_STEPS.NONE, "kawa"]);
  assert.equal(currentArea(game.progress, CONTENT).id, "kawa");
  // 川の段階 1 の強い魚(ヤマメ)の鱗を貯める。
  const need = craftCount(11);
  for (let i = 0; i < 80 && (game.progress.scales.yamame ?? 0) < need; i++) play(game, 120000, SKILLED);
  assert.ok(game.results.some((r) => r.fishId === "oikawa"), "川の弱い魚が釣れる");
  assert.ok(game.results.every((r) => ["oikawa", "yamame"].includes(r.fishId)), "川の段階 1 の魚だけ(投げていた投も川の魚に決め直す)");
  const oikawa = game.results.find((r) => r.fishId === "oikawa");
  assert.equal(oikawa.reward.coins, Math.round(fishCoins("weak", 11) * (oikawa.hook === "just" ? 1.5 : 1)), "報酬は式から");
  assert.equal(craftGameRod(game), true);
  while (![PHASES.CASTING, PHASES.WAITING].includes(game.phase)) update(game, 16);
  assert.equal(challengeBoss(game), true);
  assert.equal(game.cast.fish.id, "nushi-yamame");
  play(game, 60000, SKILLED);
  assert.equal(game.results.find((r) => r.fishId === "nushi-yamame").outcome, OUTCOMES.CAUGHT);
  assert.equal(evolveGameRod(game), true);
  assert.deepEqual([game.progress.rodStage, game.progress.rodStep], [12, ROD_STEPS.NONE]);
  // 港に戻ると港の魚だけ。製作とヌシ戦はできない。
  assert.equal(moveArea(game, "minato"), true);
  const n = game.results.length;
  play(game, 120000, SKILLED);
  assert.ok(game.results.slice(n + 1).every((r) => CONTENT.byId.get(r.fishId).stage <= 5));
  assert.equal(moveArea(game, "kawa"), true);
  assert.equal("area" in game.progress, false, "いちばん新しい釣り場では欄を持たない");
});

test("川の進み具合も、保存とセーブコードで往復でき、元の表では範囲外として拒否される", () => {
  const p = progressAt(13, ROD_STEPS.CRAFTED, { scales: { ayu: 1 }, area: "iso" });
  assert.deepEqual(parseSave(encodeSaveCode(p, CONTENT), CONTENT), p);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p, CONTENT), CONTENT), { ok: true, progress: p });
  assert.equal(decodeSaveCode(encodeSaveCode(p, CONTENT)).ok, false, "元の表には段階 13 がない");
});

test("素材の画面:釣り場を足すだけで、川のグループが出る(未入手は「?」、入手すると名前と使い道)", () => {
  const game = createGame(1, { content: CONTENT, progress: progressAt(11, ROD_STEPS.NONE) });
  const view = materialsView({ game });
  assert.equal(view.sections.at(-1).title, "川");
  assert.ok(view.sections.at(-1).rows.every((r) => r.label === "?"));
  game.progress.scales.yamame = 1;
  const yamame = materialsView({ game }).sections.at(-1).rows[0];
  assert.deepEqual([yamame.label, yamame.value], ["ヤマメの鱗", "1"]);
  assert.deepEqual(yamame.detail.at(-1), ["使い道", `ヤマメの釣竿の製作に使う(${craftCount(11)} 枚)`]);
});
