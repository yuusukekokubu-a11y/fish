// @ts-check
// スキル(スキルレベル制:D-124・D-125・D-165〜D-168・D-174)。
// - スキルの表(SKILL_ROWS):1 行に id・名前・種類(成長型/頭打ち型)・足す先・レベルごとの効果・一言の説明。
//   既にある戦闘の数値の項目を使うスキルなら、表に 1 行足すだけで、抽選・計算・画面に加わる。
// - 装着中の装備のポイントを、スキルごとに合計してレベルにする。レベル = ポイント ÷ 1 レベルのポイント(切り捨て)。
//   最大レベルで止まり、余りは無駄にする。成長型の最大は竿の段階で伸び、頭打ち型は 3。
// - 効果:戦闘の数値の表(足し算・掛け算)、報酬の倍率(豊漁・目利き)、待ち時間の倍率(俊敏)。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

/**
 * スキルの効果の向け先。
 * - combat:戦闘の数値の表の項目 stat に、op で効かせる("add" はレベル × perLevel を足す、"scale" は 1 − レベル × perLevel を掛ける)。
 * - hook:合わせの輪の帯(successMs か justMs)を、弱い魚と強い魚の両方で広げる。
 * - reward:報酬(coins か scales)を、1 + レベル × perLevel 倍にする。
 * - wait:待ち時間を、1 − レベル × perLevel 倍にする(下限あり)。
 * - trigger:条件発動型(D-184〜D-187)。戦闘の流れの条件(when)を満たした命中にだけ、効果(effect)を足す。
 *   when:"combo"(連撃の段数 1 段ごと)・"firstHit"(合わせ成功のあとの最初の命中)・"just"(ジャストのあとの最初の命中)・
 *   "lowHp"(体力が最大の一定割合以下)・"afterCrit"(クリティカルの次の命中)・"fullHp"(体力が満タンで、戦闘の最初の命中まで:D-192)。
 *   effect:"damage"(ダメージを足す)・"critChance"(会心率を足す)・"damagePct"(ダメージを 1 + n 倍)・
 *   "justMultiplier"(ジャスト倍率を足す)。
 * @typedef {{ kind: "combat", stat: string, op: "add" | "scale" } | { kind: "hook", band: "successMs" | "justMs" }
 *   | { kind: "reward", what: "coins" | "scales" } | { kind: "wait" }
 *   | { kind: "trigger", when: TriggerWhen, effect: TriggerEffect }} SkillTarget
 */

/**
 * スキルの表の 1 行。
 * @typedef {"combo" | "firstHit" | "just" | "lowHp" | "afterCrit" | "fullHp"} TriggerWhen
 * @typedef {"damage" | "critChance" | "damagePct" | "justMultiplier"} TriggerEffect
 */
/**
 * スキルの表の 1 行。
 * @typedef {object} SkillRow
 * @property {string} id 保存に使う名前(あとから変えない。表の並びの番号も、セーブコードに使うので変えない)
 * @property {string} name 画面に出す名前
 * @property {"growth" | "capped"} type 成長型(最大は竿の段階で伸びる)か、頭打ち型(最大 Lv3)
 * @property {SkillTarget} target
 * @property {number} perLevel 1 レベルあたりの効果(target の単位)
 * @property {{ label: string, scale: number, unit: string, sign: "+" | "−", when?: string }} display 効果の見せ方
 *   (when は条件発動型の条件の短い言い方。例:「連続命中 1 段ごとに」)
 * @property {string} description 一言の説明(一文)
 */

