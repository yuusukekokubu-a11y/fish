// 魚の設定表とミニゲームの限界のテスト(受け入れ条件 5)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { fishQuirks } from "../src/core/formula.js";
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

test("港・磯・川・沖・外洋・深海の魚の名前(D-277・D-347・D-377)。マグロは外洋の最後(クロマグロ)", () => {
  const RANGE = { 港: [1, 5], 磯: [6, 10], 川: [11, 15], 沖: [16, 20], 外洋: [21, 25], 深海: [26, 30] };
  const names = (kind, area) => FISH_LIST.filter((f) => f.kind === kind && f.stage >= RANGE[area][0] && f.stage <= RANGE[area][1]).map((f) => f.name);
  assert.deepEqual(names(FISH_KINDS.WEAK, "港"), ["アジ", "イワシ", "サバ", "キス", "カワハギ"]);
  assert.deepEqual(names(FISH_KINDS.STRONG, "港"), ["クロダイ", "スズキ", "ヒラメ", "ワラサ", "ブリ"]);
  assert.deepEqual(names(FISH_KINDS.BOSS, "港"), ["ヌシ・クロダイ", "ヌシ・スズキ", "ヌシ・ヒラメ", "ヌシ・ワラサ", "ヌシ・ブリ"]);
  assert.deepEqual(names(FISH_KINDS.WEAK, "磯"), ["ベラ", "カサゴ", "メバル", "アイナメ", "ソイ"]);
  assert.deepEqual(names(FISH_KINDS.STRONG, "磯"), ["メジナ", "イシダイ", "ブダイ", "イシガキダイ", "クエ"]);
  assert.deepEqual(names(FISH_KINDS.BOSS, "磯"), ["ヌシ・メジナ", "ヌシ・イシダイ", "ヌシ・ブダイ", "ヌシ・イシガキダイ", "ヌシ・クエ"]);
  assert.deepEqual(names(FISH_KINDS.WEAK, "川"), ["オイカワ", "フナ", "ウグイ", "ニゴイ", "ドジョウ"]);
  assert.deepEqual(names(FISH_KINDS.STRONG, "川"), ["ヤマメ", "アユ", "ナマズ", "ニジマス", "イトウ"]);
  assert.deepEqual(names(FISH_KINDS.BOSS, "川"), ["ヌシ・ヤマメ", "ヌシ・アユ", "ヌシ・ナマズ", "ヌシ・ニジマス", "ヌシ・イトウ"]);
  assert.deepEqual(names(FISH_KINDS.WEAK, "沖"), ["ムロアジ", "イサキ", "サワラ", "ソウダガツオ", "ムツ"]);
  assert.deepEqual(names(FISH_KINDS.STRONG, "沖"), ["ヒラマサ", "カンパチ", "シイラ", "カツオ", "キハダ"]);
  assert.deepEqual(names(FISH_KINDS.BOSS, "沖"), ["ヌシ・ヒラマサ", "ヌシ・カンパチ", "ヌシ・シイラ", "ヌシ・カツオ", "ヌシ・キハダ"]);
  assert.deepEqual(names(FISH_KINDS.WEAK, "外洋"), ["トビウオ", "サンマ", "カマス", "ウルメイワシ", "ダツ"]);
  assert.deepEqual(names(FISH_KINDS.STRONG, "外洋"), ["マカジキ", "ビンナガ", "メバチ", "クロカジキ", "クロマグロ"]);
  assert.deepEqual(names(FISH_KINDS.BOSS, "外洋"), ["ヌシ・マカジキ", "ヌシ・ビンナガ", "ヌシ・メバチ", "ヌシ・クロカジキ", "ヌシ・クロマグロ"]);
  assert.deepEqual(names(FISH_KINDS.WEAK, "深海"), ["ソコダラ", "ハダカイワシ", "ヒウチダイ", "ギンザメ", "キンメダイ"]);
  assert.deepEqual(names(FISH_KINDS.STRONG, "深海"), ["アンコウ", "アカムツ", "ラブカ", "リュウグウノツカイ", "シーラカンス"]);
  assert.deepEqual(names(FISH_KINDS.BOSS, "深海"), ["ヌシ・アンコウ", "ヌシ・アカムツ", "ヌシ・ラブカ", "ヌシ・リュウグウノツカイ", "ヌシ・シーラカンス"]);
  // マグロは外洋の最後(クロマグロ:D-272・D-347)。
  assert.deepEqual(FISH_LIST.filter((f) => /マグロ/.test(f.name)).map((f) => [f.id, f.stage]), [["kuromaguro", 25], ["nushi-kuromaguro", 25]]);
  assert.deepEqual(FISH_LIST.map((f) => f.stage), Array.from({ length: 30 }, (_, i) => i + 1).flatMap((g) => [g, g, g]));
  // 識別名はローマ字の固定文字列。ヌシは「nushi-」+ 強い魚の識別名(D-377)。
  assert.deepEqual(
    FISH_LIST.filter((f) => f.stage >= 21).map((f) => f.id),
    ["tobiuo", "makajiki", "sanma", "binnaga", "kamasu", "mebachi", "urumeiwashi", "kurokajiki", "datsu", "kuromaguro", "sokodara", "ankou", "hadakaiwashi", "akamutsu", "hiuchidai", "rabuka", "ginzame", "ryuuguunotsukai", "kinmedai", "shiirakansu"]
      .flatMap((id, i) => (i % 2 === 1 ? [id, `nushi-${id}`] : [id])),
  );
});

