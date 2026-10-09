// 魚と段階の設定表(D-093・D-094・D-111・D-224・D-225・D-228)。
// 段階の数と魚の種類は、この表だけで決まる(データ駆動)。段階や魚を足すときは、表に行を足すだけでよい。
// - 魚の表は、id・名前・区分(弱い/強い/ヌシ)・解放される段階(通し番号 g)・見た目(色と大きさ)だけを持つ。
// - 数値(報酬・鱗の数・ミニゲームの設定・製作と進化の数)は、通し番号 g の式(formula.js)から作る。表に手書きの数を置かない。
// - 段階の表は、魚の表から作る(製作はその段階の強い魚の鱗、進化はその段階のヌシの鱗)。

import { AREA_ROWS, checkAreas, makeAreas } from "./areas.js";
import { DEFAULT_CONFIG } from "./config.js";
import { craftCount, evolveCount, fishCoins, fishMinigame, fishScales, round2 } from "./formula.js";
import { EQUIP_KIND_ROWS } from "./gear.js";
import { SKILL_ROWS } from "./skills.js";

export const FISH_KINDS = Object.freeze({ WEAK: "weak", STRONG: "strong", BOSS: "boss" });

/**
 * 魚 1 種類を、表の 1 行(項目名つき)と式から作る(D-136・D-225)。
 * 行の項目:
 * - id:小文字の英数字とハイフン。保存は id で持つので、名前を変えても変えない(D-228)。
 * - name:画面に出す名前。kind:"weak"(弱い魚)・"strong"(強い魚)・"boss"(ヌシ)。stage:解放される段階(通し番号 g)。
 * - color・size:見た目(色と、絵の大きさの px)。cm:標準の大きさ(実在の魚の一般的な大きさ。ヌシは同じ魚の約 1.6 倍)。
 *   釣れた個体の大きさは、cm × 倍率(図鑑:D-405)。ないときは size を使う(確かめ用の大きな表)。
 * 式から作るもの:reward: { coins, scales }(ウロコインと、落とす「その魚の鱗」の数。弱い魚は 0)、
 * minigame(強い魚とヌシだけ):{ sweepMs(印が端から端まで), zoneWidth(命中範囲の幅), hp(体力), timeLimitMs(制限時間) }。
 * - rare・base(珍しい魚だけ:D-406):弱い魚のうち、釣り場の中でまれに出る魚。base は絵を借りる元の魚の id(絵の色を金に替える)。
 *   ウロコインは弱い魚 × rareCoinRatio。鱗は落とさない。
 * @param {{ id: string, name: string, kind: string, stage: number, color: string, size: number, cm?: number, rare?: boolean, base?: string }} row
 * @param {object} [formula] 式の数(config.formula)
 */
export function defineFish({ id, name, kind, stage, color, size, cm, rare, base }, formula = DEFAULT_CONFIG.formula) {
  const known = Object.values(FISH_KINDS).includes(kind) && Number.isSafeInteger(stage) && stage >= 1;
  const coins = known ? fishCoins(kind, stage, formula) : 0;
  return Object.freeze({
    id,
    name,
    kind,
    stage,
    reward: Object.freeze(known ? { coins: rare ? round2(coins * (formula.rareCoinRatio ?? 1)) : coins, scales: fishScales(kind, stage, formula) } : { coins: 0, scales: 0 }),
    color,
    size,
    cm: cm ?? size,
    ...(rare ? { rare: true, base: base ?? "" } : {}),
    minigame: known && kind !== FISH_KINDS.WEAK ? Object.freeze(fishMinigame(kind, stage, formula)) : null,
  });
}

/**
 * 段階の表を、魚の表から作る。段階 g の製作は、その段階の強い魚の鱗、進化は、その段階のヌシの鱗。数は式から。
 * 段階は 1 から、ヌシのいる段階の通し番号まで。
 * @param {readonly { id: string, kind: string, stage: number }[]} fish @param {object} [formula]
 */
export function stagesFromFish(fish, formula = DEFAULT_CONFIG.formula) {
  const bosses = fish.filter((f) => f.kind === FISH_KINDS.BOSS);
  const last = bosses.reduce((n, f) => Math.max(n, f.stage), 0);
  return Array.from({ length: last }, (_, i) => {
    const stage = i + 1;
    const strong = fish.find((f) => f.kind === FISH_KINDS.STRONG && f.stage === stage);
    const boss = fish.find((f) => f.kind === FISH_KINDS.BOSS && f.stage === stage);
    return Object.freeze({
      stage,
      craft: Object.freeze({ scale: strong?.id ?? "", count: craftCount(stage, formula) }),
      boss: boss?.id ?? "",
      evolve: Object.freeze({ scale: boss?.id ?? "", count: evolveCount(stage, formula) }),
    });
  });
}

