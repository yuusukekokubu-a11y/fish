// 素材とステータスの画面の中身を作る部品(D-130・D-152・D-163)。
// 部品は、画面に触らずに { header, sections: [{ title, rows }] } を返す(テストで確かめられる)。描き方は list_view.js。
// 行は { label, value, detail }。detail は押すと出る詳細の [見出し, 中身] の一覧(null なら押せない)。

import { DEFAULT_CONFIG } from "../core/config.js";
import { lureZoneWidth, normalizeCombat } from "../core/combat.js";
import { DEFAULT_CONTENT, FISH_KINDS, scaleName } from "../core/fish.js";
import { rodName, scaleCount, stageRodNames } from "../core/rod.js";
import { formatSkillEffect, SKILL_ROWS } from "../core/skills.js";
import { formatCount } from "./format.js";

const KIND_NAMES = Object.freeze({
  [FISH_KINDS.WEAK]: "弱い魚",
  [FISH_KINDS.STRONG]: "強い魚",
  [FISH_KINDS.BOSS]: "ヌシ",
});

/** 一度でも手に入れた鱗か(釣れた魚の一覧にあるか、鱗の表に名前がある。使って 0 になっても入手済み)。 */
export function hasObtainedScale(progress, id) {
  return progress.seen.includes(id) || Object.hasOwn(progress.scales, id);
}

/** 鱗の使い道の文(段階の表から作る)。 */
function scaleUses(id, content) {
  const uses = [];
  for (const s of content.stages) {
    const names = stageRodNames(s, content);
    if (s.craft.scale === id) uses.push(`${names.craft}の製作に使う(${s.craft.count} 枚)`);
    if (s.evolve.scale === id) uses.push(`${names.evolve}への進化に使う(${s.evolve.count} 枚)`);
  }
  return uses.length > 0 ? uses : ["まだ使い道はない"];
}

/** 素材タブ:魚ごとの鱗(ヌシの鱗を含む)を段階の順に。未入手は「?」で、名前と詳細を隠す。 */
export function materialsView({ game }) {
  const { progress, content = DEFAULT_CONTENT } = game;
  const sections = content.stages.map((s) => {
    const fish = content.fish.filter((f) => f.stage === s.stage && f.reward.scales > 0);
    const rows = fish.map((f) => {
      if (!hasObtainedScale(progress, f.id)) return { label: "?", value: "", detail: null };
      return {
        label: scaleName(f.id, content),
        value: formatCount(scaleCount(progress, f.id)),
        detail: [
          ["入手元", `${f.name}(段階 ${f.stage} の${KIND_NAMES[f.kind]})`],
          ...scaleUses(f.id, content).map((u) => ["使い道", u]),
        ],
      };
    });
    return { title: `段階 ${s.stage}`, rows };
  });
  return { header: null, sections };
}

const percent = (x) => `${Math.round(x * 1000) / 10}%`;
const rate = (x) => `${x >= 1 ? "+" : "−"}${Math.round(Math.abs(x - 1) * 1000) / 10}%`;

/**
 * クリティカルの段の内わけ(D-169)。例:1.2 → 「1 段 80% / 2 段 20%」、0.3 → 「なし 70% / 1 段 30%」。
 * 整数の部分は必ず出る段、残りがもう 1 段の確率。
 */
export function critStageText(chance) {
  const whole = Math.floor(chance);
  const frac = Math.round((chance - whole) * 1000) / 1000;
  const name = (n) => (n === 0 ? "なし" : `${n} 段`);
  if (frac === 0) return `${name(whole)} 100%`;
  return `${name(whole)} ${percent(1 - frac)} / ${name(whole + 1)} ${percent(frac)}`;
}
const times = (x) => `${x} 倍`;
const seconds = (ms) => `${Math.round(ms) / 1000} 秒`;
const signedSeconds = (ms) => `${ms >= 0 ? "+" : "−"}${Math.abs(ms) / 1000} 秒`;

/**
 * ステータスの項目の表(D-152・D-163)。1 行が 1 項目:名前、戦闘の数値の表から値を取る関数、表示の形。
 * グループ(節)に分けて並べる。②-4b のスキルレベルは、節(STATUS_SECTIONS)を 1 つ足して並べる。
 */
const ITEM = Object.freeze({
  damage: { label: "通常ダメージ", value: (c) => c.damage, format: String },
  critChance: { label: "クリティカルの確率", value: (c) => c.critChance, format: percent, extra: (c) => [["段の内わけ", critStageText(c.critChance)]] },
  critMultiplier: { label: "クリティカルの倍率", value: (c) => c.critMultiplier, format: times },
  missHeal: { label: "ミスしたときの回復", value: (c) => c.missHeal, format: String },
  zoneWidth: {
    label: "命中範囲の広さ(ルアー)",
    value: (c) => c.zoneWidthBonus ?? 0,
    format: (n) => `+${n}%`,
    // いまの段階の強い魚とヌシの、命中範囲の幅の変化(例:「マグロ 11% → 17%」:D-191)。
    extra: (c, game) => zoneWidthRows(c, game),
  },
  timeBonus: { label: "制限時間の増減", value: (c) => c.timeLimitBonusMs, format: signedSeconds },
  justMultiplier: { label: "ジャストの倍率", value: (c) => c.hook.justMultiplier, format: times },
  success: { label: "合わせの成功帯(強い魚)", value: (c) => c.hook.strong.successMs, format: seconds },
  just: { label: "ジャスト帯(強い魚)", value: (c) => c.hook.strong.justMs, format: seconds },
  // 報酬と待ち時間の倍率(スキル:豊漁・俊敏)。基本は全部 1。鱗を増やす効果はない(D-211)。
  coins: { label: "ウロコイン", value: (_c, r) => r.coins, format: rate },
  wait: { label: "待ち時間", value: (_c, r) => r.wait, format: rate },
});