test("id は重ならず、強い魚とヌシだけがミニゲームの重さを持ち、弱い魚は鱗を落とさない", () => {
  assert.equal(new Set(FISH_LIST.map((f) => f.id)).size, FISH_LIST.length);
  for (const f of FISH_LIST) {
    assert.equal(f.minigame !== null, f.kind !== FISH_KINDS.WEAK, f.name);
    assert.equal(f.reward.scales > 0, f.kind !== FISH_KINDS.WEAK, f.name);
  }
});

test("ヌシの体力は同じ段階の強い魚より多く、制限時間は長く、印と幅は同じか厳しい(限界の中)", () => {
  for (const { stage, craft, boss } of STAGE_LIST) {
    const s = FISH_LIST.find((f) => f.id === craft.scale).minigame;
    const b = FISH_LIST.find((f) => f.id === boss).minigame;
    // 体力は 2 倍より上(くせのあるヌシは補正で下がるので 1.5 倍より上)。強い魚の防御は 0。ヌシの防御は防御の壁のくせだけ(D-381)。
    assert.ok(b.hp > (fishQuirks("boss", stage).length > 0 ? 1.5 : 2) * s.hp, `段階 ${stage}`);
    assert.equal(s.defense, 0, `段階 ${stage} の強い魚の防御`);
    assert.equal(b.defense > 0, fishQuirks("boss", stage).includes("wall"), `段階 ${stage} のヌシの防御`);
    assert.ok(b.timeLimitMs > s.timeLimitMs, `段階 ${stage} の制限時間`);
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
  // 安全の下限(0.3 秒・5%)。ふつうの魚は式の下限(0.45 秒・10%)で止まり、くせのあるヌシだけがその下に入る(D-381)。
  assert.deepEqual(pick(effectiveMinigame(make(300, 0.05), LIMITS)), { sweepMs: 300, zoneWidth: 0.05 });
  assert.deepEqual(pick(effectiveMinigame(make(299, 0.0499), LIMITS)), { sweepMs: 300, zoneWidth: 0.05 });
  assert.deepEqual(pick(effectiveMinigame(make(100, 0), LIMITS)), { sweepMs: 300, zoneWidth: 0.05 });
  assert.deepEqual(pick(effectiveMinigame(make(301, 0.0501), LIMITS)), { sweepMs: 301, zoneWidth: 0.0501 });
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
  assert.deepEqual(list.map((f) => fishWeight(f)), [1, 2, 4]);
  // 釣り場の中の位置で数える(磯の段階 1〜3 も 1・2・4:D-275)。
  assert.deepEqual(availableFish(8, FISH_KINDS.WEAK, undefined, 6).map((f) => fishWeight(f, 6)), [1, 2, 4]);
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
  assert.deepEqual(STAGE_LIST.map((s) => s.craft.scale), ["kurodai", "suzuki", "hirame", "warasa", "buri", "mejina", "ishidai", "budai", "ishigakidai", "kue", "yamame", "ayu", "namazu", "nijimasu", "itou", "hiramasa", "kanpachi", "shiira", "katsuo", "kihada", "makajiki", "binnaga", "mebachi", "kurokajiki", "kuromaguro", "ankou", "akamutsu", "rabuka", "ryuuguunotsukai", "shiirakansu"]);
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
    [{ stage: 99 }, "段階"],
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
