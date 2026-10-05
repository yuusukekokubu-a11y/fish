"""テストで共通に使う道具。"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# scripts/ のスクリプトをテストから import できるようにする。
sys.path.insert(0, str(ROOT / "scripts"))
