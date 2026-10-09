// @ts-check
// グローブ(特殊枠:D-332〜D-335)。釣れるクレートからだけ出る、ルールを変える能力を 1 つ持つ装備。
// - 能力の表(GLOVE_ABILITY_ROWS)とレア度の表(GLOVE_RARITY_ROWS)は、保存に表の番号を書くので、行は並べ替えず、足すのは最後に。
// - 効果の大きさはレア度で固定(ばらつきなし)。対応段階は「グレード + レア度の延長」まで。それより上の魚・ヌシには効かない。
// - 分解するとグローブの欠片 1 個。欠片を config.glove.fragmentsPerCrate 個(5 個)集めると、グローブのクレートを 1 回開けられる(D-410)。
// - 乱数は、グローブ用の系統(ガチャの種と、釣れるクレートの判定の回数から作る。欠片のクレートは、別の塩と次の個体の番号から)。魚・ミニゲーム・クリティカル・ガチャの系統とは混ぜない。
//   投ごとに 1 回、判定の乱数を引く(条件を満たさなくても引く)。手に入ったときは、同じ回の乱数の続きでレア度 → 能力を決める。
// 画面に関係しない計算だけを置く。JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { drawSeed, RARITY_ROWS } from "./gear.js";
import { createRng } from "./rng.js";

/**
 * グローブのレア度の行。
 * @typedef {object} GloveRarity
 * @property {string} id
 * @property {string} name
 * @property {string} color 画面の色(装備のレア度と同じ)
 * @property {number} rate 排出率(千分率)
 * @property {number} extend 対応段階の延長(グレードに足す)
 */

/**
 * 能力の行。values はレア度の id ごとの効果の値(出てよいレア度だけ持つ)。
 * @typedef {object} GloveAbility
 * @property {string} id
 * @property {string} name
 * @property {string} text 一文の説明
 * @property {"hook" | "fight"} target 効く場所(合わせ・体力制の戦闘)
 * @property {Readonly<Record<string, any>>} values
 * @property {number} weight 抽選の重み
 * @property {(value: any) => string} format 効果の大きさの文
 */

/**
 * グローブ 1 個。ロック中のときだけ locked: true を持つ。
 * @typedef {{ id: number, ability: string, rarity: string, grade: number, locked?: true }} Glove
 */

/**
 * グローブの持ち物(保存する)。rolls は釣れるクレートの判定の回数(グローブ用の系統で、次に使う番号)。
 * fragments はグローブの欠片の数(D-410。なければ 0)。
 * @typedef {{ items: Glove[], equipped: number | null, nextId: number, rolls: number, fragments?: number }} GloveBag
 */

const colorOf = (/** @type {string} */ id) => RARITY_ROWS.find((r) => r.id === id)?.color ?? "#ffffff";

/** @type {readonly GloveRarity[]} */
export const GLOVE_RARITY_ROWS = Object.freeze([
  { id: "normal", name: "ノーマル", color: colorOf("normal"), rate: 500, extend: 0 },
  { id: "rare", name: "レア", color: colorOf("rare"), rate: 300, extend: 1 },
  { id: "epic", name: "エピック", color: colorOf("epic"), rate: 150, extend: 2 },
  { id: "legend", name: "レジェンド", color: colorOf("legend"), rate: 50, extend: 3 },
]);

const pct = (/** @type {number} */ x) => `${Math.round(x * 1000) / 10}%`;

