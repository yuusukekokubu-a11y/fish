// 保存の形(版 4)とセーブコード(TSURI4。TSURI1〜3 も読む)のテスト(②-4c 土台の条件 6・7・8、装備のロックの条件 4、餌と自動分解の条件 6、
// ②-4d の条件 10:D-223・D-232・D-247・D-267・D-280)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame } from "../src/core/fishing.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { effectRange, RARITY_ROWS } from "../src/core/gear.js";
import { levelRange, SKILL_ROWS } from "../src/core/skills.js";
import { syntheticContent } from "../src/core/synthetic.js";
import { decodeSave, encodeSave, initialProgress, SAVE_VERSION, STEP_ORDER, UPGRADES, upgradeSave } from "../src/core/save.js";
import { checksum, decodeSaveCode, encodeSaveCode, parseSave, SAVE_CODE_ERRORS } from "../src/core/savecode.js";
import { asCurrentTable, readText } from "./helpers.js";

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
// 版 7 で足したグローブの 2 つの欄(判定 0 回・次の番号 1・装着なし・持ち物なし:D-335)。
const GLOVES = "~0.1.~";

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

test("版 7 の形:13 の欄(ウロコイン・竿・鱗・釣れた魚・ガチャ・装着・持ち物・ロック・餌と自動分解・釣り場・出会ったスキル・グローブ 2 つ)を 36 進数の数と記号で書く", () => {
  assert.equal(SAVE_VERSION, 7);
  assert.equal(encodeSave(sample()), `${V3_BODY}~~${SEEN_MASK}${GLOVES}`, "いちばん新しい釣り場にいるときは、釣り場の欄は空");
  const p = sample();
  p.gear.items[1].locked = true;
  assert.equal(encodeSave(p), `${V1_BODY}~010~0.0.0~~${SEEN_MASK}${GLOVES}`, "ロックは持ち物の順に 1 個 1 字");
  assert.match(encodeSaveCode(sample()), /^TSURI7-[0-9A-Za-z.,:~-]+-[0-9a-f]{8}$/);
  // 古い釣り場(港)にいるとき:釣り場の id を書く(D-280)。
  const old = { ...sample(), rodStage: 7, area: "minato" };
  assert.equal(encodeSave(old).split("~")[9], "minato");
  assert.deepEqual(decodeSaveCode(encodeSaveCode(old)), { ok: true, progress: old }, "釣り場も往復で元に戻る");
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p)), { ok: true, progress: p }, "ロックも往復で元に戻る");
  // 餌 99 個(36 進数で 2r)・スイッチ入り・自動分解「エピックまで」(番号 3)。
  const b = { ...sample(), bait: 99, useBait: true, autoScrap: "epic" };
  assert.equal(encodeSave(b), `${V2_BODY}~2r.1.3~~${SEEN_MASK}${GLOVES}`);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(b)), { ok: true, progress: b }, "餌・スイッチ・自動分解も往復で元に戻る");
  for (const [id, n] of [["normal", 1], ["rare", 2]]) {
    const q = { ...sample(), bait: 1, autoScrap: id };
    assert.equal(encodeSave(q).split("~")[8], `1.0.${n}`);
    assert.deepEqual(decodeSaveCode(encodeSaveCode(q)).progress, q);
  }
});

test("版 2(TSURI2)のコードと本文を読み、版 3 → 版 4 に読み替える(餌 0・スイッチはオフ・自動分解はオフ。ほかは変わらない)", () => {
  assert.equal(UPGRADES[2](V2_BODY), V3_BODY);
  assert.equal(upgradeSave(V2_BODY, 2), `${V3_BODY}~~${SEEN_MASK}${GLOVES}`);
  assert.equal(UPGRADES[2](V1_BODY), null, "欄の数がちがう版 2 は読み替えない");
  const p = sample();
  p.gear.items[0].locked = true;
  const body2 = `${V1_BODY}~100`;
  const r = decodeSaveCode(`TSURI2-${body2}-${checksum(body2)}`);
  assert.deepEqual(r, { ok: true, progress: p });
  assert.ok(r.ok && !("bait" in r.progress) && !("useBait" in r.progress) && !("autoScrap" in r.progress));
  assert.deepEqual(parseSave(`TSURI2-${body2}-${checksum(body2)}`), p, "ブラウザに残った版 2 の保存データも読める");
  assert.match(encodeSaveCode(p), /^TSURI7-/);
  // 版 2 なのに 9 つの欄は拒否。
  assert.equal(decodeSaveCode(`TSURI2-${V2_BODY}~0.0.0-${checksum(`${V2_BODY}~0.0.0`)}`).error, "content");
});

test("版 1(TSURI1)のコードと本文を読み、版 2 → 版 3 → 版 4 と順に読み替える(ロックは全てなし。ほかは変わらない)", () => {
  assert.equal(UPGRADES[1](V1_BODY), `${V1_BODY}~000`);
  assert.equal(upgradeSave(V1_BODY, 1), `${V1_BODY}~000~0.0.0~~${SEEN_MASK}${GLOVES}`, "版 1 → 2 → … → 7");
  assert.equal(upgradeSave(`${V3_BODY}~`, 4), `${V3_BODY}~~${SEEN_MASK}${GLOVES}`, "版 4 → 5:持ち物のスキルが出会ったスキルになる");
  assert.equal(UPGRADES[5](`${V3_BODY}~~${SEEN_MASK}`), `${V3_BODY}~~${SEEN_MASK}`, "版 5 → 6:本文は同じ(D-325)");
  assert.equal(UPGRADES[5](V3_BODY), null, "欄の数がちがう版 5 は読み替えない");
  assert.equal(UPGRADES[6](`${V3_BODY}~~${SEEN_MASK}`), `${V3_BODY}~~${SEEN_MASK}${GLOVES}`, "版 6 → 7:グローブの欄を空で足す(D-335)");
  assert.equal(UPGRADES[6](V3_BODY), null, "欄の数がちがう版 6 は読み替えない");
  assert.equal(upgradeSave(`${V3_BODY}~~${SEEN_MASK}${GLOVES}`, 7), `${V3_BODY}~~${SEEN_MASK}${GLOVES}`, "今の版はそのまま");
  assert.equal(upgradeSave(V1_BODY, 0), null);
  assert.equal(upgradeSave(V1_BODY, 8), null);
  assert.equal(UPGRADES[1]("1~2"), null, "欄の数がちがう版 1 は読み替えない");
  const r = decodeSaveCode(`TSURI1-${V1_BODY}-${checksum(V1_BODY)}`);
  assert.deepEqual(r, { ok: true, progress: sample() });
  assert.ok(r.ok && r.progress.gear.items.every((it) => !("locked" in it)));
  // ブラウザに残った版 1 の保存データも読める(次に保存するときは版 4)。
  assert.deepEqual(parseSave(`TSURI1-${V1_BODY}-${checksum(V1_BODY)}`), sample());
  // 読み替えたものを書くと版 4。
  assert.match(encodeSaveCode(r.ok ? r.progress : sample()), /^TSURI7-/);
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
  for (const v of [0, 8, 10]) assert.equal(decodeSaveCode(`TSURI${v}-${body}-${checksum(body)}`).error, "version", `版 ${v}`);
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
