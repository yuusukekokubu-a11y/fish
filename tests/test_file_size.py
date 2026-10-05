"""ファイルの大きさの目安(D-006)のテスト。"""

from __future__ import annotations

import re
import subprocess

from conftest import ROOT

LIMIT = 800
TEXT_SUFFIXES = {".py", ".md", ".toml", ".yml", ".yaml", ".txt", ".cfg", ".ini", ".json"}


def tracked_files():
    out = subprocess.run(
        ["git", "ls-files"], cwd=ROOT, capture_output=True, text=True, check=True
    ).stdout
    return [ROOT / line for line in out.splitlines() if line]


def allowed_large_files():
    design = (ROOT / "docs" / "DESIGN.md").read_text(encoding="utf-8")
    section = design.split("### 800 行を超えるファイル", 1)[1].split("\n## ", 1)[0]
    return set(re.findall(r"^- `([^`]+)`:", section, re.MULTILINE))


def test_large_files_are_explained_in_design():
    allowed = allowed_large_files()
    too_large = []
    for path in tracked_files():
        if path.suffix not in TEXT_SUFFIXES or not path.is_file():
            continue
        lines = len(path.read_text(encoding="utf-8").splitlines())
        rel = path.relative_to(ROOT).as_posix()
        if lines > LIMIT and rel not in allowed:
            too_large.append(f"{rel}({lines} 行)")
    assert not too_large, f"{LIMIT} 行を超え、DESIGN に理由がないファイル:{too_large}"
