// テストで共通に使う道具。

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
 * 段階 6 を足した表(足すのは魚の表の行だけ:名前・区分・段階・見た目。数値は式から:D-225)。
 * 段階 6 の魚:カサゴ(弱い魚)・カンパチ(強い魚)・ヌシ・カンパチ。
 */
export const STAGE6_ROWS = Object.freeze([
  { id: "kasago", name: "カサゴ", kind: "weak", stage: 6, color: "#fefae0", size: 26 },
  { id: "kanpachi", name: "カンパチ", kind: "strong", stage: 6, color: "#bc6c25", size: 46 },
  { id: "nushi-kanpachi", name: "ヌシ・カンパチ", kind: "boss", stage: 6, color: "#7f4f24", size: 62 },
]);

/** 段階 6 を足した表 1 組。equipKinds・skills を渡すと、それも差し替える。 */
export function stage6Content(equipKinds = undefined, skills = undefined) {
  return makeContent([...FISH_ROWS, ...STAGE6_ROWS].map((r) => defineFish(r)), undefined, equipKinds, skills);
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