/**
 * 魚の表(釣り場ごと・段階の順:港 g=1〜5、磯 g=6〜10、川 g=11〜15、沖 g=16〜20、外洋 g=21〜25、深海 g=26〜30。D-277・D-345・D-377)。足すときは 1 行足す(DESIGN の「段階や魚を足す手順」)。
 * 釣り場は段階(通し番号 g)で決まる(areas.js の釣り場の表)。数値は式から作る。
 */
export const FISH_ROWS = Object.freeze([
  // 段階 1
  { id: "aji", name: "アジ", kind: "weak", stage: 1, color: "#a8dadc", size: 22, cm: 25 },
  { id: "haze", name: "ハゼ", kind: "weak", stage: 1, color: "#c2a878", size: 20, cm: 15 },
  { id: "gold-aji", name: "ゴールデンアジ", kind: "weak", stage: 1, color: "#ffd166", size: 24, cm: 25, rare: true, base: "aji" },
  { id: "kurodai", name: "クロダイ", kind: "strong", stage: 1, color: "#f4a261", size: 34, cm: 40 },
  { id: "nushi-kurodai", name: "ヌシ・クロダイ", kind: "boss", stage: 1, color: "#9c4f1c", size: 52, cm: 64 },
  // 段階 2
  { id: "iwashi", name: "イワシ", kind: "weak", stage: 2, color: "#bcd4e6", size: 20, cm: 18 },
  { id: "sappa", name: "サッパ", kind: "weak", stage: 2, color: "#c9d6df", size: 20, cm: 15 },
  { id: "suzuki", name: "スズキ", kind: "strong", stage: 2, color: "#e76f51", size: 36, cm: 70 },
  { id: "nushi-suzuki", name: "ヌシ・スズキ", kind: "boss", stage: 2, color: "#9d2f17", size: 54, cm: 112 },
  // 段階 3
  { id: "saba", name: "サバ", kind: "weak", stage: 3, color: "#90be6d", size: 24, cm: 35 },
  { id: "bora", name: "ボラ", kind: "weak", stage: 3, color: "#9aa5ad", size: 24, cm: 50 },
  { id: "gold-saba", name: "ゴールデンサバ", kind: "weak", stage: 3, color: "#ffd166", size: 24, cm: 35, rare: true, base: "saba" },
  { id: "hirame", name: "ヒラメ", kind: "strong", stage: 3, color: "#ddb892", size: 38, cm: 60 },
  { id: "nushi-hirame", name: "ヌシ・ヒラメ", kind: "boss", stage: 3, color: "#8a6a3f", size: 56, cm: 96 },
  // 段階 4
  { id: "kisu", name: "キス", kind: "weak", stage: 4, color: "#f1e3c8", size: 24, cm: 20 },
  { id: "megochi", name: "メゴチ", kind: "weak", stage: 4, color: "#b59e7a", size: 22, cm: 20 },
  { id: "warasa", name: "ワラサ", kind: "strong", stage: 4, color: "#b8c0ff", size: 40, cm: 70 },
  { id: "nushi-warasa", name: "ヌシ・ワラサ", kind: "boss", stage: 4, color: "#5a63c8", size: 58, cm: 112 },
  // 段階 5
  { id: "kawahagi", name: "カワハギ", kind: "weak", stage: 5, color: "#f9c74f", size: 26, cm: 22 },
  { id: "umitanago", name: "ウミタナゴ", kind: "weak", stage: 5, color: "#a7b4bd", size: 24, cm: 20 },
  { id: "buri", name: "ブリ", kind: "strong", stage: 5, color: "#7b8cde", size: 44, cm: 90 },
  { id: "nushi-buri", name: "ヌシ・ブリ", kind: "boss", stage: 5, color: "#2f3e9e", size: 60, cm: 144 },
  // 磯 段階 1(g=6)
  { id: "bera", name: "ベラ", kind: "weak", stage: 6, color: "#f28482", size: 22, cm: 20 },
  { id: "suzumedai", name: "スズメダイ", kind: "weak", stage: 6, color: "#6f7f8f", size: 20, cm: 12 },
  { id: "gold-bera", name: "ゴールデンベラ", kind: "weak", stage: 6, color: "#ffd166", size: 24, cm: 20, rare: true, base: "bera" },
  { id: "mejina", name: "メジナ", kind: "strong", stage: 6, color: "#457b9d", size: 36, cm: 35 },
  { id: "nushi-mejina", name: "ヌシ・メジナ", kind: "boss", stage: 6, color: "#1d3557", size: 54, cm: 56 },
  // 磯 段階 2(g=7)
  { id: "kasago", name: "カサゴ", kind: "weak", stage: 7, color: "#e76f51", size: 24, cm: 22 },
  { id: "nenbutsudai", name: "ネンブツダイ", kind: "weak", stage: 7, color: "#e8a87c", size: 20, cm: 10 },
  { id: "ishidai", name: "イシダイ", kind: "strong", stage: 7, color: "#d9d9d9", size: 38, cm: 45 },
  { id: "nushi-ishidai", name: "ヌシ・イシダイ", kind: "boss", stage: 7, color: "#495057", size: 56, cm: 72 },
  // 磯 段階 3(g=8)
  { id: "mebaru", name: "メバル", kind: "weak", stage: 8, color: "#8d99ae", size: 24, cm: 22 },
  { id: "kusafugu", name: "クサフグ", kind: "weak", stage: 8, color: "#9c9b6c", size: 22, cm: 15 },
  { id: "gold-mebaru", name: "ゴールデンメバル", kind: "weak", stage: 8, color: "#ffd166", size: 24, cm: 22, rare: true, base: "mebaru" },
  { id: "budai", name: "ブダイ", kind: "strong", stage: 8, color: "#80b918", size: 40, cm: 40 },
  { id: "nushi-budai", name: "ヌシ・ブダイ", kind: "boss", stage: 8, color: "#2b9348", size: 58, cm: 64 },
  // 磯 段階 4(g=9)
  { id: "ainame", name: "アイナメ", kind: "weak", stage: 9, color: "#bc8a5f", size: 26, cm: 35 },
  { id: "haokoze", name: "ハオコゼ", kind: "weak", stage: 9, color: "#a65e4a", size: 22, cm: 10 },
  { id: "ishigakidai", name: "イシガキダイ", kind: "strong", stage: 9, color: "#c9ada7", size: 42, cm: 50 },
  { id: "nushi-ishigakidai", name: "ヌシ・イシガキダイ", kind: "boss", stage: 9, color: "#6d597a", size: 60, cm: 80 },
  // 磯 段階 5(g=10)
  { id: "soi", name: "ソイ", kind: "weak", stage: 10, color: "#6c757d", size: 26, cm: 35 },
  { id: "takanohadai", name: "タカノハダイ", kind: "weak", stage: 10, color: "#c9b48a", size: 26, cm: 35 },
  { id: "kue", name: "クエ", kind: "strong", stage: 10, color: "#a68a64", size: 46, cm: 80 },
  { id: "nushi-kue", name: "ヌシ・クエ", kind: "boss", stage: 10, color: "#582f0e", size: 62, cm: 128 },
  // 川 段階 1(g=11)
  { id: "oikawa", name: "オイカワ", kind: "weak", stage: 11, color: "#c3d6b8", size: 22, cm: 13 },
  { id: "motsugo", name: "モツゴ", kind: "weak", stage: 11, color: "#b7b39a", size: 18, cm: 8 },
  { id: "gold-oikawa", name: "ゴールデンオイカワ", kind: "weak", stage: 11, color: "#ffd166", size: 24, cm: 13, rare: true, base: "oikawa" },
  { id: "yamame", name: "ヤマメ", kind: "strong", stage: 11, color: "#8fb3a1", size: 36, cm: 25 },
  { id: "nushi-yamame", name: "ヌシ・ヤマメ", kind: "boss", stage: 11, color: "#4a6b5d", size: 54, cm: 40 },
  // 川 段階 2(g=12)
  { id: "funa", name: "フナ", kind: "weak", stage: 12, color: "#b5a882", size: 24, cm: 25 },
  { id: "tanago", name: "タナゴ", kind: "weak", stage: 12, color: "#a8b8c8", size: 18, cm: 8 },
  { id: "ayu", name: "アユ", kind: "strong", stage: 12, color: "#c9c27a", size: 38, cm: 22 },
  { id: "nushi-ayu", name: "ヌシ・アユ", kind: "boss", stage: 12, color: "#7d7531", size: 56, cm: 35 },
  // 川 段階 3(g=13)
  { id: "ugui", name: "ウグイ", kind: "weak", stage: 13, color: "#d4a5a5", size: 24, cm: 28 },
  { id: "kawamutsu", name: "カワムツ", kind: "weak", stage: 13, color: "#8fa38a", size: 22, cm: 15 },
  { id: "gold-ugui", name: "ゴールデンウグイ", kind: "weak", stage: 13, color: "#ffd166", size: 24, cm: 28, rare: true, base: "ugui" },
  { id: "namazu", name: "ナマズ", kind: "strong", stage: 13, color: "#6b705c", size: 40, cm: 55 },
  { id: "nushi-namazu", name: "ヌシ・ナマズ", kind: "boss", stage: 13, color: "#3a3d32", size: 58, cm: 88 },
  // 川 段階 4(g=14)
  { id: "nigoi", name: "ニゴイ", kind: "weak", stage: 14, color: "#c8c8b4", size: 26, cm: 45 },
  { id: "yoshinobori", name: "ヨシノボリ", kind: "weak", stage: 14, color: "#8c7a5c", size: 18, cm: 7 },
  { id: "nijimasu", name: "ニジマス", kind: "strong", stage: 14, color: "#e5989b", size: 42, cm: 40 },
  { id: "nushi-nijimasu", name: "ヌシ・ニジマス", kind: "boss", stage: 14, color: "#a4505a", size: 60, cm: 64 },
  // 川 段階 5(g=15)
  { id: "dojou", name: "ドジョウ", kind: "weak", stage: 15, color: "#a98467", size: 26, cm: 12 },
  { id: "kajika", name: "カジカ", kind: "weak", stage: 15, color: "#7a6a52", size: 22, cm: 13 },
  { id: "itou", name: "イトウ", kind: "strong", stage: 15, color: "#9c6644", size: 46, cm: 100 },
  { id: "nushi-itou", name: "ヌシ・イトウ", kind: "boss", stage: 15, color: "#5a3a24", size: 62, cm: 160 },
  // 沖 段階 1(g=16)
  { id: "muroaji", name: "ムロアジ", kind: "weak", stage: 16, color: "#a9bcd0", size: 22, cm: 35 },
  { id: "takabe", name: "タカベ", kind: "weak", stage: 16, color: "#d8c46a", size: 22, cm: 20 },
  { id: "gold-muroaji", name: "ゴールデンムロアジ", kind: "weak", stage: 16, color: "#ffd166", size: 24, cm: 35, rare: true, base: "muroaji" },
  { id: "hiramasa", name: "ヒラマサ", kind: "strong", stage: 16, color: "#ffd166", size: 36, cm: 100 },
  { id: "nushi-hiramasa", name: "ヌシ・ヒラマサ", kind: "boss", stage: 16, color: "#b08a1e", size: 54, cm: 160 },
  // 沖 段階 2(g=17)
  { id: "isaki", name: "イサキ", kind: "weak", stage: 17, color: "#9aa5b1", size: 24, cm: 35 },
  { id: "ibodai", name: "イボダイ", kind: "weak", stage: 17, color: "#c0c8d0", size: 22, cm: 20 },
  { id: "kanpachi", name: "カンパチ", kind: "strong", stage: 17, color: "#d4a373", size: 38, cm: 90 },
  { id: "nushi-kanpachi", name: "ヌシ・カンパチ", kind: "boss", stage: 17, color: "#8a5a2b", size: 56, cm: 144 },
  // 沖 段階 3(g=18)
  { id: "sawara", name: "サワラ", kind: "weak", stage: 18, color: "#b8c4d6", size: 24, cm: 80 },
  { id: "shimaaji", name: "シマアジ", kind: "weak", stage: 18, color: "#b8c8a8", size: 26, cm: 60 },
  { id: "gold-sawara", name: "ゴールデンサワラ", kind: "weak", stage: 18, color: "#ffd166", size: 24, cm: 80, rare: true, base: "sawara" },
  { id: "shiira", name: "シイラ", kind: "strong", stage: 18, color: "#90be6d", size: 40, cm: 100 },
  { id: "nushi-shiira", name: "ヌシ・シイラ", kind: "boss", stage: 18, color: "#3f7d20", size: 58, cm: 160 },
  // 沖 段階 4(g=19)
  { id: "soudagatsuo", name: "ソウダガツオ", kind: "weak", stage: 19, color: "#6d8ba8", size: 26, cm: 40 },
  { id: "himeji", name: "ヒメジ", kind: "weak", stage: 19, color: "#e0a080", size: 22, cm: 20 },
  { id: "katsuo", name: "カツオ", kind: "strong", stage: 19, color: "#5e7ca8", size: 42, cm: 60 },
  { id: "nushi-katsuo", name: "ヌシ・カツオ", kind: "boss", stage: 19, color: "#253f6b", size: 60, cm: 96 },
  // 沖 段階 5(g=20)
  { id: "mutsu", name: "ムツ", kind: "weak", stage: 20, color: "#7a6f8a", size: 26, cm: 50 },
  { id: "houbou", name: "ホウボウ", kind: "weak", stage: 20, color: "#d06a5a", size: 26, cm: 40 },
  { id: "kihada", name: "キハダ", kind: "strong", stage: 20, color: "#f4d35e", size: 46, cm: 130 },
  { id: "nushi-kihada", name: "ヌシ・キハダ", kind: "boss", stage: 20, color: "#a88b1a", size: 62, cm: 208 },
  // 外洋 段階 1(g=21)
  { id: "tobiuo", name: "トビウオ", kind: "weak", stage: 21, color: "#9fc5e8", size: 22, cm: 30 },
  { id: "tsumuburi", name: "ツムブリ", kind: "weak", stage: 21, color: "#6a9ac8", size: 24, cm: 80 },
  { id: "gold-tobiuo", name: "ゴールデントビウオ", kind: "weak", stage: 21, color: "#ffd166", size: 24, cm: 30, rare: true, base: "tobiuo" },
  { id: "makajiki", name: "マカジキ", kind: "strong", stage: 21, color: "#3d5a80", size: 36, cm: 220 },
  { id: "nushi-makajiki", name: "ヌシ・マカジキ", kind: "boss", stage: 21, color: "#1d2d50", size: 54, cm: 352 },
  // 外洋 段階 2(g=22)
  { id: "sanma", name: "サンマ", kind: "weak", stage: 22, color: "#a7b4c2", size: 24, cm: 30 },
  { id: "amimongara", name: "アミモンガラ", kind: "weak", stage: 22, color: "#8a8f9a", size: 24, cm: 40 },
  { id: "binnaga", name: "ビンナガ", kind: "strong", stage: 22, color: "#5c8dbc", size: 38, cm: 90 },
  { id: "nushi-binnaga", name: "ヌシ・ビンナガ", kind: "boss", stage: 22, color: "#2c4f7c", size: 56, cm: 144 },
  // 外洋 段階 3(g=23)
  { id: "kamasu", name: "カマス", kind: "weak", stage: 23, color: "#c9b18a", size: 24, cm: 35 },
  { id: "hagatsuo", name: "ハガツオ", kind: "weak", stage: 23, color: "#7a98b8", size: 24, cm: 60 },
  { id: "gold-kamasu", name: "ゴールデンカマス", kind: "weak", stage: 23, color: "#ffd166", size: 24, cm: 35, rare: true, base: "kamasu" },
  { id: "mebachi", name: "メバチ", kind: "strong", stage: 23, color: "#2f4b7c", size: 40, cm: 150 },
  { id: "nushi-mebachi", name: "ヌシ・メバチ", kind: "boss", stage: 23, color: "#162447", size: 58, cm: 240 },
  // 外洋 段階 4(g=24)
  { id: "urumeiwashi", name: "ウルメイワシ", kind: "weak", stage: 24, color: "#7fa6a3", size: 26, cm: 25 },
  { id: "kaiwari", name: "カイワリ", kind: "weak", stage: 24, color: "#c8d0d8", size: 24, cm: 25 },
  { id: "kurokajiki", name: "クロカジキ", kind: "strong", stage: 24, color: "#22313f", size: 42, cm: 300 },
  { id: "nushi-kurokajiki", name: "ヌシ・クロカジキ", kind: "boss", stage: 24, color: "#0b1622", size: 60, cm: 480 },
  // 外洋 段階 5(g=25)
  { id: "datsu", name: "ダツ", kind: "weak", stage: 25, color: "#b0c4de", size: 26, cm: 80 },
  { id: "manbou", name: "マンボウ", kind: "weak", stage: 25, color: "#a8b0b8", size: 28, cm: 200 },
  { id: "kuromaguro", name: "クロマグロ", kind: "strong", stage: 25, color: "#1b3a6b", size: 46, cm: 200 },
  { id: "nushi-kuromaguro", name: "ヌシ・クロマグロ", kind: "boss", stage: 25, color: "#0a1a3a", size: 62, cm: 320 },
  // 深海 段階 1(g=26)
  { id: "sokodara", name: "ソコダラ", kind: "weak", stage: 26, color: "#8c8a93", size: 22, cm: 40 },
  { id: "genge", name: "ゲンゲ", kind: "weak", stage: 26, color: "#c8b0b8", size: 22, cm: 30 },
  { id: "gold-sokodara", name: "ゴールデンソコダラ", kind: "weak", stage: 26, color: "#ffd166", size: 24, cm: 40, rare: true, base: "sokodara" },
  { id: "ankou", name: "アンコウ", kind: "strong", stage: 26, color: "#6b5d4f", size: 36, cm: 70 },
  { id: "nushi-ankou", name: "ヌシ・アンコウ", kind: "boss", stage: 26, color: "#3b3026", size: 54, cm: 112 },
  // 深海 段階 2(g=27)
  { id: "hadakaiwashi", name: "ハダカイワシ", kind: "weak", stage: 27, color: "#5e6b8c", size: 24, cm: 8 },
  { id: "demenigisu", name: "デメニギス", kind: "weak", stage: 27, color: "#4a5a6a", size: 22, cm: 15 },
  { id: "akamutsu", name: "アカムツ", kind: "strong", stage: 27, color: "#c0392b", size: 38, cm: 30 },
  { id: "nushi-akamutsu", name: "ヌシ・アカムツ", kind: "boss", stage: 27, color: "#7b1e1e", size: 56, cm: 48 },
  // 深海 段階 3(g=28)
  { id: "hiuchidai", name: "ヒウチダイ", kind: "weak", stage: 28, color: "#d35400", size: 24, cm: 15 },
  { id: "onikinme", name: "オニキンメ", kind: "weak", stage: 28, color: "#5a3a3a", size: 22, cm: 15 },
  { id: "gold-hiuchidai", name: "ゴールデンヒウチダイ", kind: "weak", stage: 28, color: "#ffd166", size: 24, cm: 15, rare: true, base: "hiuchidai" },
  { id: "rabuka", name: "ラブカ", kind: "strong", stage: 28, color: "#5d6d7e", size: 40, cm: 150 },
  { id: "nushi-rabuka", name: "ヌシ・ラブカ", kind: "boss", stage: 28, color: "#2e3640", size: 58, cm: 240 },
  // 深海 段階 4(g=29)
  { id: "ginzame", name: "ギンザメ", kind: "weak", stage: 29, color: "#b8b8c8", size: 26, cm: 80 },
  { id: "hoteieso", name: "ホテイエソ", kind: "weak", stage: 29, color: "#2a3a4a", size: 24, cm: 30 },
  { id: "ryuuguunotsukai", name: "リュウグウノツカイ", kind: "strong", stage: 29, color: "#e8e8f0", size: 42, cm: 400 },
  { id: "nushi-ryuuguunotsukai", name: "ヌシ・リュウグウノツカイ", kind: "boss", stage: 29, color: "#a83232", size: 60, cm: 640 },
  // 深海 段階 5(g=30)
  { id: "kinmedai", name: "キンメダイ", kind: "weak", stage: 30, color: "#e74c3c", size: 26, cm: 40 },
  { id: "yokoeso", name: "ヨコエソ", kind: "weak", stage: 30, color: "#3a4a5a", size: 22, cm: 7 },
  { id: "shiirakansu", name: "シーラカンス", kind: "strong", stage: 30, color: "#4a5a6a", size: 46, cm: 160 },
  { id: "nushi-shiirakansu", name: "ヌシ・シーラカンス", kind: "boss", stage: 30, color: "#1f2a35", size: 62, cm: 256 },
]);

