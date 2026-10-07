// 署名の鍵の書き込みと置き場のテスト(署名の依頼の受け入れ条件 5:D-292・D-293)。

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { checkKey, filesContaining, PRODUCTION_KEY_ID, stampKey } from "../scripts/stamp_key.mjs";
import { SIGNING_KEY_ID, SIGNING_KEY_SECRET } from "../src/save_key.js";
import { readText } from "./helpers.js";

const SOURCE = readText("src/save_key.js");
// テスト用の作り物の鍵(本物の鍵ではない)。公開の処理として動かすテストでは「リポジトリのファイルに鍵の文字がない」ことも
// 確かめるので、このファイルに鍵の文字がそのまま入らないよう、組み立てて作る。
const FAKE = ["test", "only", "key", (0x0123456789).toString(16), "abcdef"].join("-");

test("リポジトリの鍵は仮の鍵(番号 dev)。本番の鍵の番号(k1)を書いたファイルはない", () => {
  assert.deepEqual([SIGNING_KEY_ID, SIGNING_KEY_SECRET], ["dev", "dev-placeholder-key-not-secret"]);
  assert.match(SOURCE, /秘密ではない/);
  const names = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter((n) => /\.(m?js|html|json|ya?ml)$/.test(n));
  const assigned = names.filter((n) => /SIGNING_KEY_ID = "k\d+"/.test(readFileSync(n, "utf8")));
  assert.deepEqual(assigned, [], "本番の鍵の番号を書いたファイル");
});

test("本番の鍵(公開のときの環境変数)が、リポジトリのどのファイルにも入っていない", (t) => {
  const secret = process.env.SAVE_SIGNING_KEY;
  if (!secret) {
    t.skip("SAVE_SIGNING_KEY がない(公開の処理で、同じ確かめを本番の鍵で行う)");
    return;
  }
  assert.deepEqual(filesContaining(secret), []);
});

test("書き込み:鍵の番号を k1、鍵を Secrets の値にする。ほかの行は変えない", () => {
  const out = stampKey(SOURCE, FAKE);
  assert.match(out, new RegExp(`^export const SIGNING_KEY_ID = "${PRODUCTION_KEY_ID}";$`, "m"));
  assert.ok(out.split("\n").includes(`export const SIGNING_KEY_SECRET = ${JSON.stringify(FAKE)};`));
  assert.equal(out.split("\n").length, SOURCE.split("\n").length);
  // 引用符や $ を含む鍵も、そのまま JavaScript の文字列になる。
  const tricky = 'a"b\\c$&$1-0123456789';
  const t = stampKey(SOURCE, tricky);
  assert.ok(t.includes(`= ${JSON.stringify(tricky)};`));
});

test("鍵がない・空・短い・仮の鍵と同じなら、はっきりした文で失敗する(鍵の値は文に出さない)", () => {
  assert.throws(() => checkKey(undefined), /SAVE_SIGNING_KEY が設定されていません/);
  assert.throws(() => checkKey("  "), /SAVE_SIGNING_KEY が設定されていません/);
  assert.throws(() => checkKey("short-key"), (e) => e instanceof Error && /短すぎます/.test(e.message) && !e.message.includes("short-key"));
  assert.throws(() => checkKey(SIGNING_KEY_SECRET), /仮の鍵と同じ/);
  assert.doesNotThrow(() => checkKey(FAKE));
});

test("公開の処理として動かす:鍵がないと失敗して文を出す。あると書き込み、記録に鍵の値を出さない", () => {
  const dir = mkdtempSync(join(tmpdir(), "stamp-key-"));
  const file = join(dir, "save_key.js");
  writeFileSync(file, SOURCE);
  const run = (env) => spawnSync(process.execPath, ["scripts/stamp_key.mjs", file], { encoding: "utf8", env: { ...process.env, SAVE_SIGNING_KEY: env } });
  const none = run("");
  assert.equal(none.status, 1);
  assert.match(none.stderr, /::error::SAVE_SIGNING_KEY が設定されていません/);
  assert.equal(readFileSync(file, "utf8"), SOURCE, "失敗したら書き込まない");
  // 鍵の文字がリポジトリのファイルにあると失敗する(ここでは、このファイルに鍵の文字がないので通る)。
  assert.deepEqual(filesContaining(FAKE), []);
  const ok = run(FAKE);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /鍵の番号 k1 の鍵を書き込みました/);
  assert.ok(!ok.stdout.includes(FAKE) && !ok.stderr.includes(FAKE), "記録に鍵の値を出さない");
  assert.ok(readFileSync(file, "utf8").includes(FAKE));
});
