// 重いテスト:限界の確かめ(段階 100・魚 300 種類:②-4c 土台の条件 4・5、戦闘の調整の条件 8:D-204・D-226・D-233・D-253・D-259)。
// 本番の表は変えず、テストの中で大きな表(synthetic.js)を作る。結果の数字は報告に使う(console.log)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { areaOfStage } from "../../src/core/areas.js";
import { DEFAULT_CONFIG } from "../../src/core/config.js";
import { checkContent, DEFAULT_CONTENT, FISH_KINDS } from "../../src/core/fish.js";
import { createGame, update } from "../../src/core/fishing.js";
import { craftCount, fishCoins, fishDefense, fishHp, fishSweepMs, fishTimeLimitMs, fishZoneWidth, stagePosition } from "../../src/core/formula.js";
import { BASE_KIND_IDS, effectRange, gachaKinds, makeCrates, RARITY_ROWS } from "../../src/core/gear.js";
import { CHARM_ROWS } from "../../src/core/charms.js";
import { KOURIN_ROWS } from "../../src/core/kourin.js";
import { decodeSaveCode, encodeSaveCode, MAX_CODE_LENGTH } from "../../src/core/savecode.js";
import { levelRange, maxLevel, SKILL_ROWS } from "../../src/core/skills.js";
import { GLOVE_ABILITY_ROWS, GLOVE_RARITY_ROWS } from "../../src/core/glove.js";
import { syntheticContent } from "../../src/core/synthetic.js";
import { formatCount } from "../../src/ui/format.js";
import { crateCards, inventoryRows } from "../../src/ui/gear_view.js";
import { materialsView, statusView } from "../../src/ui/screen_views.js";
import { skillRows } from "../../src/ui/skill_view.js";
import { progressAt } from "../helpers.js";
import { policyOf, SKILLED, SLOPPY } from "./policy.js";

/** クレート 1 回分が貯まる目標の時間(秒。D-355 で 15 秒)。上手は 0.5〜1.5 倍、ときどき失敗は 2 倍まで。 */
const T = DEFAULT_CONFIG.gacha.targetSeconds;

const G_MAX = 100;
const BIG = syntheticContent(G_MAX);
const GG = DEFAULT_CONFIG.gacha.gradeGrowth;
const SAFE = Number.MAX_SAFE_INTEGER;

