// グローブ(②-5b:D-332〜D-335)のテスト:抽選・釣れるクレート・持ち物・対応段階・能力 5 個・保存の版 7。

import assert from "node:assert/strict";
import { test } from "node:test";

import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT, FISH_KINDS } from "../src/core/fish.js";
import { createGame, currentHookTiming, fightSweepMs, OUTCOMES, PHASES, REASONS, tap, update } from "../src/core/fishing.js";
import { makeCrates } from "../src/core/gear.js";
import {
  abilityAllows,
  coverLimit,
  crateRng,
  dismantleGlove,
  drawGlove,
  equipGlove,
  GLOVE_ABILITY_ROWS,
  GLOVE_RARITY_ROWS,
  gloveRefund,
  gloveValue,
  openCrate,
  setGloveLocked,
} from "../src/core/glove.js";
import { gloveEffect, gloveOutOfRange, inGrazeBand, retryStock } from "../src/core/glove_play.js";
import { decodeSave, encodeSave } from "../src/core/save.js";
import { decodeSaveCode, encodeSaveCode, parseSave } from "../src/core/savecode.js";
import { readSaveCode, signSaveCode } from "../src/core/signed_code.js";
import { CURRENT_KEY } from "../src/ui/save_sign.js";
import { startQuickFight } from "../src/ui/debug_view.js";
import { progressAt, readText, toV8, withDefense } from "./helpers.js";

const SEED = 777;

/** ガチャの種のある進み具合(釣れるクレートの判定が働く)。gloves を渡すと持ち物にする。 */
function progressWith(stage, gloves = null, extra = {}) {
  const p = progressAt(stage, "none", { gear: { items: [], equipped: {}, draws: 0, seed: SEED, nextId: 1 }, ...extra });
  if (gloves) p.gloves = gloves;
  return p;
}

/** グローブ 1 個を付けた持ち物。 */
function wearing(ability, rarity, grade) {
  return { items: [{ id: 1, ability, rarity, grade }], equipped: 1, nextId: 2, rolls: 0 };
}

/** 投げ終わり(待つの始まり)まで進める。 */
function toWaiting(game) {
  while (game.phase !== PHASES.WAITING) update(game, 16);
}

/** 掛かる(合わせの輪の始まり)まで進める。 */
function toBite(game) {
  while (game.phase !== PHASES.BITE) update(game, 16);
}

/** 結果を見せたあと、次の投げまで進める(合わせを続けて逃して休んでいたら、タップで再開)。 */
function toNextCast(game) {
  while (game.phase !== PHASES.CASTING) {
    if (game.phase === PHASES.RESTING) tap(game);
    else update(game, 16);
  }
}

/** 掛かっている魚を、成功帯で合わせて終わらせる(強い魚は戦わずに制限時間で逃がす)。 */
function finishCast(game) {
  if (game.phase === PHASES.BITE) {
    update(game, currentHookTiming(game).successStart + 1 - game.phaseMs);
    tap(game);
  }
  if (game.phase === PHASES.MINIGAME) update(game, game.fight.timeLimitMs);
  toNextCast(game);
}

/** 弱い魚が掛かるまで進める(強い魚は合わせてから逃がす。合わせの失敗は使わない)。 */
function nextWeakBite(game) {
  for (;;) {
    toBite(game);
    if (game.cast.kind === FISH_KINDS.WEAK) return;
    finishCast(game);
  }
}