export const FISH_LIST = Object.freeze(FISH_ROWS.map((r) => defineFish(r)));
export const STAGE_LIST = Object.freeze(stagesFromFish(FISH_LIST));

/**
 * 設定表 1 組(魚と段階と装備の種類とスキルと釣り場)。テストや将来の追加では、別の組を作って渡せる。
 * 段階は魚の表から作る。クレートは段階の表から作る(gear.js の makeCrates)。釣り場は釣り場の表から、
 * 最後の段階までを覆うように作る(表にない段階には自動で作る:areas.js の makeAreas)。
 */
export function makeContent(fish = FISH_LIST, stages = stagesFromFish(fish), equipKinds = EQUIP_KIND_ROWS, skills = SKILL_ROWS, areaRows = AREA_ROWS) {
  const byId = new Map(fish.map((f) => [f.id, f]));
  const sortedStages = [...stages].sort((a, b) => a.stage - b.stage);
  const maxStage = sortedStages.length > 0 ? sortedStages[sortedStages.length - 1].stage : 1;
  return Object.freeze({
    areas: makeAreas(areaRows, maxStage),
    fish,
    stages: sortedStages,
    byId,
    stageByNumber: new Map(sortedStages.map((s) => [s.stage, s])),
    maxStage,
    equipKinds,
    skills,
  });
}

