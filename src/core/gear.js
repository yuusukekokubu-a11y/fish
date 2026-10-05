// @ts-check
// 装備・クレート・ガチャ(D-120〜D-123・D-137〜D-143・D-145〜D-149)。
// - 装備の種類とレア度は、下の表(データ)で決まる。種類は「戦闘の数値の表」の項目 1 つに足し算する。
//   既にある項目を使う種類なら、表に 1 行足すだけで抽選に加わり、戦闘に効く。
// - クレートは、魚と段階の表から自動で作る(段階ごとに 1 種類)。価格は段階の稼ぎの数式で決める。
// - ガチャの乱数は、魚とミニゲームの乱数とは別の系統。種と「何回目に引いたか」から作る(D-141)。
// このファイルは JSDoc(コメントで型を書く方法)で型を書き、`npm run typecheck` で確かめる(D-144)。

import { createRng } from "./rng.js";

/**
 * レア度の表の 1 行。
 * @typedef {object} Rarity
 * @property {string} id 保存に使う名前(あとから変えない)
 * @property {string} name 画面に出す名前
 * @property {string} color 画面の色
 * @property {number} rate 排出率(千分率:1000 で 100%)。全部の行の合計は 1000
 * @property {number} multiplier 基本効果の範囲に掛ける倍率
 * @property {number} refundRate 分解したときに返るウロコインの、クレートの価格に対する割合
 */

/**
 * 装備の種類の表の 1 行。
 * @typedef {object} EquipKind
 * @property {string} id 保存に使う名前(装着の枠の名前も兼ねる)
 * @property {string} name 画面に出す名前(例:糸)
 * @property {string} stat 足し算する「戦闘の数値の表」の項目
 * @property {{ min: number, max: number }} base グレード 1・ノーマルのときの基本効果の範囲(stat の単位)
 * @property {number} step 基本効果の刻み(この倍数だけが出る)
 * @property {{ label: string, scale: number, unit: string }} display 画面の見せ方(値 ÷ scale に unit を付ける)
 */

/**
 * 装備 1 個。
 * @typedef {object} Item
 * @property {number} id 個体の番号(1 から。持ち物の中で重ならない)
 * @property {string} kind 種類の id
 * @property {string} rarity レア度の id
 * @property {number} grade グレード(引いたクレートの段階)
 * @property {number} value 基本効果の値(stat の単位の整数)
 * @property {string[]} skills スキル(②-4b で入る。今は空)
 */

/**
 * 進み具合の中の、装備とガチャのまとまり。
 * @typedef {object} Gear
 * @property {Item[]} items 持ち物
 * @property {Record<string, number>} equipped 枠(種類の id)ごとの、装着中の個体の番号
 * @property {number} draws これまでに引いた回数(10 連は 10 回)
 * @property {number | null} seed ガチャの乱数の種(データを作ったときに画面が決める。まだなら null)
 * @property {number} nextId 次に作る個体の番号
 */

/**
 * クレート 1 種類(段階の表から作る)。
 * @typedef {object} Crate
 * @property {string} id
 * @property {string} name 名前(例:クロダイのクレート)
 * @property {number} stage 解放される段階(竿がこの段階になると引ける)
 * @property {number} grade グレード(装備の基本効果の大きさの目安)
 * @property {number} price 1 回の価格(10 連はこの 10 倍:D-138)
 * @property {Rarity[]} rarities レア度と排出率(画面の表示と抽選で同じ表を使う)
 */

/**
 * ガチャの数値(config.gacha)。
 * @typedef {object} GachaConfig
 * @property {number} targetSeconds クレート 1 回分が貯まる目標の時間(秒)
 * @property {number} secondsPerCast 1 回投げて結果が出るまでの平均の時間(秒。測った値)
 * @property {number} gradeGrowth グレードが 1 上がるごとに、基本効果の範囲が増える割合
 * @property {number} inventoryMax 持ち物の上限
 * @property {number} pullMax 1 回に引ける最大の回数(10 連)
 */

/**
 * クレートを作るのに使う、魚と段階の表(fish.js の makeContent の形)。
 * @typedef {object} ContentLike
 * @property {{ id: string, name: string, kind: string, stage: number, reward: { coins: number } }[]} fish
 * @property {{ stage: number, craft: { scale: string } }[]} stages
 * @property {Map<string, { name: string }>} byId
 * @property {number} maxStage
 * @property {EquipKind[]} equipKinds
 */

/**
 * 魚の抽選の設定(config.js の一部)。
 * @typedef {object} FishingConfigLike
 * @property {number} strongChance
 * @property {GachaConfig} gacha
 */