test("抽選:レア度は 50/30/15/5%(10 万回で ±1%)。自動合わせはレジェンドだけ。能力はレア度の候補から。効果はレア度で固定", () => {
  const N = 100000;
  const rarity = Object.fromEntries(GLOVE_RARITY_ROWS.map((r) => [r.id, 0]));
  const byAbility = new Map();
  for (let i = 0; i < N; i++) {
    const rng = crateRng(SEED, i);
    rng();
    const g = drawGlove(rng, 3);
    rarity[g.rarity] += 1;
    const ability = GLOVE_ABILITY_ROWS.find((a) => a.id === g.ability);
    assert.ok(abilityAllows(ability, g.rarity), `${g.ability} は ${g.rarity} で出ない`);
    byAbility.set(`${g.ability}:${g.rarity}`, (byAbility.get(`${g.ability}:${g.rarity}`) ?? 0) + 1);
  }
  for (const r of GLOVE_RARITY_ROWS) assert.ok(Math.abs(rarity[r.id] / N - r.rate / 1000) < 0.01, `${r.id}:${rarity[r.id]}`);
  for (const r of ["normal", "rare", "epic"]) assert.ok(!byAbility.has(`auto-hook:${r}`));
  assert.ok(byAbility.get("auto-hook:legend") > 0);
  assert.deepEqual(
    GLOVE_ABILITY_ROWS.map((a) => a.id),
    ["auto-hook", "retry", "insurance", "graze", "combo-keep", "chain", "combo-accel", "core-master", "edge-master", "tailwind"],
  );
  // 効果の値はレア度で固定。
  assert.deepEqual(["normal", "rare", "epic", "legend"].map((r) => gloveValue({ id: 1, ability: "retry", rarity: r, grade: 1 })), [1, 2, 3, 4]);
  assert.deepEqual(["normal", "rare", "epic", "legend"].map((r) => gloveValue({ id: 1, ability: "insurance", rarity: r, grade: 1 })), [1, 1, 2, 3]);
  assert.deepEqual(["normal", "rare", "epic", "legend"].map((r) => gloveValue({ id: 1, ability: "combo-keep", rarity: r, grade: 1 })), [0.5, 0.6, 0.75, 0.9]);
  assert.deepEqual(gloveValue({ id: 1, ability: "graze", rarity: "epic", grade: 1 }), { outer: 0.2, damage: 0.5 });
});

test("釣れるクレート:判定の乱数は投ごとに 1 回(条件を満たさなくても引く)。魚の乱数の引く順番と数は変わらない", () => {
  const plain = createGame(5, { progress: progressAt(1) });
  const game = createGame(5, { progress: progressWith(1) });
  game.crateChance = 1;
  const fish = (g) => [g.cast.fish.id, g.cast.kind, Math.round(g.cast.waitMs)];
  for (let i = 0; i < 30; i++) {
    for (const g of [plain, game]) toWaiting(g);
    assert.deepEqual(fish(game), fish(plain), `${i} 投目`);
    assert.equal(game.progress.gloves.rolls, i + 1, "投ごとに 1 回");
    // 弱い魚の投だけ置き換わる(強い魚の投はそのまま)。
    assert.equal(Boolean(game.cast.crate), game.cast.kind === FISH_KINDS.WEAK, `${i} 投目`);
    for (const g of [plain, game]) {
      update(g, currentHookTiming(g).ringMs + g.cast.waitMs + 1);
      toNextCast(g);
    }
  }
  assert.equal(plain.progress.gloves, undefined, "ガチャの種がない(データを作る前)は判定しない");
});

test("釣れるクレート:条件(1)〜(5)を全部満たすときだけ出る(1 つ外すと出ない)", () => {
  /** @param {(game: any) => void} setup */
  const crateAppears = (setup, stage = 1) => {
    const game = createGame(5, { progress: progressWith(stage) });
    game.crateChance = 1;
    setup(game);
    nextWeakBite(game);
    return Boolean(game.cast.crate);
  };
  assert.equal(crateAppears(() => {}), true, "全部満たす");
  // (1) 保管に空きがない。
  const full = { items: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, ability: "retry", rarity: "normal", grade: 1 })), equipped: null, nextId: 21, rolls: 0 };
  assert.equal(crateAppears((g) => (g.progress.gloves = full)), false, "保管がいっぱい");
  // (2) いちばん新しい釣り場にいない(磯の段階にいて、港にいる)。
  assert.equal(crateAppears((g) => (g.progress.area = "minato"), 6), false, "古い釣り場");
  assert.equal(crateAppears(() => {}, 6), true, "いちばん新しい釣り場");
  // (3) 餌を使う投(餌の投は強い魚になるので、弱い魚の投が来ない間に判定)。
  const bait = createGame(5, { progress: progressWith(1, null, { bait: 99, useBait: true }) });
  bait.crateChance = 1;
  for (let i = 0; i < 10; i++) {
    toBite(bait);
    assert.ok(!bait.cast.crate && bait.cast.bait, "餌の投");
    update(bait, currentHookTiming(bait).ringMs);
    toNextCast(bait);
  }
  // (4) 自動合わせを付けている(対応段階によらない)。
  assert.equal(crateAppears((g) => (g.progress.gloves = wearing("auto-hook", "legend", 1))), false, "自動合わせ");
  // 自動合わせ以外のグローブなら出る。
  assert.equal(crateAppears((g) => (g.progress.gloves = wearing("retry", "legend", 1))), true, "ほかのグローブ");
});

