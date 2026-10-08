// @ts-check
// 遊びの記録の、保存場所と見せ方(D-348・D-350)。
// - 保存場所:ゲームの保存データとは別のキー。本番(PLAY_LOG_KEY)とデバッグ(DEBUG_PLAY_LOG_KEY)で分ける。
//   セーブコードには入れない。ブラウザの設定で使えないときも、エラーで止めない。
// - 記録の器(createPlayLogRecorder):結果を足すのは結果の場面で、書き込みは「戦闘の間でないとき」に 1 回だけ(D-284)。
// - デバッグ画面の節(playLogSection):本番の遊びとデバッグの遊びを並べる。本番は読むだけ(書き換えない)。
// 計算(足し方・集計・コピーの文章)は計算本体の play_log.js。
// JSDoc で型を書き、`npm run typecheck` で確かめる(D-144・D-158)。

import {
  addPlayTime,
  addPulledItems,
  addPulls,
  addToPlayLog,
  emptyPlayLog,
  kindLabel,
  minutesText,
  parsePlayLog,
  percentText,
  perHourText,
  playLogText,
  rateText,
  secondsText,
  stringifyPlayLog,
  summarizePlayLog,
} from "../core/play_log.js";
import { button, el } from "./list_view.js";

export const PLAY_LOG_KEY = "tsuri:playlog";
export const DEBUG_PLAY_LOG_KEY = "tsuri:debug-playlog";

/** @typedef {import("../core/play_log.js").PlayLog} PlayLog */
/** @typedef {{ getItem: (k: string) => string | null, setItem: (k: string, v: string) => void, removeItem: (k: string) => void }} KeyStore */

/** 記録を書く保存場所(?debug ならデバッグの記録)。 @param {{ debug: boolean }} options */
export function playLogKeyFor(options) {
  return options.debug ? DEBUG_PLAY_LOG_KEY : PLAY_LOG_KEY;
}

/** 読む(なければ・壊れていれば空)。 @param {KeyStore | null} store @param {string} key @returns {PlayLog} */
export function loadPlayLog(store, key) {
  try {
    return parsePlayLog(store ? store.getItem(key) : null);
  } catch {
    return emptyPlayLog();
  }
}

/**
 * 記録の器。add で結果を足し(書き込まない)、flush で書く。書いた回数を数える(確かめ用)。
 * @param {KeyStore | null} store @param {string} key
 */
export function createPlayLogRecorder(store, key) {
  let log = loadPlayLog(store, key);
  let dirty = false;
  // 遊んだ時間だけが増えたとき(それだけでは書かない。ほかを書くとき・ページを離れるときに一緒に書く:D-356)。
  let timePending = false;
  let writes = 0;
  /** @type {number | null} */
  let lastDraws = null;
  return {
    /** 結果 1 件を足す(書き込みはしない)。 @param {any} game @param {any} result */
    add(game, result) {
      if (addToPlayLog(log, game, result)) dirty = true;
    },
    /**
     * ガチャを引いた回数を、進み具合の引いた回数の通算(gear.draws)の増え方から数える(書き込みはしない:D-356)。
     * @param {any} game
     */
    observe(game) {
      const draws = game.progress?.gear?.draws;
      if (typeof draws !== "number") return;
      if (lastDraws !== null && draws !== lastDraws && addPulls(log, draws - lastDraws)) dirty = true;
      lastDraws = draws;
    },
    /**
     * ガチャで引いた装備のレア度を数える(引いた直後に呼ぶ。書き込みはしない:D-368)。
     * @param {readonly { rarity: string }[]} items
     */
    pulled(items) {
      if (addPulledItems(log, items)) dirty = true;
    },
    /** 遊んだ時間を足す(書き込みはしない)。 @param {number} ms */
    addTime(ms) {
      addPlayTime(log, ms);
      if (ms > 0) timePending = true;
    },
    /** 書くものがあるか(遊んだ時間だけのときは false)。 */
    dirty: () => dirty,
    /** 足した分を書く。force なら、遊んだ時間だけでも書く(ページを離れるとき)。書いたら true。 @param {boolean} [force] */
    flush(force = false) {
      if (!dirty && !(force && timePending)) return false;
      dirty = false;
      timePending = false;
      try {
        store?.setItem(key, stringifyPlayLog(log));
        writes += 1;
        return true;
      } catch {
        return false;
      }
    },
    /** 記録を空にして書く。 */
    reset() {
      log = emptyPlayLog();
      dirty = false;
      timePending = false;
      try {
        store?.removeItem(key);
      } catch {
        // 消せなくても続ける。
      }
    },
    log: () => log,
    writes: () => writes,
  };
}

/** @typedef {ReturnType<typeof createPlayLogRecorder>} PlayLogRecorder */

/**
 * 画面に出す行(集計から作る。テストで確かめられるように、文字だけ)。
 * @param {PlayLog} log
 */