export const DEFAULT_CONTENT = makeContent();

// 魚の id の形(小文字の英数字とハイフン、40 字まで)。保存の点検でも使う。
export const FISH_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MINIGAME_KEYS = ["sweepMs", "zoneWidth", "hp", "timeLimitMs"];
const FISH_KEYS = "id,name,kind,stage,reward,color,size,cm,minigame";
const FISH_KEYS_RARE = "id,name,kind,stage,reward,color,size,cm,rare,base,minigame";
const isCountAtLeast = (n, min) => Number.isSafeInteger(n) && n >= min;

/**
 * 設定表の点検(テストと、将来の追加の確かめに使う)。おかしなところの文の一覧を返す(空なら問題なし)。
 */
export function checkContent(content) {
  const problems = [];
  const ids = new Set();
  for (const f of content.fish) {
    if (Object.keys(f).join(",") !== (f.rare ? FISH_KEYS_RARE : FISH_KEYS)) problems.push(`魚の項目がちがう:${f.id}`);
    if (f.rare && (f.kind !== FISH_KINDS.WEAK || !content.byId.has(f.base) || content.byId.get(f.base)?.rare)) problems.push(`珍しい魚の設定:${f.id}`);
    if (typeof f.id !== "string" || !FISH_ID_PATTERN.test(f.id)) problems.push(`id の形がおかしい:${f.id}`);
    if (ids.has(f.id)) problems.push(`id が重なっている:${f.id}`);
    ids.add(f.id);
    if (typeof f.name !== "string" || f.name === "") problems.push(`名前がない:${f.id}`);
    if (!Object.values(FISH_KINDS).includes(f.kind)) problems.push(`区分がおかしい:${f.id}`);
    if (!isCountAtLeast(f.stage, 1) || !content.stageByNumber.has(f.stage)) problems.push(`段階が表にない:${f.id}`);
    if (!isCountAtLeast(f.reward.coins, 0) || !isCountAtLeast(f.reward.scales, 0)) problems.push(`報酬の数がおかしい:${f.id}`);
    if (typeof f.color !== "string" || !(f.size > 0)) problems.push(`見た目の設定:${f.id}`);
    if (!(f.cm > 0)) problems.push(`標準の大きさ(cm)がない:${f.id}`);
    if ((f.kind === FISH_KINDS.WEAK) !== (f.minigame === null)) problems.push(`ミニゲームの設定:${f.id}`);
    if (f.minigame && !MINIGAME_KEYS.every((k) => Number.isFinite(f.minigame[k]) && f.minigame[k] > 0)) {
      problems.push(`ミニゲームの数がおかしい:${f.id}`);
    }
    if (f.minigame && !(Number.isFinite(f.minigame.defense) && f.minigame.defense >= 0)) problems.push(`防御がおかしい:${f.id}`);
    if (f.kind === FISH_KINDS.WEAK && f.reward.scales !== 0) problems.push(`弱い魚は鱗を落とさない:${f.id}`);
    if (f.kind !== FISH_KINDS.WEAK && f.reward.scales < 1) problems.push(`強い魚とヌシは鱗を落とす:${f.id}`);
  }
  content.stages.forEach((s, i) => {
    if (s.stage !== i + 1) problems.push(`段階は 1 からの通し番号:${s.stage}`);
    const craft = content.byId.get(s.craft.scale);
    const boss = content.byId.get(s.boss);
    if (!craft || craft.kind !== FISH_KINDS.STRONG || craft.stage !== s.stage) problems.push(`製作の鱗はその段階の強い魚:${s.stage}`);
    if (!boss || boss.kind !== FISH_KINDS.BOSS || boss.stage !== s.stage) problems.push(`ヌシはその段階のヌシ:${s.stage}`);
    if (!isCountAtLeast(s.craft.count, 1) || !isCountAtLeast(s.evolve.count, 1)) problems.push(`製作と進化の数は 1 以上:${s.stage}`);
    if (!content.fish.some((f) => f.kind === FISH_KINDS.WEAK && f.stage === s.stage)) problems.push(`弱い魚がいない:${s.stage}`);
  });
  problems.push(...checkAreas(content.areas, content.maxStage));
  return problems;
}