test("釣れるクレート:合わせの成功でグローブが手に入る(グレード = 竿の段階)。失敗で逃げる。同じ回数目なら同じ結果", () => {
  const game = createGame(5, { progress: progressWith(3) });
  game.crateChance = 1;
  nextWeakBite(game);
  const index = game.cast.crate.index;
  update(game, currentHookTiming(game).successStart + 1);
  assert.equal(tap(game).grade, "good");
  while (game.phase !== PHASES.RESULT) update(game, 16);
  const result = game.lastResult;
  assert.equal(result.crate, true);
  assert.equal(result.outcome, OUTCOMES.CAUGHT);
  assert.equal(result.glove.grade, 3);
  assert.deepEqual(game.progress.gloves.items, [result.glove]);
  assert.equal(result.reward.coins, 0, "ウロコインは入らない");
  // 同じ回数目を開けると同じグローブ(引き直しはできない)。
  const again = { items: [], equipped: null, nextId: 1, rolls: 0 };
  assert.deepEqual(openCrate(again, SEED, index, 3, 20), result.glove);
  // 失敗(遅すぎ)なら逃げて、何も手に入らない。
  toNextCast(game);
  nextWeakBite(game);
  update(game, currentHookTiming(game).ringMs);
  assert.equal(game.lastResult.crate, true);
  assert.deepEqual([game.lastResult.outcome, game.lastResult.reason, game.lastResult.glove], [OUTCOMES.ESCAPED, REASONS.LATE, null]);
  assert.equal(game.progress.gloves.items.length, 1);
});

test("持ち物:上限 20(いっぱいなら開けない)。装着は 1 つ。分解でウロコイン(ロック中は分解できない)", () => {
  const bag = { items: [], equipped: null, nextId: 1, rolls: 0 };
  for (let i = 0; i < 20; i++) assert.ok(openCrate(bag, SEED, i, 2, 20));
  assert.equal(openCrate(bag, SEED, 20, 2, 20), null);
  assert.equal(bag.items.length, 20);
  assert.equal(equipGlove(bag, 3), true);
  assert.equal(equipGlove(bag, 5), true);
  assert.equal(bag.equipped, 5, "付け替え(1 つだけ)");
  assert.equal(equipGlove(bag, 99), false);
  const crates = makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG);
  setGloveLocked(bag, 4, true);
  assert.equal(dismantleGlove(bag, 4, crates), 0, "ロック中");
  const refund = gloveRefund(bag.items.find((g) => g.id === 5), crates);
  assert.ok(refund >= 1);
  assert.equal(dismantleGlove(bag, 5, crates), refund);
  assert.equal(bag.equipped, null, "装着中を分解したら外れる");
  assert.equal(bag.items.length, 19);
  // 戻りは、グレードのクレートの価格の 1〜2 割。
  for (const r of GLOVE_RARITY_ROWS) {
    const price = crates[1].price;
    const v = gloveRefund({ id: 1, ability: "retry", rarity: r.id, grade: 2 }, crates);
    assert.ok(v >= Math.floor(price * 0.1) && v <= price * 0.2, `${r.id}:${v} / ${price}`);
  }
});

