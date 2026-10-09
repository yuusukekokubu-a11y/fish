// 降臨(レイド風:D-396・D-397)の計算本体のテスト。
import assert from "node:assert/strict";
import { test } from "node:test";

import { charmValue, CHARM_ROWS } from "../src/core/charms.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { challengeBoss, challengeRaid, createGame, currentMarker, fightSweepMs, PHASES, tap, update } from "../src/core/fishing.js";
import { fishMinigame, typicalPenetration } from "../src/core/formula.js";
import {
  addCatchGauge,
  canSummon,
  catchUnits,
  donateScales,
  fullGauge,
  KOURIN_ROWS,
  kourinUnlocked,
  makeRaidCast,
  planDonation,
  raidMinigame,
  scaleOffers,
  summonRaid,
} from "../src/core/kourin.js";
import { decodeSave, encodeSave } from "../src/core/save.js";
import { makeAimCenter, progressAt } from "./helpers.js";

const C = DEFAULT_CONFIG.kourin;
const U = C.unit;
const FULL = fullGauge(C);
const aim = makeAimCenter(currentMarker);

/** 段階 g の、ゲージ満タンの進み具合。 */
function fullAt(g, extra = {}) {
  return progressAt(g, "none", { kourin: { gauge: FULL, fromScales: 0, cleared: {}, raid: null }, ...extra });
}

/** 戦いが終わるまで進める(aimHit なら命中範囲の真ん中で押す。そうでなければ押さない)。 */
function finishFight(game, aimHit) {
  for (let i = 0; i < 200000 && game.phase === PHASES.MINIGAME; i++) {
    update(game, 16);
    if (aimHit && game.phase === PHASES.MINIGAME && aim(game)) tap(game);
  }
}

test("降臨の表:4 キャラ(疾風の大エビ・鉄壁の大ガニ・不死の大ダコ・刹那の大イカ)とくせ・お守りは 1 対 1。お守りの表と効く場所(D-396)", () => {
  assert.deepEqual(
    KOURIN_ROWS.map((r) => [r.id, r.name, r.quirk, r.charm]),
    [
      ["ebi", "疾風の大エビ", "fast", "shizume"],
      ["kani", "鉄壁の大ガニ", "wall", "yaburi"],
      ["tako", "不死の大ダコ", "regen", "yawaragi"],
      ["ika", "刹那の大イカ", "short", "toki"],
    ],
  );
  assert.deepEqual(new Set(KOURIN_ROWS.map((r) => r.charm)).size, CHARM_ROWS.length);
  assert.deepEqual(
    CHARM_ROWS.map((r) => [r.id, r.cap, r.scope]),
    [
      ["shizume", 0.4, "all"],
      ["toki", 0.6, "boss"],
      ["yaburi", 0.5, "boss"],
      ["yawaragi", 0.6, "boss"],
    ],
  );
  // 効果 = 上限 × L ÷(L + 15)。
  assert.equal(charmValue(CHARM_ROWS[0], 15, C.charmK), 0.2);
  assert.equal(charmValue(CHARM_ROWS[1], 5, C.charmK), 0.15);
  assert.equal(charmValue(CHARM_ROWS[2], 0, C.charmK), 0);
});

test("解放は港を越えたら(磯の段階 6 から)。ゲージは釣り上げ +1・強い魚とヌシ +5・餌の強い魚 +1、満タンで止まる", () => {
  assert.equal(kourinUnlocked(progressAt(5), DEFAULT_CONTENT), false);
  assert.equal(kourinUnlocked(progressAt(6), DEFAULT_CONTENT), true);
  assert.deepEqual([catchUnits("weak", false, C), catchUnits("strong", false, C), catchUnits("boss", false, C), catchUnits("strong", true, C)], [U, 5 * U, 5 * U, U]);
  const p = progressAt(5);
  assert.equal(addCatchGauge(p, DEFAULT_CONTENT, "strong", false, C), 0, "港では貯まらない");
  assert.equal(p.kourin, undefined);
  const q = progressAt(6, "none", { kourin: { gauge: FULL - 2 * U, fromScales: 0, cleared: {}, raid: null } });
  assert.equal(addCatchGauge(q, DEFAULT_CONTENT, "strong", false, C), 2 * U, "満タンで止まる");
  assert.equal(q.kourin.gauge, FULL);
});

