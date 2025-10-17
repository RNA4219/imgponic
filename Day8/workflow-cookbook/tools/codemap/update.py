"""Birdseye再生成ツールの雛形実装。"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


@dataclass(frozen=True)
class UpdateOptions:
    targets: tuple[Path, ...]
    emit: str


def parse_args(argv: Iterable[str] | None = None) -> UpdateOptions:
    parser = argparse.ArgumentParser(
        description="Regenerate Birdseye index and capsules.",
    )
    parser.add_argument(
        "--targets",
        type=str,
        required=True,
        help="Comma-separated list of Birdseye resources to analyse.",
    )
    parser.add_argument(
        "--emit",
        type=str,
        choices=("index", "caps", "index+caps"),
        default="index+caps",
        help="Select which artefacts to write.",
    )
    args = parser.parse_args(list(argv) if argv is not None else None)
    target_paths = tuple(Path(value.strip()) for value in args.targets.split(",") if value.strip())
    if not target_paths:
        parser.error("--targets must contain at least one path")
    return UpdateOptions(targets=target_paths, emit=args.emit)


def ensure_python_version() -> None:
    if sys.version_info < (3, 11):
        print("[ERROR] Python 3.11 or newer is required.")
        raise SystemExit(1)


def run_update(options: UpdateOptions) -> None:
    """Execute the codemap update workflow.

    現在は雛形のため、処理内容は TODO として残しています。
    """
    # TODO: Implement analysis and file emission logic.
    for target in options.targets:
        if not target.exists():
            print(f"[ERROR] {target}: missing target")
            print(f"[TODO] Analyse {target}")
            continue

        missing_resources = []
        index_path = target / "index.json"
        if not index_path.exists():
            missing_resources.append("index.json")
        caps_path = target / "caps"
        if not caps_path.exists():
            missing_resources.append("caps")

        if missing_resources:
            for resource in missing_resources:
                print(f"[ERROR] {target}: missing {resource}")
        else:
            print(f"[OK] {target}: resources ready")

        print(f"[TODO] Analyse {target}")
    print(f"[TODO] Emit artefacts: {options.emit}")


def main(argv: Iterable[str] | None = None) -> int:
    ensure_python_version()
    options = parse_args(argv)
    run_update(options)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
