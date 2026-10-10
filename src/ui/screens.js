// @ts-check
// 画面の表と、画面の切り替えの状態(D-152・D-153・D-161)。
// - 画面の表(SCREENS):1 行に id・タイトルと、中身を作る部品(mount)を持つ。ドロワーの目次はこの表から作る。
//   画面を足すときは、表に 1 行足して、中身を作る部品を 1 つ作るだけでよい(DESIGN の手順)。
// - 状態は { drawer: 目次が開いているか, screen: 開いている画面の id か null }。どちらかなら釣りを止める。
// - URL の「#」のあと(#equipment など)で、開いている画面を表す。ブラウザの「戻る」で前の画面に戻れる。
// ここは画面に触らない(テストで確かめられる)。画面の枠は screen_shell.js が作る。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import { mountAreas } from "./area_screen.js";
import { mountCrates } from "./crate_screen.js";
import { mountDebug } from "./debug_screen.js";
import { mountEquipment } from "./equip_screen.js";
import { mountKourin } from "./kourin_screen.js";
import { canAffordRaid } from "../core/kourin.js";
import { inventoryWarning } from "./gear_view.js";
import { mountList } from "./list_view.js";
import { materialsView, statusView } from "./screen_views.js";
import { dexView } from "./dex_view.js";
import { mountSettings } from "./settings.js";
import { mountShop } from "./shop_screen.js";
import { mountSkills } from "./skill_screen.js";

/**
 * 画面 1 つ。mount は、中身を container に作る。ctx は main.js が渡す(ゲームの状態や保存の窓口)。
 * @typedef {object} Screen
 * @property {string} id URL の「#」のあとに使う名前(小文字の英字)
 * @property {string} title 目次と、画面の上のバーに出す名前
 * @property {string} [note] 目次に小さく出す一言(何ができる画面か:D-400)
 * @property {(container: HTMLElement, ctx: any) => void} mount
 * @property {(game: any) => "warn" | "full" | null} [badge] 目次の項目に出す「!」の印(黄:warn・赤:full)(D-216)
 */

/** @type {readonly Screen[]} */
export const SCREENS = Object.freeze([
  { id: "areas", title: "釣り場", note: "釣り場を移る", mount: mountAreas },
  // 魚の図鑑(D-405):釣った数・大きさ・冠。
  { id: "dex", title: "図鑑", note: "釣った魚と大きさの記録", mount: mountList(dexView) },
  // 降臨(D-396):満タンで呼べるときに「!」。
  { id: "kourin", title: "降臨", note: "ウロコパワーを払って挑む", mount: mountKourin, badge: (game) => (canAffordRaid(game.progress, game.content, game.config.kourin) ? "warn" : null) },
  { id: "equipment", title: "装備", note: "付け替え・分解・ロック", mount: mountEquipment, badge: (game) => inventoryWarning(game).level },
  { id: "skills", title: "スキル", note: "装備で育つ力の一覧", mount: mountSkills },
  { id: "crates", title: "クレート", note: "ウロコインで装備を引く", mount: mountCrates },
  { id: "shop", title: "店", note: "餌を買う", mount: mountShop },
  { id: "materials", title: "素材", note: "持っている鱗", mount: mountList(materialsView) },
  { id: "status", title: "ステータス", note: "いまの数値", mount: mountList(statusView) },
  { id: "settings", title: "設定", note: "セーブコード・タイミング補正", mount: mountSettings },
]);

/** デバッグ画面の行。?debug のときだけ、表の最後に足す(D-214)。 @type {Screen} */
export const DEBUG_SCREEN = Object.freeze({ id: "debug", title: "デバッグ", note: "確かめ用", mount: mountDebug });

/**
 * 使う画面の表。?debug のときだけ、デバッグ画面の行を最後に足す(D-214)。
 * @param {boolean} debug @returns {readonly Screen[]}
 */
export function screensFor(debug) {
  return debug ? Object.freeze([...SCREENS, DEBUG_SCREEN]) : SCREENS;
}

/**
 * 目次の項目(表の順)。note は一言(なければ空)。
 * @param {readonly { id: string, title: string, note?: string }[]} screens
 */
export function drawerItems(screens = SCREENS) {
  return screens.map((s) => ({ id: s.id, label: s.title, note: s.note ?? "" }));
}

/**
 * 画面の切り替えの状態。
 * @typedef {object} NavState
 * @property {boolean} drawer 目次が開いているか
 * @property {string | null} screen 開いている全画面の id(メイン画面なら null)
 */

/** @returns {NavState} */
export function initialNav() {
  return { drawer: false, screen: null };
}

/** 目次か全画面が開いていれば、釣りを止める(D-134・D-153)。 @param {NavState} nav */
export function isPaused(nav) {
  return nav.drawer || nav.screen !== null;
}

/** 目次を開く・閉じる。全画面の上では開かない。 @param {NavState} nav @param {boolean} open @returns {NavState} */
export function setDrawer(nav, open) {
  return { drawer: open && nav.screen === null, screen: nav.screen };
}

/** 全画面に移る(目次は閉じる)。 @param {NavState} _nav @param {string | null} screen @returns {NavState} */
export function showScreen(_nav, screen) {
  return { drawer: false, screen };
}

/**
 * URL の「#」のあとから、画面の id を取り出す。表にない名前や空なら null(メイン画面)。
 * @param {string} hash 例:"#equipment" @param {readonly { id: string }[]} screens
 */
export function screenFromHash(hash, screens = SCREENS) {
  const id = hash.replace(/^#/, "");
  return screens.some((s) => s.id === id) ? id : null;
}

/** 画面の id を、URL の「#」の形にする。 @param {string} id */
export function hashFor(id) {
  return `#${id}`;
}
