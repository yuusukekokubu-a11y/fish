"""重いテストの回し方(D-013)のテスト。"""

from __future__ import annotations

import tomllib

from conftest import ROOT
from run_slow_tests import NO_TESTS_COLLECTED, normalize_exit_code


def test_no_slow_tests_counts_as_success():
    assert normalize_exit_code(NO_TESTS_COLLECTED) == 0


def test_other_exit_codes_are_kept():
    assert normalize_exit_code(0) == 0
    assert normalize_exit_code(1) == 1
    assert normalize_exit_code(2) == 2


def test_pytest_runs_only_fast_tests_by_default():
    config = tomllib.loads((ROOT / "pyproject.toml").read_text(encoding="utf-8"))
    options = config["tool"]["pytest"]["ini_options"]
    assert "-m 'not slow'" in options["addopts"]
    assert any(m.startswith("slow:") for m in options["markers"])
