// 保存の形(版 4)とセーブコード(TSURI4。TSURI1〜3 も読む)のテスト(②-4c 土台の条件 6・7・8、装備のロックの条件 4、餌と自動分解の条件 6、
// ②-4d の条件 10:D-223・D-232・D-247・D-267・D-280)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame } from "../src/core/fishing.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { effectRange, EQUIP_KIND_ROWS, makeCrates, RARITY_ROWS, refundFor } from "../src/core/gear.js";
import { levelRange, SKILL_ROWS } from "../src/core/skills.js";
import { syntheticContent } from "../src/core/synthetic.js";
import { decodeSave, encodeSave, initialProgress, SAVE_VERSION, STEP_ORDER, UPGRADES, upgradeSave } from "../src/core/save.js";
import { checksum, decodeSaveCode, encodeSaveCode, parseSave, SAVE_CODE_ERRORS } from "../src/core/savecode.js";
import { asCurrentTable, readText, toV10, toV13, toV9 } from "./helpers.js";

/** いろいろな値を持つ、正しい進み具合。 */
function sample() {
  return {
    coins: 12345,
    scales: { kurodai: 3, "nushi-kurodai": 1 },
    rodStage: 2,
    rodStep: "crafted",
    seen: ["aji", "kurodai"],
    gear: {
      items: [
        { id: 1, kind: "reel", rarity: "legend", grade: 1, value: 5, skills: [{ id: "power", level: 2 }, { id: "crit-rate", level: 1 }, { id: "core", level: 2 }] },
        { id: 4, kind: "line", rarity: "rare", grade: 2, value: 1500, skills: [{ id: "edge", level: 1 }] },
        { id: 5, kind: "lure", rarity: "normal", grade: 1, value: 5, skills: [] },
      ],
      equipped: { reel: 1, line: 4 },
      draws: 5,
      seed: 123,
      nextId: 6,
    },
    // 出会ったスキル(版 5:D-300)。持ち物のスキルと同じにしておく(古い版からの読み替えと同じ結果になる)。
    skillsSeen: ["power", "crit-rate", "core", "edge"],
  };
}

// 出会ったスキルの印(power=A・crit-rate=B・core=Q・edge=R → 2^0 + 2^1 + 2^16 + 2^17 を 36 進数で)。
const SEEN_MASK = (2 ** 0 + 2 ** 1 + 2 ** 16 + 2 ** 17).toString(36);
// 版 7 で足したグローブの 2 つの欄(判定 0 回・次の番号 1・装着なし・欠片 0(版 12:D-410)・持ち物なし:D-335)。
const GLOVES = "~0.1..0~";
// 版 8 で足した降臨とお守りの 2 つの欄(版 13 の形:ウロコパワー 0・呼び出しなし・お守りなし:D-392・D-397・D-411)と、図鑑の欄。
const KOURIN = "~0.....~.~";
// 版 10〜12 の降臨の欄(注入した量と鱗から入れた分がある形:D-403)。
const OLD_KOURIN = "~0.......~.~";
const TAIL = `${GLOVES}${KOURIN}`;
// 版 11 までのグローブの頭(欠片の数がない形)。
const OLD_GLOVES = "~0.1.~";

/** 本文から、印の合ったコードを作る。 */
const codeOf = (body) => `TSURI${SAVE_VERSION}-${body}-${checksum(body)}`;
/** 正しい本文の、i 番目の欄を差し替える。 */
function withField(i, text) {
  const parts = encodeSave(sample()).split("~");
  parts[i] = text;
  return codeOf(parts.join("~"));
}

// 版 1 の本文(sample() を版 1 で書いたもの)。
const V1_BODY = "9ix~2.1~kurodai:3,nushi-kurodai:1~aji,kurodai~5.3f.6~1.1,0.4~1.7.1.5A2B1Q2,3.1.2.15oR1,1.8.1.5";

// 版 2 の本文(sample() を版 2 で書いたもの)。
const V2_BODY = `${V1_BODY}~000`;

// 版 3 の本文(sample() を版 3 で書いたもの)。
const V3_BODY = `${V2_BODY}~0.0.0`;

test("版 8 の形:15 の欄(ウロコイン・竿・鱗・釣れた魚・ガチャ・装着・持ち物・ロック・餌と自動分解・釣り場・出会ったスキル・グローブ 2 つ・降臨・お守り)を 36 進数の数と記号で書く", () => {
  assert.equal(SAVE_VERSION, 13);
  assert.equal(encodeSave(sample()), `${V3_BODY}~~${SEEN_MASK}${TAIL}`, "いちばん新しい釣り場にいるときは、釣り場の欄は空");
  const p = sample();
  p.gear.items[1].locked = true;
  assert.equal(encodeSave(p), `${V1_BODY}~010~0.0.0~~${SEEN_MASK}${TAIL}`, "ロックは持ち物の順に 1 個 1 字");
  assert.match(encodeSaveCode(sample()), /^TSURI13-[0-9A-Za-z.,:~-]+-[0-9a-f]{8}$/);
  // 古い釣り場(港)にいるとき:釣り場の id を書く(D-280)。
  const old = { ...sample(), rodStage: 7, area: "minato" };
  assert.equal(encodeSave(old).split("~")[9], "minato");
  assert.deepEqual(decodeSaveCode(encodeSaveCode(old)), { ok: true, progress: old }, "釣り場も往復で元に戻る");
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p)), { ok: true, progress: p }, "ロックも往復で元に戻る");
  // 餌 99 個(36 進数で 2r)・スイッチ入り・自動分解「エピックまで」(番号 3)。
  const b = { ...sample(), bait: 99, useBait: true, autoScrap: "epic" };
  assert.equal(encodeSave(b), `${V2_BODY}~2r.1.3~~${SEEN_MASK}${TAIL}`);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(b)), { ok: true, progress: b }, "餌・スイッチ・自動分解も往復で元に戻る");
  for (const [id, n] of [["normal", 1], ["rare", 2]]) {
    const q = { ...sample(), bait: 1, autoScrap: id };
    assert.equal(encodeSave(q).split("~")[8], `1.0.${n}`);
    assert.deepEqual(decodeSaveCode(encodeSaveCode(q)).progress, q);
  }
});

