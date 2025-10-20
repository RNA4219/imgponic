"""Birdseye再生成ツールの雛形実装。"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Iterable


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


def read_front_matter(markdown_path: Path) -> Dict[str, str]:
    lines = markdown_path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "---":
        return {}

    body: Dict[str, str] = {}
    for line in lines[1:]:
        stripped = line.strip()
        if stripped == "---":
            break
        if not stripped or stripped.startswith("#"):
            continue
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        value = value.strip()
        if not value:
            body[key.strip()] = ""
            continue
        if " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        body[key.strip()] = value
    return body


def collect_front_matter(root: Path) -> Dict[str, Dict[str, str]]:
    front_matter: Dict[str, Dict[str, str]] = {}
    for markdown_path in root.rglob("*.md"):
        try:
            relative_path = markdown_path.relative_to(root).as_posix()
        except ValueError:
            continue
        if relative_path.startswith("docs/birdseye/"):
            continue
        data = read_front_matter(markdown_path)
        if data:
            front_matter[relative_path] = data
    return front_matter


def capsule_name_for(markdown_path: str) -> str:
    return markdown_path.replace("/", ".") + ".json"


def write_json(path: Path, payload: object) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def update_index(index_path: Path, metadata: Dict[str, Dict[str, str]]) -> None:
    if not index_path.exists():
        print(f"[WARN] Skip index update: missing {index_path}")
        return
    content = json.loads(index_path.read_text(encoding="utf-8"))
    nodes = content.get("nodes", {})
    updated = False
    for node_path, node_data in nodes.items():
        node_meta = metadata.get(node_path)
        if not node_meta:
            continue
        node_data["metadata"] = node_meta
        updated = True
    if not updated:
        return
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    content["generated_at"] = generated_at
    write_json(index_path, content)


def update_capsules(caps_dir: Path, metadata: Dict[str, Dict[str, str]]) -> None:
    if not caps_dir.exists():
        print(f"[WARN] Skip capsule update: missing {caps_dir}")
        return
    for markdown_path, node_meta in metadata.items():
        capsule_path = caps_dir / capsule_name_for(markdown_path)
        if not capsule_path.exists():
            continue
        payload = json.loads(capsule_path.read_text(encoding="utf-8"))
        payload["metadata"] = node_meta
        write_json(capsule_path, payload)


def run_update(options: UpdateOptions) -> None:
    for target in options.targets:
        if not target.exists():
            print(f"[ERROR] {target}: missing target")
            continue

        front_matter = collect_front_matter(target)
        birdseye_root = target / "docs" / "birdseye"
        if options.emit in {"index", "index+caps"}:
            update_index(birdseye_root / "index.json", front_matter)
        if options.emit in {"caps", "index+caps"}:
            update_capsules(birdseye_root / "caps", front_matter)


def main(argv: Iterable[str] | None = None) -> int:
    ensure_python_version()
    options = parse_args(argv)
    run_update(options)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