/** id から魚を探す。ないときは undefined。 */
export function fishById(id, content = DEFAULT_CONTENT) {
  return content.byId.get(id);
}

/** 鱗の名前(例:クロダイの鱗)。 */
export function scaleName(id, content = DEFAULT_CONTENT) {
  const f = fishById(id, content);
  return f ? `${f.name}の鱗` : `${id}の鱗`;
}

/**
 * 段階 min〜max で釣れる、区分 kind の魚(段階の小さい順)。ヌシはランダムには出ない。
 * 釣り場の中だけにするときは、min に釣り場の最初の段階を渡す(D-275)。min を省くと段階 1 から。
 */
export function availableFish(max, kind, list = FISH_LIST, min = 1) {
  return list.filter((f) => f.kind === kind && !f.rare && f.stage >= min && f.stage <= max).sort((a, b) => a.stage - b.stage);
}

/** 段階 min〜max で出る珍しい魚(D-406。段階の小さい順)。 */
export function rareFish(max, list = FISH_LIST, min = 1) {
  return list.filter((f) => f.rare && f.stage >= min && f.stage <= max).sort((a, b) => a.stage - b.stage);
}

/** 竿の段階 rodStage で新しく釣れるようになる魚(ヌシを除く)。 */
export function fishUnlockedAt(rodStage, list = FISH_LIST) {
  return list.filter((f) => f.stage === rodStage && f.kind !== FISH_KINDS.BOSS);
}