test("釣りの中でゲージが貯まる:弱い魚を釣り上げると +1(D-396)", () => {
  const game = createGame(3, { progress: progressAt(6) });
  for (let i = 0; i < 20000 && game.counts.weak === 0; i++) {
    update(game, 16);
    if (game.phase === PHASES.BITE && game.phaseMs > 1300) tap(game);
  }
  assert.ok(game.counts.weak >= 1);
  assert.equal(game.progress.kourin.gauge, (game.counts.weak + 5 * (game.counts.strong + game.counts.boss)) * U);
});

test("鱗を納める:強い魚の鱗の余りだけ(今の段階は製作の分を残す・ヌシの鱗は入れない)。1 段階下がるごとに半分、鱗の分は 150 点まで", () => {
  const stage = DEFAULT_CONTENT.stageByNumber.get(8);
  const old = DEFAULT_CONTENT.stageByNumber.get(7).craft.scale;
  const older = DEFAULT_CONTENT.stageByNumber.get(5).craft.scale;
  const p = progressAt(8, "none", { scales: { [stage.craft.scale]: stage.craft.count + 2, [old]: 3, [older]: 1, [stage.boss]: 4 } });
  const offers = scaleOffers(p, DEFAULT_CONTENT, C);
  assert.deepEqual(
    offers.map((o) => [o.fishId, o.count, o.each]),
    [
      [stage.craft.scale, 2, 10 * U],
      [old, 3, 5 * U],
      [older, 1, 1.25 * U],
    ],
  );
  // 製作済みなら、今の段階の鱗も全部。
  assert.equal(scaleOffers({ ...p, rodStep: "crafted" }, DEFAULT_CONTENT, C)[0].count, stage.craft.count + 2);
  const r = donateScales(p, DEFAULT_CONTENT, C);
  assert.deepEqual(r, { scales: 6, units: (20 + 15 + 1.25) * U });
  assert.equal(p.scales[stage.craft.scale], stage.craft.count, "製作の分は残る");
  assert.equal(p.scales[old], undefined);
  assert.equal(p.scales[stage.boss], 4, "ヌシの鱗はそのまま");
  assert.deepEqual([p.kourin.gauge, p.kourin.fromScales], [36.25 * U, 36.25 * U]);
  // 鱗の分の上限:150 点まで(最後の 1 枚は、こえる分を切り捨て)。
  const q = progressAt(8, "crafted", { scales: { [stage.craft.scale]: 40 }, kourin: { gauge: 145 * U, fromScales: 145 * U, cleared: {}, raid: null } });
  assert.deepEqual(planDonation(q, DEFAULT_CONTENT, C), { take: [{ fishId: stage.craft.scale, count: 1 }], scales: 1, units: 5 * U });
  donateScales(q, DEFAULT_CONTENT, C);
  assert.deepEqual([q.kourin.gauge, q.kourin.fromScales, q.scales[stage.craft.scale]], [150 * U, 150 * U, 39]);
  assert.equal(planDonation(q, DEFAULT_CONTENT, C).scales, 0, "上限に届いたら納められない");
  // 港(未解放)では納められない。
  assert.equal(planDonation(progressAt(3, "crafted", { scales: { [DEFAULT_CONTENT.stageByNumber.get(3).craft.scale]: 5 } }), DEFAULT_CONTENT, C).scales, 0);
});

test("呼ぶ:満タン・呼んでいない・解放済みのとき。ゲージは空になり、体力は段階のヌシ(キャラのくせの補正つき)× 6", () => {
  const p = fullAt(13);
  assert.equal(canSummon(p, DEFAULT_CONTENT, C), true);
  assert.equal(summonRaid(p, "nope", DEFAULT_CONTENT, DEFAULT_CONFIG), false);
  assert.equal(summonRaid(p, "tako", DEFAULT_CONTENT, DEFAULT_CONFIG), true);
  const hp = raidMinigame(KOURIN_ROWS[2], 1, DEFAULT_CONFIG).hp;
  assert.deepEqual(p.kourin, { gauge: 0, fromScales: 0, cleared: {}, raid: { char: "tako", hp, tries: 0, paid: 0 } });
  assert.equal(canSummon(p, DEFAULT_CONTENT, C), false, "呼んでいる間は呼べない");
  // 体力:段階 n のヌシ(くせの補正つき)× 6 を上から 2 けた。くせはキャラのもの。
  const mg = fishMinigame("boss", 10, DEFAULT_CONFIG.formula, ["regen"]);
  assert.equal(raidMinigame(KOURIN_ROWS[2], 10, DEFAULT_CONFIG).hp, Math.round((mg.hp * 6) / 100) * 100);
  assert.ok(raidMinigame(KOURIN_ROWS[2], 10, DEFAULT_CONFIG).regenPerSec > 0);
  // 防御の壁は「ふつうの貫通 + margin」(下限なし:D-397)。
  assert.equal(raidMinigame(KOURIN_ROWS[1], 3, DEFAULT_CONFIG).defense, Math.round((typicalPenetration(3) + 0.2) * 1000) / 1000);
  assert.equal(raidMinigame(KOURIN_ROWS[1], 20, DEFAULT_CONFIG).defense, Math.round((typicalPenetration(20) + 0.2) * 1000) / 1000);
  assert.equal(canSummon(fullAt(5), DEFAULT_CONTENT, C), false, "港では呼べない");
});