test("段階 100・魚 300 種類の表:形に問題がなく、数字は安全な整数の範囲で、順序どおりに(単調に)伸びる", () => {
  assert.equal(BIG.fish.length, 300);
  assert.equal(BIG.maxStage, G_MAX);
  assert.deepEqual(checkContent(BIG), []);
  const crates = makeCrates(BIG, DEFAULT_CONFIG);
  let prev = null;
  for (let g = 1; g <= G_MAX; g++) {
    const row = {
      weak: fishCoins("weak", g),
      strong: fishCoins("strong", g),
      boss: fishCoins("boss", g),
      hp: fishHp("strong", g),
      time: fishTimeLimitMs("strong", g),
      // ヌシの制限時間と体力も、単調に伸びる(D-380)。
      bossTime: fishTimeLimitMs("boss", g),
      bossHp: fishHp("boss", g),
      price: crates[g - 1].price,
    };
    // 製作の鱗は、釣り場の中の位置で 3・4・4・5・6(釣り場ごとに戻る:D-282)。
    assert.equal(craftCount(g), [3, 4, 4, 5, 6][stagePosition(g) - 1], `g=${g} 製作の鱗`);
    for (const [k, v] of Object.entries(row)) assert.ok(Number.isSafeInteger(v) && v > 0 && v < SAFE, `g=${g} ${k}=${v}`);
    if (prev) for (const k of Object.keys(row)) assert.ok(row[k] >= prev[k], `g=${g} ${k} が下がった:${prev[k]} → ${row[k]}`);
    // 防御は、いまはどの魚も 0(D-380)。
    assert.equal(fishDefense("strong", g) + fishDefense("boss", g), 0, `g=${g} 防御`);
    // 限界:幅 10% 以上、印の速さ 0.45 秒以上。段が進むほど厳しく(同じか)。
    for (const kind of ["strong", "boss"]) {
      assert.ok(fishZoneWidth(kind, g) >= 0.1 && fishSweepMs(kind, g) >= 450, `g=${g} ${kind}`);
      if (g > 1) assert.ok(fishZoneWidth(kind, g) <= fishZoneWidth(kind, g - 1) && fishSweepMs(kind, g) <= fishSweepMs(kind, g - 1));
    }
    // 装備の基本効果とスキルのレベル(グレード g のレジェンドの最大)。
    for (const kind of BIG.equipKinds) {
      const r = effectRange(kind, RARITY_ROWS[3], g, GG);
      assert.ok(Number.isSafeInteger(r.max) && r.max < SAFE, `g=${g} ${kind.id} ${r.max}`);
    }
    assert.ok(levelRange("legend", g, DEFAULT_CONFIG.skills).max <= maxLevel(SKILL_ROWS[0], g, DEFAULT_CONFIG.skills));
    // 表示が崩れない(8 文字以内)。
    for (const v of Object.values(row)) assert.ok(formatCount(v).length <= 8, `${v} → ${formatCount(v)}`);
    prev = row;
  }
  const last = (g) => `ヌシ ${formatCount(fishCoins("boss", g))}・価格 ${formatCount(crates[g - 1].price)}・体力 ${fishHp("strong", g)}/${fishHp("boss", g)}`;
  console.log([1, 5, 10, 25, 50, 100].map((g) => `g=${g}:${last(g)}・製作 ${craftCount(g)}`).join("\n"));
  const top = fishCoins("boss", G_MAX);
  console.log(`安全な整数までの余裕:ヌシ(g=100)のウロコイン ${top} は上限の ${(top / SAFE).toExponential(1)} 倍`);
});

/** 段階 g の平均的な装備(レア・グレード g・値は真ん中・スキルなし)を糸・リール・ルアーに付けた進み具合(D-323)。 */
function geared(g) {
  const rare = RARITY_ROWS[1];
  // 経済の基準は糸・リール・ルアーの 3 枠だけ(おもり・浮き・おまもりは入れない:D-323)。
  const items = BIG.equipKinds.filter((kind) => BASE_KIND_IDS.includes(kind.id)).map((kind, i) => {
    const r = effectRange(kind, rare, g, GG);
    return { id: i + 1, kind: kind.id, rarity: rare.id, grade: g, value: Math.round((r.min + r.max) / 2 / kind.step) * kind.step, skills: [] };
  });
  return progressAt(g, "none", {
    gear: { items, equipped: Object.fromEntries(items.map((it) => [it.kind, it.id])), draws: 0, seed: 1, nextId: items.length + 1 },
  });
}