/** @type {readonly Rarity[]} */
export const RARITY_ROWS = Object.freeze([
  { id: "normal", name: "ノーマル", color: "#cfd8dc", rate: 700, multiplier: 1, refundRate: 0.06 },
  { id: "rare", name: "レア", color: "#4fc3f7", rate: 220, multiplier: 1.5, refundRate: 0.12 },
  { id: "epic", name: "エピック", color: "#ce93d8", rate: 65, multiplier: 2.2, refundRate: 0.25 },
  { id: "legend", name: "レジェンド", color: "#ffd54f", rate: 15, multiplier: 3.2, refundRate: 0.5 },
]);

/** @type {readonly EquipKind[]} */
export const EQUIP_KIND_ROWS = Object.freeze([
  {
    id: "line",
    name: "糸",
    stat: "timeLimitBonusMs",
    base: { min: 500, max: 1000 },
    step: 100,
    display: { label: "制限時間", scale: 1000, unit: " 秒" },
  },
  {
    id: "reel",
    name: "リール",
    stat: "damage",
    base: { min: 1, max: 2 },
    step: 1,
    display: { label: "ダメージ", scale: 1, unit: "" },
  },
  {
    id: "lure",
    name: "ルアー",
    stat: "missBonusDamage",
    base: { min: 2, max: 4 },
    step: 1,
    display: { label: "外したあとの次の当たり", scale: 1, unit: "" },
  },
]);

/** 初めて遊ぶときの装備とガチャのまとまり。 @returns {Gear} */
export function emptyGear() {
  return { items: [], equipped: {}, draws: 0, seed: null, nextId: 1 };
}

/** 複製する(呼んだ側のものは変えない)。 @param {Gear} gear @returns {Gear} */
export function copyGear(gear) {
  return {
    items: gear.items.map((it) => ({ ...it, skills: [...it.skills] })),
    equipped: { ...gear.equipped },
    draws: gear.draws,
    seed: gear.seed,
    nextId: gear.nextId,
  };
}

/** @param {string} id @param {readonly Rarity[]} [rarities] */
export function rarityById(id, rarities = RARITY_ROWS) {
  return rarities.find((r) => r.id === id);
}

/** @param {string} id @param {readonly EquipKind[]} kinds */
export function kindById(id, kinds) {
  return kinds.find((k) => k.id === id);
}

/**
 * 数を、上から 2 けたの切りのよい数に丸める(例:19.5 → 20、613 → 610)。1 より小さくしない。
 * @param {number} n
 */
export function niceRound(n) {
  if (!(n > 0)) return 1;
  const digits = Math.floor(Math.log10(n));
  const unit = 10 ** Math.max(0, digits - 1);
  return Math.max(1, Math.round(n / unit) * unit);
}

/**
 * 段階 stage で、1 回投げたときに増えるウロコインの期待値(上手に遊んで全部釣れたとき)。
 * 区分ごとに、段階 stage 以下の魚を抽選の重み(段階ごとに 2 倍:D-046)で平均する。
 * @param {ContentLike} content @param {number} stage @param {number} strongChance
 */
export function coinsPerCast(content, stage, strongChance) {
  /** @param {string} kind */
  const average = (kind) => {
    const list = content.fish.filter((f) => f.kind === kind && f.stage <= stage);
    const weight = list.reduce((sum, f) => sum + 2 ** (f.stage - 1), 0);
    return weight === 0 ? 0 : list.reduce((sum, f) => sum + 2 ** (f.stage - 1) * f.reward.coins, 0) / weight;
  };
  return (1 - strongChance) * average("weak") + strongChance * average("strong");
}

/**
 * クレートの 1 回の価格(D-122・D-146)。
 * 価格 = 段階の毎秒の稼ぎ × 目標の時間。毎秒の稼ぎ = 1 回投げたときの期待値 ÷ 1 回の平均の時間。
 * 魚の表から作るので、段階を足しても手で決め直さずに済む。
 * @param {ContentLike} content @param {number} stage @param {FishingConfigLike} config
 */
export function cratePrice(content, stage, config) {
  const perSecond = coinsPerCast(content, stage, config.strongChance) / config.gacha.secondsPerCast;
  return niceRound(perSecond * config.gacha.targetSeconds);
}

/**
 * クレートの一覧(段階の順)。段階ごとに 1 種類。名前は、その段階の強い魚の名前から。
 * @param {ContentLike} content @param {FishingConfigLike} config @param {readonly Rarity[]} [rarities]
 * @returns {Crate[]}
 */
export function makeCrates(content, config, rarities = RARITY_ROWS) {
  return content.stages.map((s) => ({
    id: `crate-${s.stage}`,
    name: `${content.byId.get(s.craft.scale)?.name ?? `段階 ${s.stage}`}のクレート`,
    stage: s.stage,
    grade: s.stage,
    price: cratePrice(content, s.stage, config),
    rarities: [...rarities],
  }));
}

