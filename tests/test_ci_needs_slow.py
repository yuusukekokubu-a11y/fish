"""重いテストを回すかの判定(D-012)のテスト。"""

from __future__ import annotations

import os
import subprocess
import sys

import pytest

from conftest import ROOT
from ci_needs_slow import needs_slow


@pytest.mark.parametrize(
    "files",
    [
        ["src/fish/__init__.py"],
        ["docs/SPEC.md", "src/fish/core/calc.py"],
        ["tests/slow/test_big.py"],
        ["scripts/run_slow_tests.py"],
        ["./src/fish/x.py"],
        ["src\\fish\\x.py"],
    ],
)
def test_core_changes_need_slow(files):
    assert needs_slow(files) is True


@pytest.mark.parametrize(
    "files",
    [
        [],
        [""],
        ["README.md", "docs/DECISIONS.md"],
        ["tests/test_ci_needs_slow.py"],
        [".github/workflows/ci.yml"],
        ["scripts/ci_needs_slow.py"],
        ["src/fishing/x.py"],
        ["docs/src/fish/x.md"],
    ],
)
def test_other_changes_do_not_need_slow(files):
    assert needs_slow(files) is False


@pytest.mark.parametrize(
    ("stdin", "expected"),
    [("README.md\nsrc/fish/a.py\n", "true"), ("README.md\n", "false"), ("", "false")],
)
def test_script_writes_github_output(tmp_path, stdin, expected):
    output = tmp_path / "out.txt"
    env = {**os.environ, "GITHUB_OUTPUT": str(output)}
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "ci_needs_slow.py")],
        input=stdin,
        capture_output=True,
        text=True,
        env=env,
        check=True,
    )
    assert result.stdout.strip() == expected
    assert output.read_text(encoding="utf-8") == f"needs_slow={expected}\n"