test("版 2(TSURI2)のコードと本文を読み、版 3 → 版 4 に読み替える(餌 0・スイッチはオフ・自動分解はオフ。ほかは変わらない)", () => {
  assert.equal(UPGRADES[2](V2_BODY), V3_BODY);
  assert.equal(upgradeSave(V2_BODY, 2), `${V3_BODY}~~${SEEN_MASK}${TAIL}`);
  assert.equal(UPGRADES[2](V1_BODY), null, "欄の数がちがう版 2 は読み替えない");
  const p = sample();
  p.gear.items[0].locked = true;
  const body2 = `${V1_BODY}~100`;
  const r = decodeSaveCode(`TSURI2-${body2}-${checksum(body2)}`);
  assert.deepEqual(r, { ok: true, progress: p });
  assert.ok(r.ok && !("bait" in r.progress) && !("useBait" in r.progress) && !("autoScrap" in r.progress));
  assert.deepEqual(parseSave(`TSURI2-${body2}-${checksum(body2)}`), p, "ブラウザに残った版 2 の保存データも読める");
  assert.match(encodeSaveCode(p), /^TSURI13-/);
  // 版 2 なのに 9 つの欄は拒否。
  assert.equal(decodeSaveCode(`TSURI2-${V2_BODY}~0.0.0-${checksum(`${V2_BODY}~0.0.0`)}`).error, "content");
});

test("版 1(TSURI1)のコードと本文を読み、版 2 → 版 3 → 版 4 と順に読み替える(ロックは全てなし。ほかは変わらない)", () => {
  assert.equal(UPGRADES[1](V1_BODY), `${V1_BODY}~000`);
  assert.equal(upgradeSave(V1_BODY, 1), `${V1_BODY}~000~0.0.0~~${SEEN_MASK}${TAIL}`, "版 1 → 2 → … → 13");
  assert.equal(upgradeSave(`${V3_BODY}~`, 4), `${V3_BODY}~~${SEEN_MASK}${TAIL}`, "版 4 → 5:持ち物のスキルが出会ったスキルになる");
  assert.equal(UPGRADES[5](`${V3_BODY}~~${SEEN_MASK}`), `${V3_BODY}~~${SEEN_MASK}`, "版 5 → 6:本文は同じ(D-325)");
  assert.equal(UPGRADES[5](V3_BODY), null, "欄の数がちがう版 5 は読み替えない");
  assert.equal(UPGRADES[6](`${V3_BODY}~~${SEEN_MASK}`), `${V3_BODY}~~${SEEN_MASK}${OLD_GLOVES}`, "版 6 → 7:グローブの欄を空で足す(D-335)");
  assert.equal(UPGRADES[6](V3_BODY), null, "欄の数がちがう版 6 は読み替えない");
  assert.equal(UPGRADES[7](`${V3_BODY}~~${SEEN_MASK}${OLD_GLOVES}`, DEFAULT_CONTENT, DEFAULT_CONFIG), `${V3_BODY}~~${SEEN_MASK}${OLD_GLOVES}~0...~.`, "版 7 → 8:糸・リール・ルアーだけなら、降臨とお守りの欄を空で足すだけ(D-392)");
  assert.equal(UPGRADES[8](`${V3_BODY}~~${SEEN_MASK}${OLD_GLOVES}~0.nushi-kurodai.1.2~.`), `${V3_BODY}~~${SEEN_MASK}${OLD_GLOVES}~0.0.....~.`, "版 8 → 9:降臨の欄を空の形にする(D-397)");
  assert.equal(UPGRADES[8](V3_BODY), null, "欄の数がちがう版 8 は読み替えない");
  assert.equal(UPGRADES[9](`${V3_BODY}~~${SEEN_MASK}${OLD_GLOVES}~0.0.....~.`, DEFAULT_CONTENT, DEFAULT_CONFIG), `${V3_BODY}~~${SEEN_MASK}${OLD_GLOVES}~0.......~.`, "版 9 → 10:降臨の欄をウロコパワーの形にする(D-403)");
  assert.equal(UPGRADES[10](`${V3_BODY}~~${SEEN_MASK}${OLD_GLOVES}~0.......~.`), `${V3_BODY}~~${SEEN_MASK}${OLD_GLOVES}${OLD_KOURIN}`, "版 10 → 11:図鑑の欄を空で足す(D-405)");
  assert.equal(UPGRADES[11](`${V3_BODY}~~${SEEN_MASK}${OLD_GLOVES}${OLD_KOURIN}`), `${V3_BODY}~~${SEEN_MASK}${GLOVES}${OLD_KOURIN}`, "版 11 → 12:グローブの欠片 0 を足す(D-410)");
  assert.equal(UPGRADES[11](`${V3_BODY}~~${SEEN_MASK}${GLOVES}${OLD_KOURIN}`), null, "欠片の数がもうある形は読み替えない");
  assert.equal(UPGRADES[12](`${V3_BODY}~~${SEEN_MASK}${GLOVES}${OLD_KOURIN}`), `${V3_BODY}~~${SEEN_MASK}${TAIL}`, "版 12 → 13:注入の欄をなくす(D-411)");
  // 注入した量(大エビ 500・大イカ 7)は、貯めているウロコパワー(1234)に戻る。鱗から入れた分の記録は捨てる。呼び出しはそのまま。
  assert.equal(UPGRADES[12](`${V3_BODY}~~${SEEN_MASK}${GLOVES}~ya.3,0,1.dw,0,0,7.3c.1.3uw.3.4~.~`), `${V3_BODY}~~${SEEN_MASK}${GLOVES}~${(1234 + 500 + 7).toString(36)}.3,0,1.1.3uw.3.4~.~`);
  assert.equal(UPGRADES[12](`${V3_BODY}~~${SEEN_MASK}${TAIL}`), null, "注入の欄がもうない形は読み替えない");
  assert.equal(UPGRADES[10](V3_BODY), null, "欄の数がちがう版 10 は読み替えない");
  assert.equal(UPGRADES[9](V3_BODY, DEFAULT_CONTENT, DEFAULT_CONFIG), null, "欄の数がちがう版 9 は読み替えない");
  assert.equal(upgradeSave(`${V3_BODY}~~${SEEN_MASK}${TAIL}`, 13), `${V3_BODY}~~${SEEN_MASK}${TAIL}`, "今の版はそのまま");
  assert.equal(upgradeSave(V1_BODY, 0), null);
  assert.equal(upgradeSave(V1_BODY, 14), null);
  assert.equal(UPGRADES[1]("1~2"), null, "欄の数がちがう版 1 は読み替えない");
  const r = decodeSaveCode(`TSURI1-${V1_BODY}-${checksum(V1_BODY)}`);
  assert.deepEqual(r, { ok: true, progress: sample() });
  assert.ok(r.ok && r.progress.gear.items.every((it) => !("locked" in it)));
  // ブラウザに残った版 1 の保存データも読める(次に保存するときは版 4)。
  assert.deepEqual(parseSave(`TSURI1-${V1_BODY}-${checksum(V1_BODY)}`), sample());
  // 読み替えたものを書くと版 4。
  assert.match(encodeSaveCode(r.ok ? r.progress : sample()), /^TSURI13-/);
});

