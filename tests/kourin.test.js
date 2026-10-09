// 降臨(レイド風:D-396・D-397・D-403・D-408)の計算本体のテスト。
import assert from "node:assert/strict";
import { test } from "node:test";

import { charmValue, CHARM_ROWS } from "../src/core/charms.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { canStartRaid, challengeBoss, challengeRaid, createGame, currentMarker, fightSweepMs, PHASES, startRaid, tap, update } from "../src/core/fishing.js";
import { fishMinigame, round2, typicalPenetration } from "../src/core/formula.js";
import {
  addCatchPower,
  canSummon,
  catchPower,
  convertScales,
  injectableOf,
  injectPower,
  KOURIN_ROWS,
  kourinUnlocked,
  makeRaidCast,
  needPower,
  raidMinigame,
  scaleOffers,
  summonRaid,
} from "../src/core/kourin.js";
import { decodeSave, encodeSave } from "../src/core/save.js";
import { makeAimCenter, progressAt } from "./helpers.js";

const C = DEFAULT_CONFIG.kourin;
const aim = makeAimCenter(currentMarker);

/** 段階 g の、4 キャラとも Lv1 に要る量まで注入した進み具合。 */
function fullAt(g, extra = {}) {
  const fills = Object.fromEntries(KOURIN_ROWS.map((r) => [r.id, { total: needPower(1, C), scales: 0 }]));
  return progressAt(g, "none", { kourin: { power: 0, fills, cleared: {}, raid: null }, ...extra });
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

test("解放は港を越えたら(磯の段階 6 から)。ウロコパワーは釣り上げ 1・強い魚とヌシ 5・餌の強い魚 1 に、魚の段階ごとに 2 倍(D-403)", () => {
  assert.equal(kourinUnlocked(progressAt(5), DEFAULT_CONTENT), false);
  assert.equal(kourinUnlocked(progressAt(6), DEFAULT_CONTENT), true);
  assert.deepEqual([catchPower("weak", false, 1, C), catchPower("strong", false, 1, C), catchPower("boss", false, 1, C), catchPower("strong", true, 1, C)], [1, 5, 5, 1]);
  assert.deepEqual([catchPower("weak", false, 6, C), catchPower("strong", false, 8, C)], [32, 640], "段階 6 は 32 倍、段階 8 は 128 倍");
  // 要る量:240 × 2^(レベル − 1)。竿の段階には依らない。
  assert.deepEqual([needPower(1, C), needPower(3, C), needPower(8, C)], [240, 960, 30720]);
  const p = progressAt(5);
  assert.equal(addCatchPower(p, DEFAULT_CONTENT, "strong", false, 5, C), 0, "港では貯まらない");
  assert.equal(p.kourin, undefined);
  const q = progressAt(6);
  assert.equal(addCatchPower(q, DEFAULT_CONTENT, "strong", false, 6, C), 160);
  assert.equal(q.kourin.power, 160);
});

test("釣りの中でウロコパワーが貯まる:弱い魚を釣り上げると 1 × 2^(段階 − 1)(D-403)", () => {
  const game = createGame(3, { progress: progressAt(6) });
  for (let i = 0; i < 20000 && game.counts.weak === 0; i++) {
    update(game, 16);
    if (game.phase === PHASES.BITE && game.phaseMs > 1300) tap(game);
  }
  assert.ok(game.counts.weak >= 1);
  const caught = game.results.filter((r) => r.outcome === "caught");
  const want = caught.reduce((n, r) => n + catchPower(r.kind, false, DEFAULT_CONTENT.byId.get(r.fishId).stage, C), 0);
  assert.equal(game.progress.kourin.power, want);
});

test("鱗をまとめてウロコパワーに替える(上限なし。竿の製作に要る分とヌシの鱗は残す)。1 枚 10 × 2^(段階 − 1)(D-408)", () => {
  const stage = DEFAULT_CONTENT.stageByNumber.get(8);
  const old = DEFAULT_CONTENT.stageByNumber.get(7).craft.scale;
  const older = DEFAULT_CONTENT.stageByNumber.get(5).craft.scale;
  const p = progressAt(8, "none", { scales: { [stage.craft.scale]: stage.craft.count + 2, [old]: 3, [older]: 1, [stage.boss]: 4 } });
  // 1 枚の量:10 × 2^(段階 − 1)。竿の段階には依らない。
  assert.deepEqual(
    scaleOffers(p, DEFAULT_CONTENT, C).map((o) => [o.fishId, o.count, o.each]),
    [
      [stage.craft.scale, 2, 1280],
      [old, 3, 640],
      [older, 1, 160],
    ],
  );
  assert.equal(scaleOffers({ ...p, rodStep: "crafted" }, DEFAULT_CONTENT, C)[0].count, stage.craft.count + 2, "製作済みなら今の段階の鱗も全部");
  assert.deepEqual(convertScales(p, DEFAULT_CONTENT, C), { scales: 6, power: 2560 + 1920 + 160 });
  assert.equal(p.kourin.power, 4640);
  assert.equal(p.scales[stage.craft.scale], stage.craft.count, "製作の分は残る");
  assert.equal(p.scales[old], undefined);
  assert.equal(p.scales[stage.boss], 4, "ヌシの鱗はそのまま");
  assert.deepEqual(convertScales(p, DEFAULT_CONTENT, C), { scales: 0, power: 0 }, "もう替えられる鱗はない");
  // 港(未解放)では替えられない。
  const harbor = progressAt(3, "crafted", { scales: { [DEFAULT_CONTENT.stageByNumber.get(3).craft.scale]: 5 } });
  assert.deepEqual(convertScales(harbor, DEFAULT_CONTENT, C), { scales: 0, power: 0 });
  assert.equal(harbor.kourin, undefined);
});

test("注入する:貯めたウロコパワーから、要る量まで(鱗の分の上限はない:D-408)。呼んでいる相手には注入しない", () => {
  const p = progressAt(8, "none", { kourin: { power: 1000, fills: {}, cleared: {}, raid: null } });
  // Lv1 の相手(要る 240)には 240 だけ。
  assert.equal(injectableOf(p, DEFAULT_CONTENT, "ebi", C), 240);
  assert.equal(injectPower(p, DEFAULT_CONTENT, "ebi", C), 240);
  assert.deepEqual([p.kourin.fills.ebi, p.kourin.power], [{ total: 240, scales: 0 }, 760]);
  assert.equal(injectPower(p, DEFAULT_CONTENT, "ebi", C), 0, "満たした相手には入らない");
  assert.equal(canSummon(p, DEFAULT_CONTENT, C, "ebi"), true);
  // Lv8 の相手(要る 30720)には、ある分を全部。前の決まりで鱗から入れた分(scales)は、記録としてそのまま残る。
  p.kourin.cleared.kani = 7;
  p.kourin.fills.kani = { total: 15360, scales: 15360 };
  assert.equal(injectPower(p, DEFAULT_CONTENT, "kani", C), 760);
  assert.deepEqual([p.kourin.fills.kani, p.kourin.power], [{ total: 16120, scales: 15360 }, 0]);
  assert.equal(canSummon(p, DEFAULT_CONTENT, C, "kani"), false, "要る量に届くまで呼べない");
  // 呼んでいる相手・表にない相手・港(未解放)には注入しない。
  const q = progressAt(8, "none", { kourin: { power: 500, fills: {}, cleared: {}, raid: { char: "tako", hp: 10, tries: 0, paid: 0 } } });
  assert.deepEqual([injectableOf(q, DEFAULT_CONTENT, "tako", C), injectableOf(q, DEFAULT_CONTENT, "nope", C)], [0, 0]);
  assert.equal(injectableOf(progressAt(3, "none", { kourin: { power: 500, fills: {}, cleared: {}, raid: null } }), DEFAULT_CONTENT, "ebi", C), 0);
});

test("呼ぶ:要る量まで注入した・呼んでいない・解放済みのとき。注入した分は使い切り、体力は段階のヌシ(キャラのくせの補正つき)× 6", () => {
  const p = fullAt(13);
  assert.equal(canSummon(p, DEFAULT_CONTENT, C), true);
  assert.equal(summonRaid(p, "nope", DEFAULT_CONTENT, DEFAULT_CONFIG), false);
  assert.equal(summonRaid(p, "tako", DEFAULT_CONTENT, DEFAULT_CONFIG), true);
  const hp = raidMinigame(KOURIN_ROWS[2], 1, DEFAULT_CONFIG).hp;
  assert.equal(p.kourin.fills.tako, undefined, "呼んだ相手の注入した分は使い切る");
  assert.deepEqual(p.kourin.raid, { char: "tako", hp, tries: 0, paid: 0 });
  assert.equal(canSummon(p, DEFAULT_CONTENT, C), false, "呼んでいる間は呼べない");
  // 体力:段階 n のヌシ(くせの補正つき)× 6 を上から 2 けた。くせはキャラのもの。
  const mg = fishMinigame("boss", 10, DEFAULT_CONFIG.formula, ["regen"]);
  assert.equal(raidMinigame(KOURIN_ROWS[2], 10, DEFAULT_CONFIG).hp, Math.round((mg.hp * 6) / 100) * 100);
  assert.ok(raidMinigame(KOURIN_ROWS[2], 10, DEFAULT_CONFIG).regenPerSec > 0);
  // 疾風の大エビだけ × 5(倒すまでの回数を、ほかのキャラにそろえる:D-404)。
  const fast = fishMinigame("boss", 10, DEFAULT_CONFIG.formula, ["fast"]);
  assert.equal(raidMinigame(KOURIN_ROWS[0], 10, DEFAULT_CONFIG).hp, round2(fast.hp * 5));
  // 防御の壁は「ふつうの貫通 + margin」(下限なし:D-397)。
  assert.equal(raidMinigame(KOURIN_ROWS[1], 3, DEFAULT_CONFIG).defense, Math.round((typicalPenetration(3) + 0.2) * 1000) / 1000);
  assert.equal(raidMinigame(KOURIN_ROWS[1], 20, DEFAULT_CONFIG).defense, Math.round((typicalPenetration(20) + 0.2) * 1000) / 1000);
  assert.equal(canSummon(fullAt(5), DEFAULT_CONTENT, C), false, "港では呼べない");
});

test("挑む(D-409:呼ぶと挑むを 1 つに):要る量まで注入した相手は、呼んでそのまま戦う。呼んでいる間は、ほかの相手には挑めない", () => {
  const game = createGame(7, { progress: fullAt(13) });
  const waiting = game.cast;
  assert.equal(canStartRaid(game, "ika"), true);
  assert.equal(startRaid(game, "ika"), true);
  assert.deepEqual([game.phase, game.pendingCast, game.progress.kourin.raid.char, game.progress.kourin.raid.tries], [PHASES.MINIGAME, waiting, "ika", 1]);
  assert.equal(game.progress.kourin.fills.ika, undefined, "注入した分は使い切る");
  assert.equal(canStartRaid(game, "ika"), false, "戦いの間は挑めない");
  finishFight(game, false);
  update(game, DEFAULT_CONFIG.resultMs);
  assert.equal(canStartRaid(game, "ika"), true, "呼んでいる相手には、また挑める");
  assert.equal(canStartRaid(game, "tako"), false, "ほかの相手には挑めない(注入は済んでいても)");
  assert.equal(startRaid(game, "tako"), false);
  // 注入が足りない相手には挑めない。
  assert.equal(canStartRaid(createGame(7, { progress: progressAt(13) }), "ebi"), false);
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
