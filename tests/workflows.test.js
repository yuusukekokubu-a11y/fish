// GitHub のテストの設定が決まりどおりかのテスト(D-005・D-015・D-026〜D-028)。
// 外部の部品を入れないため、YAML を読む道具は使わず、行のまとまりで確かめる。

import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { readText, ROOT } from "./helpers.js";

const CI = readText(".github/workflows/ci.yml");
const ALLOWED_ACTIONS = new Set(["actions/checkout", "actions/setup-node"]);

/** jobs: の下を、ジョブの名前ごとの文字列に分ける。 */
function jobs(text) {
  const body = text.split(/^jobs:\s*$/m)[1];
  const result = {};
  let name = null;
  for (const line of body.split("\n")) {
    const m = line.match(/^ {2}([\w-]+):\s*$/);
    if (m) {
      name = m[1];
      result[name] = "";
    } else if (name) {
      result[name] += line + "\n";
    }
  }
  return result;
}

/** ジョブの中の if: の条件(複数行の書き方にも対応)を 1 行にする。 */
function condition(job) {
  const m = job.match(/^ {4}if: (>-\n((?: {6}.*\n)+)|(.*)\n)/m);
  assert.ok(m, "if: がない");
  return (m[2] ?? m[3]).split("\n").map((s) => s.trim()).join(" ").trim();
}

const JOBS = jobs(CI);

test("PR・main への取り込み・手動の実行で動く", () => {
  const on = CI.split(/^on:\s*$/m)[1].split(/^\S/m)[0];
  assert.match(on, /^ {2}pull_request:/m);
  assert.match(on, /^ {2}push:\n {4}branches: \[main\]/m);
  assert.match(on, /^ {2}workflow_dispatch:/m);
});

test("同じ PR の古い実行は止める", () => {
  assert.match(CI, /group: ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/);
  assert.match(CI, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/);
});

test("Node.js の版は 1 つだけ", () => {
  assert.match(CI, /NODE_VERSION: "22"/);
  assert.doesNotMatch(CI, /strategy:|matrix:/);
});

test("速いテストは PR と main で回り、重いテストは含まない", () => {
  const fast = JOBS.fast;
  assert.equal(condition(fast), "github.event_name != 'workflow_dispatch'");
  assert.match(fast, /- run: npm test$/m);
  assert.doesNotMatch(fast, /slow/);
});

test("重いテストは計算本体が変わった PR と手動の実行だけ", () => {
  const slow = JOBS.slow;
  const cond = condition(slow);
  assert.ok(cond.includes("needs.changes.outputs.needs_slow == 'true'"), cond);
  assert.ok(cond.includes("github.event_name == 'workflow_dispatch'"), cond);
  assert.ok(cond.includes("github.event_name == 'pull_request'"), cond);
  assert.ok(!cond.includes("push"), "main への取り込み後は速いテストだけ");
  assert.match(slow, /- run: npm run test:slow$/m);
});

test("判定のジョブは PR だけで、判定のスクリプトを使う", () => {
  const changes = JOBS.changes;
  assert.equal(condition(changes), "github.event_name == 'pull_request'");
  assert.match(changes, /node scripts\/ci_needs_slow\.mjs < changed_files\.txt/);
  assert.match(changes, /needs_slow: \$\{\{ steps\.decide\.outputs\.needs_slow \}\}/);
});

test("ci-result はほかの全部のジョブをまとめる", () => {
  const result = JOBS["ci-result"];
  const others = Object.keys(JOBS).filter((n) => n !== "ci-result").sort();
  const needs = result.match(/needs: \[(.*)\]/)[1].split(",").map((s) => s.trim()).sort();
  assert.deepEqual(needs, others);
  assert.equal(condition(result), "always()");
});

test("どのジョブにも時間の上限がある", () => {
  for (const [name, job] of Object.entries(JOBS)) {
    assert.match(job, /timeout-minutes: \d+/, name);
  }
});

test("外部の部品は決めたものだけで、commit の番号で固定している", () => {
  const dir = join(ROOT, ".github", "workflows");
  for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    const text = readText(join(".github", "workflows", file));
    for (const [, name, ref] of text.matchAll(/uses: ([^@\s]+)@(\S+)/g)) {
      assert.ok(ALLOWED_ACTIONS.has(name), `${file}:許可していない部品 ${name}(D-027)`);
      assert.match(ref, /^[0-9a-f]{40}$/, `${file}:commit の番号で固定していない ${name}(D-027)`);
    }
  }
});