test("版 3(TSURI3)を版 4 に読み替える:釣り場は竿の段階の釣り場、頭打ち型は Lv1、港の最後の「進化済み」は磯の段階 1(D-280)", () => {
  assert.equal(UPGRADES[3](V3_BODY, DEFAULT_CONTENT), `${V3_BODY}~`);
  assert.equal(UPGRADES[3](V2_BODY, DEFAULT_CONTENT), null, "欄の数がちがう版 3 は読み替えない");
  // 俊敏(F)は頭打ち型:Lv3 → Lv1。強打(A)は成長型なのでそのまま。
  const letter = (id) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[SKILL_ROWS.findIndex((x) => x.id === id)];
  assert.deepEqual([letter("agility"), letter("insight"), letter("mastery"), letter("recovery")], ["F", "G", "H", "I"]);
  const body3 = "9ix~5.3~nushi-buri:1~aji~5.3f.6~1.1~1.7.1.5A2F3I2~0~3.1.2";
  const upgraded = UPGRADES[3](body3, DEFAULT_CONTENT);
  assert.equal(upgraded, "9ix~6.0~nushi-buri:1~aji~5.3f.6~1.1~1.7.1.5A2F1I1~0~3.1.2~");
  const r = decodeSaveCode(`TSURI3-${body3}-${checksum(body3)}`);
  assert.equal(r.ok, true);
  assert.deepEqual([r.progress.rodStage, r.progress.rodStep, r.progress.bait, r.progress.useBait, r.progress.autoScrap], [6, "none", 3, true, "rare"]);
  assert.deepEqual(r.progress.gear.items[0].skills, [{ id: "power", level: 2 }, { id: "agility", level: 1 }, { id: "recovery", level: 1 }]);
  assert.equal("area" in r.progress, false, "いちばん新しい釣り場(磯)");
  // 表に次の段階がない「進化済み」は、そのまま(いまの表の最後の段階 g=30 = u)。
  assert.equal(UPGRADES[3]("1~u.3~~~0..1~~~~0.0.0", DEFAULT_CONTENT), "1~u.3~~~0..1~~~~0.0.0~");
  // 沖の 5 段階目(g=20 = k)の進化済みは、外洋を足したので、外洋の段階 1(g=21 = l)の未製作として読む(D-350・D-377)。
  assert.equal(UPGRADES[3]("1~k.3~~~0..1~~~~0.0.0", DEFAULT_CONTENT), "1~l.0~~~0..1~~~~0.0.0~");
  // 版 1 なのに 8 つの欄(ロックの欄つき)は拒否。
  assert.equal(decodeSaveCode(`TSURI1-${V1_BODY}~000-${checksum(`${V1_BODY}~000`)}`).error, "content");
});

test("書き出して読むと、完全に元に戻る(全部の工程・初めの状態・ガチャの種がまだないとき)", () => {
  for (const step of STEP_ORDER) {
    const p = { ...sample(), rodStage: step === "evolved" ? DEFAULT_CONTENT.maxStage : 2, rodStep: step };
    assert.deepEqual(decodeSaveCode(encodeSaveCode(p)), { ok: true, progress: p }, step);
  }
  assert.deepEqual(decodeSaveCode(encodeSaveCode(initialProgress())), { ok: true, progress: initialProgress() });
  const noSeed = initialProgress();
  assert.equal(noSeed.gear.seed, null);
  assert.equal(decodeSaveCode(encodeSaveCode(noSeed)).progress.gear.seed, null);
});

test("鱗は持っているもの(1 以上)だけを書く", () => {
  const p = { ...sample(), scales: { kurodai: 0, suzuki: 2 } };
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p)).progress.scales, { suzuki: 2 });
});

test("保存したものからゲームを作ると、続きから遊べる(読んだものは書き換えない)", () => {
  const code = encodeSaveCode(sample());
  const progress = parseSave(code);
  const game = createGame(1, { progress });
  assert.equal(game.progress.coins, 12345);
  assert.equal(game.progress.gear.equipped.reel, 1);
  game.progress.coins = 0;
  assert.equal(progress.coins, 12345);
});

