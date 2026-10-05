// GitHub Pages の公開の設定のテスト(受け入れ条件 10、D-043・D-052)。

import assert from "node:assert/strict";
import { test } from "node:test";

import { readText } from "./helpers.js";

const PAGES = readText(".github/workflows/pages.yml");
const CI = readText(".github/workflows/ci.yml");

test("main への取り込みと手動の実行だけで動き、PR では動かない", () => {
  const on = PAGES.split(/^on:\s*$/m)[1].split(/^\S/m)[0];
  assert.match(on, /^ {2}push:\n {4}branches: \[main\]/m);
  assert.match(on, /^ {2}workflow_dispatch:/m);
  assert.doesNotMatch(on, /pull_request/);
});

test("公開は 1 つずつで、途中で止めない", () => {
  assert.match(PAGES, /concurrency:\n {2}group: pages\n {2}cancel-in-progress: false/);
});

test("公開に必要な権限だけを、公開のジョブに与える", () => {
  const top = PAGES.split(/^jobs:/m)[0];
  assert.match(top, /^permissions:\n {2}contents: read\n/m, "全体は読むだけ");
  assert.match(PAGES, / {4}permissions:\n {6}contents: read\n {6}pages: write\n {6}id-token: write\n/);
  assert.match(PAGES, /environment:\n {6}name: github-pages/);
});

test("公開するのは index.html と src/ だけ(ビルドなし、テストや文書は出さない)", () => {
  const collect = PAGES.match(/name: 公開するファイルを集める\n {8}run: \|\n((?: {10}.*\n)+)/);
  assert.ok(collect, "集める手順がない");
  const commands = collect[1].split("\n").map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(commands, ["mkdir _site", "cp index.html _site/", "cp -r src _site/"]);
  assert.match(PAGES, /uses: actions\/upload-pages-artifact@\S+.*\n {8}with:\n {10}path: _site/);
  assert.doesNotMatch(PAGES, /npm (install|ci|run build)/);
});

test("Pages の設定の前は、公開の手順を全部飛ばす(main を赤くしない)", () => {
  assert.match(PAGES, /gh api "repos\/\$REPO\/pages"/);
  assert.match(PAGES, /echo "enabled=false" >> "\$GITHUB_OUTPUT"/);
  const steps = PAGES.split(/\n {6}- /).slice(1);
  assert.ok(steps[0].startsWith("id: check"), "最初に設定を確かめる");
  for (const step of steps.slice(1)) {
    assert.match(step, /^if: steps\.check\.outputs\.enabled == 'true'/, step.split("\n")[0]);
  }
  // 確かめる手順そのものは、失敗しないように || true で受ける。
  assert.match(PAGES, /--jq '\.build_type' 2>\/dev\/null \|\| true/);
});

test("テストの設定(ci.yml)とは別で、ci-result に公開は混ざらない", () => {
  assert.doesNotMatch(CI, /deploy-pages|upload-pages-artifact/);
  assert.doesNotMatch(PAGES, /ci-result/);
});