/** 段階 g で、done(game) が true になるまでの時間(秒)。 */
function secondsUntil(g, done, style, seed, limitMs = 3600000, content = BIG) {
  const game = createGame(seed, { content, progress: geared(g) });
  const policy = policyOf(style, seed);
  for (let t = 16; t <= limitMs; t += 16) {
    update(game, 16);
    policy(game);
    if (done(game)) return t / 1000;
  }
  return Infinity;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const SEEDS = [1, 2, 3, 4, 5];

test("時間:クレート 1 回分は上手で 30〜90 秒(ときどき失敗でも 120 秒以内)、製作までは g=1 と釣り場の最初の段階で約 3〜4 分、全体で 30 分以内(段階 g の平均的な装備で)", () => {
  const crates = makeCrates(BIG, DEFAULT_CONFIG);
  const lines = [];
  const worst = { crate: 0, sloppy: 0, craft: 0 };
  const shown = [1, 2, 3, 4, 5, 6, 10, 11, 25, 26, 50, 96, 100];
  for (let g = 1; g <= G_MAX; g++) {
    const price = crates[g - 1].price;
    const crateSkilled = median(SEEDS.map((s) => secondsUntil(g, (game) => game.progress.coins >= price, SKILLED, s)));
    const crateSloppy = median(SEEDS.map((s) => secondsUntil(g, (game) => game.progress.coins >= price, SLOPPY, s)));
    const strong = BIG.fish.find((f) => f.kind === FISH_KINDS.STRONG && f.stage === g);
    const need = craftCount(g);
    const craft = median(SEEDS.map((s) => secondsUntil(g, (game) => (game.progress.scales[strong.id] ?? 0) >= need, SKILLED, s)));
    worst.crate = Math.max(worst.crate, crateSkilled);
    worst.sloppy = Math.max(worst.sloppy, crateSloppy);
    worst.craft = Math.max(worst.craft, craft);
    if (shown.includes(g)) lines.push(`g=${g}:クレート ${price}(上手 ${crateSkilled.toFixed(0)} 秒・ときどき失敗 ${crateSloppy.toFixed(0)} 秒)、製作 ${need} 枚 ${(craft / 60).toFixed(1)} 分`);
    assert.ok(crateSkilled >= T * 0.5 && crateSkilled <= T * 1.5, `g=${g} クレート 上手 ${crateSkilled} 秒`);
    assert.ok(crateSloppy <= T * 2, `g=${g} クレート ときどき失敗 ${crateSloppy} 秒`);
    assert.ok(craft <= 1800, `g=${g} 製作 ${craft} 秒`);
    if (g === 1) assert.ok(craft >= 120 && craft <= 330, `g=1 の製作 ${craft} 秒(約 3〜5 分)`);
    // 釣り場の最初の段階(g=6・11 …)は、魚のプールが分かれ、鱗も 3 枚からなので、また約 3〜4 分(D-275・D-282)。
    if (g > 1 && g % 5 === 1) assert.ok(craft <= 270, `g=${g}(釣り場の最初)の製作 ${craft} 秒`);
  }
  lines.push(`全ての g(1〜100)で一番長いもの:クレート 上手 ${worst.crate.toFixed(0)} 秒・ときどき失敗 ${worst.sloppy.toFixed(0)} 秒、製作 ${(worst.craft / 60).toFixed(1)} 分`);
  console.log(lines.join("\n"));
});

// 川・沖・外洋・深海の本物の表(D-347・D-377):表のデータだけで足した釣り場でも、時間の条件が成り立つ。
test("川・沖・外洋・深海の本物の表(g=11〜30):クレート 1 回分は上手で 30〜90 秒(ときどき失敗 120 秒以内)、製作は釣り場の最初で約 3〜4 分、全体で 30 分以内", () => {
  const crates = makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG);
  const lines = ["| g | 釣り場 | クレート | 上手(秒) | ときどき失敗(秒) | 製作の鱗 | 製作(分) |", "| --- | --- | --- | --- | --- | --- | --- |"];
  for (let g = 11; g <= 30; g++) {
    const price = crates[g - 1].price;
    const until = (done, style, s) => secondsUntil(g, done, style, s, 3600000, DEFAULT_CONTENT);
    const crateSkilled = median(SEEDS.map((s) => until((game) => game.progress.coins >= price, SKILLED, s)));
    const crateSloppy = median(SEEDS.map((s) => until((game) => game.progress.coins >= price, SLOPPY, s)));
    const strong = DEFAULT_CONTENT.fish.find((f) => f.kind === FISH_KINDS.STRONG && f.stage === g);
    const need = craftCount(g);
    const craft = median(SEEDS.map((s) => until((game) => (game.progress.scales[strong.id] ?? 0) >= need, SKILLED, s)));
    lines.push(`| ${g} | ${areaOfStage(DEFAULT_CONTENT, g).name} | ${formatCount(price)} | ${crateSkilled.toFixed(0)} | ${crateSloppy.toFixed(0)} | ${need} | ${(craft / 60).toFixed(1)} |`);
    assert.ok(crateSkilled >= T * 0.5 && crateSkilled <= T * 1.5, `g=${g} クレート 上手 ${crateSkilled} 秒`);
    assert.ok(crateSloppy <= T * 2, `g=${g} クレート ときどき失敗 ${crateSloppy} 秒`);
    assert.ok(craft <= 1800, `g=${g} 製作 ${craft} 秒`);
    if (g % 5 === 1) assert.ok(craft <= 270, `g=${g}(釣り場の最初)の製作 ${craft} 秒`);
  }
  console.log(lines.join("\n"));
});