test("前後の空白や途中の改行があっても読め、読み込みは渡したものを書き換えない", () => {
  const code = encodeSaveCode(sample());
  assert.equal(decodeSaveCode(`  ${code.slice(0, 30)}\n${code.slice(30)}  `).ok, true);
  const p = sample();
  const before = JSON.stringify(p);
  encodeSaveCode(p);
  assert.equal(JSON.stringify(p), before);
});

test("古い版のコード(FISH2〜FISH7)は読まず「古い版のコードは読めません」", () => {
  assert.equal(SAVE_CODE_ERRORS.old, "古い版のコードは読めません");
  for (const v of [2, 3, 4, 5, 6, 7]) {
    const r = decodeSaveCode(`FISH${v}-eyJ2ZXJzaW9uIjo3fQ-12345678`);
    assert.deepEqual([r.ok, r.error, r.message], [false, "old", "古い版のコードは読めません"], `FISH${v}`);
  }
});

test("空・切れた・1 文字ちがう・ちがう形・ちがう版のコードは拒否する", () => {
  const code = encodeSaveCode(sample());
  assert.equal(decodeSaveCode("").error, "empty");
  assert.equal(decodeSaveCode(null).error, "empty");
  assert.equal(decodeSaveCode(code.slice(0, code.length - 3)).error, "format");
  assert.equal(decodeSaveCode(code.slice(0, 40) + "-" + code.slice(-8)).error, "checksum");
  const i = code.indexOf("kurodai");
  assert.equal(decodeSaveCode(code.slice(0, i) + "x" + code.slice(i + 1)).error, "checksum");
  assert.equal(decodeSaveCode("hello").error, "format");
  assert.equal(decodeSaveCode("TSURI3-abc").error, "format");
  const body = encodeSave(sample());
  for (const v of [0, 14, 15]) assert.equal(decodeSaveCode(`TSURI${v}-${body}-${checksum(body)}`).error, "version", `版 ${v}`);
  assert.equal(decodeSaveCode("TSURI1-" + "a".repeat(60000) + "-00000000").error, "format");
});

test("壊れた・範囲外・存在しない魚や工程・重複・装着の番号が持ち物にない、は拒否する(content)", () => {
  const bad = {
    欄が足りない: codeOf("1~1.0~~~0..1~"),
    ウロコインが大きすぎ: withField(0, "zzzzzzzzzzzz"),
    ウロコインの先頭が0: withField(0, "01"),
    ウロコインが記号: withField(0, "-1"),
    段階0: withField(1, "0.0"),
    段階が表をこえる: withField(1, `${(DEFAULT_CONTENT.maxStage + 1).toString(36)}.0`),
    存在しない工程: withField(1, "2.4"),
    竿の欄の形: withField(1, "2"),
    存在しない魚の鱗: withField(2, "maguro:1"),
    鱗が0: withField(2, "kurodai:0"),
    鱗が重複: withField(2, "kurodai:1,kurodai:2"),
    鱗の形: withField(2, "kurodai"),
    存在しない魚を釣った: withField(3, "maguro"),
    釣れた魚が重複: withField(3, "aji,aji"),
    ガチャの欄の形: withField(4, "5.3f"),
    ガチャの種が大きすぎ: withField(4, `5.${(2 ** 32).toString(36)}.6`),
    次の番号が0: withField(4, "5.3f.0"),
    次の番号が持ち物の番号以下: withField(4, "5.3f.5"),
    装着の番号が持ち物にない: withField(5, "1.2"),
    装着の枠と種類がちがう: withField(5, "0.1"),
    同じ枠に二重: withField(5, "1.1,1.1"),
    存在しない枠: withField(5, "9.1"),
    存在しない種類とレア度: withField(6, "1.z.1.5"),
    グレードが0: withField(6, "1.7.0.5"),
    グレードが表をこえる: withField(6, "1.7.6.5"),
    値が範囲外: withField(6, "1.7.1.z"),
    スキルがレア度の数より多い: withField(6, "1.1.1.5A1"),
    同じスキルが2回: withField(6, "1.7.1.5A1A1"),
    レベルが範囲外: withField(6, "1.7.1.5A9"),
    存在しないスキル: withField(6, "1.7.1.5Z1"),
    個体の番号が重複: withField(6, "1.7.1.5,0.7.1.5"),
    装備の形: withField(6, "1.7.1"),
    ロックが0と1以外: withField(7, "020"),
    ロックが記号: withField(7, "0.0"),
    ロックの数が持ち物より少ない: withField(7, "00"),
    ロックの数が持ち物より多い: withField(7, "0000"),
    版4なのにロックと餌の欄がない: codeOf(V1_BODY),
    版4なのに餌の欄がない: codeOf(V2_BODY),
    版4なのに釣り場の欄がない: codeOf(V3_BODY),
    版4で欄が多い: codeOf(`${V3_BODY}~~`),
    存在しない釣り場: withField(9, "gaiyo"),
    釣り場の形: withField(9, "Minato"),
    未解放の釣り場: withField(9, "iso"),
    頭打ち型のレベルが1でない: withField(6, "1.7.1.5F2"),
    頭打ち型のレベルが0: withField(6, "1.7.1.5F0"),
    餌が上限をこえる: withField(8, "2s.0.0"),
    餌が負: withField(8, "-1.0.0"),
    餌の数の先頭が0: withField(8, "01.0.0"),
    スイッチが0と1以外: withField(8, "1.2.0"),
    自動分解の設定が表にない: withField(8, "1.0.4"),
    餌の欄の形: withField(8, "1.0"),
    餌の欄が空: withField(8, ""),
  };
  for (const [name, code] of Object.entries(bad)) {
    const r = decodeSaveCode(code);
    assert.equal(r.ok, false, name);
    assert.equal(r.error, "content", name);
  }
  // 表の最後でない段階の「進化済み」は、次の段階の未製作として読む(表に段階が足されたとき:D-350)。
  const evolved = decodeSaveCode(withField(1, "2.3"));
  assert.deepEqual(evolved.ok ? [evolved.progress.rodStage, evolved.progress.rodStep] : null, [3, "none"]);
  // 沖の 5 段階目(g=20)の進化済み → 外洋の段階 1・竿は未製作(D-377)。深海の 5 段階目(g=30)の進化済みは、そのまま。
  const oki = decodeSaveCode(withField(1, "k.3"));
  assert.deepEqual(oki.ok ? [oki.progress.rodStage, oki.progress.rodStep] : null, [21, "none"]);
  const deep = decodeSaveCode(withField(1, "u.3"));
  assert.deepEqual(deep.ok ? [deep.progress.rodStage, deep.progress.rodStep] : null, [30, "evolved"]);
  // 持ち物が上限(300 個:D-355)をこえる(装着なし、次の番号は 400)。
  const parts = encodeSave(sample()).split("~");
  parts[4] = "5.3f.b4";
  parts[5] = "";
  parts[6] = Array.from({ length: 301 }, () => "1.8.1.5").join(",");
  parts[7] = "0".repeat(301);
  parts[8] = "0.0.0";
  parts[9] = "";
  assert.equal(decodeSaveCode(codeOf(parts.join("~"))).error, "content");
  parts[6] = Array.from({ length: 300 }, () => "1.8.1.5").join(",");
  parts[7] = "1".repeat(300);
  assert.equal(decodeSaveCode(codeOf(parts.join("~"))).ok, true, "300 個までは読める");
});