/**
 * 抽選の重み:新しい魚ほど出やすい。段階が 1 上がるごとに 2 倍(D-046)。
 * 釣り場の中の位置で数える(first は釣り場の最初の段階。位置 1 の重みが 1:D-275)。
 */
export function fishWeight(f, first = 1) {
  return 2 ** (f.stage - first);
}

/**
 * 0 以上 1 未満の数 v で、候補から重みづけで 1 匹選ぶ(first は釣り場の最初の段階)。
 * 乱数は呼ぶ側が渡す(ここでは乱数を引かない)。
 */
export function pickWeighted(candidates, v, first = 1) {
  // 同じ段階に何種類かいるときは、その段階の重みを等しく分ける(弱い魚を各段階 2 種類にした:D-406)。
  const perStage = new Map();
  for (const f of candidates) perStage.set(f.stage, (perStage.get(f.stage) ?? 0) + 1);
  const weight = (f) => fishWeight(f, first) / perStage.get(f.stage);
  const total = candidates.reduce((sum, f) => sum + weight(f), 0);
  let target = v * total;
  for (const f of candidates) {
    target -= weight(f);
    if (target < 0) return f;
  }
  return candidates[candidates.length - 1];
}

/**
 * ミニゲームの重さを、限界(最小幅・速さの上限)の中に収める(D-036・D-048)。
 * 体力と制限時間はそのまま使う。
 */
export function effectiveMinigame(f, limits) {
  if (!f.minigame) return null;
  return {
    sweepMs: Math.max(limits.minSweepMs, f.minigame.sweepMs),
    zoneWidth: Math.max(limits.minZoneWidth, f.minigame.zoneWidth),
    hp: f.minigame.hp,
    timeLimitMs: f.minigame.timeLimitMs,
    defense: f.minigame.defense ?? 0,
    // ヌシのくせ(D-382):自動回復と、延びる上限を数える制限時間。持つときだけ写す。
    ...(f.minigame.regenPerSec ? { regenPerSec: f.minigame.regenPerSec } : {}),
    ...(f.minigame.limitBaseMs ? { limitBaseMs: f.minigame.limitBaseMs } : {}),
  };
}