/**
 * 基本効果の範囲(stat の単位、step の倍数)。グレード 1・ノーマルが表の base で、
 * グレードが 1 上がるごとに gradeGrowth ずつ増え、レア度の倍率を掛ける。
 * @param {EquipKind} kind @param {Rarity} rarity @param {number} grade @param {number} gradeGrowth
 * @returns {{ min: number, max: number }}
 */
export function effectRange(kind, rarity, grade, gradeGrowth) {
  const factor = (1 + gradeGrowth * (grade - 1)) * rarity.multiplier;
  /** @param {number} v */
  const quantize = (v) => Math.max(kind.step, Math.round(v / kind.step) * kind.step);
  const min = quantize(kind.base.min * factor);
  const max = Math.max(min, quantize(kind.base.max * factor));
  return { min, max };
}

/**
 * 「何回目に引いたか」から、その 1 回ぶんの乱数の種を作る(D-141・D-148)。
 * @param {number} seed @param {number} index
 */
export function drawSeed(seed, index) {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * 1 回ぶんの抽選。乱数は 3 回、決まった順に引く:レア度 → 種類(等確率)→ 基本効果の値。
 * @param {number} seed @param {number} index 何回目か(0 から) @param {Crate} crate
 * @param {readonly EquipKind[]} kinds @param {number} gradeGrowth
 * @returns {Omit<Item, "id">}
 */
export function drawItem(seed, index, crate, kinds, gradeGrowth) {
  const rng = createRng(drawSeed(seed, index));
  const r = rng() * 1000;
  let rarity = crate.rarities[crate.rarities.length - 1];
  let acc = 0;
  for (const row of crate.rarities) {
    acc += row.rate;
    if (r < acc) {
      rarity = row;
      break;
    }
  }
  const kind = kinds[Math.min(kinds.length - 1, Math.floor(rng() * kinds.length))];
  const range = effectRange(kind, rarity, crate.grade, gradeGrowth);
  const choices = Math.round((range.max - range.min) / kind.step) + 1;
  const value = range.min + Math.min(choices - 1, Math.floor(rng() * choices)) * kind.step;
  return { kind: kind.id, rarity: rarity.id, grade: crate.grade, value, skills: [] };
}

/**
 * 引けるかどうか。引けるなら null、引けないならその理由。
 * @param {{ coins: number, rodStage: number, gear: Gear }} progress @param {Crate} crate @param {number} count
 * @param {GachaConfig} gacha
 * @returns {null | "count" | "locked" | "seed" | "coins" | "space"}
 */
export function pullBlocker(progress, crate, count, gacha) {
  if (!Number.isSafeInteger(count) || count < 1 || count > gacha.pullMax) return "count";
  if (progress.rodStage < crate.stage) return "locked";
  if (progress.gear.seed === null) return "seed";
  if (progress.coins < crate.price * count) return "coins";
  if (progress.gear.items.length + count > gacha.inventoryMax) return "space";
  return null;
}

/**
 * クレートを count 回引く(1 回か 10 連)。引けないときは何も変えない。
 * 引けたら、価格ぶんのウロコインを減らし、装備を持ち物に足し、引いた回数を進める。
 * @param {{ coins: number, rodStage: number, gear: Gear }} progress @param {Crate} crate @param {number} count
 * @param {readonly EquipKind[]} kinds @param {GachaConfig} gacha
 * @returns {{ ok: true, items: Item[] } | { ok: false, reason: string }}
 */
export function pullCrate(progress, crate, count, kinds, gacha) {
  const blocker = pullBlocker(progress, crate, count, gacha);
  if (blocker) return { ok: false, reason: blocker };
  const gear = progress.gear;
  const seed = /** @type {number} */ (gear.seed);
  /** @type {Item[]} */
  const items = [];
  for (let i = 0; i < count; i++) {
    const drawn = drawItem(seed, gear.draws, crate, kinds, gacha.gradeGrowth);
    const item = { id: gear.nextId, ...drawn };
    gear.nextId += 1;
    gear.draws += 1;
    gear.items.push(item);
    items.push(item);
  }
  progress.coins -= crate.price * count;
  return { ok: true, items };
}

/** 装着中の装備(枠の種類の id)。 @param {Gear} gear @param {string} kindId */
export function equippedItem(gear, kindId) {
  const id = gear.equipped[kindId];
  return id === undefined ? undefined : gear.items.find((it) => it.id === id);
}

/** 装着中か。 @param {Gear} gear @param {number} itemId */
export function isEquipped(gear, itemId) {
  return Object.values(gear.equipped).includes(itemId);
}

/**
 * 装着する。同じ種類の枠に付いていたものは外れる(付け替え)。できたら true。
 * @param {Gear} gear @param {number} itemId
 */
export function equipItem(gear, itemId) {
  const item = gear.items.find((it) => it.id === itemId);
  if (!item) return false;
  gear.equipped[item.kind] = item.id;
  return true;
}

/** 枠から外す。外したら true。 @param {Gear} gear @param {string} kindId */
export function unequipKind(gear, kindId) {
  if (gear.equipped[kindId] === undefined) return false;
  delete gear.equipped[kindId];
  return true;
}

/**
 * いま付けている同じ種類の装備との、基本効果の差(付けていなければ値そのもの)。
 * @param {Gear} gear @param {Item} item
 */
export function effectDiff(gear, item) {
  const current = equippedItem(gear, item.kind);
  return item.value - (current ? current.value : 0);
}

/**
 * 分解で返るウロコイン(D-137・D-149)。その装備のグレードのクレートの価格 × レア度の割合(切り捨て、1 以上)。
 * @param {Item} item @param {Crate[]} crates @param {readonly Rarity[]} [rarities]
 */
export function refundFor(item, crates, rarities = RARITY_ROWS) {
  const crate = crates.find((c) => c.grade === item.grade);
  const rarity = rarityById(item.rarity, rarities);
  if (!crate || !rarity) return 1;
  return Math.max(1, Math.floor(crate.price * rarity.refundRate));
}

/**
 * 1 個分解する(装着中なら外してから)。返ったウロコインの数を返す。なければ 0。
 * 装着中のものを分解する前の確認は、画面が出す。
 * @param {{ coins: number, gear: Gear }} progress @param {number} itemId @param {Crate[]} crates
 * @param {number} coinMax
 */
export function dismantleItem(progress, itemId, crates, coinMax) {
  const gear = progress.gear;
  const index = gear.items.findIndex((it) => it.id === itemId);
  if (index < 0) return 0;
  const [item] = gear.items.splice(index, 1);
  for (const [kind, id] of Object.entries(gear.equipped)) if (id === itemId) delete gear.equipped[kind];
  const refund = refundFor(item, crates);
  progress.coins = Math.min(coinMax, progress.coins + refund);
  return refund;
}

/**
 * レア度を選んで、まとめて分解する。装着中のものは対象にしない。{ count, coins } を返す。
 * @param {{ coins: number, gear: Gear }} progress @param {string} rarityId @param {Crate[]} crates
 * @param {number} coinMax
 */
export function dismantleRarity(progress, rarityId, crates, coinMax) {
  const targets = progress.gear.items.filter((it) => it.rarity === rarityId && !isEquipped(progress.gear, it.id));
  let coins = 0;
  for (const it of targets) coins += dismantleItem(progress, it.id, crates, coinMax);
  return { count: targets.length, coins };
}

/**
 * 装備を反映した戦闘の数値の表(D-145)。基本の表 → 足し算(装着中の装備の基本効果)。
 * 掛け算の効果は ②-4b 以降で、足し算のあとに掛ける。丸めと安全上限は、呼ぶ側の normalizeCombat が行う。
 * @template {Record<string, any>} T
 * @param {T} base @param {Gear} gear @param {readonly EquipKind[]} kinds
 * @returns {T}
 */
export function applyGear(base, gear, kinds) {
  /** @type {Record<string, any>} */
  const result = { ...base };
  for (const kind of kinds) {
    const item = equippedItem(gear, kind.id);
    if (!item) continue;
    result[kind.stat] = (Number.isFinite(result[kind.stat]) ? result[kind.stat] : 0) + item.value;
  }
  return /** @type {T} */ (result);
}

/** 装備の名前(例:クロダイの糸)。グレードの段階の強い魚の名前 + 種類。 @param {Item} item @param {ContentLike} content */
export function itemName(item, content) {
  const stage = content.stages.find((s) => s.stage === item.grade);
  const fish = stage ? content.byId.get(stage.craft.scale) : undefined;
  const kind = kindById(item.kind, content.equipKinds);
  return `${fish ? fish.name : `段階 ${item.grade}`}の${kind ? kind.name : item.kind}`;
}

/** 基本効果の見せ方(例:「制限時間 +1.3 秒」)。 @param {EquipKind} kind @param {number} value */
export function formatEffect(kind, value) {
  const n = Math.round((value / kind.display.scale) * 1000) / 1000;
  return `${kind.display.label} ${n >= 0 ? "+" : "−"}${Math.abs(n)}${kind.display.unit}`;
}