test("壊れた保存データは、エラーにせず初めの状態にする(いまのデータは書き換えない)", () => {
  for (const text of [null, "", "{}", "FISH7-abc-12345678", withField(1, "9.9"), "TSURI1-x-00000000"]) {
    assert.deepEqual(parseSave(text), initialProgress(), String(text));
  }
  assert.equal(decodeSave(123).ok, false);
});

test("セーブコードの長さ:持ち物 100 個(全部スキル 3 つ・最大の値)・鱗 20 種類で 3000 文字以内", () => {
  // 鱗 20 種類を持てるよう、段階 10(魚 30 種類)の大きな表で数える。
  const content = syntheticContent(10);
  const kinds = ["line", "reel", "lure"];
  const items = Array.from({ length: 100 }, (_, i) => {
    const kind = content.equipKinds.find((k) => k.id === kinds[i % 3]);
    const range = effectRange(kind, RARITY_ROWS[3], 10, DEFAULT_CONFIG.gacha.gradeGrowth);
    const lv = levelRange("legend", 10, DEFAULT_CONFIG.skills).max;
    return { id: i * 3 + 1, kind: kind.id, rarity: "legend", grade: 10, value: range.max, skills: [{ id: "power", level: lv }, { id: "crit-rate", level: lv }, { id: "edge", level: lv }] };
  });
  const scaleFish = content.fish.filter((f) => f.reward.scales > 0).slice(0, 20);
  assert.equal(scaleFish.length, 20);
  const scales = Object.fromEntries(scaleFish.map((f, i) => [f.id, 999999 + i]));
  const p = {
    coins: Number.MAX_SAFE_INTEGER,
    scales,
    rodStage: 10,
    rodStep: "defeated",
    seen: content.fish.slice(0, 20).map((f) => f.id),
    gear: { items, equipped: { line: 1, reel: 4, lure: 7 }, draws: 999999, seed: 4294967295, nextId: 400 },
  };
  const code = encodeSaveCode(p, content);
  assert.ok(code.length <= 3000, `長さ ${code.length}`);
  assert.deepEqual(decodeSaveCode(code, content).progress, p);
  // 版 2 のロックの欄で増えた長さ(全部ロック中でも同じ):200 文字以内(D-247)。
  for (const it of items) it.locked = true;
  const parts = encodeSave(p, content).split("~");
  const lockAdded = parts[7].length + 1;
  assert.ok(lockAdded <= 200, `ロックの増え ${lockAdded} 文字`);
  // 版 3 の餌と自動分解の欄で増えた長さ(餌は最大・スイッチ入り・エピックまで):50 文字以内(D-267)。
  Object.assign(p, { bait: 99, useBait: true, autoScrap: "epic" });
  const baitAdded = encodeSave(p, content).split("~")[8].length + 1;
  assert.ok(baitAdded <= 50, `餌の欄の増え ${baitAdded} 文字`);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p, content), content).progress, p);
  // 版 4 の釣り場の欄で増えた長さ(古い釣り場にいるとき):20 文字以内(D-280)。港(minato)でも 7 文字。
  p.area = "a1";
  assert.ok(encodeSave(p, content).split("~")[9].length + 1 <= 20);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p, content), content).progress, p);
  const harbor = { ...sample(), rodStage: 6, area: "minato" };
  const areaAdded = encodeSave(harbor).split("~")[9].length + 1;
  assert.ok(areaAdded <= 20, `釣り場の欄の増え ${areaAdded} 文字`);
});

/**
 * 版 4 までの正解データの「読んだ結果」を、版 5 の決まりに直す(D-300):持ち物のスキルを、出会ったスキルにする(表の順)。
 */
function addSeen(p) {
  const ids = new Set(p.gear.items.flatMap((it) => it.skills.map((s) => s.id)));
  const seen = SKILL_ROWS.map((s) => s.id).filter((id) => ids.has(id));
  if (seen.length > 0) p.skillsSeen = seen;
  return p;
}

