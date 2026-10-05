// バージョン表記のテスト(受け入れ条件 11)。

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createGame, PHASES, tap, update } from "../src/core/fishing.js";
import { BUILD, VERSION, versionLabel } from "../src/version.js";
import { stampVersion } from "../scripts/stamp_version.mjs";
import { hookJust, ROOT } from "./helpers.js";

test("リポジトリと手元では、識別番号は dev", () => {
  assert.equal(BUILD, "dev");
  assert.match(VERSION, /^0\.\d+\.\d+$/);
  assert.equal(versionLabel(), `v${VERSION}・dev`);
  assert.equal(versionLabel("0.6.0", "abc1234"), "v0.6.0・abc1234");
});

test("公開の処理と同じ手順で、公開用の version.js にだけ commit の頭 7 文字が入る", () => {
  const site = mkdtempSync(join(tmpdir(), "fish-site-"));
  cpSync(join(ROOT, "src"), join(site, "src"), { recursive: true });
  const sha = "0123456789abcdef0123456789abcdef01234567";
  execFileSync(process.execPath, [join(ROOT, "scripts", "stamp_version.mjs"), join(site, "src", "version.js"), sha]);
  const stamped = readFileSync(join(site, "src", "version.js"), "utf8");
  assert.match(stamped, /^export const BUILD = "0123456";$/m);
  assert.match(stamped, new RegExp(`^export const VERSION = "${VERSION.replaceAll(".", "\\.")}";$`, "m"));
  // リポジトリのファイルは変わらない。
  assert.match(readFileSync(join(ROOT, "src", "version.js"), "utf8"), /^export const BUILD = "dev";$/m);
});

test("commit の番号でない値や、BUILD の行がないときは書き込まない", () => {
  const source = readFileSync(join(ROOT, "src", "version.js"), "utf8");
  assert.throws(() => stampVersion(source, "not-a-sha"));
  assert.throws(() => stampVersion("export const VERSION = '1';", "abcdef0"));
});

test("計算本体はバージョンを読まない(表記はゲームの結果や保存に影響しない)", () => {
  const dir = join(ROOT, "src", "core");
  for (const file of readdirSync(dir)) {
    assert.doesNotMatch(readFileSync(join(dir, file), "utf8"), /version\.js/, file);
  }
  // 書き込みのあとの version.js を読み込んでも、遊んだ結果は同じ(計算本体は version.js に触れない)。
  const play = () => {
    const g = createGame(5);
    for (let t = 0; t < 120000; t += 16) {
      update(g, 16);
      if (g.phase === PHASES.BITE && hookJust(g)) tap(g);
    }
    return g.results;
  };
  assert.deepEqual(play(), play());
});
