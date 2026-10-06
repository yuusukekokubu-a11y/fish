// 保存の形(版 2)とセーブコード(TSURI2。TSURI1 も読む)のテスト(②-4c 土台の条件 6・7・8、装備のロックの条件 4:D-223・D-232・D-247)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGame } from "../src/core/fishing.js";
import { DEFAULT_CONFIG } from "../src/core/config.js";
import { DEFAULT_CONTENT } from "../src/core/fish.js";
import { effectRange, RARITY_ROWS } from "../src/core/gear.js";
import { levelRange } from "../src/core/skills.js";
import { syntheticContent } from "../src/core/synthetic.js";
import { decodeSave, encodeSave, initialProgress, SAVE_VERSION, STEP_ORDER, UPGRADES, upgradeSave } from "../src/core/save.js";
import { checksum, decodeSaveCode, encodeSaveCode, parseSave, SAVE_CODE_ERRORS } from "../src/core/savecode.js";
import { readText } from "./helpers.js";

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
  };
}

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

test("版 2 の形:8 つの欄(ウロコイン・竿・鱗・釣れた魚・ガチャ・装着・持ち物・ロック)を 36 進数の数と記号で書く", () => {
  assert.equal(SAVE_VERSION, 2);
  assert.equal(encodeSave(sample()), `${V1_BODY}~000`);
  const p = sample();
  p.gear.items[1].locked = true;
  assert.equal(encodeSave(p), `${V1_BODY}~010`, "ロックは持ち物の順に 1 個 1 字");
  assert.match(encodeSaveCode(sample()), /^TSURI2-[0-9A-Za-z.,:~-]+-[0-9a-f]{8}$/);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p)), { ok: true, progress: p }, "ロックも往復で元に戻る");
});

test("版 1(TSURI1)のコードと本文を読み、版 2 に読み替える(ロックは全てなし。ほかは変わらない)", () => {
  assert.equal(UPGRADES[1](V1_BODY), `${V1_BODY}~000`);
  assert.equal(upgradeSave(V1_BODY, 1), `${V1_BODY}~000`);
  assert.equal(upgradeSave(`${V1_BODY}~000`, 2), `${V1_BODY}~000`, "今の版はそのまま");
  assert.equal(upgradeSave(V1_BODY, 0), null);
  assert.equal(upgradeSave(V1_BODY, 3), null);
  assert.equal(UPGRADES[1]("1~2"), null, "欄の数がちがう版 1 は読み替えない");
  const r = decodeSaveCode(`TSURI1-${V1_BODY}-${checksum(V1_BODY)}`);
  assert.deepEqual(r, { ok: true, progress: sample() });
  assert.ok(r.ok && r.progress.gear.items.every((it) => !("locked" in it)));
  // ブラウザに残った版 1 の保存データも読める(次に保存するときは版 2)。
  assert.deepEqual(parseSave(`TSURI1-${V1_BODY}-${checksum(V1_BODY)}`), sample());
  // 読み替えたものを書くと版 2。
  assert.match(encodeSaveCode(r.ok ? r.progress : sample()), /^TSURI2-/);
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
  assert.equal(decodeSaveCode("TSURI2-abc").error, "format");
  const body = encodeSave(sample());
  for (const v of [0, 3, 10]) assert.equal(decodeSaveCode(`TSURI${v}-${body}-${checksum(body)}`).error, "version", `版 ${v}`);
  assert.equal(decodeSaveCode("TSURI1-" + "a".repeat(60000) + "-00000000").error, "format");
});

test("壊れた・範囲外・存在しない魚や工程・重複・装着の番号が持ち物にない、は拒否する(content)", () => {
  const bad = {
    欄が足りない: codeOf("1~1.0~~~0..1~"),
    ウロコインが大きすぎ: withField(0, "zzzzzzzzzzzz"),
    ウロコインの先頭が0: withField(0, "01"),
    ウロコインが記号: withField(0, "-1"),
    段階0: withField(1, "0.0"),
    段階が表をこえる: withField(1, "6.0"),
    存在しない工程: withField(1, "2.4"),
    進化済みは最後の段階だけ: withField(1, "2.3"),
    竿の欄の形: withField(1, "2"),
    存在しない魚の鱗: withField(2, "maguro:1"),
    鱗が0: withField(2, "kurodai:0"),
    鱗が重複: withField(2, "kurodai:1,kurodai:2"),
    鱗の形: withField(2, "kurodai"),
    存在しない魚を釣った: withField(3, "katsuo"),
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
    版2なのにロックの欄がない: codeOf(V1_BODY),
    版2で欄が多い: codeOf(`${V1_BODY}~000~0`),
  };
  for (const [name, code] of Object.entries(bad)) {
    const r = decodeSaveCode(code);
    assert.equal(r.ok, false, name);
    assert.equal(r.error, "content", name);
  }
  // 持ち物が 100 個をこえる(装着なし、次の番号は 200)。
  const parts = encodeSave(sample()).split("~");
  parts[4] = "5.3f.5k";
  parts[5] = "";
  parts[6] = Array.from({ length: 101 }, () => "1.8.1.5").join(",");
  parts[7] = "0".repeat(101);
  assert.equal(decodeSaveCode(codeOf(parts.join("~"))).error, "content");
  parts[6] = Array.from({ length: 100 }, () => "1.8.1.5").join(",");
  parts[7] = "1".repeat(100);
  assert.equal(decodeSaveCode(codeOf(parts.join("~"))).ok, true, "100 個までは読める");
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
  const body = encodeSave(p, content);
  const added = body.length - body.slice(0, body.lastIndexOf("~")).length;
  assert.ok(added <= 200, `増え ${added} 文字`);
  assert.deepEqual(decodeSaveCode(encodeSaveCode(p, content), content).progress, p);
});

test("互換の正解データ(compat_v1.json・compat_v2.json):いつまでも読めて、同じ結果になる(消さない:DESIGN の決まり)", () => {
  for (const version of [1, 2]) {
    const fixture = JSON.parse(readText(`tests/fixtures/compat_v${version}.json`));
    assert.equal(fixture.version, version);
    for (const c of fixture.cases) {
      const r = decodeSaveCode(c.code);
      assert.deepEqual(r, { ok: true, progress: c.progress }, c.name);
      // 書き出すのは今の版。今の版の正解データは書き出しも同じ。古い版は、書き出して読み直すと同じ。
      const code = encodeSaveCode(c.progress);
      if (version === SAVE_VERSION) assert.equal(code, c.code, `${c.name}:書き出しも同じ`);
      assert.deepEqual(decodeSaveCode(code), { ok: true, progress: c.progress }, `${c.name}:今の版で往復`);
    }
    for (const c of fixture.rejected) assert.equal(decodeSaveCode(c.code).error, c.error, c.name);
  }
});