/**
 * 版 3 までの正解データの「読んだ結果」を、版 4 の決まりに直す(D-279・D-280)。正解データのファイルは書き換えない。
 * - 頭打ち型のスキルは Lv1 に丸める。
 * - 表の最後で「進化済み」だった竿は、いまの表に次の段階があれば、その段階の未製作(港の最後 → 磯の段階 1)。
 */
function asVersion4(progress) {
  const p = structuredClone(progress);
  addSeen(p);
  for (const it of p.gear.items) for (const s of it.skills) if (SKILL_ROWS.find((x) => x.id === s.id)?.type === "capped") s.level = 1;
  if (p.rodStep === "evolved" && DEFAULT_CONTENT.stageByNumber.has(p.rodStage + 1)) Object.assign(p, { rodStage: p.rodStage + 1, rodStep: "none" });
  return p;
}

test("互換の正解データ(compat_v1〜v4.json。版 5 の読み替えで、持ち物のスキルが出会ったスキルになる):いつまでも読めて、決まった結果になる(消さない:DESIGN の決まり)", () => {
  for (const version of [1, 2, 3, 4]) {
    const fixture = JSON.parse(readText(`tests/fixtures/compat_v${version}.json`));
    assert.equal(fixture.version, version);
    for (const c of fixture.cases) {
      const r = decodeSaveCode(c.code);
      const expected = asCurrentTable(version < 4 ? asVersion4(c.progress) : addSeen(structuredClone(c.progress)));
      assert.deepEqual(r, { ok: true, progress: expected }, c.name);
      // 書き出すのは今の版。今の版の正解データは書き出しも同じ。古い版は、書き出して読み直すと同じ。
      const code = encodeSaveCode(expected);
      if (version === SAVE_VERSION) assert.equal(code, c.code, `${c.name}:書き出しも同じ`);
      assert.deepEqual(decodeSaveCode(code), { ok: true, progress: expected }, `${c.name}:今の版で往復`);
    }
    for (const c of fixture.rejected) {
      const r = decodeSaveCode(c.code);
      // 「まだない版」の例は、その版ができたあとは、中身の形がちがうので「中身が正しくありません」で拒否される(D-267)。
      const later = c.error === "version" && Number(c.code.match(/^TSURI(\d+)-/)?.[1]) <= SAVE_VERSION;
      assert.equal(r.ok, false, c.name);
      if (!later) assert.equal(r.error, c.error, c.name);
    }
  }
});

test("版 7 → 8(D-392):おもり(印を遅くする)は払い戻しのウロコインに換え(ロック中・装着中でも)、おまもりはおもりになる。番号の差とロックはずれない", () => {
  const R = RARITY_ROWS.length;
  const crates = makeCrates(DEFAULT_CONTENT, DEFAULT_CONFIG);
  // 持ち物:1 糸(装着)・2 おもり(エピック・グレード 3・ロック・装着)・4 おまもり(レア・グレード 2・装着)・5 おもり(ノーマル・グレード 1)・7 リール。
  const kr = (kind, rarity) => (kind * R + rarity).toString(36);
  // 値は、その種類・レア度・グレードの範囲のいちばん小さい値。
  const v = (kind, rarity, grade) => effectRange(EQUIP_KIND_ROWS[kind], RARITY_ROWS[rarity], grade, DEFAULT_CONFIG.gacha.gradeGrowth).min.toString(36);
  const items = [`1.${kr(0, 1)}.1.${v(0, 1, 1)}`, `1.${kr(3, 2)}.3.${v(3, 2, 3)}`, `2.${kr(5, 1)}.2.${v(5, 1, 2)}`, `1.${kr(3, 0)}.1.${v(3, 0, 1)}`, `2.${kr(1, 0)}.1.${v(1, 0, 1)}`].join(",");
  const v7 = ["100", "3.0", "", "", "5..8", "0.1,3.2,5.4", items, "01000", "0.0.0", "", "0", "0.1.", ""].join("~");
  const v8 = UPGRADES[7](v7, DEFAULT_CONTENT, DEFAULT_CONFIG);
  const refund =
    refundFor({ id: 2, kind: "weight", rarity: "epic", grade: 3, value: 30, skills: [] }, crates) +
    refundFor({ id: 5, kind: "weight", rarity: "normal", grade: 1, value: 10, skills: [] }, crates);
  const parts = v8.split("~");
  assert.equal(parts.length, 15);
  assert.equal(parseInt(parts[0], 36), 36 ** 2 + refund, "払い戻しを足す");
  assert.equal(parts[5], "0.1,3.4", "おもりの装着は外し、おまもりの装着はおもりの枠へ");
  assert.equal(parts[6], [`1.${kr(0, 1)}.1.${v(0, 1, 1)}`, `3.${kr(3, 1)}.2.${v(5, 1, 2)}`, `3.${kr(1, 0)}.1.${v(1, 0, 1)}`].join(","), "取り除いた分の番号の差は次に足す");
  assert.equal(parts[7], "000", "ロックは残った装備の分だけ");
  assert.deepEqual(parts.slice(13), ["0...", "."]);
  const r = decodeSave(upgradeSave(v8, 8) ?? "");
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.progress.gear.items.map((it) => [it.id, it.kind, it.rarity]), [[1, "line", "rare"], [4, "weight", "rare"], [7, "reel", "normal"]]);
  assert.deepEqual(r.ok && r.progress.gear.equipped, { line: 1, weight: 4 });
  // 版 7 のコードとしても読める(セーブコードの読み替え)。
  assert.deepEqual(decodeSaveCode(`TSURI7-${v7}-${checksum(v7)}`), r);
});

