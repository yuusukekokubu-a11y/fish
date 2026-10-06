// 魚の設定表とミニゲームの限界のテスト(受け入れ条件 5)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import {
  availableFish,
  checkContent,
  DEFAULT_CONTENT,
  defineFish,
  effectiveMinigame,
  FISH_KINDS,
  FISH_LIST,
  FISH_ROWS,
  fishWeight,
  makeContent,
  pickWeighted,
  STAGE_LIST,
  stagesFromFish,
} from "../src/core/fish.js";
import { createGame, currentMarker, drawCast, PHASES, tap, update } from "../src/core/fishing.js";
import { createRng } from "../src/core/rng.js";
import { hookGood, progressAt } from "./helpers.js";

const LIMITS = DEFAULT_CONFIG.minigame;

test("各段階に、弱い魚・強い魚・ヌシが 1 種類ずつあり、設定表の点検に問題がない", () => {
  assert.deepEqual(checkContent(DEFAULT_CONTENT), []);
  for (const { stage } of STAGE_LIST) {
    const at = FISH_LIST.filter((f) => f.stage === stage);
    assert.deepEqual(at.map((f) => f.kind).sort(), [FISH_KINDS.BOSS, FISH_KINDS.STRONG, FISH_KINDS.WEAK]);
  }
  assert.equal(DEFAULT_CONTENT.maxStage, STAGE_LIST.length);
});

test("港の魚の名前(D-224)。マグロとカツオはいない", () => {
  const names = (kind) => FISH_LIST.filter((f) => f.kind === kind).map((f) => f.name);
  assert.deepEqual(names(FISH_KINDS.WEAK), ["アジ", "イワシ", "サバ", "キス", "カワハギ"]);
  assert.deepEqual(names(FISH_KINDS.STRONG), ["クロダイ", "スズキ", "ヒラメ", "ワラサ", "ブリ"]);
  assert.deepEqual(names(FISH_KINDS.BOSS), ["ヌシ・クロダイ", "ヌシ・スズキ", "ヌシ・ヒラメ", "ヌシ・ワラサ", "ヌシ・ブリ"]);
  assert.ok(!FISH_LIST.some((f) => /マグロ|カツオ/.test(f.name) || /maguro|katsuo/.test(f.id)));
  assert.deepEqual(FISH_LIST.map((f) => f.stage), [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 5]);
});

test("id は重ならず、強い魚とヌシだけがミニゲームの重さを持ち、弱い魚は鱗を落とさない", () => {
  assert.equal(new Set(FISH_LIST.map((f) => f.id)).size, FISH_LIST.length);
  for (const f of FISH_LIST) {
    assert.equal(f.minigame !== null, f.kind !== FISH_KINDS.WEAK, f.name);
    assert.equal(f.reward.scales > 0, f.kind !== FISH_KINDS.WEAK, f.name);
  }
});

test("ヌシの体力は同じ段階の強い魚の 3〜4 倍で、制限時間は長く、印と幅は同じか厳しい(限界の中)", () => {
  for (const { stage, craft, boss } of STAGE_LIST) {
    const s = FISH_LIST.find((f) => f.id === craft.scale).minigame;
    const b = FISH_LIST.find((f) => f.id === boss).minigame;
    assert.ok(b.hp >= 3 * s.hp && b.hp <= 4 * s.hp, `段階 ${stage}`);
    assert.ok(b.timeLimitMs > s.timeLimitMs);
    assert.ok(b.sweepMs <= s.sweepMs && b.zoneWidth <= s.zoneWidth);
    assert.deepEqual(effectiveMinigame({ minigame: b }, LIMITS), { ...b }, "限界で直されない");
  }
});

test("段階 1 の魚のミニゲームの手触りは前のまま", () => {
  const [normal, strong] = [availableFish(1, FISH_KINDS.WEAK), availableFish(1, FISH_KINDS.STRONG)];
  assert.equal(normal.length, 1);
  assert.equal(strong.length, 1);
  // 印の速さと当たり範囲の幅は Issue #4 のまま。体力と制限時間は体力制で足した(D-063)。
  assert.equal(strong[0].minigame.sweepMs, 900);
  assert.equal(strong[0].minigame.zoneWidth, 0.22);
  assert.equal(strong[0].color, "#f4a261");
  assert.equal(normal[0].color, "#a8dadc");
});

test("段階が上の強い魚ほど、印が速く、当たり範囲が狭い", () => {
  const strong = availableFish(5, FISH_KINDS.STRONG);
  for (let i = 1; i < strong.length; i++) {
    assert.ok(strong[i].minigame.sweepMs < strong[i - 1].minigame.sweepMs, strong[i].name);
    assert.ok(strong[i].minigame.zoneWidth < strong[i - 1].minigame.zoneWidth, strong[i].name);
  }
});

test("全部の強い魚が、限界(幅 10% 以上・端から端 0.45 秒以上)の中にある", () => {
  for (const f of availableFish(5, FISH_KINDS.STRONG)) {
    const m = effectiveMinigame(f, LIMITS);
    assert.deepEqual(m, { ...f.minigame }, `${f.name} は限界で直されずにそのまま使われる`);
    assert.ok(m.zoneWidth >= LIMITS.minZoneWidth && m.sweepMs >= LIMITS.minSweepMs);
  }
});