test("対応段階:グレード g + 延長(+0〜+3)ちょうどまで効き、1 つ上では効かない(「対応外」)", () => {
  for (const [rarity, extend] of [["normal", 0], ["rare", 1], ["epic", 2], ["legend", 3]]) {
    const glove = { id: 1, ability: "insurance", rarity, grade: 2 };
    assert.equal(coverLimit(glove), 2 + extend);
    for (const [stage, ok] of [[2 + extend, true], [3 + extend, false]]) {
      const strong = DEFAULT_CONTENT.fish.find((f) => f.kind === FISH_KINDS.STRONG && f.stage === stage);
      const game = createGame(1, { progress: progressWith(stage, wearing("insurance", rarity, 2)) });
      assert.equal(startQuickFight(game, strong.id, "good").ok, true);
      assert.equal(gloveEffect(game, "insurance") !== null, ok, `${rarity} 段階 ${stage}`);
      assert.equal(gloveOutOfRange(game), !ok);
    }
  }
});

test("自動合わせ:輪が成功帯に入った瞬間に成功(ジャストなし)。弱い魚は放置で釣れ続け、強い魚の命中は手動(放置で逃げる)", () => {
  const game = createGame(11, { progress: progressWith(1, wearing("auto-hook", "legend", 1)) });
  let weak = 0;
  let strong = 0;
  let coins = 0;
  for (let t = 0; t < 600000; t += 16) {
    if (game.phase === PHASES.BITE && game.phaseMs > 0) assert.ok(game.phaseMs <= currentHookTiming(game).successStart, "成功帯より前");
    update(game, 16);
    if (game.phase === PHASES.MINIGAME && game.hookGrade) assert.equal(game.hookGrade, "good", "ジャストは出ない");
    if (game.phase === PHASES.RESULT && game.phaseMs < 16) {
      const r = game.lastResult;
      if (r.kind === FISH_KINDS.WEAK) {
        assert.deepEqual([r.outcome, r.hook, r.auto, r.justCoinRate], [OUTCOMES.CAUGHT, "good", true, undefined]);
        weak += 1;
      }
      if (r.kind === FISH_KINDS.STRONG) {
        assert.deepEqual([r.outcome, r.reason, r.strike], [OUTCOMES.ESCAPED, REASONS.TIMEOUT, undefined], "放置では逃げる");
        strong += 1;
      }
    }
  }
  coins = game.progress.coins;
  assert.ok(weak > 30 && strong > 0, `${weak} / ${strong}`);
  assert.ok(coins > 0);
  assert.deepEqual(game.progress.scales, {}, "鱗は出ない");
  assert.equal(game.progress.gloves.items.length, 1, "釣れるクレートは出ない");
  // 掛かっている間のタップは無視する(早すぎで逃がさない)。
  const g2 = createGame(11, { progress: progressWith(1, wearing("auto-hook", "legend", 1)) });
  toBite(g2);
  assert.equal(tap(g2), null);
  // 対応段階の外(レジェンド・グレード 1 → 段階 4 まで)の段階 5 の魚では、自動にならない。
  const out = createGame(11, { progress: progressWith(5, wearing("auto-hook", "legend", 1)) });
  let checked = 0;
  for (let i = 0; i < 200 && checked < 3; i++) {
    toBite(out);
    if (out.cast.fish.stage === 5) {
      update(out, currentHookTiming(out).ringMs);
      assert.equal(out.lastResult.reason, REASONS.LATE);
      checked += 1;
      toNextCast(out);
    } else {
      // 段階 4 までの魚は自動で掛かる。
      while (out.phase === PHASES.BITE) update(out, 16);
      assert.notEqual(out.phase, PHASES.RESULT);
      finishCast(out);
    }
  }
  assert.equal(checked, 3);
});

