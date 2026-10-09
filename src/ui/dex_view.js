// @ts-check
// 魚の図鑑の画面の中身(D-405)。画面に触らず { header, sections } を返す(描き方は list_view.js の mountList)。
// 釣り場ごとのグループ(いちばん新しい釣り場だけ開く)。行は魚 1 種類:名前と取った冠の印・釣った数。
// まだ釣っていない魚は「???」。押すと、標準の大きさ・最小と最大の cm・冠の 3 つ(取ったか)が出る。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { DEFAULT_CONFIG } from "../core/config.js";
import { dexOf, entryCrowns, sizeCm } from "../core/dex.js";
import { DEFAULT_CONTENT } from "../core/fish.js";
import { groupByArea, stageLabel } from "./area_view.js";
import { formatCount } from "./format.js";

/** 区分の言い方。 */
const KIND_NAMES = /** @type {Record<string, string>} */ ({ weak: "弱い魚", strong: "強い魚", boss: "ヌシ" });

/** 冠の名前と印(色だけでなく文字でも分かるように:D-154)。 */
export const CROWN_TEXT = Object.freeze({ gold: "金冠", silver: "銀冠", mini: "ミニ金冠" });
const CROWN_MARK = Object.freeze({ gold: "金", silver: "銀", mini: "小" });

/**
 * 冠の印の短い文字(例:「〔金〕〔小〕」。金冠を取っていれば銀冠の印は出さない)。
 * @param {{ gold: boolean, silver: boolean, mini: boolean }} crowns
 */
export function crownMarks(crowns) {
  const marks = [];
  if (crowns.gold) marks.push(CROWN_MARK.gold);
  else if (crowns.silver) marks.push(CROWN_MARK.silver);
  if (crowns.mini) marks.push(CROWN_MARK.mini);
  return marks.map((m) => `〔${m}〕`).join("");
}

/**
 * 図鑑の画面の中身。
 * @param {{ game: any }} ctx
 */
export function dexView({ game }) {
  const { progress, content = DEFAULT_CONTENT } = game;
  const c = game.config?.dex ?? DEFAULT_CONFIG.dex;
  const dex = dexOf(progress);
  const fish = [...content.fish].sort((/** @type {any} */ a, /** @type {any} */ b) => a.stage - b.stage);
  let registered = 0;
  let crowns = 0;
  const sections = groupByArea({ progress, content }, fish, (/** @type {any} */ f) => f.stage).map((group) => {
    const rows = group.items.map((/** @type {any} */ f) => {
      const e = dex[f.id];
      const seen = progress.seen.includes(f.id) || Boolean(e);
      if (!seen) return { label: "???", value: "", detail: null };
      registered += 1;
      const got = entryCrowns(e, c);
      crowns += Number(got.gold) + Number(got.silver) + Number(got.mini);
      const marks = crownMarks(got);
      const detail = [
        ["釣れる場所", `${stageLabel(content, f.stage)} の${KIND_NAMES[f.kind] ?? f.kind}`],
        ["標準の大きさ", `${f.cm} cm`],
        ["釣った大きさ", e ? `${sizeCm(f.cm, e.min)} 〜 ${sizeCm(f.cm, e.max)} cm` : "記録なし(これから釣ると記録されます)"],
        ...(["gold", "silver", "mini"].map((k) => [CROWN_TEXT[/** @type {"gold"} */ (k)], got[/** @type {"gold"} */ (k)] ? "取った" : "まだ"])),
      ];
      return { label: marks ? `${f.name} ${marks}` : f.name, value: e ? `${formatCount(e.count)} 匹` : "記録なし", detail };
    });
    return { title: group.title, rows, collapsible: true, open: group.open };
  });
  const total = content.fish.length;
  return {
    header: `登録 ${registered} / ${total} 種類・冠 ${crowns} / ${total * 3}(〔金〕金冠・〔銀〕銀冠・〔小〕ミニ金冠)`,
    sections,
  };
}