/** @type {readonly SkillRow[]} */
export const SKILL_ROWS = Object.freeze([
  {
    id: "power",
    name: "強打",
    type: "growth",
    target: { kind: "combat", stat: "damage", op: "add" },
    perLevel: 2,
    display: { label: "通常ダメージ", scale: 1, unit: "", sign: "+" },
    description: "命中のダメージが増える。",
  },
  {
    id: "crit-rate",
    name: "会心率",
    type: "growth",
    target: { kind: "combat", stat: "critChance", op: "add" },
    perLevel: 0.15,
    display: { label: "会心率", scale: 0.01, unit: "%", sign: "+" },
    description: "クリティカルが出やすくなる。100% を超えると追加クリティカル。",
  },
  {
    id: "crit-power",
    name: "会心威力",
    type: "growth",
    target: { kind: "combat", stat: "critMultiplier", op: "add" },
    perLevel: 0.2,
    display: { label: "クリティカルの倍率", scale: 1, unit: " 倍", sign: "+" },
    description: "クリティカルのダメージが大きくなる。",
  },
  {
    id: "tenacity",
    name: "粘り",
    type: "growth",
    target: { kind: "combat", stat: "timeLimitBonusMs", op: "add" },
    perLevel: 1000,
    display: { label: "制限時間", scale: 1000, unit: " 秒", sign: "+" },
    description: "戦いの制限時間が長くなる。",
  },
  {
    id: "fortune",
    name: "豊漁",
    type: "growth",
    target: { kind: "reward", what: "coins" },
    perLevel: 0.1,
    display: { label: "ウロコイン", scale: 0.01, unit: "%", sign: "+" },
    description: "釣ったときのウロコインが増える。",
  },
  {
    id: "appraisal",
    name: "目利き",
    type: "growth",
    target: { kind: "reward", what: "scales" },
    perLevel: 0.1,
    display: { label: "鱗", scale: 0.01, unit: "%", sign: "+" },
    description: "釣ったときの鱗が増える。",
  },
  {
    id: "agility",
    name: "俊敏",
    type: "capped",
    target: { kind: "wait" },
    perLevel: 0.1,
    display: { label: "待ち時間", scale: 0.01, unit: "%", sign: "−" },
    description: "魚が掛かるまでの待ち時間が短くなる。",
  },
  {
    id: "insight",
    name: "見極め",
    type: "capped",
    target: { kind: "hook", band: "successMs" },
    perLevel: 100,
    display: { label: "合わせの成功帯", scale: 1000, unit: " 秒", sign: "+" },
    description: "合わせの成功帯が広くなる。",
  },
  {
    id: "mastery",
    name: "名人技",
    type: "capped",
    target: { kind: "hook", band: "justMs" },
    perLevel: 40,
    display: { label: "ジャスト帯", scale: 1000, unit: " 秒", sign: "+" },
    description: "ジャスト帯が広くなる。",
  },
  {
    id: "recovery",
    name: "回復の軽減",
    type: "capped",
    target: { kind: "combat", stat: "missHeal", op: "scale" },
    perLevel: 1 / 3,
    display: { label: "ミスしたときの回復", scale: 0.01, unit: "%", sign: "−" },
    description: "ミスしたときの魚の回復が減る。Lv3 で回復しない。",
  },
  // ここから条件発動型(D-184)。番号はセーブコードに使うので、表の末尾に足す(D-188)。
  {
    id: "combo-power",
    name: "連撃・攻",
    type: "growth",
    target: { kind: "trigger", when: "combo", effect: "damage" },
    perLevel: 1,
    display: { label: "ダメージ", scale: 1, unit: "", sign: "+", when: "連続命中 1 段ごとに" },
    description: "続けて命中するほど、ダメージが増える。ミスで途切れる。",
  },
  {
    id: "combo-crit",
    name: "連撃・心",
    type: "growth",
    target: { kind: "trigger", when: "combo", effect: "critChance" },
    perLevel: 0.03,
    display: { label: "会心率", scale: 0.01, unit: "%", sign: "+", when: "連続命中 1 段ごとに" },
    description: "続けて命中するほど、クリティカルが出やすくなる。ミスで途切れる。",
  },
  {
    id: "first-hit",
    name: "先手",
    type: "growth",
    target: { kind: "trigger", when: "firstHit", effect: "damage" },
    perLevel: 4,
    display: { label: "ダメージ", scale: 1, unit: "", sign: "+", when: "合わせ成功のあとの最初の命中で" },
    description: "合わせが成功したあとの最初の命中が強くなる。ヌシ戦は始まりで効く。",
  },
  {
    id: "just-boost",
    name: "ジャスト・ブースト",
    type: "growth",
    target: { kind: "trigger", when: "just", effect: "justMultiplier" },
    perLevel: 0.15,
    display: { label: "ジャスト倍率", scale: 1, unit: "", sign: "+", when: "ジャストのあとの最初の命中で" },
    description: "合わせがジャストのとき、最初の命中の倍率が上がる。",
  },
  {
    id: "finisher",
    name: "とどめ",
    type: "growth",
    target: { kind: "trigger", when: "lowHp", effect: "damagePct" },
    perLevel: 0.15,
    display: { label: "ダメージ", scale: 0.01, unit: "%", sign: "+", when: "魚の体力 25% 以下で" },
    description: "魚の体力が残り少ないとき、ダメージが増える。",
  },
  {
    id: "momentum",
    name: "勢い",
    type: "growth",
    target: { kind: "trigger", when: "afterCrit", effect: "critChance" },
    perLevel: 0.1,
    display: { label: "会心率", scale: 0.01, unit: "%", sign: "+", when: "クリティカルの次の命中で" },
    description: "クリティカルが出たら、次の命中もクリティカルが出やすい。",
  },
  {
    id: "first-strike",
    name: "先制",
    type: "growth",
    target: { kind: "trigger", when: "fullHp", effect: "critChance" },
    perLevel: 0.1,
    display: { label: "会心率", scale: 0.01, unit: "%", sign: "+", when: "戦いの最初の命中で" },
    description: "魚の体力が満タンの最初の命中で、クリティカルが出やすい。",
  },
]);