test("挑む:待っていた魚を取っておき、残りの体力から戦う。時間切れで残りを保存し、挑戦の回数が進む。魚の並びは変わらない", () => {
  const p = fullAt(13);
  summonRaid(p, "ika", DEFAULT_CONTENT, DEFAULT_CONFIG);
  p.kourin.raid.hp = 200;
  const game = createGame(7, { progress: p });
  const plain = createGame(7, { progress: fullAt(13) });
  const waiting = game.cast;
  assert.equal(challengeRaid(game), true);
  assert.equal(game.pendingCast, waiting);
  assert.equal(game.phase, PHASES.MINIGAME);
  assert.equal(game.fight.hp, 200);
  assert.equal(game.fight.maxHp, raidMinigame(KOURIN_ROWS[3], 1, DEFAULT_CONFIG).hp);
  assert.equal(game.progress.kourin.raid.tries, 1);
  // 時間切れ(押さない)。ミスがないので体力は同じ。
  finishFight(game, false);
  assert.equal(game.lastResult.raid.defeated, false);
  assert.equal(game.lastResult.outcome, "escaped");
  assert.equal(game.progress.kourin.raid.hp, 200);
  // 結果のあとは、待っていた魚から続ける(魚の系統は使っていない)。
  update(game, DEFAULT_CONFIG.resultMs);
  assert.equal(game.cast, waiting);
  assert.deepEqual([game.rng(), game.rng()], [plain.rng(), plain.rng()], "魚の系統の乱数は進んでいない");
  assert.equal(challengeRaid(createGame(1, { progress: fullAt(13) })), false, "呼んでいなければ挑めない");
});

test("同じシード・同じ挑戦の回数なら同じ投。回数・キャラ・レベルが変われば種が変わる", () => {
  const p = fullAt(13);
  summonRaid(p, "ebi", DEFAULT_CONTENT, DEFAULT_CONFIG);
  const a = makeRaidCast(p, DEFAULT_CONFIG, 42);
  const b = makeRaidCast(structuredClone(p), DEFAULT_CONFIG, 42);
  assert.deepEqual(a, b);
  p.kourin.raid.tries = 1;
  assert.notEqual(makeRaidCast(p, DEFAULT_CONFIG, 42).minigameSeed, a.minigameSeed);
  p.kourin.cleared.ebi = 1;
  p.kourin.raid.tries = 0;
  assert.notEqual(makeRaidCast(p, DEFAULT_CONFIG, 42).minigameSeed, a.minigameSeed);
  assert.equal(makeRaidCast(p, DEFAULT_CONFIG, 42).raid.level, 2);
});

test("区切りの報酬:10% ごとに 1 回(ウロコイン・クレート・グローブ)、討伐でお守り。次はレベル + 1", () => {
  const p = fullAt(13);
  p.gear.seed = 99;
  summonRaid(p, "kani", DEFAULT_CONTENT, DEFAULT_CONFIG);
  const max = p.kourin.raid.hp;
  // 体力を 45% まで削った状態から挑む(区切り 5 つ分まで)。
  p.kourin.raid.hp = Math.ceil(max * 0.45);
  p.kourin.raid.paid = 0;
  const game = createGame(3, { progress: p });
  challengeRaid(game);
  game.fight.hp = Math.ceil(max * 0.45);
  // 押さずに時間切れ:残り 45% → 区切りは 5 つ(10・20・30・40・50%)。
  finishFight(game, false);
  const r = game.lastResult.raid;
  assert.deepEqual(r.rewards.map((x) => [x.step, x.type]), [
    [1, "coins"],
    [2, "item"],
    [3, "coins"],
    [4, "item"],
    [5, "glove"],
  ]);
  assert.equal(game.progress.kourin.raid.paid, 5);
  assert.equal(game.progress.gear.draws, 2, "ただのクレートも引いた回数を進める");
  assert.equal(game.progress.gloves.items.length, 1);
  // 討伐:残りの区切りとお守り。
  update(game, DEFAULT_CONFIG.resultMs);
  challengeRaid(game);
  game.fight.hp = 1;
  game.fight.zone = { start: 0, end: 1 };
  tap(game);
  const d = game.lastResult.raid;
  assert.equal(d.defeated, true);
  assert.deepEqual(d.rewards.map((x) => x.step), [6, 7, 8, 9, 10]);
  assert.deepEqual(d.rewards[4], { step: 10, type: "charm", charm: "yaburi", level: 1, fresh: true });
  assert.deepEqual(game.progress.kourin.cleared, { kani: 1 });
  assert.equal(game.progress.kourin.raid, null);
  assert.deepEqual(game.progress.charms, { levels: { yaburi: 1 }, equipped: "yaburi" }, "空の枠なら自動で付ける");
  // 保存して読み直しても同じ。
  assert.deepEqual(decodeSave(encodeSave(game.progress)), { ok: true, progress: game.progress });
});