/** グローブ 20 個(保管の上限。能力は表の順に使い回す。自動合わせはレジェンドだけ:D-334)。 */
function fullGloves(grade) {
  const items = Array.from({ length: DEFAULT_CONFIG.glove.max }, (_, i) => {
    const ability = GLOVE_ABILITY_ROWS[i % GLOVE_ABILITY_ROWS.length].id;
    return { id: i + 1, ability, rarity: ability === "auto-hook" ? "legend" : GLOVE_RARITY_ROWS[i % 4].id, grade };
  });
  return { items, equipped: 1, nextId: items.length + 1, rolls: 99999 };
}

test("保存とセーブコード:魚 300 種類の鱗を全部・全部釣った・持ち物 300 個(スキル 3 つ)・グローブ 20 個・降臨とお守り(すべて最大)で往復し、上限の長さに収まる", () => {
  // お守りの種類は装備の個体を持たない(D-394)ので、ガチャの種類だけで作る。
  const kinds = gachaKinds(BIG.equipKinds);
  const lv = levelRange("legend", G_MAX, DEFAULT_CONFIG.skills).max;
  const items = Array.from({ length: DEFAULT_CONFIG.gacha.inventoryMax }, (_, i) => {
    const kind = kinds[i % kinds.length];
    return {
      id: i + 1,
      kind: kind.id,
      rarity: "legend",
      grade: G_MAX,
      value: effectRange(kind, RARITY_ROWS[3], G_MAX, GG).max,
      // 頭打ち型は Lv1(D-279)。
      skills: [SKILL_ROWS[i % 18], SKILL_ROWS[(i + 1) % 18], SKILL_ROWS[(i + 2) % 18]].map((s) => ({ id: s.id, level: s.type === "capped" ? 1 : lv })),
    };
  });
  const p = {
    coins: SAFE,
    scales: Object.fromEntries(BIG.fish.map((f, i) => [f.id, SAFE - i])),
    rodStage: G_MAX,
    rodStep: "evolved",
    seen: BIG.fish.map((f) => f.id),
    gear: { items, equipped: { line: 1, reel: 2, lure: 3 }, draws: SAFE, seed: 4294967295, nextId: items.length + 1 },
    gloves: fullGloves(G_MAX),
    // 降臨(版 10:D-403):ウロコパワー・注入した量・倒したレベル・体力・回数は最大(呼んでいないキャラに注入)。
    kourin: {
      power: SAFE,
      fills: Object.fromEntries(KOURIN_ROWS.slice(0, -1).map((r) => [r.id, { total: SAFE, scales: SAFE }])),
      cleared: Object.fromEntries(KOURIN_ROWS.map((r) => [r.id, SAFE])),
      raid: { char: KOURIN_ROWS.at(-1).id, hp: SAFE, tries: SAFE, paid: DEFAULT_CONFIG.kourin.steps - 1 },
    },
    charms: { levels: Object.fromEntries(CHARM_ROWS.map((c) => [c.id, SAFE])), equipped: CHARM_ROWS.at(-1).id },
    // 図鑑(版 11:D-405):全部の魚に記録(数は最大・最小と最大は範囲の両端)。
    dex: Object.fromEntries(BIG.fish.map((f) => [f.id, { count: SAFE, min: 800, max: 1250 }])),
  };
  const code = encodeSaveCode(p, BIG);
  assert.deepEqual(decodeSaveCode(code, BIG), { ok: true, progress: p });
  assert.ok(code.length <= MAX_CODE_LENGTH, `長さ ${code.length}`);
  console.log(`魚 300 種類の鱗を全部(数は最大)・全部釣った・持ち物 300 個(レジェンド・グレード 100・スキル 3 つ)・グローブ 20 個:${code.length} 文字(上限 ${MAX_CODE_LENGTH})`);
  // ふつうの遊びの見込み(D-355):持ち物 300 個(スキル 3 つ)・グローブ 20 個・鱗 20 種類・段階 20。
  const g = 20;
  const lv20 = levelRange("legend", g, DEFAULT_CONFIG.skills).max;
  const scaleFish = BIG.fish.filter((f) => f.reward.scales > 0 && f.stage <= g).slice(0, 20);
  const usual = {
    coins: 10 ** 12,
    scales: Object.fromEntries(scaleFish.map((f) => [f.id, 999])),
    rodStage: g,
    rodStep: "none",
    seen: BIG.fish.filter((f) => f.stage <= g).map((f) => f.id),
    gear: {
      items: items.map((it) => ({ ...it, grade: g, value: effectRange(kinds.find((k) => k.id === it.kind), RARITY_ROWS[3], g, GG).max, skills: it.skills.map((sk) => ({ ...sk, level: Math.min(sk.level, lv20) })) })),
      equipped: { line: 1, reel: 2, lure: 3 },
      draws: 5000,
      seed: 4294967295,
      nextId: items.length + 1,
    },
    gloves: fullGloves(g),
  };
  const usualCode = encodeSaveCode(usual, BIG);
  assert.deepEqual(decodeSaveCode(usualCode, BIG), { ok: true, progress: usual });
  console.log(`持ち物 300 個(スキル 3 つ)・グローブ 20 個・鱗 20 種類(段階 20):${usualCode.length} 文字(上限 ${MAX_CODE_LENGTH})`);
});