/**
 * スキルの数値(config.skills)。
 * @typedef {object} SkillConfig
 * @property {number} pointsPerLevel 1 レベルに要るポイント
 * @property {number} growthMaxBase 成長型の最大レベル = growthMaxBase + growthMaxPerStage × 竿の段階
 * @property {number} growthMaxPerStage
 * @property {number} cappedMax 頭打ち型の最大レベル
 * @property {{ min: number, max: number }} pointsBase グレード 1・レアのときのポイントの範囲
 * @property {number} pointsGradeGrowth グレードが 1 上がるごとに、ポイントの範囲が増える割合
 * @property {Record<string, number>} pointsRarityMultiplier レア度ごとのポイントの倍率
 * @property {number} minWaitMs 俊敏で短くしても、待ち時間はこれより短くしない
 * @property {number} comboMax 連撃の最大段数(D-185)
 * @property {number} lowHpRatio 「とどめ」が効く、魚の体力の割合(この割合以下で効く)
 */

/** @param {string} id @param {readonly SkillRow[]} [skills] */
export function skillById(id, skills = SKILL_ROWS) {
  return skills.find((s) => s.id === id);
}

/**
 * スキルの最大レベル(D-167)。成長型は竿の段階で伸び、頭打ち型は固定。
 * @param {SkillRow} skill @param {number} rodStage @param {SkillConfig} config
 */
export function maxLevel(skill, rodStage, config) {
  return skill.type === "capped" ? config.cappedMax : config.growthMaxBase + config.growthMaxPerStage * rodStage;
}

/**
 * ポイントの合計から、レベル(最大で止まる。余りは無駄)。
 * @param {number} points @param {number} max @param {SkillConfig} config
 */
export function levelFor(points, max, config) {
  return Math.max(0, Math.min(max, Math.floor(points / config.pointsPerLevel)));
}

/**
 * 装備 1 個に付くスキルのポイントの範囲(D-168)。レア度とグレードで大きくなる。
 * @param {string} rarityId @param {number} grade @param {SkillConfig} config
 * @returns {{ min: number, max: number }}
 */
