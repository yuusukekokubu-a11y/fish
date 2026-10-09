// @ts-check
// 降臨の画面の文字(D-396・D-397)。画面に触らない(テストで確かめられる)。画面の部品は kourin_screen.js。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { activeCharm, CHARM_ROWS, charmValue } from "../core/charms.js";
import { canChallengeRaid } from "../core/fishing.js";
import { percentText } from "../core/gear.js";
import { canSummon, fullGauge, KOURIN_ROWS, kourinById, kourinOf, kourinUnlocked, planDonation, raidLevel, raidMinigame } from "../core/kourin.js";
import { formatCount } from "./format.js";

/** くせの短い説明(キャラの行の quirk)。 */
export const QUIRK_TEXT = Object.freeze({ fast: "印が速い", wall: "防御の壁", regen: "自動回復", short: "制限時間が短い" });

/** お守りの効果の書き方(id ごと)。 */
const CHARM_EFFECT_TEXT = Object.freeze({
  shizume: (/** @type {string} */ p) => `印の速さ −${p}%`,
  toki: (/** @type {string} */ p) => `制限時間 +${p}%(ヌシ戦・降臨)`,
  yaburi: (/** @type {string} */ p) => `ダメージ +${p}%(ヌシ戦・降臨)`,
  yawaragi: (/** @type {string} */ p) => `くせ −${p}%(ヌシ戦・降臨)`,
});

/**
 * お守りの効果の文(例:「印の速さ −11.8%」)。
 * @param {string} id @param {number} value
 */
export function charmEffectText(id, value) {
  const f = CHARM_EFFECT_TEXT[/** @type {keyof typeof CHARM_EFFECT_TEXT} */ (id)];
  return f ? f(percentText(value)) : "";
}

/** 1 点 = unit の量を、点の文字にする(端数は切り捨て)。 @param {number} units @param {number} unit */
function points(units, unit) {
  return formatCount(Math.floor(units / unit));
}

/**
 * 降臨の画面の中身。
 * @param {any} game
 */
export function kourinView(game) {
  const { progress, content, config } = game;
  const c = config.kourin;
  const k = kourinOf(progress);
  const unlocked = kourinUnlocked(progress, content);
  const full = fullGauge(c);
  const plan = planDonation(progress, content, c);
  const summonable = canSummon(progress, content, c);
  const raid = k.raid;
  const raidRow = raid ? kourinById(raid.char) : undefined;
  const bag = progress.charms;
  const worn = activeCharm(bag, c.charmK);
  return {
    unlocked,
    lockedText: "港を越えると(磯に入ると)、降臨を呼べるようになります",
    gauge: {
      ratio: Math.min(1, k.gauge / full),
      text: `ゲージ ${points(k.gauge, c.unit)} / ${formatCount(c.full)} 点`,
      scaleText: `鱗から ${points(k.fromScales, c.unit)} / ${formatCount(c.scaleCap)} 点`,
      note: `釣り上げ +${c.weakPoints}・強い魚とヌシ +${c.strongPoints}。満タンで 1 体を呼べます`,
    },
    donate: {
      label: plan.scales > 0 ? `余りの鱗を納める(${formatCount(plan.scales)} 枚で +${points(plan.units, c.unit)} 点)` : "納められる鱗はありません",
      disabled: !unlocked || plan.scales === 0,
      note: "強い魚の鱗の余りだけ(今の段階は製作に要る分を残す)。古い段階ほど点が低い",
    },
    raid:
      raid && raidRow
        ? (() => {
            const level = raidLevel(k, raidRow.id);
            const maxHp = raidMinigame(raidRow, level, config).hp;
            const challenge = canChallengeRaid(game);
            return {
              id: raidRow.id,
              name: `降臨・${raidRow.name}`,
              level,
              ratio: raid.hp / maxHp,
              hpText: `残り ${formatCount(raid.hp)} / ${formatCount(maxHp)}`,
              stepsText: `報酬 ${raid.paid} / ${c.steps}`,
              triesText: `挑戦 ${formatCount(raid.tries)} 回`,
              canChallenge: challenge,
              note: challenge ? "何回でも無料で挑めます。待っていた魚は、戦いのあとに続きから" : "投げる・待つの間だけ挑めます",
            };
          })()
        : null,
    chars: KOURIN_ROWS.map((row) => {
      const level = raidLevel(k, row.id);
      const charm = CHARM_ROWS.find((x) => x.id === row.charm);
      return {
        id: row.id,
        name: row.name,
        levelText: `Lv${level}`,
        quirkText: QUIRK_TEXT[/** @type {keyof typeof QUIRK_TEXT} */ (row.quirk)] ?? row.quirk,
        charmText: `倒すと ${charm?.name ?? row.charm}`,
        clearedText: (k.cleared[row.id] ?? 0) > 0 ? `Lv${k.cleared[row.id]} まで討伐` : "まだ討伐していない",
        canSummon: summonable,
        current: raid?.char === row.id,
      };
    }),
    charms: CHARM_ROWS.filter((row) => (bag?.levels[row.id] ?? 0) > 0).map((row) => {
      const level = /** @type {number} */ (bag?.levels[row.id]);
      return {
        id: row.id,
        name: row.name,
        levelText: `Lv${level}`,
        effectText: charmEffectText(row.id, charmValue(row, level, c.charmK)),
        equipped: worn?.id === row.id,
      };
    }),
  };
}