test("仕切り直し:失敗で輪がやり直し、ストックが減る。0 なら逃げる。10 匹ごとに 1 増え、上限まで。開くたびに上限いっぱい", () => {
  const game = createGame(3, { progress: progressWith(1, wearing("retry", "rare", 1)) });
  nextWeakBite(game);
  assert.equal(retryStock(game), 2, "開いたときは上限(レア 2)");
  // 早すぎ:やり直し。
  const r1 = tap(game);
  assert.deepEqual([r1.grade, r1.retry, game.phase, game.phaseMs], ["early", true, PHASES.BITE, 0]);
  assert.equal(retryStock(game), 1);
  // 遅すぎ:やり直し。
  update(game, currentHookTiming(game).ringMs);
  assert.deepEqual([game.phase, game.phaseMs], [PHASES.BITE, 0]);
  assert.equal(retryStock(game), 0);
  // ストック 0:逃げる。
  update(game, currentHookTiming(game).ringMs);
  assert.equal(game.lastResult.reason, REASONS.LATE);
  // 10 匹釣ると 1 増える(上限 2 まで)。
  toNextCast(game);
  let caught = 0;
  while (caught < 25) {
    nextWeakBite(game);
    update(game, currentHookTiming(game).successStart + 1);
    tap(game);
    while (game.phase !== PHASES.RESULT) update(game, 16);
    caught += 1;
    if (caught === 10) assert.equal(retryStock(game), 1);
    if (caught === 20) assert.equal(retryStock(game), 2);
    toNextCast(game);
  }
  assert.equal(retryStock(game), 2, "上限で止まる");
  // ストックは保存しない(新しく開いたゲームは上限いっぱい)。
  assert.equal(JSON.stringify(game.progress).includes("stock"), false);
});

/** 段階 stage のヌシ(体力が多い)と戦いを始める。 */
function fightWith(stage, gloves) {
  const strong = DEFAULT_CONTENT.fish.find((f) => f.kind === FISH_KINDS.BOSS && f.stage === stage);
  const game = createGame(1, { progress: progressWith(stage, gloves) });
  assert.equal(startQuickFight(game, strong.id, "good").ok, true);
  return game;
}

/** 印が position にある時刻へ進めてタップする(行きの向き)。 */
function tapAt(game, position) {
  const sweep = fightSweepMs(game);
  const base = Math.ceil((game.phaseMs + 1) / (2 * sweep)) * 2 * sweep;
  update(game, base + position * sweep - game.phaseMs);
  return tap(game);
}

/** 命中範囲の外で、かすりの帯にも入らない位置。 */
function farMiss(zone) {
  return zone.start > 0.5 ? zone.start / 4 : (1 + zone.end) / 2 + (1 - zone.end) / 4;
}

test("保険:戦闘ごとにレア度の回数(1/1/2/3)だけミスを無効にする。回復・連撃のリセットは起きない", () => {
  for (const [rarity, n] of [["normal", 1], ["rare", 1], ["epic", 2], ["legend", 3]]) {
    const game = fightWith(2, wearing("insurance", rarity, 2));
    const zone = () => game.fight.zone;
    tapAt(game, (zone().start + zone().end) / 2);
    tapAt(game, (zone().start + zone().end) / 2);
    const hp = game.fight.hp;
    assert.equal(game.fight.combo, 2);
    for (let i = 0; i < n; i++) {
      const r = tapAt(game, farMiss(zone()));
      assert.deepEqual([r.action, r.insured, r.heal], ["miss", true, 0], `${rarity} ${i}`);
    }
    assert.deepEqual([game.fight.hp, game.fight.combo, game.fight.misses], [hp, 2, 0]);
    const r = tapAt(game, farMiss(zone()));
    assert.equal(r.insured, undefined, "回数をこえたら普通のミス");
    assert.equal(game.fight.combo, 0);
    assert.ok(game.fight.hp > hp || hp === game.fight.maxHp);
  }
});

test("かすり:範囲のすぐ外(幅 × 10/15/20/30%)はかすり。ダメージは通常の 30/40/50/60%、回復せず、連撃と範囲は変わらない", () => {
  for (const [rarity, outer, ratio] of [["normal", 0.1, 0.3], ["rare", 0.15, 0.4], ["epic", 0.2, 0.5], ["legend", 0.3, 0.6]]) {
    const game = fightWith(2, wearing("graze", rarity, 2));
    const z = game.fight.zone;
    tapAt(game, (z.start + z.end) / 2);
    const zone = { ...game.fight.zone };
    const width = zone.end - zone.start;
    const combo = game.fight.combo;
    const hp = game.fight.hp;
    // 帯の内側の端(外側 outer × 幅の少し内)。
    const pos = zone.end + width * outer * 0.9 <= 1 ? zone.end + width * outer * 0.9 : zone.start - width * outer * 0.9;
    assert.equal(inGrazeBand(pos, zone, outer), true);
    const r = tapAt(game, pos);
    const expected = Math.max(1, Math.round(game.combat.damage * ratio));
    assert.deepEqual([r.action, r.damage, game.fight.hp, game.fight.combo], ["graze", expected, hp - expected, combo], rarity);
    assert.deepEqual(game.fight.zone, zone, "範囲は動かない");
    assert.equal(game.fight.hits, 1, "命中に数えない");
    // 帯の外はミス。
    const far = zone.end + width * outer * 1.2 <= 1 ? zone.end + width * outer * 1.2 : zone.start - width * outer * 1.2;
    if (far >= 0 && far <= 1) assert.equal(tapAt(game, far).action, "miss");
  }
});

