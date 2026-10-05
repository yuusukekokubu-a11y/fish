// 装備・クレート・ガチャのテスト(②-4a の受け入れ条件 1・2・4・5・7・8・9・10)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { boostedDamage } from "../src/core/combat.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT, defineFish, defineStage, FISH_ROWS, makeContent, STAGE_ROWS } from "../src/core/fish.js";
import {
  challengeBoss,
  createGame,
  currentMarker,
  PHASES,
  refreshCombat,
  tap,
  update,
} from "../src/core/fishing.js";
import {
  applyGear,
  dismantleItem,
  dismantleRarity,
  drawItem,
  effectDiff,
  effectRange,
  emptyGear,
  EQUIP_KIND_ROWS,
  equipItem,
  itemName,
  makeCrates,
  pullBlocker,
  pullCrate,
  RARITY_ROWS,
  refundFor,
  unequipKind,
} from "../src/core/gear.js";
import { ROD_STEPS } from "../src/core/rod.js";
import { progressAt } from "./helpers.js";

const GACHA = DEFAULT_CONFIG.gacha;
const KINDS = EQUIP_KIND_ROWS;
const CRATES = makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG);
const withGear = (extra = {}, gear = {}) => progressAt(5, ROD_STEPS.NONE, { coins: 1e9, gear: { ...emptyGear(), seed: 1234, ...gear }, ...extra });

/** 決まった値の装備を 1 個作る(テスト用)。 */
function itemOf(id, kind, rarity = "normal", grade = 1, value) {
  const range = effectRange(KINDS.find((k) => k.id === kind), RARITY_ROWS.find((r) => r.id === rarity), grade, GACHA.gradeGrowth);
  return { id, kind, rarity, grade, value: value ?? range.min, skills: [] };
}

test("クレートは段階ごとに 1 種類。名前・解放の段階・グレード・価格・排出率を持つ", () => {
  assert.deepEqual(
    CRATES.map((c) => [c.name, c.stage, c.grade, c.price]),
    [
      ["クロダイのクレート", 1, 1, 20],
      ["スズキのクレート", 2, 2, 46],
      ["ブリのクレート", 3, 3, 110],
      ["カツオのクレート", 4, 4, 260],
      ["マグロのクレート", 5, 5, 630],
    ],
  );
  for (const c of CRATES) {
    assert.equal(c.rarities.reduce((s, r) => s + r.rate, 0), 1000, "排出率の合計は 100%");
    assert.deepEqual(c.rarities.map((r) => r.id), ["normal", "rare", "epic", "legend"]);
  }
  const legend = CRATES[0].rarities.at(-1);
  assert.ok(legend.rate >= 10 && legend.rate <= 30, "レジェンドは 1〜3%");
});

test("基本効果:レア度・グレード・種類ごとに範囲の中、段階が上ほど平均が高く、同じレア度でもばらつく", () => {
  for (const kind of KINDS) {
    for (const rarity of RARITY_ROWS) {
      let lastMean = -Infinity;
      for (const crate of CRATES) {
        const range = effectRange(kind, rarity, crate.grade, GACHA.gradeGrowth);
        const values = [];
        // レア度と種類を固定して値だけを見るため、1 種類 1 レア度のクレートで引く。
        const fixed = { ...crate, rarities: [{ ...rarity, rate: 1000 }] };
        for (let i = 0; values.length < 300 && i < 5000; i++) {
          const item = drawItem(77, i, fixed, [kind], GACHA.gradeGrowth);
          assert.equal(item.rarity, rarity.id);
          assert.ok(item.value >= range.min && item.value <= range.max, `${kind.id} ${rarity.id} ${crate.grade}:${item.value}`);
          assert.equal(item.value % kind.step, 0, "刻みの倍数");
          values.push(item.value);
        }
        assert.ok(new Set(values).size >= 2, `${kind.id} ${rarity.id} ${crate.grade}:ばらつきがある`);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        assert.ok(mean > lastMean, `${kind.id} ${rarity.id}:段階 ${crate.grade} の平均が上がる`);
        lastMean = mean;
      }
    }
  }
});