export function playLogRows(log) {
  const sum = summarizePlayLog(log);
  return {
    sum,
    totals: /** @type {[string, string][]} */ ([
      ["戦闘", `${sum.fights}(勝ち ${sum.wins})`],
      ["勝率", percentText(sum.winRate)],
      ["命中・かすり・ミス", `${sum.hits}・${sum.grazes}・${sum.misses}`],
      ["ミス率", percentText(sum.missRate)],
      ["保険で無効", String(sum.insured)],
      ["合わせ", `${sum.hooks.total} 回(ジャスト ${percentText(sum.hooks.just)}・成功 ${percentText(sum.hooks.good)}・失敗 ${percentText(sum.hooks.fail)})`],
      // 通算(D-356)。
      ["遊んだ時間", minutesText(sum.playSec)],
      ["ガチャ", `${sum.pulls} 回(平均の間隔 ${secondsText(sum.pullGapSec)})`],
      ["ウロコイン", `${sum.coins}(1 分あたり ${rateText(sum.coinsPerMin)})`],
      ["鱗", String(sum.scales)],
      // レア度ごとの個数(D-368)。割合と 1 時間あたり。
      ["引いた装備", `${sum.gear.total} 個(1 時間あたり ${perHourText(sum.gear.perHour)})`],
      ...sum.gear.rows.map((r) => /** @type {[string, string]} */ ([`・${r.name}`, `${r.count}(${percentText(r.share)}・1 時間あたり ${perHourText(r.perHour)})`])),
      ["エピック以上", `1 時間あたり ${perHourText(sum.gear.epicUpPerHour)}(${sum.gear.epicUp} 個)`],
      ["レジェンド", `1 時間あたり ${perHourText(sum.gear.legendPerHour)}`],
      ["釣れるクレート", `釣れた ${sum.gloves.catches} 回・逃した ${sum.gloves.escapes} 回`],
      ["グローブ", sum.gloves.rows.map((r) => `${r.name} ${r.count}`).join("・")],
    ]),
    table: sum.table.map((r) => [kindLabel(r.kind), String(r.s), String(r.fights), String(r.wins), percentText(r.missRate)]),
    recent: sum.recent.map((e) => [
      `g${e.g}`,
      kindLabel(e.kind),
      `s${e.s}`,
      e.won ? "勝" : "逃",
      `${e.hits}/${e.grazes}/${e.misses}`,
      `${(e.ms / 1000).toFixed(1)}秒`,
    ]),
  };
}

/** 表 1 つ。 @param {string[]} head @param {string[][]} rows */
function table(head, rows) {
  const node = el("table", "playlog-table");
  const tr = el("tr", "");
  for (const h of head) tr.append(el("th", "", h));
  node.append(tr);
  for (const r of rows) {
    const row = el("tr", "");
    for (const c of r) row.append(el("td", "", c));
    node.append(row);
  }
  return node;
}

/**
 * 記録 1 つ分の表示(本番またはデバッグ)。
 * @param {string} title @param {PlayLog} log
 * @param {{ version: string, copy: (text: string) => Promise<boolean>, reset?: () => void, say: (text: string, error?: boolean) => void }} opts
 */
function logBlock(title, log, opts) {
  const box = el("div", "playlog-block");
  box.dataset.playlog = title;
  box.append(el("h3", "playlog-title", title));
  const v = playLogRows(log);
  const dl = el("dl", "sheet-list playlog-totals");
  for (const [k, val] of v.totals) dl.append(el("dt", "", k), el("dd", "", val));
  box.append(dl);
  if (v.table.length > 0) {
    box.append(el("p", "playlog-caption", "区分と位置 s ごと"), table(["区分", "s", "挑戦", "勝ち", "ミス率"], v.table));
    box.append(el("p", "playlog-caption", `直近 ${v.recent.length} 戦(新しい順。命中/かすり/ミス)`), table(["g", "区分", "s", "結果", "命中/かすり/ミス", "時間"], v.recent));
  } else {
    box.append(el("p", "screen-empty", "まだ記録がありません"));
  }
  const buttons = el("div", "sheet-buttons playlog-buttons");
  const copy = button("コピー", "secondary-button playlog-copy");
  copy.addEventListener("click", async () => {
    const ok = await opts.copy(playLogText(v.sum, title, opts.version));
    opts.say(ok ? `${title}の記録をコピーしました` : "コピーできませんでした", !ok);
  });
  buttons.append(copy);
  if (opts.reset) {
    const reset = button("リセット", "secondary-button playlog-reset");
    reset.addEventListener("click", () => opts.reset?.());
    buttons.append(reset);
  }
  box.append(buttons);
  return box;
}

/**
 * デバッグ画面の「遊びの記録」の節の中身。本番の遊び(読むだけ)とデバッグの遊びを並べる。
 * @param {HTMLElement} box 節
 * @param {{ main: PlayLog, debug: PlayLog, version: string, resetDebug: () => void, say: (text: string, error?: boolean) => void }} opts
 */
export function fillPlayLogSection(box, opts) {
  const copy = async (/** @type {string} */ text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };
  box.append(
    el("p", "playlog-note", "戦闘が終わるたびに記録します(ゲームの保存データとセーブコードには入りません)。本番の記録は、ここでは読むだけです。"),
    logBlock("本番の遊び", opts.main, { version: opts.version, copy, say: opts.say }),
    logBlock("デバッグの遊び", opts.debug, { version: opts.version, copy, say: opts.say, reset: opts.resetDebug }),
  );
}