test("かすり:防御と貫通は通常どおり効く(実効防御 100% 以上は 1)", () => {
  // いまの魚の表は防御 0(D-380)なので、5 体目のヌシに防御 105% を付けた表で確かめる。
  const plain = DEFAULT_CONTENT.fish.find((f) => f.kind === FISH_KINDS.BOSS && f.stage === 5);
  const content = withDefense(DEFAULT_CONTENT, { [plain.id]: 1.05 });
  const boss = content.byId.get(plain.id);
  const game = createGame(1, { content, progress: progressWith(5, wearing("graze", "legend", 5)) });
  assert.equal(startQuickFight(game, boss.id, "good").ok, true);
  const z = game.fight.zone;
  const pos = z.end + (z.end - z.start) * 0.2 <= 1 ? z.end + (z.end - z.start) * 0.2 : z.start - (z.end - z.start) * 0.2;
  const r = tapAt(game, pos);
  assert.equal(r.action, "graze");
  assert.ok(r.effDefense >= 1 && r.damage === 1, `防御 ${r.effDefense}・${r.damage}`);
});

test("連撃の維持:ミスで段数がレア度ごとに 50/60/75/90% 残る(端数は切り捨て)", () => {
  for (const [rarity, keep] of [["normal", 0.5], ["rare", 0.6], ["epic", 0.75], ["legend", 0.9]]) {
    const game = fightWith(2, wearing("combo-keep", rarity, 2));
    for (let i = 0; i < 7 && game.phase === PHASES.MINIGAME; i++) tapAt(game, (game.fight.zone.start + game.fight.zone.end) / 2);
    if (game.phase !== PHASES.MINIGAME) continue;
    const before = game.fight.combo;
    const r = tapAt(game, farMiss(game.fight.zone));
    assert.equal(game.fight.combo, Math.floor(before * keep), `${rarity} ${before}`);
    assert.equal(r.comboKept, Math.floor(before * keep));
  }
  // 装着なしなら 0 に戻る(前と同じ)。
  const plain = fightWith(2, null);
  tapAt(plain, (plain.fight.zone.start + plain.fight.zone.end) / 2);
  const r = tapAt(plain, farMiss(plain.fight.zone));
  assert.deepEqual([plain.fight.combo, r.comboKept], [0, undefined]);
});

test("保存の版 7:グローブが往復で元に戻る。壊れた系(能力・組み合わせ・グレード・装着・上限)は拒否", () => {
  const p = progressWith(4, {
    items: [
      { id: 1, ability: "auto-hook", rarity: "legend", grade: 4, locked: true },
      { id: 3, ability: "graze", rarity: "normal", grade: 1 },
      { id: 7, ability: "combo-keep", rarity: "epic", grade: 10 },
    ],
    equipped: 3,
    nextId: 8,
    rolls: 1234,
  });
  const body = encodeSave(p);
  assert.deepEqual(decodeSave(body), { ok: true, progress: p });
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p)), { ok: true, progress: p });
  const parts = body.split("~");
  const withGloves = (head, items) => [...parts.slice(0, 11), head, items, ...parts.slice(13)].join("~");
  assert.equal(decodeSave(withGloves(parts[11], parts[12])).ok, true);
  const bad = {
    "存在しない能力": withGloves("0.2.", `1.${(10 * 4).toString(36)}.1`),
    "ノーマルの自動合わせ": withGloves("0.2.", "1.0.1"),
    "グレード 0": withGloves("0.2.", "1.4.0"),
    "グレードが表より上": withGloves("0.2.", `1.4.${(DEFAULT_CONTENT.maxStage + 1).toString(36)}`),
    "装着の番号が持ち物にない": withGloves("0.2.5", "1.4.1"),
    "上限をこえる": withGloves("0.m.", Array.from({ length: 21 }, () => "1.4.1").join(",")),
    "次の番号が持ち物以下": withGloves("0.1.", "1.4.1"),
    "形がちがう": withGloves("0.2", "1.4.1"),
    "ロックの印が 1 でない": withGloves("0.2.", "1.4.1.2"),
  };
  for (const [name, text] of Object.entries(bad)) assert.equal(decodeSave(text).ok, false, name);
  // グローブが既定の形(持ち物なし・判定 0 回)なら、progress.gloves を持たない。
  assert.equal("gloves" in decodeSave(encodeSave(progressAt(1))).progress, false);
});

