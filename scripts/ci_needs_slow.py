"""PR で重いテストを回すかを、変わったファイルの一覧から決める(D-012)。

使い方:
    変わったファイルを 1 行に 1 つずつ標準入力に渡す。
    結果を "true" か "false" で表示する。
    環境変数 GITHUB_OUTPUT があれば、そこへ "needs_slow=true" などを書き足す。
"""

from __future__ import annotations

import os
import sys
from collections.abc import Iterable

# ここで始まるファイルが変わったら、重いテストを回す。
SLOW_PREFIXES = (
    "src/fish/",
    "tests/slow/",
)
# このファイルそのものが変わったら、重いテストを回す。
SLOW_FILES = (
    "scripts/run_slow_tests.py",
)


def needs_slow(changed_files: Iterable[str]) -> bool:
    """変わったファイルの中に、計算本体か重いテストに関わるものがあれば True。"""
    for raw in changed_files:
        path = raw.strip().replace("\\", "/").removeprefix("./")
        if not path:
            continue
        if path in SLOW_FILES or path.startswith(SLOW_PREFIXES):
            return True
    return False


def main() -> int:
    result = "true" if needs_slow(sys.stdin.read().splitlines()) else "false"
    print(result)
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as f:
            f.write(f"needs_slow={result}\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