/** @type {readonly GloveAbility[]} */
export const GLOVE_ABILITY_ROWS = Object.freeze([
  {
    id: "auto-hook",
    name: "自動合わせ",
    text: "輪が成功帯に入った瞬間に、自動で合わせが成功する(ジャストは出ない。付けている間は釣れるクレートが出ない)",
    target: "hook",
    values: Object.freeze({ legend: 1 }),
    weight: 1,
    format: () => "合わせが自動で成功",
  },
  {
    id: "retry",
    name: "仕切り直し",
    text: "合わせに失敗しても、ストックを 1 つ使って輪をやり直す。魚を 10 匹釣るごとにストックが 1 増える",
    target: "hook",
    values: Object.freeze({ normal: 1, rare: 2, epic: 3, legend: 4 }),
    weight: 1,
    format: (v) => `ストック ${v}`,
  },
  {
    id: "insurance",
    name: "保険",
    text: "戦闘のミスを、戦闘ごとに決まった回数まで無効にする(回復も連撃のリセットも起きない)",
    target: "fight",
    values: Object.freeze({ normal: 1, rare: 1, epic: 2, legend: 3 }),
    weight: 1,
    format: (v) => `戦闘ごとに ${v} 回`,
  },
  {
    id: "graze",
    name: "かすり",
    text: "命中範囲のすぐ外のタップが「かすり」になり、少しダメージが入る(命中には数えない)",
    target: "fight",
    values: Object.freeze({
      normal: Object.freeze({ outer: 0.1, damage: 0.3 }),
      rare: Object.freeze({ outer: 0.15, damage: 0.4 }),
      epic: Object.freeze({ outer: 0.2, damage: 0.5 }),
      legend: Object.freeze({ outer: 0.3, damage: 0.6 }),
    }),
    weight: 1,
    format: (v) => `外側 +${pct(v.outer)}・ダメージ ${pct(v.damage)}`,
  },
  {
    id: "combo-keep",
    name: "連撃の維持",
    text: "ミスしても、連撃の段数が一部残る",
    target: "fight",
    values: Object.freeze({ normal: 0.5, rare: 0.6, epic: 0.75, legend: 0.9 }),
    weight: 1,
    format: (v) => `段数の ${pct(v)} が残る`,
  },
  // ②-5c の 5 個(D-340)。
  {
    id: "chain",
    name: "連鎖",
    text: "連撃の段数が増えるほど、命中範囲が広がる(連撃が切れると戻る)",
    target: "fight",
    values: Object.freeze({ normal: 0.01, rare: 0.015, epic: 0.02, legend: 0.03 }),
    weight: 1,
    format: (v) => `1 段ごとに +${pct(v)}(最大 +${pct(v * 10)})`,
  },
  {
    id: "combo-accel",
    name: "連撃加速",
    text: "命中のたびに、決まった回数ごとに、連撃の段数が追加で 1 上がる(最大の段数はこえない)",
    target: "fight",
    // [分子, 分母]:命中 n 回のうち、分子 回で +1 段(乱数なし)。
    values: Object.freeze({ normal: Object.freeze([1, 3]), rare: Object.freeze([1, 2]), epic: Object.freeze([2, 3]), legend: Object.freeze([1, 1]) }),
    weight: 1,
    format: (v) => (v[0] === v[1] ? "毎回 +1 段" : `${v[1]} 回に ${v[0]} 回 +1 段`),
  },
  {
    id: "core-master",
    name: "芯の達人",
    text: "芯の帯が広がる(芯のスキルを付けているときだけ効く)",
    target: "fight",
    values: Object.freeze({ normal: 0.05, rare: 0.08, epic: 0.12, legend: 0.18 }),
    weight: 1,
    format: (v) => `芯の帯 +${Math.round(v * 100)} ポイント`,
  },
  {
    id: "edge-master",
    name: "縁の達人",
    text: "縁の帯が広がる(縁のスキルを付けているときだけ効く)",
    target: "fight",
    values: Object.freeze({ normal: 0.04, rare: 0.06, epic: 0.09, legend: 0.14 }),
    weight: 1,
    format: (v) => `縁の帯 +${Math.round(v * 100)} ポイント`,
  },
  {
    id: "tailwind",
    name: "追い風",
    text: "命中するたびに、制限時間が少し延びる(戦闘ごとに上限あり)",
    target: "fight",
    // 命中 1 回で延びるミリ秒。
    values: Object.freeze({ normal: 200, rare: 300, epic: 400, legend: 600 }),
    weight: 1,
    format: (v) => `命中ごとに +${v / 1000} 秒(戦闘ごとに +3 秒まで)`,
  },
]);

/** 釣れるクレートの判定の種を、ガチャの種とずらすための数。 */
const GLOVE_SEED_SALT = 0x5be0cd19;
/** 欠片のクレートの種を、釣れるクレートの種とずらすための数(D-410)。 */
const FRAGMENT_SEED_SALT = 0x1f83d9ab;