export function pointsRange(rarityId, grade, config) {
  const factor = (1 + config.pointsGradeGrowth * (grade - 1)) * (config.pointsRarityMultiplier[rarityId] ?? 1);
  const min = Math.max(1, Math.round(config.pointsBase.min * factor));
  const max = Math.max(min, Math.round(config.pointsBase.max * factor));
  return { min, max };
}

/**
 * 装備 1 個のスキル(スキルの id とポイント)。
 * @typedef {{ id: string, points: number }} ItemSkill
 */

/**
 * スキルごとの状態。
 * @typedef {object} SkillState
 * @property {number} points 装着中の装備のポイントの合計
 * @property {number} level レベル(最大で止まる)
 * @property {number} max 最大レベル
 */

/**
 * 装着中の装備から、スキルごとのポイント・レベル・最大を作る。
 * @param {{ items: { id: number, skills: ItemSkill[] }[], equipped: Record<string, number> }} gear
 * @param {number} rodStage @param {SkillConfig} config @param {readonly SkillRow[]} [skills]
 * @returns {Record<string, SkillState>}
 */
export function skillStates(gear, rodStage, config, skills = SKILL_ROWS) {
  /** @type {Record<string, number>} */
  const points = {};
  const equippedIds = new Set(Object.values(gear.equipped));
  for (const item of gear.items) {
    if (!equippedIds.has(item.id)) continue;
    for (const s of item.skills) points[s.id] = (points[s.id] ?? 0) + s.points;
  }
  /** @type {Record<string, SkillState>} */
  const states = {};
  for (const skill of skills) {
    const max = maxLevel(skill, rodStage, config);
    const p = points[skill.id] ?? 0;
    states[skill.id] = { points: p, level: levelFor(p, max, config), max };
  }
  return states;
}

/**
 * スキルの効果の量(レベル × 1 レベルの効果)。
 * @param {SkillRow} skill @param {number} level
 */
export function skillAmount(skill, level) {
  return skill.perLevel * level;
}

/**
 * 戦闘の数値の表に、スキルの効果を反映する(D-174)。順は 足し算(戦闘の項目・合わせの帯)→ 掛け算(回復の軽減)。
 * 丸めと安全上限は、呼ぶ側の normalizeCombat が行う。
 * @template {Record<string, any>} T
 * @param {T} combat 装備の基本効果を足したあとの表 @param {Record<string, SkillState>} states
 * @param {readonly SkillRow[]} [skills]
 * @returns {T}
 */
export function applySkillsToCombat(combat, states, skills = SKILL_ROWS) {
  /** @type {Record<string, any>} */
  const result = { ...combat };
  const hook = combat.hook
    ? { ...combat.hook, normal: { ...combat.hook.normal }, strong: { ...combat.hook.strong } }
    : undefined;
  if (hook) result.hook = hook;
  /** @type {[SkillRow, number][]} */
  const scales = [];
  for (const skill of skills) {
    const level = states[skill.id]?.level ?? 0;
    if (level === 0) continue;
    const amount = skillAmount(skill, level);
    const t = skill.target;
    if (t.kind === "combat" && t.op === "add") {
      result[t.stat] = (Number.isFinite(result[t.stat]) ? result[t.stat] : 0) + amount;
    } else if (t.kind === "combat" && t.op === "scale") {
      scales.push([skill, amount]);
    } else if (t.kind === "hook" && hook) {
      hook.normal[t.band] += amount;
      hook.strong[t.band] += amount;
    }
  }
  for (const [skill, amount] of scales) {
    const t = /** @type {{ stat: string }} */ (skill.target);
    // 回復の軽減など:1 − 量 を掛ける(0 より小さくしない)。浮動小数の誤差で 0 を少しはみ出さないよう丸める。
    const factor = Math.max(0, Math.round((1 - amount) * 1e9) / 1e9);
    result[t.stat] = (Number.isFinite(result[t.stat]) ? result[t.stat] : 0) * factor;
  }
  return /** @type {T} */ (result);
}