test("版 10 の降臨とお守りの欄(D-397・D-403):往復で元に戻る。既定の形は欄を持たない。お守りの種類の装備・壊れた形は拒否", () => {
  const p = sample();
  p.kourin = { power: 1234, cleared: { ebi: 3, tako: 1 }, raid: { char: "kani", hp: 5000, tries: 3, paid: 4 } };
  p.charms = { levels: { shizume: 2, yaburi: 50 }, equipped: "yaburi" };
  const body = encodeSave(p);
  assert.deepEqual(body.split("~").slice(13), ["ya.3,0,1.1.3uw.3.4", "2.2,0,1e", ""]);
  assert.deepEqual(decodeSave(body), { ok: true, progress: p });
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p)), { ok: true, progress: p });
  const powerOnly = { ...sample(), kourin: { power: 5, cleared: {}, raid: null } };
  assert.deepEqual(decodeSave(encodeSave(powerOnly)), { ok: true, progress: powerOnly });
  const plain = decodeSave(encodeSave(sample()));
  assert.ok(plain.ok && !("kourin" in plain.progress) && !("charms" in plain.progress), "既定の形は持たない");
  const parts = body.split("~");
  const withTail = (k, c) => [...parts.slice(0, 13), k, c, ""].join("~");
  const bad = {
    "表にないキャラ": withTail("0..4.1.0.0", "."),
    "残りの体力 0": withTail("0..0.0.0.0", "."),
    "区切りが 10": withTail("0..0.1.0.a", "."),
    "呼び出しの欄が足りない": withTail("0..0.1..", "."),
    "形がちがう(版 12 の形)": withTail("0.......", "."),
    "キャラの数をこえる": withTail("0.1,1,1,1,1....", "."),
    "最後の 0 を書いた": withTail("0.1,0....", "."),
    "表の数をこえるお守り": withTail("0.....", ".1,1,1,1,1"),
    "付けた能力のレベルが 0": withTail("0.....", "1.1"),
    "表にない能力を付けた": withTail("0.....", "9.1"),
    "お守りの種類の装備": encodeSave(sample()).replace("1.8.1.5", `1.${(5 * RARITY_ROWS.length).toString(36)}.1.a`),
  };
  for (const [name, text] of Object.entries(bad)) assert.equal(decodeSave(text).ok, false, name);
});

test("版 9 → 10(D-403):ゲージの割合 × いちばん低いレベルの相手に要る量が、貯めているウロコパワーになる。呼んでいるキャラはそのまま", () => {
  const v9 = (k) => { const parts = encodeSave(sample()).split("~"); parts[11] = "0.1."; return [...parts.slice(0, 13), k, "."].join("~"); };
  // ゲージ 150 点(半分)・倒したレベル 大エビ 2・大ガニ 3・大ダコ 1・大イカ 4 → いちばん低い次のレベルは 2(大ダコ)。
  const r = decodeSave(upgradeSave(v9(`${(150 * 64).toString(36)}.0.2,3,1,4....`), 9) ?? "");
  assert.ok(r.ok);
  assert.deepEqual(r.progress.kourin, { power: 0.5 * 240 * 2, cleared: { ebi: 2, kani: 3, tako: 1, ika: 4 }, raid: null });
  const s = decodeSave(upgradeSave(v9("0.0..1.3uw.3.4"), 9) ?? "");
  assert.deepEqual(s.ok && s.progress.kourin, { power: 0, cleared: {}, raid: { char: "kani", hp: 5000, tries: 3, paid: 4 } });
  assert.equal(decodeSave(upgradeSave(v9(`${(300 * 64 + 1).toString(36)}.0.....`), 9) ?? "").ok, false, "版 9 で満タンをこえていたら拒否");
});

test("互換の正解データ(compat_save_v8.json):保存の版 8 の署名なしと署名つきのコードが、読めて決まった結果になる", async () => {
  const { readSaveCode, signSaveCode } = await import("../src/core/signed_code.js");
  const { CURRENT_KEY } = await import("../src/ui/save_sign.js");
  const fixture = JSON.parse(readText("tests/fixtures/compat_save_v8.json"));
  assert.equal(fixture.version, 8);
  for (const c of fixture.cases) {
    // 版 9 で読むと、降臨の欄は空になる(D-397)。書き出すと今の版。
    const want = toV10(toV9(c.progress));
    assert.deepEqual(decodeSaveCode(c.code), { ok: true, progress: want }, c.name);
    assert.deepEqual(parseSave(c.code), want, `${c.name}:ブラウザの保存としても読める`);
    assert.match(encodeSaveCode(want), /^TSURI13-/, `${c.name}:書き出しは今の版`);
    assert.deepEqual(await readSaveCode(c.signed, { keys: [CURRENT_KEY] }), { ok: true, progress: want, signed: true, keyId: "dev", warning: null }, c.name);
    assert.match(await signSaveCode(want, CURRENT_KEY), /^TSURI5-dev-13-/, `${c.name}:署名つきの書き出しは今の版`);
  }
  for (const c of fixture.rejected) {
    const r = decodeSaveCode(c.code);
    assert.deepEqual([r.ok, r.ok ? "" : r.error], [false, c.error], c.name);
  }
});

test("互換の正解データ(compat_save_v9.json):保存の版 9 の署名なしと署名つきのコードが、読めて決まった結果になる(D-397)", async () => {
  const { readSaveCode, signSaveCode } = await import("../src/core/signed_code.js");
  const { CURRENT_KEY } = await import("../src/ui/save_sign.js");
  const fixture = JSON.parse(readText("tests/fixtures/compat_save_v9.json"));
  assert.equal(fixture.version, 9);
  for (const c of fixture.cases) {
    // 版 10 で読むと、ゲージはウロコパワーになる(D-403)。
    const want = toV10(c.progress);
    assert.deepEqual(decodeSaveCode(c.code), { ok: true, progress: want }, c.name);
    assert.deepEqual(parseSave(c.code), want, `${c.name}:ブラウザの保存としても読める`);
    assert.deepEqual(await readSaveCode(c.signed, { keys: [CURRENT_KEY] }), { ok: true, progress: want, signed: true, keyId: "dev", warning: null }, c.name);
  }
  for (const c of fixture.rejected) {
    const r = decodeSaveCode(c.code);
    assert.deepEqual([r.ok, r.ok ? "" : r.error], [false, c.error], c.name);
  }
});

