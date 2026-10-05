// 配信の道具(D-030)のテスト。リポジトリの外や隠しファイルを配信しないこと。

import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";

import { resolvePath } from "../scripts/serve.mjs";

const root = "/repo";

test("ふつうの道筋はリポジトリの中のファイルになる", () => {
  assert.equal(resolvePath(root, "/"), join(root, "index.html"));
  assert.equal(resolvePath(root, "/src/ui/main.js?x=1"), join(root, "src/ui/main.js"));
  assert.equal(resolvePath(root, "/?seed=5"), join(root, "index.html"));
});

test("リポジトリの外や隠しファイルは配信しない", () => {
  assert.equal(resolvePath(root, "/../etc/passwd"), null);
  assert.equal(resolvePath(root, "/%2e%2e/etc/passwd"), null);
  assert.equal(resolvePath(root, "/.git/config"), null);
  assert.equal(resolvePath(root, "/%E0%A4%A"), null);
});
