// @ts-check
// 背景のドット絵の一覧(D-383・D-384。夜の絵は D-392)。釣り場の表(src/core/areas.js)と同じ並び:港 → 磯 → 川 → 沖 → 外洋 → 深海。
// 絵のデータは scripts/art/bg_*.mjs が書き出す(このファイルは手で書く一覧だけ)。ゲームの起動では読み込まない(D-362)。

import { BG_GAIYOU } from "./gaiyou.js";
import { BG_ISO } from "./iso.js";
import { BG_KAWA } from "./kawa.js";
import { BG_MINATO, MINATO_HORIZON } from "./minato.js";
import { BG_OKI } from "./oki.js";
import { BG_SHINKAI } from "./shinkai.js";
import { BG_GAIYOU_NIGHT } from "./gaiyou_night.js";
import { BG_ISO_NIGHT } from "./iso_night.js";
import { BG_KAWA_NIGHT } from "./kawa_night.js";
import { BG_MINATO_NIGHT } from "./minato_night.js";
import { BG_OKI_NIGHT } from "./oki_night.js";
import { BG_SHINKAI_NIGHT } from "./shinkai_night.js";

/** 水平線の行(上から。どの背景も同じ:ゲームの水面 0.42 の位置)。 */
export const BG_HORIZON = MINATO_HORIZON;

/** 背景の一覧。areaId は釣り場の表の id。night は夜の絵(降臨の戦いだけで使う:D-392)。 */
export const BACKGROUNDS = Object.freeze([
  Object.freeze({ areaId: "minato", art: BG_MINATO, night: BG_MINATO_NIGHT }),
  Object.freeze({ areaId: "iso", art: BG_ISO, night: BG_ISO_NIGHT }),
  Object.freeze({ areaId: "kawa", art: BG_KAWA, night: BG_KAWA_NIGHT }),
  Object.freeze({ areaId: "oki", art: BG_OKI, night: BG_OKI_NIGHT }),
  Object.freeze({ areaId: "gaiyou", art: BG_GAIYOU, night: BG_GAIYOU_NIGHT }),
  Object.freeze({ areaId: "shinkai", art: BG_SHINKAI, night: BG_SHINKAI_NIGHT }),
]);