test("互換の正解データ(compat_save_v10.json):保存の版 10 の署名なしと署名つきのコードが、読めて決まった結果になる(D-403)", async () => {
  const { readSaveCode, signSaveCode } = await import("../src/core/signed_code.js");
  const { CURRENT_KEY } = await import("../src/ui/save_sign.js");
  const fixture = JSON.parse(readText("tests/fixtures/compat_save_v10.json"));
  assert.equal(fixture.version, 10);
  for (const c of fixture.cases) {
    // 版 13 で読むと、注入した量は貯めているウロコパワーに戻る(D-411)。
    const want = toV13(c.progress);
    assert.deepEqual(decodeSaveCode(c.code), { ok: true, progress: want }, c.name);
    assert.deepEqual(parseSave(c.code), want, `${c.name}:ブラウザの保存としても読める`);
    assert.deepEqual(await readSaveCode(c.signed, { keys: [CURRENT_KEY] }), { ok: true, progress: want, signed: true, keyId: "dev", warning: null }, c.name);
    void signSaveCode;
  }
  for (const c of fixture.rejected) {
    const r = decodeSaveCode(c.code);
    assert.deepEqual([r.ok, r.ok ? "" : r.error], [false, c.error], c.name);
  }
});

test("互換の正解データ(compat_save_v11.json):保存の版 11 の署名なしと署名つきのコードが、読めて決まった結果になる(D-405)", async () => {
  const { readSaveCode, signSaveCode } = await import("../src/core/signed_code.js");
  const { CURRENT_KEY } = await import("../src/ui/save_sign.js");
  const fixture = JSON.parse(readText("tests/fixtures/compat_save_v11.json"));
  assert.equal(fixture.version, 11);
  for (const c of fixture.cases) {
    assert.deepEqual(decodeSaveCode(c.code), { ok: true, progress: c.progress }, c.name);
    assert.deepEqual(parseSave(c.code), c.progress, `${c.name}:ブラウザの保存としても読める`);
    if (fixture.version === SAVE_VERSION) assert.equal(encodeSaveCode(c.progress), c.code, `${c.name}:書き出しも同じ`);
    assert.deepEqual(await readSaveCode(c.signed, { keys: [CURRENT_KEY] }), { ok: true, progress: c.progress, signed: true, keyId: "dev", warning: null }, c.name);
    if (fixture.version === SAVE_VERSION) assert.equal(await signSaveCode(c.progress, CURRENT_KEY), c.signed, `${c.name}:署名つきの書き出しも同じ`);
  }
  for (const c of fixture.rejected) {
    const r = decodeSaveCode(c.code);
    assert.deepEqual([r.ok, r.ok ? "" : r.error], [false, c.error], c.name);
  }
});

test("互換の正解データ(compat_save_v12.json):保存の版 12 の署名なしと署名つきのコードが、読めて決まった結果になる(D-410)", async () => {
  const { readSaveCode, signSaveCode } = await import("../src/core/signed_code.js");
  const { CURRENT_KEY } = await import("../src/ui/save_sign.js");
  const fixture = JSON.parse(readText("tests/fixtures/compat_save_v12.json"));
  assert.equal(fixture.version, 12);
  for (const c of fixture.cases) {
    assert.deepEqual(decodeSaveCode(c.code), { ok: true, progress: c.progress }, c.name);
    assert.deepEqual(parseSave(c.code), c.progress, `${c.name}:ブラウザの保存としても読める`);
    if (fixture.version === SAVE_VERSION) assert.equal(encodeSaveCode(c.progress), c.code, `${c.name}:書き出しも同じ`);
    assert.deepEqual(await readSaveCode(c.signed, { keys: [CURRENT_KEY] }), { ok: true, progress: c.progress, signed: true, keyId: "dev", warning: null }, c.name);
    if (fixture.version === SAVE_VERSION) assert.equal(await signSaveCode(c.progress, CURRENT_KEY), c.signed, `${c.name}:署名つきの書き出しも同じ`);
  }
  for (const c of fixture.rejected) {
    const r = decodeSaveCode(c.code);
    assert.deepEqual([r.ok, r.ok ? "" : r.error], [false, c.error], c.name);
  }
});

test("互換の正解データ(compat_save_v13.json):保存の版 13 の署名なしと署名つきのコードが、読めて決まった結果になる(D-411)", async () => {
  const { readSaveCode, signSaveCode } = await import("../src/core/signed_code.js");
  const { CURRENT_KEY } = await import("../src/ui/save_sign.js");
  const fixture = JSON.parse(readText("tests/fixtures/compat_save_v13.json"));
  assert.equal(fixture.version, 13);
  for (const c of fixture.cases) {
    assert.deepEqual(decodeSaveCode(c.code), { ok: true, progress: c.progress }, c.name);
    assert.deepEqual(parseSave(c.code), c.progress, `${c.name}:ブラウザの保存としても読める`);
    if (fixture.version === SAVE_VERSION) assert.equal(encodeSaveCode(c.progress), c.code, `${c.name}:書き出しも同じ`);
    assert.deepEqual(await readSaveCode(c.signed, { keys: [CURRENT_KEY] }), { ok: true, progress: c.progress, signed: true, keyId: "dev", warning: null }, c.name);
    if (fixture.version === SAVE_VERSION) assert.equal(await signSaveCode(c.progress, CURRENT_KEY), c.signed, `${c.name}:署名つきの書き出しも同じ`);
  }
  for (const c of fixture.rejected) {
    const r = decodeSaveCode(c.code);
    assert.deepEqual([r.ok, r.ok ? "" : r.error], [false, c.error], c.name);
  }
});