test("限界の境界:ちょうどの値はそのまま、こえた値は限界に直す", () => {
  const make = (sweepMs, zoneWidth) => ({ minigame: { sweepMs, zoneWidth, hp: 3, timeLimitMs: 9000 } });
  const pick = (m) => ({ sweepMs: m.sweepMs, zoneWidth: m.zoneWidth });
  assert.deepEqual(pick(effectiveMinigame(make(450, 0.1), LIMITS)), { sweepMs: 450, zoneWidth: 0.1 });
  assert.deepEqual(pick(effectiveMinigame(make(449, 0.0999), LIMITS)), { sweepMs: 450, zoneWidth: 0.1 });
  assert.deepEqual(pick(effectiveMinigame(make(100, 0), LIMITS)), { sweepMs: 450, zoneWidth: 0.1 });
  assert.deepEqual(pick(effectiveMinigame(make(451, 0.1001), LIMITS)), { sweepMs: 451, zoneWidth: 0.1001 });
  assert.equal(effectiveMinigame(make(100, 0), LIMITS).hp, 3, "体力と制限時間はそのまま");
  assert.equal(effectiveMinigame({ minigame: null }, LIMITS), null);
});

test("強い魚ごとの設定が、当たり範囲の幅と印の動きに反映される", () => {
  const rng = createRng(31);
  for (let i = 0; i < 3000; i++) {
    const cast = drawCast(rng, DEFAULT_CONFIG, 5);
    if (!cast.zone) continue;
    assert.ok(Math.abs(cast.zone.end - cast.zone.start - cast.fish.minigame.zoneWidth) < 1e-12, cast.fish.name);
    assert.equal(cast.minigame.sweepMs, cast.fish.minigame.sweepMs);
  }
  // ブリ(0.5 秒)のミニゲームで、0.5 秒たつと印は反対側の対称の位置に来る。
  const game = createGame(1, { progress: progressAt(5) });
  // ブリが掛かったときだけ合わせる。ほかは逃がし、休みになったら再開する。
  for (let i = 0; i < 1000000 && !(game.phase === PHASES.MINIGAME && game.cast.fish.id === "buri"); i++) {
    update(game, 10);
    if (game.phase === PHASES.BITE && game.cast.fish.id === "buri" && hookGood(game)) tap(game);
    if (game.phase === PHASES.RESTING) tap(game);
  }
  assert.equal(game.cast.fish.id, "buri");
  const before = currentMarker(game);
  assert.ok(before < 0.1, `始まった直後の位置 ${before}`);
  update(game, 500);
  assert.ok(Math.abs(currentMarker(game) - (1 - before)) < 1e-9);
});

test("重みは段階ごとに 2 倍で、境界の値で正しく選ぶ", () => {
  const list = availableFish(3, FISH_KINDS.WEAK);
  assert.deepEqual(list.map(fishWeight), [1, 2, 4]);
  // 合計 7 のうち、[0, 1/7) は段階 1、[1/7, 3/7) は段階 2、[3/7, 1) は段階 3。
  assert.equal(pickWeighted(list, 0).stage, 1);
  assert.equal(pickWeighted(list, 0.9999 / 7).stage, 1);
  assert.equal(pickWeighted(list, 1 / 7).stage, 2);
  assert.equal(pickWeighted(list, 2.9999 / 7).stage, 2);
  assert.equal(pickWeighted(list, 3 / 7).stage, 3);
  assert.equal(pickWeighted(list, 0.99999).stage, 3);
});

test("表の行は項目名つきで、数値を持たない(数値は式から:D-136・D-225)", () => {
  for (const row of FISH_ROWS) {
    assert.deepEqual(Object.keys(row), ["id", "name", "kind", "stage", "color", "size"], row.id);
    assert.ok(["weak", "strong", "boss"].includes(row.kind), row.id);
    assert.ok(!Object.values(row).some((v) => typeof v === "object"), `${row.id} に数の表がない`);
  }
  // 行から作った中の形(報酬は reward にまとまる、段階は魚の表から作り、進化の鱗はヌシ)。
  assert.deepEqual(FISH_LIST[1].reward, { coins: 5, scales: 1 });
  assert.deepEqual(STAGE_LIST[0].evolve, { scale: "nushi-kurodai", count: 1 });
  assert.deepEqual(STAGE_LIST.map((s) => s.craft.scale), ["kurodai", "suzuki", "hirame", "warasa", "buri"]);
});

test("表の点検は、形のまちがいを見つける", () => {
  const broken = (fishPatch, stagePatch = null) => {
    const fish = FISH_ROWS.map((r) => (r.id === "aji" ? { ...r, ...fishPatch } : r)).map((r) => defineFish(r));
    const stages = stagesFromFish(fish).map((s) => (s.stage === 1 && stagePatch ? { ...s, ...stagePatch } : s));
    return checkContent(makeContent(fish, stages));
  };
  assert.deepEqual(broken({}), []);
  const cases = [
    [{ id: "Aji" }, "id の形"],
    [{ name: "" }, "名前"],
    [{ kind: "W" }, "区分"],
    [{ stage: 9 }, "段階"],
    [{ size: 0 }, "見た目"],
  ];
  for (const [patch, word] of cases) assert.ok(broken(patch).some((p) => p.includes(word)), `${word}:${broken(patch)}`);
  assert.ok(broken({}, { craft: { scale: "aji", count: 3 } }).some((p) => p.includes("製作の鱗")));
  assert.ok(broken({}, { craft: { scale: "kurodai", count: 0 } }).some((p) => p.includes("1 以上")));
  const badMinigame = FISH_LIST.map((f) => (f.id === "kurodai" ? { ...f, minigame: { ...f.minigame, hp: 0 } } : f));
  assert.ok(checkContent(makeContent(badMinigame, STAGE_LIST)).some((p) => p.includes("ミニゲームの数")));
  const extra = FISH_LIST.map((f) => (f.id === "aji" ? { ...f, coins: 3 } : f));
  assert.ok(checkContent(makeContent(extra, STAGE_LIST)).some((p) => p.includes("魚の項目")), "手書きの数を足すと見つける");
});