test("装備の名前は、グレードの段階の魚の名前 + 種類", () => {
  assert.equal(itemName(itemOf(1, "line"), DEFAULT_CONTENT), "クロダイの糸");
  assert.equal(itemName(itemOf(2, "reel", "rare", 5), DEFAULT_CONTENT), "マグロのリール");
  assert.equal(itemName(itemOf(3, "lure", "epic", 2), DEFAULT_CONTENT), "スズキのルアー");
});

test("ガチャの再現性:同じ種と引いた回数なら同じ結果。10 連は 10 回分で数える", () => {
  const a = withGear();
  const b = withGear();
  const one = pullCrate(a, CRATES[2], 10, KINDS, GACHA);
  for (let i = 0; i < 10; i++) pullCrate(b, CRATES[2], 1, KINDS, GACHA);
  assert.equal(one.ok, true);
  assert.deepEqual(a.gear, b.gear, "10 連 = 1 回を 10 回");
  assert.equal(a.gear.draws, 10);
  assert.deepEqual(a.gear.items.map((it) => it.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  // 保存して読み込んでも、次は引いた回数の続き(最初の結果を引き直せない)。
  const copy = structuredClone(a);
  const next1 = pullCrate(a, CRATES[2], 1, KINDS, GACHA);
  const next2 = pullCrate(copy, CRATES[2], 1, KINDS, GACHA);
  assert.deepEqual(next1, next2);
  assert.notDeepEqual({ ...next1.items[0], id: 1 }, a.gear.items[0], "11 回目は 1 回目と別の抽選");
  // 種がちがえば、ちがう結果。
  const c = withGear({}, { seed: 99 });
  pullCrate(c, CRATES[2], 10, KINDS, GACHA);
  assert.notDeepEqual(c.gear.items, b.gear.items);
});

test("価格:足りないと引けず何も変わらない。足りれば価格ぶん減る(境界)。10 連は 10 倍", () => {
  const crate = CRATES[0];
  const p = withGear({ coins: crate.price - 1 });
  assert.deepEqual(pullCrate(p, crate, 1, KINDS, GACHA), { ok: false, reason: "coins" });
  assert.equal(p.coins, crate.price - 1);
  assert.equal(p.gear.items.length, 0);
  p.coins = crate.price;
  assert.equal(pullCrate(p, crate, 1, KINDS, GACHA).ok, true);
  assert.equal(p.coins, 0);
  const q = withGear({ coins: crate.price * 10 - 1 });
  assert.equal(pullBlocker(q, crate, 10, GACHA), "coins");
  q.coins += 1;
  assert.equal(pullCrate(q, crate, 10, KINDS, GACHA).ok, true);
  assert.equal(q.coins, 0);
});

test("解放:竿の段階に届かないクレートは引けない。種が決まっていなければ引けない", () => {
  const p = progressAt(2, ROD_STEPS.NONE, { coins: 1e6, gear: { ...emptyGear(), seed: 1 } });
  assert.equal(pullBlocker(p, CRATES[2], 1, GACHA), "locked");
  assert.equal(pullBlocker(p, CRATES[1], 1, GACHA), null);
  assert.equal(pullBlocker(p, CRATES[0], 1, GACHA), null, "古いクレートも引ける");
  const noSeed = progressAt(1, ROD_STEPS.NONE, { coins: 1e6 });
  assert.equal(pullBlocker(noSeed, CRATES[0], 1, GACHA), "seed");
  assert.equal(pullBlocker(p, CRATES[0], 11, GACHA), "count");
  assert.equal(pullBlocker(p, CRATES[0], 0, GACHA), "count");
});

test("持ち物の上限:空きが足りないと引く前に止まり、装備もウロコインも変わらない", () => {
  const p = withGear();
  for (let i = 0; i < GACHA.inventoryMax / 10; i++) assert.equal(pullCrate(p, CRATES[0], 10, KINDS, GACHA).ok, true);
  assert.equal(p.gear.items.length, GACHA.inventoryMax);
  const before = structuredClone(p);
  assert.deepEqual(pullCrate(p, CRATES[0], 1, KINDS, GACHA), { ok: false, reason: "space" });
  assert.deepEqual(p, before);
  // 9 個空いていても、10 連は引けない。1 回は引ける。
  dismantleItem(p, p.gear.items[0].id, CRATES, Number.MAX_SAFE_INTEGER);
  for (let i = 0; i < 8; i++) dismantleItem(p, p.gear.items[0].id, CRATES, Number.MAX_SAFE_INTEGER);
  assert.equal(p.gear.items.length, GACHA.inventoryMax - 9);
  assert.equal(pullBlocker(p, CRATES[0], 10, GACHA), "space");
  assert.equal(pullBlocker(p, CRATES[0], 1, GACHA), null);
});

test("装着:各枠に 1 個ずつ。付け替えると入れ替わり、差(+/−)が出る。外せる", () => {
  const gear = { ...emptyGear(), items: [itemOf(1, "reel", "normal", 1, 2), itemOf(2, "reel", "rare", 1, 3), itemOf(3, "line")] };
  assert.equal(effectDiff(gear, gear.items[0]), 2, "付けていなければ値そのもの");
  assert.equal(equipItem(gear, 1), true);
  assert.equal(equipItem(gear, 3), true);
  assert.deepEqual(gear.equipped, { reel: 1, line: 3 });
  assert.equal(effectDiff(gear, gear.items[1]), 1);
  equipItem(gear, 2);
  assert.deepEqual(gear.equipped, { reel: 2, line: 3 }, "付け替え");
  assert.equal(effectDiff(gear, gear.items[0]), -1);
  assert.equal(equipItem(gear, 99), false);
  assert.equal(unequipKind(gear, "reel"), true);
  assert.equal(unequipKind(gear, "reel"), false);
  assert.deepEqual(gear.equipped, { line: 3 });
});

test("分解:価格の 1 割前後が返り、レア度が高いほど多い。まとめて分解は装着中を除く", () => {
  const refunds = RARITY_ROWS.map((r) => refundFor(itemOf(1, "reel", r.id, 5), CRATES));
  for (let i = 1; i < refunds.length; i++) assert.ok(refunds[i] > refunds[i - 1], `${refunds}`);
  // 排出率で平均すると、価格の 1 割前後。
  const expected = RARITY_ROWS.reduce((s, r) => s + (r.rate / 1000) * r.refundRate, 0);
  assert.ok(expected > 0.07 && expected < 0.13, `${expected}`);
  assert.equal(refundFor(itemOf(1, "reel", "normal", 1), CRATES), 1, "1 より少なくしない");

  const p = withGear({ coins: 0 }, { items: [itemOf(1, "reel"), itemOf(2, "reel"), itemOf(3, "line", "rare"), itemOf(4, "lure")], nextId: 5 });
  equipItem(p.gear, 2);
  const done = dismantleRarity(p, "normal", CRATES, Number.MAX_SAFE_INTEGER);
  assert.equal(done.count, 2);
  assert.deepEqual(p.gear.items.map((it) => it.id), [2, 3], "装着中の 2 は残る");
  assert.equal(p.coins, done.coins);
  // 装着中を 1 個ずつ分解すると、枠も空く(確認は画面が出す)。
  const coins = p.coins;
  const back = dismantleItem(p, 2, CRATES, Number.MAX_SAFE_INTEGER);
  assert.equal(p.coins, coins + back);
  assert.deepEqual(p.gear.equipped, {});
  assert.equal(dismantleItem(p, 2, CRATES, Number.MAX_SAFE_INTEGER), 0, "もうない");
});

/** 強い魚(または ヌシ)と戦う場面まで進める。 */
function untilFight(game) {
  for (let t = 0; t < 600000 && game.phase !== PHASES.MINIGAME; t += 5) {
    update(game, 5);
    if (game.phase === PHASES.BITE && game.cast.kind === "strong" && game.phaseMs >= 1100) tap(game); // ジャストにしない
  }
  assert.equal(game.phase, PHASES.MINIGAME);
  return game;
}

/** 印が当たり範囲の真ん中に来るまで進めて、当てる。 */
function hitOnce(game) {
  for (let i = 0; i < 2000; i++) {
    const z = game.fight.zone;
    if (Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.02) return tap(game);
    update(game, 2);
  }
  throw new Error("当たらない");
}

/** 当たり範囲の外で押して、外す。 */
function missOnce(game) {
  for (let i = 0; i < 2000; i++) {
    const z = game.fight.zone;
    const p = currentMarker(game);
    if (p < z.start - 0.05 || p > z.end + 0.05) return tap(game);
    update(game, 2);
  }
  throw new Error("外せない");
}

const noCrit = { ...DEFAULT_CONFIG.combat, critChance: 0 };

for (const rarity of RARITY_ROWS) {
  test(`効果の反映(${rarity.name}・境界の値):糸は制限時間、リールはダメージ、ルアーは外したあとの次の当たり`, () => {
    for (const grade of [1, 5]) {
      const ranges = Object.fromEntries(KINDS.map((k) => [k.id, effectRange(k, rarity, grade, GACHA.gradeGrowth)]));
      for (const edge of ["min", "max"]) {
        const items = KINDS.map((k, i) => itemOf(i + 1, k.id, rarity.id, grade, ranges[k.id][edge]));
        const gear = { ...emptyGear(), items, equipped: { line: 1, reel: 2, lure: 3 }, nextId: 4 };
        const game = untilFight(createGame(3, { combat: noCrit, progress: progressAt(1, ROD_STEPS.NONE, { gear }) }));
        assert.equal(game.combat.damage, 10 + ranges.reel[edge]);
        assert.equal(game.combat.timeLimitBonusMs, ranges.line[edge]);
        assert.equal(game.fight.timeLimitMs, 8000 + ranges.line[edge], "クロダイ 8 秒 + 糸");
        missOnce(game);
        missOnce(game); // 外し続けても積み上げない
        const hit = hitOnce(game);
        assert.equal(hit.damage, 10 + ranges.reel[edge] + ranges.lure[edge], "次の当たりにルアーが乗る");
        if (game.phase === PHASES.MINIGAME) assert.equal(hitOnce(game).damage, 10 + ranges.reel[edge], "1 回だけ");
      }
    }
  });
}

test("効果はヌシ戦にも効き、外すと元に戻る", () => {
  const gear = { ...emptyGear(), items: [itemOf(1, "reel", "legend", 5, 15), itemOf(2, "line", "normal", 1, 1000)], equipped: { reel: 1, line: 2 }, nextId: 3 };
  const game = createGame(5, { combat: noCrit, progress: progressAt(1, ROD_STEPS.CRAFTED, { gear }) });
  assert.equal(challengeBoss(game), true);
  assert.equal(game.fight.timeLimitMs, 31000);
  assert.equal(hitOnce(game).damage, 25);
  unequipKind(game.progress.gear, "reel");
  refreshCombat(game);
  assert.equal(hitOnce(game).damage, 10);
  const lured = applyGear(noCrit, { ...emptyGear(), items: [itemOf(1, "lure", "normal", 1, 3)], equipped: { lure: 1 } }, KINDS);
  assert.equal(lured.missBonusDamage, 3);
});

test("ダメージの順:通常 → クリティカルの倍率 → ジャストの倍率(四捨五入)→ ルアーを足す", () => {
  const just = { id: "just", damageMultiplier: 1.5, uses: 1 };
  const lure = { id: "lure", damageBonus: 3, uses: 1 };
  assert.equal(boostedDamage(15, [just, lure]), 26, "15 × 1.5 = 22.5 → 23、+3");
  assert.equal(boostedDamage(15, [lure]), 18);
  assert.equal(boostedDamage(15, [just]), 23, "ルアーがなければ前と同じ");
  assert.equal(boostedDamage(15, []), 15);
});

test("装備なし・ガチャを引いても付けなければ、結果は前と同じ(魚の並びもガチャ・分解・装着で変わらない)", () => {
  const play = (seed, ops) => {
    const game = createGame(seed, { progress: withGear({ coins: 100000 }) });
    const crates = makeCrates(game.content, game.config);
    for (let t = 0; t < 400000; t += 16) {
      if (t % 20000 === 0) ops(game, crates);
      update(game, 16);
      if (game.phase === PHASES.BITE && game.phaseMs >= 1000) tap(game);
      else if (game.phase === PHASES.MINIGAME && game.phaseMs % 300 < 16) tap(game);
      else if (game.phase === PHASES.RESTING) tap(game);
    }
    return game;
  };
  const casts = (g) => g.results.map((r) => r.fishId);
  const plain = play(8, () => {});
  const pulled = play(8, (g, crates) => {
    pullCrate(g.progress, crates[0], 1, KINDS, GACHA);
    if (g.progress.gear.items.length > 3) dismantleItem(g.progress, g.progress.gear.items[0].id, crates, Number.MAX_SAFE_INTEGER);
  });
  // 引いて分解しても(付けなければ)、ウロコイン以外の結果は同じ。
  assert.deepEqual(pulled.results, plain.results);
  const equipped = play(8, (g, crates) => {
    const r = pullCrate(g.progress, crates[4], 1, KINDS, GACHA);
    if (r.ok) equipItem(g.progress.gear, r.items[0].id);
    refreshCombat(g);
  });
  // 装備を付けると戦いは変わるが、待ち時間と魚の並び(投げた順)は同じ。
  const order = (g) => g.results.map((r) => [r.fishId]).slice(0, 25);
  assert.deepEqual(order(equipped), order(plain));
  assert.ok(casts(plain).length > 25);
});

test("データ駆動:段階 6 を足すとクレートが自動で増え、価格・グレード・排出率が数式と表から作られる", () => {
  const fish = [
    ...FISH_ROWS,
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
  const stages = [...STAGE_ROWS, { stage: 6, craft: { scale: "kanpachi", count: 2 }, boss: "nushi-kanpachi", evolve: { count: 1 } }];
  const content = makeContent(fish.map(defineFish), stages.map(defineStage));
  const crates = makeCrates(content, DEFAULT_CONFIG);
  assert.equal(crates.length, 6);
  const six = crates[5];
  assert.deepEqual([six.name, six.stage, six.grade], ["カンパチのクレート", 6, 6]);
  assert.ok(six.price > crates[4].price);
  assert.deepEqual(six.rarities, crates[0].rarities);
  const p = progressAt(6, ROD_STEPS.NONE, { coins: 1e9, gear: { ...emptyGear(), seed: 5 } });
  const r = pullCrate(p, six, 10, content.equipKinds, GACHA);
  assert.equal(r.ok, true);
  assert.ok(r.items.every((it) => it.grade === 6));
  assert.ok(r.items.map((it) => itemName(it, content)).some((n) => n.startsWith("カンパチの")));
});

test("データ駆動:既にある戦闘の数値を使う種類を表に 1 行足すと、抽選に加わり、戦闘に効く", () => {
  const rod = {
    id: "rod-tip",
    name: "穂先",
    stat: "critChance",
    base: { min: 0.05, max: 0.1 },
    step: 0.01,
    display: { label: "クリティカルの確率", scale: 0.01, unit: "%" },
  };
  const kinds = [...EQUIP_KIND_ROWS, rod];
  const content = makeContent(undefined, undefined, kinds);
  const crates = makeCrates(content, DEFAULT_CONFIG);
  const p = progressAt(1, ROD_STEPS.NONE, { coins: 1e9, gear: { ...emptyGear(), seed: 3 } });
  for (let i = 0; i < 5; i++) pullCrate(p, crates[0], 10, kinds, GACHA);
  const tip = p.gear.items.find((it) => it.kind === "rod-tip");
  assert.ok(tip, "抽選に加わる");
  equipItem(p.gear, tip.id);
  const game = createGame(1, { content, combat: { ...DEFAULT_CONFIG.combat, critChance: 0 }, progress: p });
  assert.ok(Math.abs(game.combat.critChance - tip.value) < 1e-9, "戦闘の数値の表に足される");
});