/**
 * 報酬と待ち時間の倍率(豊漁・目利き・俊敏)。スキルがなければ全部 1。
 * @param {Record<string, SkillState>} states @param {readonly SkillRow[]} [skills]
 * @returns {{ coins: number, scales: number, wait: number }}
 */
export function skillRates(states, skills = SKILL_ROWS) {
  const rates = { coins: 1, scales: 1, wait: 1 };
  for (const skill of skills) {
    const level = states[skill.id]?.level ?? 0;
    if (level === 0) continue;
    const amount = skillAmount(skill, level);
    const t = skill.target;
    if (t.kind === "reward") rates[t.what] += amount;
    else if (t.kind === "wait") rates.wait = Math.max(0, rates.wait - amount);
  }
  return rates;
}

/**
 * 待ち時間に俊敏を効かせる。引いた待ち時間に掛け、下限より短くしない。倍率が 1 なら、そのまま(前と同じ)。
 * @param {number} waitMs @param {number} rate @param {number} minWaitMs
 */
export function scaledWait(waitMs, rate, minWaitMs) {
  if (rate >= 1) return waitMs;
  return Math.max(minWaitMs, waitMs * rate);
}

/**
 * 報酬に倍率を掛け、端数は持ち越す(D-175)。倍率が 1 なら、そのまま(前と同じ)。
 * 返り値は { amount: 今回もらう数, carry: 次に持ち越す端数(0 以上 1 未満) }。
 * @param {number} base @param {number} rate @param {number} carry
 */
export function scaledReward(base, rate, carry) {
  if (rate === 1 || base === 0) return { amount: base, carry };
  // 浮動小数の誤差(1.1 × 10 = 11.000000000000002 など)で端数が出ないよう、小さい桁で丸める。
  const exact = Math.round((base * rate + carry) * 1e9) / 1e9;
  const amount = Math.floor(exact);
  return { amount, carry: exact - amount };
}

/**
 * スキルの効果の見せ方(例:「会心率 +20%」「待ち時間 −30%」「連続命中 1 段ごとにダメージ +2(最大 10 段)」)。
 * @param {SkillRow} skill @param {number} level @param {SkillConfig | null} [config] 連撃の最大段数を添えるとき
 */
export function formatSkillEffect(skill, level, config = null) {
  const n = Math.round((skillAmount(skill, level) / skill.display.scale) * 1000) / 1000;
  const text = `${skill.display.label} ${skill.display.sign}${n}${skill.display.unit}`;
  const d = skill.display;
  if (!d.when) return text;
  // 条件発動型:条件の短い言い方を前に付ける。連撃は最大段数も添える(例:「連続命中 1 段ごとにダメージ +2(最大 10 段)」)。
  const t = /** @type {{ when: string }} */ (skill.target);
  const limit = t.when === "combo" && config ? `(最大 ${config.comboMax} 段)` : "";
  return `${d.when}${text}${limit}`;
}

/**
 * 条件発動型の効果の量(D-184)。レベル 0 のスキルは入れない。
 * 返り値は、条件(when)ごとに、効果(effect)の合計。例:{ combo: { damage: 3, critChance: 0.06 }, lowHp: { damagePct: 0.3 } }。
 * 同じ条件と効果のスキルを表に足すと、ここで合わさる(コードを変えずに計算に加わる)。
 * @param {Record<string, SkillState>} states @param {readonly SkillRow[]} [skills]
 * @returns {TriggerTable}
 */
export function triggerAmounts(states, skills = SKILL_ROWS) {
  /** @type {TriggerTable} */
  const table = {};
  for (const skill of skills) {
    const t = skill.target;
    if (t.kind !== "trigger") continue;
    const level = states[skill.id]?.level ?? 0;
    if (level === 0) continue;
    const row = (table[t.when] ??= {});
    row[t.effect] = (row[t.effect] ?? 0) + skillAmount(skill, level);
  }
  return table;
}

/** @typedef {Partial<Record<TriggerWhen, Partial<Record<TriggerEffect, number>>>>} TriggerTable */