/** 空のグローブの持ち物。 @returns {GloveBag} */
export function emptyGloves() {
  return { items: [], equipped: null, nextId: 1, rolls: 0 };
}

/** 複製する。 @param {GloveBag} bag @returns {GloveBag} */
export function copyGloves(bag) {
  const out = { items: bag.items.map((g) => ({ ...g })), equipped: bag.equipped, nextId: bag.nextId, rolls: bag.rolls };
  return (bag.fragments ?? 0) > 0 ? { ...out, fragments: bag.fragments } : out;
}

/** 既定の形(持ち物なし・装着なし・番号 1・判定 0 回・欠片 0)か。保存では、既定のときは progress.gloves を持たない。 @param {GloveBag} bag */
export function isEmptyGloves(bag) {
  return bag.items.length === 0 && bag.equipped === null && bag.nextId === 1 && bag.rolls === 0 && (bag.fragments ?? 0) === 0;
}

/** @param {string} id @param {readonly GloveAbility[]} [rows] */
export function abilityById(id, rows = GLOVE_ABILITY_ROWS) {
  return rows.find((a) => a.id === id);
}

/** @param {string} id @param {readonly GloveRarity[]} [rows] */
export function gloveRarityById(id, rows = GLOVE_RARITY_ROWS) {
  return rows.find((r) => r.id === id);
}

/** その能力が、そのレア度で出てよいか(自動合わせはレジェンドだけ)。 @param {GloveAbility} ability @param {string} rarityId */
export function abilityAllows(ability, rarityId) {
  return rarityId in ability.values;
}

/** 対応段階の上限(グレード + レア度の延長)。 @param {Glove} glove */
export function coverLimit(glove) {
  return glove.grade + (gloveRarityById(glove.rarity)?.extend ?? 0);
}

/** その段階の魚・ヌシに効くか。 @param {Glove} glove @param {number} stage */
export function gloveCovers(glove, stage) {
  return stage <= coverLimit(glove);
}

/** 効果の値(レア度で固定)。 @param {Glove} glove */
export function gloveValue(glove) {
  return abilityById(glove.ability)?.values[glove.rarity];
}

/** 効果の大きさの文。 @param {Glove} glove */
export function gloveEffectText(glove) {
  const ability = abilityById(glove.ability);
  return ability ? ability.format(gloveValue(glove)) : "";
}

/** 名前(例:「仕切り直しのグローブ」)。 @param {Glove} glove */
export function gloveName(glove) {
  return `${abilityById(glove.ability)?.name ?? glove.ability}のグローブ`;
}

/** 装着中のグローブ(なければ null)。 @param {GloveBag | undefined} bag @returns {Glove | null} */
export function equippedGlove(bag) {
  if (!bag || bag.equipped === null) return null;
  return bag.items.find((g) => g.id === bag.equipped) ?? null;
}

/** 釣れるクレートの判定 index 回目の乱数(グローブ用の系統)。 @param {number} seed @param {number} index */
export function crateRng(seed, index) {
  return createRng(drawSeed((seed ^ GLOVE_SEED_SALT) >>> 0, index));
}

/**
 * グローブを抽選する(レア度 → 能力)。rng は、判定の乱数を引いたあとの続き。
 * @param {() => number} rng @param {number} grade
 * @param {readonly GloveAbility[]} [abilities] @param {readonly GloveRarity[]} [rarities]
 * @returns {{ ability: string, rarity: string, grade: number }}
 */
export function drawGlove(rng, grade, abilities = GLOVE_ABILITY_ROWS, rarities = GLOVE_RARITY_ROWS) {
  const r = rng() * 1000;
  let rarity = rarities[rarities.length - 1];
  let acc = 0;
  for (const row of rarities) {
    acc += row.rate;
    if (r < acc) {
      rarity = row;
      break;
    }
  }
  const candidates = abilities.filter((a) => abilityAllows(a, rarity.id));
  const total = candidates.reduce((s, a) => s + a.weight, 0);
  let w = rng() * total;
  let ability = candidates[candidates.length - 1];
  for (const a of candidates) {
    w -= a.weight;
    if (w < 0) {
      ability = a;
      break;
    }
  }
  return { ability: ability.id, rarity: rarity.id, grade };
}