test("互換の正解データ(compat_save_v7.json):保存の版 7 の署名なしと署名つきのコードが、読めて決まった結果になる。版 6 の署名つき(TSURI5-dev-6-)も読める", async () => {
  const fixture = JSON.parse(readText("tests/fixtures/compat_save_v7.json"));
  assert.equal(fixture.version, 7);
  for (const c of fixture.cases) {
    // 版 8 で読むと、おもりは払い戻しに、おまもりはおもりになる(D-392)。
    const want = await toV8(c.progress);
    assert.deepEqual(decodeSaveCode(c.code), { ok: true, progress: want }, c.name);
    assert.deepEqual(parseSave(c.code), want, `${c.name}:ブラウザの保存としても読める`);
    assert.match(encodeSaveCode(want), /^TSURI10-/, `${c.name}:書き出しは版 8`);
    assert.deepEqual(decodeSaveCode(encodeSaveCode(want)), { ok: true, progress: want }, `${c.name}:版 8 で往復`);
    assert.deepEqual(await readSaveCode(c.signed, { keys: [CURRENT_KEY] }), { ok: true, progress: want, signed: true, keyId: "dev", warning: null }, c.name);
    assert.match(await signSaveCode(want, CURRENT_KEY), /^TSURI5-dev-10-/, `${c.name}:署名つきの書き出しは版 8`);
    assert.match(c.signed, /^TSURI5-dev-7-/);
  }
  for (const c of fixture.rejected) {
    const r = decodeSaveCode(c.code);
    // 「表にない能力(番号 5)」は、②-5c で能力の表に連鎖(番号 5)を足したので、いまは連鎖のグローブとして読める(D-344)。
    if (c.name.startsWith("表にない能力(番号 5)")) {
      assert.deepEqual(r.ok && r.progress.gloves.items.map((g) => [g.ability, g.rarity]), [["chain", "normal"]], c.name);
      continue;
    }
    assert.deepEqual([r.ok, r.ok ? "" : r.error], [false, c.error], c.name);
  }
  // 版 6 の署名つきのコードは、グローブが空の版 7 として読める(ほかの値は変わらない)。
  for (const c of JSON.parse(readText("tests/fixtures/compat_save_v6.json")).cases) {
    const r = await readSaveCode(c.signed, { keys: [CURRENT_KEY] });
    assert.deepEqual([r.ok, r.ok && r.progress], [true, await toV8(c.progress)], c.name);
    assert.equal(r.ok && "gloves" in r.progress, false);
  }
});

test("セーブコードの増え:グローブ 20 個(全部レジェンド・グレード 2 けた・ロックつき)でも 400 文字以内", () => {
  const p = progressAt(10);
  const base = encodeSaveCode(p).length;
  p.gloves = {
    items: Array.from({ length: 20 }, (_, i) => ({ id: i * 7 + 1, ability: GLOVE_ABILITY_ROWS[i % 5].id, rarity: "legend", grade: 10, locked: true })),
    equipped: 134,
    nextId: 200,
    rolls: 99999,
  };
  const grown = encodeSaveCode(p).length - base;
  assert.ok(grown <= 400, `${grown}`);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p)), { ok: true, progress: p });
  console.log(`グローブ 20 個でのセーブコードの増え:${grown} 文字`);
});
