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
 * @typedef {{ kind: "combat", stat: string, op: "add" | "scale" } | { kind: "hook", band: "successMs" | "justMs" }
 *   | { kind: "reward", what: "coins" | "scales" } | { kind: "wait" }} SkillTarget
 */

/**
 * スキルの表の 1 行。
 * @typedef {object} SkillRow
 * @property {string} id 保存に使う名前(あとから変えない。表の並びの番号も、セーブコードに使うので変えない)
 * @property {string} name 画面に出す名前
 * @property {"growth" | "capped"} type 成長型(最大は竿の段階で伸びる)か、頭打ち型(最大 Lv3)
 * @property {SkillTarget} target
 * @property {number} perLevel 1 レベルあたりの効果(target の単位)
 * @property {{ label: string, scale: number, unit: string, sign: "+" | "−" }} display 効果の見せ方
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
    description: "当たりのダメージが増える。",
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
    display: { label: "外したときの回復", scale: 0.01, unit: "%", sign: "−" },
    description: "外したときの魚の回復が減る。Lv3 で回復しない。",
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
 * スキルの効果の見せ方(例:「会心率 +20%」「待ち時間 −30%」)。
 * @param {SkillRow} skill @param {number} level
 */
export function formatSkillEffect(skill, level) {
  const n = Math.round((skillAmount(skill, level) / skill.display.scale) * 1000) / 1000;
  return `${skill.display.label} ${skill.display.sign}${n}${skill.display.unit}`;
}