/**
 * 釣れるクレートの判定(D-333)。投ごとに 1 回呼ぶ。乱数は条件を満たさなくても引き、回数を進める。
 * 出るなら { index }(手に入れるときに、同じ回の乱数の続きでグローブを決める)、出ないなら null。
 * conditions は、条件(1)〜(5)を全部満たしているか。chance は出現率。
 * @param {GloveBag} bag @param {number} seed @param {boolean} conditions @param {number} chance
 */
export function rollCrate(bag, seed, conditions, chance) {
  const index = bag.rolls;
  bag.rolls += 1;
  const roll = crateRng(seed, index)();
  return conditions && roll < chance ? { index } : null;
}

/**
 * 釣れるクレートを開けて、グローブを持ち物に足す(合わせが成功したとき)。足したグローブを返す。保管がいっぱいなら null。
 * @param {GloveBag} bag @param {number} seed @param {number} index @param {number} grade @param {number} max
 */
export function openCrate(bag, seed, index, grade, max) {
  if (bag.items.length >= max) return null;
  const rng = crateRng(seed, index);
  rng(); // 判定に使った 1 個目。
  const drawn = drawGlove(rng, grade);
  /** @type {Glove} */
  const glove = { id: bag.nextId, ...drawn };
  bag.nextId += 1;
  bag.items.push(glove);
  return glove;
}

/** 付ける(付け替える)。持ち物にないなら false。 @param {GloveBag} bag @param {number} id */
export function equipGlove(bag, id) {
  if (!bag.items.some((g) => g.id === id)) return false;
  bag.equipped = id;
  return true;
}

/** 外す。 @param {GloveBag} bag */
export function unequipGlove(bag) {
  bag.equipped = null;
}

/**
 * 分解する(D-410)。ロック中は分解しない。装着中なら外す。グローブの欠片が 1 個増える。増えた欠片の数を返す(分解できなければ 0)。
 * @param {GloveBag} bag @param {number} id
 */
export function dismantleGlove(bag, id) {
  const glove = bag.items.find((g) => g.id === id);
  if (!glove || glove.locked) return 0;
  bag.items = bag.items.filter((g) => g.id !== id);
  if (bag.equipped === id) bag.equipped = null;
  bag.fragments = (bag.fragments ?? 0) + 1;
  return 1;
}

/**
 * 欠片のクレートを開けられるか(欠片が need 個以上・保管に空き)。 @param {GloveBag} bag @param {number} need @param {number} max
 */
export function canOpenFragmentCrate(bag, need, max) {
  return (bag.fragments ?? 0) >= need && bag.items.length < max;
}

/**
 * 欠片 need 個で、グローブのクレートを開ける(D-410。グレードは grade = いまの竿の段階)。足したグローブを返す。開けられなければ null。
 * 乱数は、欠片の塩と次の個体の番号から作る(釣れるクレートの判定の系統とは混ぜない)。
 * @param {GloveBag} bag @param {number} seed @param {number} grade @param {number} need @param {number} max
 */
export function openFragmentCrate(bag, seed, grade, need, max) {
  if (!canOpenFragmentCrate(bag, need, max)) return null;
  const rng = createRng(drawSeed((seed ^ FRAGMENT_SEED_SALT) >>> 0, bag.nextId));
  /** @type {Glove} */
  const glove = { id: bag.nextId, ...drawGlove(rng, grade) };
  bag.nextId += 1;
  bag.items.push(glove);
  bag.fragments = (bag.fragments ?? 0) - need;
  return glove;
}

/** ロックを付ける・外す。 @param {GloveBag} bag @param {number} id @param {boolean} locked */
export function setGloveLocked(bag, id, locked) {
  const glove = bag.items.find((g) => g.id === id);
  if (!glove) return false;
  if (locked) glove.locked = true;
  else delete glove.locked;
  return true;
}
