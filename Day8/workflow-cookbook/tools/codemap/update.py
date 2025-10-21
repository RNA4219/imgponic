# SPDX-License-Identifier: Apache-2.0
# Copyright 2025 RNA4219

"""Birdseyeインデックスとカプセルを再生成するスクリプト。"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Mapping

LINK_PATTERN = re.compile(r"\[[^\]]+\]\(([^)]+)\)")


@dataclass(frozen=True)
class UpdateOptions:
    targets: tuple[Path, ...]
    emit: str


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def parse_args(argv: Iterable[str] | None = None) -> UpdateOptions:
    parser = argparse.ArgumentParser(
        description="Regenerate Birdseye index and capsules.",
    )
    parser.add_argument(
        "--targets",
        type=str,
        required=True,
        help="Comma-separated list of repository roots to analyse.",
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


def _load_json(path: Path) -> Mapping[str, object]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def _split_front_matter(text: str) -> tuple[dict[str, str], str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end == -1:
        return {}, text
    block = text[4:end]
    body = text[end + 4 :]
    front: dict[str, str] = {}
    for line in block.splitlines():
        if not line.strip() or ":" not in line:
            continue
        key, value = line.split(":", 1)
        front[key.strip()] = value.strip()
    return front, body


def _extract_links(root: Path, src: Path, body: str) -> set[str]:
    deps: set[str] = set()
    for match in LINK_PATTERN.findall(body):
        target = match.split("#", 1)[0].strip()
        if not target or "://" in target or target.startswith("mailto:"):
            continue
        resolved = (src.parent / target).resolve()
        try:
            relative = resolved.relative_to(root)
        except ValueError:
            continue
        if resolved.is_dir() or resolved.suffix.lower() not in {".md", ".json"}:
            continue
        if not resolved.exists():
            continue
        deps.add(relative.as_posix())
    return deps


def _caps_filename(node_id: str) -> str:
    return node_id.replace("/", ".") + ".json"


def _isoformat(path: Path) -> str:
    value = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc)
    return value.isoformat().replace("+00:00", "Z")


def run_update(options: UpdateOptions) -> None:
    for root in options.targets:
        if not root.exists():
            print(f"[ERROR] {root}: missing target")
            continue
        birdseye_dir = root / "docs" / "birdseye"
        caps_dir = birdseye_dir / "caps"
        if not birdseye_dir.exists():
            print(f"[ERROR] {root}: missing docs/birdseye directory")
            continue
        caps_dir.mkdir(parents=True, exist_ok=True)

        index_path = birdseye_dir / "index.json"
        existing_index = _load_json(index_path)
        existing_roles = {
            node_id: data.get("role", "document")
            for node_id, data in existing_index.get("nodes", {}).items()
            if isinstance(data, Mapping)
        }

        nodes: dict[str, dict[str, str]] = {}
        front_matters: dict[str, dict[str, str]] = {}
        deps_out: dict[str, list[str]] = {}

        markdown_paths = [path for path in root.rglob("*.md") if "docs" not in path.relative_to(root).parts or path.relative_to(root).parts[:2] != ("docs", "birdseye")]
        for md_path in markdown_paths:
            rel = md_path.relative_to(root).as_posix()
            front, body = _split_front_matter(md_path.read_text(encoding="utf-8"))
            front_matters[rel] = front
            deps = sorted(_extract_links(root, md_path, body))
            deps_out[rel] = deps
            role = existing_roles.get(rel, "document")
            nodes[rel] = {
                "role": role,
                "caps": f"docs/birdseye/caps/{_caps_filename(rel)}",
                "mtime": _isoformat(md_path),
            }

        deps_in: dict[str, list[str]] = defaultdict(list)
        edges: list[list[str]] = []
        for src, destinations in deps_out.items():
            filtered = [dest for dest in destinations if dest in nodes]
            deps_out[src] = filtered
            for dest in filtered:
                deps_in[dest].append(src)
                edges.append([src, dest])
        for node in deps_in:
            deps_in[node].sort()

        if options.emit in ("index", "index+caps"):
            payload = {
                "generated_at": utcnow().isoformat().replace("+00:00", "Z"),
                "nodes": nodes,
                "edges": edges,
            }
            index_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )

        if options.emit in ("caps", "index+caps"):
            for node_id, meta in nodes.items():
                cap_path = caps_dir / _caps_filename(node_id)
                cap_payload = dict(_load_json(cap_path))
                cap_payload.update(
                    {
                        "id": node_id,
                        "role": meta["role"],
                        "front_matter": front_matters.get(node_id, {}),
                        "deps_out": deps_out.get(node_id, []),
                        "deps_in": deps_in.get(node_id, []),
                    }
                )
                cap_path.write_text(
                    json.dumps(cap_payload, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )


def main(argv: Iterable[str] | None = None) -> int:
    ensure_python_version()
    options = parse_args(argv)
    run_update(options)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