test("画面の中身:素材(鱗 200 行)・クレート(100 個)・スキル・ステータス・装備を、段階 100 の表で作れる(崩れの元になる値がない)", () => {
  const p = geared(G_MAX);
  p.scales = Object.fromEntries(BIG.fish.filter((f) => f.reward.scales > 0).map((f) => [f.id, SAFE]));
  p.seen = BIG.fish.map((f) => f.id);
  p.coins = SAFE;
  const game = createGame(1, { content: BIG, progress: p });
  const start = performance.now();
  const materials = materialsView({ game });
  const rows = materials.sections.flatMap((s) => s.rows);
  assert.equal(materials.sections.length, G_MAX / 5, "釣り場ごとのグループ(20)");
  assert.equal(rows.length, 200, "強い魚とヌシの鱗");
  const crates = makeCrates(BIG, DEFAULT_CONFIG);
  const cards = crateCards(game, crates);
  assert.equal(cards.length, G_MAX);
  const status = statusView({ game });
  const skills = skillRows(game);
  const items = inventoryRows(game, crates, "rarity");
  const ms = performance.now() - start;
  const texts = [
    ...rows.flatMap((r) => [r.label, r.value]),
    ...cards.flatMap((c) => [c.name, c.price.one, c.price.ten]),
    ...status.sections.flatMap((s) => s.rows.flatMap((r) => [r.label, r.value])),
    ...skills.flatMap((s) => [s.label, s.effect]),
  ];
  for (const t of texts) assert.ok(typeof t === "string" && !/NaN|undefined|Infinity|e\+/.test(t), `表示:${t}`);
  assert.ok(items.length === 3);
  assert.ok(cards.every((c) => c.price.one.length <= 8 && c.price.ten.length <= 8), "価格は短い表示");
  console.log(`段階 100 の画面の中身(素材 ${rows.length} 行・クレート ${cards.length} 個・ステータス・スキル)を作る時間:${ms.toFixed(1)} ミリ秒`);
});
