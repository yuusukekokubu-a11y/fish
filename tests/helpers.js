// テストで共通に使う道具。

import { AREA_ROWS } from "../src/core/areas.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DEFAULT_CONFIG as DEFAULT_CONFIG_FOR_TESTS } from "../src/core/config.js";
import { DEFAULT_CONTENT as DEFAULT_CONTENT_FOR_TESTS, defineFish, FISH_ROWS, makeContent } from "../src/core/fish.js";
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
 * ②-5d から川は本物の表にあるので、本物の表から取り出す(D-345)。
 */
export const RIVER_AREA = AREA_ROWS.find((a) => a.id === "kawa");
export const RIVER_ROWS = Object.freeze(FISH_ROWS.filter((r) => r.stage >= 11 && r.stage <= 15));

/**
 * 本物の表を、段階 maxStage まで(と、その段階までに始まる釣り場)に切った表 1 組。
 * 「釣り場を足すと、コードを変えずに動く」を確かめるときに、足す前と後の表を作るのに使う。
 * @param {number} maxStage
 */
export function contentUpTo(maxStage, equipKinds = undefined, skills = undefined) {
  return makeContent(
    FISH_ROWS.filter((r) => r.stage <= maxStage).map((r) => defineFish(r)),
    undefined,
    equipKinds,
    skills,
    AREA_ROWS.filter((a) => a.firstStage <= maxStage),
  );
}

/**
 * 表に段階が足されたあとの読み方(D-350):「進化済み」は表の最後の段階でだけありうるので、
 * 次の段階がある「進化済み」は、次の段階の未製作として読む(磯の 5 段階目の進化済み → 川の段階 1)。
 * 互換の正解データの期待の値を、いまの表に合わせるのに使う(正解データは書き換えない)。
 * @param {any} progress
 */
export function asCurrentTable(progress, content = DEFAULT_CONTENT_FOR_TESTS) {
  const p = structuredClone(progress);
  if (p.rodStep === "evolved" && content.stageByNumber.has(p.rodStage + 1)) Object.assign(p, { rodStage: p.rodStage + 1, rodStep: "none" });
  return p;
}

/** 港と磯(g=1〜10)だけの表(川を足す前)。 */
export const HARBOR_ISO_CONTENT = contentUpTo(10);

/** 川(g=11〜15)まで足した表 1 組。equipKinds・skills を渡すと、それも差し替える。 */
export function riverContent(equipKinds = undefined, skills = undefined) {
  return contentUpTo(15, equipKinds, skills);
}

/**
 * 防御のない魚の表(数値は式から。いまは、どの魚も防御 0:D-380)。スキルの計算の順など、防御と関係のない決まりを確かめるテストで使う。
 */
export const NO_DEFENSE_CONTENT = makeContent(FISH_ROWS.map((r) => defineFish(r, DEFAULT_CONFIG_FOR_TESTS.formula)));

/**
 * 同じ魚で、決めた魚にだけ防御を付けた表(防御と貫通の仕組みを確かめるテスト用。いまの魚の表は防御 0:D-380)。
 * @param {any} content @param {Record<string, number>} defenses 魚の id → 防御(割合)
 */
export function withDefense(content, defenses) {
  return makeContent(content.fish.map((f) => (f.minigame && defenses[f.id] !== undefined ? { ...f, minigame: { ...f.minigame, defense: defenses[f.id] } } : f)));
}

/**
 * 同じ魚(体力・制限時間などはそのまま)で、防御だけ 0 にした表。防御と関係のない決まり(芯・縁の損得、外し得など)を、
 * 防御 100% 以上のヌシ(貫通が要る)でも確かめるときに使う。
 */
export function withoutDefense(content) {
  return makeContent(content.fish.map((f) => (f.minigame ? { ...f, minigame: { ...f.minigame, defense: 0 } } : f)));
}

/**
 * 版 7 までの進み具合を、版 8 で読んだときの形にする(D-392:おもりとお守りの入れ替え)。互換の正解データの比べ合わせに使う。
 * - おもり(印を遅くする)の装備は取り除き、払い戻しのウロコインに換える(ロック中でも。装着中なら外す)。
 * - おまもりの装備は、おもり(版 8 ではウロコイン +%)に変える。
 */
export async function toV8(progress) {
  const { makeCrates, refundFor } = await import("../src/core/gear.js");
  const crates = makeCrates(DEFAULT_CONTENT_FOR_TESTS, DEFAULT_CONFIG_FOR_TESTS);
  const p = structuredClone(progress);
  let refund = 0;
  p.gear.items = p.gear.items.flatMap((it) => {
    if (it.kind === "weight") {
      refund += refundFor(it, crates);
      return [];
    }
    return [it.kind === "charm" ? { ...it, kind: "weight" } : it];
  });
  const eq = {};
  for (const [kind, id] of Object.entries(p.gear.equipped)) {
    if (kind === "weight") continue;
    eq[kind === "charm" ? "weight" : kind] = id;
  }
  // 装着の並び:種類の表の順(書き出しと同じ)。
  const order = ["line", "reel", "lure", "weight", "float", "charm"];
  p.gear.equipped = Object.fromEntries(Object.entries(eq).sort(([a], [b]) => order.indexOf(a) - order.indexOf(b)));
  p.coins += refund;
  return p;
}

/**
 * 版 8 の進み具合を、版 9 で読んだ形にする(D-397):降臨の欄は空になる(版 8 では降臨で遊べなかった)。お守りはそのまま。
 */
export function toV9(progress) {
  const p = structuredClone(progress);
  delete p.kourin;
  return p;
}
