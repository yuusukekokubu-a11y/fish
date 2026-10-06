// テストで共通に使う道具。

import { AREA_ROWS } from "../src/core/areas.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIG as DEFAULT_CONFIG_FOR_TESTS } from "../src/core/config.js";
import { defineFish, FISH_ROWS, makeContent } from "../src/core/fish.js";
import { emptyGear } from "../src/core/gear.js";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function readText(relativePath) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

/** 平均。 */
export function mean(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * 遊ぶ関数を作る。play は時間を stepMs ずつ進める。
 * - hook(game):掛かっている間の毎こまで呼ばれ、true を返すと合わせのタップをする。
 * - fight(game):ミニゲームの毎こまで呼ばれ、true を返すとタップする。
 * - resume:休みになったらタップして再開するか。
 * - actions:{ atMs: 実行する時刻, run(game) } の一覧。その時刻を過ぎたこまで 1 回だけ実行する。
 */
export function makePlayer({ update, tap, PHASES }) {
  return function play(
    game,
    totalMs,
    { stepMs = 16, hook = () => false, fight = () => false, resume = false, actions = [] } = {},
  ) {
    const pending = [...actions].sort((a, b) => a.atMs - b.atMs);
    for (let t = 0; t < totalMs; t += stepMs) {
      update(game, stepMs);
      while (pending.length > 0 && pending[0].atMs <= t) pending.shift().run(game);
      if (game.phase === PHASES.BITE && hook(game)) tap(game);
      else if (game.phase === PHASES.MINIGAME && fight(game)) tap(game);
      else if (game.phase === PHASES.RESTING && resume) tap(game);
    }
    return game;
  };
}

/** 今の魚の輪(普通か強い)。 */
function ringOf(game) {
  return game.cast.kind === "strong" ? game.combat.hook.strong : game.combat.hook.normal;
}

/** 輪がジャスト帯の真ん中あたりに来たら合わせる(16 ミリ秒ずつ進めても、必ずジャスト帯の中で押せる)。 */
export function hookJust(game) {
  const ring = ringOf(game);
  return game.phaseMs >= ring.ringMs - ring.successMs / 2 - 8;
}

/** 輪が成功帯に入った直後(ジャスト帯より前)に合わせる。 */
export function hookGood(game) {
  const ring = ringOf(game);
  return game.phaseMs >= ring.ringMs - ring.successMs + 1;
}

/** 掛かったらすぐタップする(輪が大きいうちなので、必ず早すぎになる)。 */
export const hookMash = () => true;

/** 印が当たり範囲の真ん中付近に来たらタップする遊び方。 */
export function makeAimCenter(currentMarker) {
  return (game) => {
    const z = game.fight.zone;
    return Math.abs(currentMarker(game) - (z.start + z.end) / 2) < 0.02;
  };
}

/** 竿の段階 rodStage・工程 rodStep の、鱗もウロコインもない進み具合(テスト用)。 */
export function progressAt(rodStage, rodStep = "none", extra = {}) {
  return { coins: 0, scales: {}, rodStage, rodStep, seen: [], gear: emptyGear(), ...extra };
}

/**
 * 釣り場を 1 つ足すときに足す行(釣り場の表 1 行と、魚の表 15 行だけ:D-272)。川(g=11〜15)。
 * 名前は D-277 の候補。数値は式から作る(D-225)。
 */
export const RIVER_AREA = Object.freeze({ id: "kawa", name: "川", firstStage: 11, stages: 5, sky: ["#a7c957", "#f2e8cf"], sea: ["#6a994e", "#386641"] });
const RIVER_NAMES = [
  ["oikawa", "オイカワ", "yamame", "ヤマメ"],
  ["funa", "フナ", "ayu", "アユ"],
  ["ugui", "ウグイ", "namazu", "ナマズ"],
  ["nigoi", "ニゴイ", "nijimasu", "ニジマス"],
  ["dojou", "ドジョウ", "itou", "イトウ"],
];
export const RIVER_ROWS = Object.freeze(
  RIVER_NAMES.flatMap(([wid, wname, sid, sname], i) => [
    { id: wid, name: wname, kind: "weak", stage: 11 + i, color: "#fefae0", size: 24 },
    { id: sid, name: sname, kind: "strong", stage: 11 + i, color: "#bc6c25", size: 40 },
    { id: `nushi-${sid}`, name: `ヌシ・${sname}`, kind: "boss", stage: 11 + i, color: "#7f4f24", size: 58 },
  ]),
);

/** 川(g=11〜15)を足した表 1 組。equipKinds・skills を渡すと、それも差し替える。 */
export function riverContent(equipKinds = undefined, skills = undefined) {
  return makeContent([...FISH_ROWS, ...RIVER_ROWS].map((r) => defineFish(r)), undefined, equipKinds, skills, [...AREA_ROWS, RIVER_AREA]);
}

/**
 * 防御のない魚の表(港の魚。数値は式から、防御だけ 0)。スキルの計算の順など、防御と関係のない決まりを確かめるテストで使う。
 */
export const NO_DEFENSE_CONTENT = makeContent(
  FISH_ROWS.map((r) => defineFish(r, { ...DEFAULT_CONFIG_FOR_TESTS.formula, defenseStartStage: Number.MAX_SAFE_INTEGER })),
);

/**
 * 同じ魚(体力・制限時間などはそのまま)で、防御だけ 0 にした表。防御と関係のない決まり(芯・縁の損得、外し得など)を、
 * 防御 100% 以上のヌシ(貫通が要る)でも確かめるときに使う。
 */
export function withoutDefense(content) {
  return makeContent(content.fish.map((f) => (f.minigame ? { ...f, minigame: { ...f.minigame, defense: 0 } } : f)));
}