test("持ち物がいっぱいなら、クレートの代わりにその価格のウロコイン。グローブがいっぱいなら強い魚 5 匹ぶん", () => {
  const p = fullAt(8);
  p.gear.seed = 5;
  p.gear.items = Array.from({ length: DEFAULT_CONFIG.gacha.inventoryMax }, (_, i) => ({ id: i + 1, kind: "line", rarity: "normal", grade: 1, value: 1, skills: [] }));
  p.gear.nextId = p.gear.items.length + 1;
  p.gloves = { items: Array.from({ length: DEFAULT_CONFIG.glove.max }, (_, i) => ({ id: i + 1, ability: "retry", rarity: "rare", grade: 1 })), equipped: null, nextId: 21, rolls: 0 };
  summonRaid(p, "ebi", DEFAULT_CONTENT, DEFAULT_CONFIG);
  const game = createGame(3, { progress: p });
  challengeRaid(game);
  game.fight.hp = Math.ceil(game.fight.maxHp * 0.45);
  finishFight(game, false);
  const types = game.lastResult.raid.rewards.map((x) => [x.type, x.full ?? ""]);
  assert.deepEqual(types, [
    ["coins", ""],
    ["coins", "gear"],
    ["coins", ""],
    ["coins", "gear"],
    ["coins", "glove"],
  ]);
  assert.equal(game.progress.gear.items.length, DEFAULT_CONFIG.gacha.inventoryMax);
});

test("お守りの効果(D-397):静めは印を遅く(どの戦いにも)、刻は制限時間、破りはダメージ、和らぎはくせを弱める(ヌシ戦と降臨だけ)", () => {
  const charms = (id, level) => ({ levels: { [id]: level }, equipped: id });
  // 静め:Lv15 で 20%。
  const slow = createGame(1, { progress: progressAt(13, "none", { charms: charms("shizume", 15) }) });
  assert.equal(slow.combat.markerSlow, 0.2);
  // 刻:ヌシ戦の制限時間 ×(1 + 30%)。
  const base = createGame(1, { progress: progressAt(13, "crafted") });
  challengeBoss(base);
  const toki = createGame(1, { progress: progressAt(13, "crafted", { charms: charms("toki", 15) }) });
  challengeBoss(toki);
  assert.equal(toki.fight.timeLimitMs, Math.round(base.fight.timeLimitMs * 1.3));
  // 破り:ヌシ戦のダメージ ×(1 + 25%)。強い魚には効かない。
  const yaburi = createGame(1, { progress: progressAt(13, "crafted", { charms: charms("yaburi", 15) }) });
  challengeBoss(yaburi);
  assert.equal(yaburi.fight.damageRate, 1.25);
  assert.equal(base.fight.damageRate, 1);
  // 和らぎ:くせを 30% 弱める(川のヌシ:防御の壁)。
  const soft = createGame(1, { progress: progressAt(13, "crafted", { charms: charms("yawaragi", 15) }) });
  challengeBoss(soft);
  assert.ok(base.cast.minigame.defense > 0);
  assert.equal(soft.cast.minigame.defense, Math.round(base.cast.minigame.defense * 0.7 * 1000) / 1000);
  assert.equal(soft.cast.minigame.hp, base.cast.minigame.hp, "体力はそのまま");
  // 付けていないお守りは効かない。
  const off = createGame(1, { progress: progressAt(13, "crafted", { charms: { levels: { toki: 15 }, equipped: null } }) });
  challengeBoss(off);
  assert.equal(off.fight.timeLimitMs, base.fight.timeLimitMs);
  assert.equal(fightSweepMs(slow) > 0, true);
});