export const STATUS_SECTIONS = Object.freeze([
  { title: "戦闘", items: [ITEM.damage, ITEM.critChance, ITEM.critMultiplier, ITEM.missHeal, ITEM.zoneWidth] },
  { title: "時間", items: [ITEM.timeBonus] },
  { title: "合わせ", items: [ITEM.success, ITEM.just, ITEM.justMultiplier] },
  { title: "報酬と待ち時間", items: [ITEM.coins, ITEM.wait] },
]);

const BASE_RATES = Object.freeze({ coins: 1, wait: 1 });

/** 幅(0〜1)を「22%」の形に。 */
const widthText = (x) => `${Math.round(x * 1000) / 10}%`;

/** いまの段階の、ミニゲームのある魚(強い魚とヌシ)の命中範囲の幅の変化。 */
function zoneWidthRows(c, game) {
  const content = game.content ?? DEFAULT_CONTENT;
  const config = game.config ?? DEFAULT_CONFIG;
  const limits = { minZoneWidth: config.minigame.minZoneWidth, maxZoneWidth: config.combatLimits.maxZoneWidth };
  return content.fish
    .filter((f) => f.stage === game.progress.rodStage && f.minigame)
    .map((f) => {
      const w = f.minigame.zoneWidth;
      return [`命中範囲(${f.name})`, `${widthText(w)} → ${widthText(lureZoneWidth(w, c, limits))}`];
    });
}

/**
 * 芯・縁の帯の幅(命中範囲に対する割合と、いまの段階の強い魚の命中範囲での幅:D-209)。
 */
function bandRows(when, config, game) {
  if (when !== "core" && when !== "edge") return [];
  const ratio = when === "core" ? config.coreRatio : 1 - config.edgeRatio;
  const name = when === "core" ? "芯の帯" : "縁の帯";
  const where = when === "core" ? "真ん中" : "両端";
  const rows = [[name, `命中範囲の${where} ${widthText(ratio)}`]];
  const content = game.content ?? DEFAULT_CONTENT;
  const fish = content.fish.find((f) => f.stage === game.progress.rodStage && f.kind === FISH_KINDS.STRONG && f.minigame);
  if (fish) {
    const all = (game.config ?? DEFAULT_CONFIG);
    const w = lureZoneWidth(fish.minigame.zoneWidth, game.combat, { minZoneWidth: all.minigame.minZoneWidth, maxZoneWidth: all.combatLimits.maxZoneWidth });
    rows.push([`${name}(${fish.name})`, `ゲージの ${widthText(w * ratio)}`]);
  }
  return rows;
}

/**
 * 条件つきの効果(条件発動型:D-184・D-191)。「今の値」には含めず、別の節に出す。レベル 0 のものは出さない。
 */
function conditionalRows(game) {
  const skills = game.content?.skills ?? SKILL_ROWS;
  const config = (game.config ?? DEFAULT_CONFIG).skills;
  const rows = skills
    .filter((s) => s.target.kind === "trigger" && (game.skills?.[s.id]?.level ?? 0) > 0)
    .map((s) => {
      const level = game.skills[s.id].level;
      const text = formatSkillEffect(s, level, config);
      return { label: s.name, value: `Lv${level}`, detail: [["条件つき", text], ...bandRows(s.target.when, config, game)] };
    });
  return rows.length > 0 ? rows : [{ label: "なし", value: "", detail: null }];
}

/** 全部の項目(節の順)。 */
export const STATUS_ITEMS = Object.freeze(STATUS_SECTIONS.flatMap((s) => s.items));

/** 装備なしの表(点検・丸め済み)。詳細で「基本の値」として並べる(D-162)。 */
function baseCombat(game) {
  const config = game.config ?? DEFAULT_CONFIG;
  return normalizeCombat(game.baseCombat ?? config.combat, config.combat, config.combatLimits);
}

/**
 * ステータスタブ:上に竿の名前と段階、下に戦闘の数値と報酬の倍率。
 * 今の値は装備とスキルを反映した game.combat・game.rates から、基本の値は装備なしの表から作る(D-179)。
 */
export function statusView({ game }) {
  const content = game.content ?? DEFAULT_CONTENT;
  const base = baseCombat(game);
  const rates = game.rates ?? BASE_RATES;
  return {
    header: `${rodName(game.progress, content)}(段階 ${game.progress.rodStage})`,
    sections: STATUS_SECTIONS.map(({ title, items }) => ({
      title,
      rows: items.map((item) => ({
        label: item.label,
        value: item.format(item.value(game.combat, rates)),
        detail: [
          ["今の値(装備・スキル込み)", item.format(item.value(game.combat, rates))],
          ["基本の値", item.format(item.value(base, BASE_RATES))],
          ...(item.extra ? item.extra(game.combat, game) : []),
        ],
      })),
    })).concat([{ title: "条件つき", rows: conditionalRows(game) }]),
  };
}
