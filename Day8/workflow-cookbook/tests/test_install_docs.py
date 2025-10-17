from __future__ import annotations

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[2]
INSTALL_MD = ROOT / "INSTALL.md"


_DEF_SECTION_HEADER = "最低限必要なのは次の通り："
_PATTERN = re.compile(r"^- `([^`]+)`")


def _iter_install_paths(contents: str) -> list[str]:
    paths: list[str] = []
    collecting = False
    for raw_line in contents.splitlines():
        line = raw_line.strip()
        if not collecting:
            if line == _DEF_SECTION_HEADER:
                collecting = True
            continue
        if not line:
            break
        match = _PATTERN.match(line)
        if match:
            paths.append(match.group(1))
    return paths


def test_install_md_lists_existing_paths() -> None:
    listed_paths = _iter_install_paths(INSTALL_MD.read_text(encoding="utf-8"))
    missing = [path for path in listed_paths if not (ROOT / path).exists()]

    assert not missing, f"Missing paths referenced in INSTALL.md: {missing}"
