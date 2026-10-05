"""重いテスト(marker「slow」)を回す(D-013)。

重いテストが 0 件のとき pytest は終了コード 5 を返すが、ここでは成功として扱う。
引数は、そのまま pytest に渡す。
"""

from __future__ import annotations

import subprocess
import sys

# pytest の「テストが 1 つも集まらなかった」を表す終了コード。
NO_TESTS_COLLECTED = 5


def normalize_exit_code(code: int) -> int:
    """重いテストが 0 件のときの終了コードを、成功(0)に直す。"""
    if code == NO_TESTS_COLLECTED:
        return 0
    return code


def main(argv: list[str]) -> int:
    code = subprocess.call([sys.executable, "-m", "pytest", "-m", "slow", *argv])
    if code == NO_TESTS_COLLECTED:
        print("重いテストはまだありません(0 件)。成功として終わります。")
    return normalize_exit_code(code)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
