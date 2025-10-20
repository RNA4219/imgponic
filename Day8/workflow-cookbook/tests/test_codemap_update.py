from __future__ import annotations

import json
from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest

from tools.codemap import update


def read_json(path: Any) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def test_ensure_python_version_exits(monkeypatch, capsys):
    monkeypatch.setattr(update, "sys", SimpleNamespace(version_info=(3, 10, 0)))

    with pytest.raises(SystemExit) as excinfo:
        update.ensure_python_version()

    assert excinfo.value.code == 1
    captured = capsys.readouterr()
    assert "Python 3.11 or newer is required" in captured.out


def test_run_update_generates_index_and_caps(tmp_path, monkeypatch):
    root = tmp_path / "repo"
    root.mkdir()

    birdseye_dir = root / "docs" / "birdseye"
    caps_dir = birdseye_dir / "caps"
    caps_dir.mkdir(parents=True)

    (birdseye_dir / "index.json").write_text(
        json.dumps(
            {
                "generated_at": "2024-01-01T00:00:00Z",
                "nodes": {
                    "README.md": {
                        "role": "overview",
                        "caps": "docs/birdseye/caps/README.md.json",
                        "mtime": "2024-01-01T00:00:00Z",
                    }
                },
                "edges": [],
            },
        ),
        encoding="utf-8",
    )

    (caps_dir / "README.md.json").write_text(
        json.dumps(
            {
                "id": "README.md",
                "role": "overview",
                "summary": "existing",
                "deps_out": [],
                "deps_in": [],
            }
        ),
        encoding="utf-8",
    )

    (root / "README.md").write_text(
        """---
intent_id: INT-001
owner: agent
status: active
---

See [Spec](docs/day8/spec.md).
""",
        encoding="utf-8",
    )

    spec_path = root / "docs" / "day8"
    spec_path.mkdir(parents=True)
    (spec_path / "spec.md").write_text(
        """---
intent_id: INT-002
owner: reviewer
status: draft
---

Refer back to [top](../../README.md).
""",
        encoding="utf-8",
    )

    fixed_now = datetime(2025, 5, 5, 10, 0, tzinfo=timezone.utc)
    monkeypatch.setattr(update, "utcnow", lambda: fixed_now)

    options = update.UpdateOptions(targets=(root,), emit="index+caps")

    update.run_update(options)

    index_data = read_json(birdseye_dir / "index.json")
    assert index_data["generated_at"] == "2025-05-05T10:00:00Z"
    assert index_data["nodes"] == {
        "README.md": {
            "role": "overview",
            "caps": "docs/birdseye/caps/README.md.json",
            "mtime": index_data["nodes"]["README.md"]["mtime"],
        },
        "docs/day8/spec.md": {
            "role": "document",
            "caps": "docs/birdseye/caps/docs.day8.spec.md.json",
            "mtime": index_data["nodes"]["docs/day8/spec.md"]["mtime"],
        },
    }
    assert index_data["edges"] == [
        ["README.md", "docs/day8/spec.md"],
        ["docs/day8/spec.md", "README.md"],
    ]

    readme_caps = read_json(caps_dir / "README.md.json")
    spec_caps = read_json(caps_dir / "docs.day8.spec.md.json")

    assert readme_caps["front_matter"] == {
        "intent_id": "INT-001",
        "owner": "agent",
        "status": "active",
    }
    assert readme_caps["deps_out"] == ["docs/day8/spec.md"]
    assert readme_caps["deps_in"] == ["docs/day8/spec.md"]

    assert spec_caps["front_matter"] == {
        "intent_id": "INT-002",
        "owner": "reviewer",
        "status": "draft",
    }
    assert spec_caps["deps_out"] == ["README.md"]
    assert spec_caps["deps_in"] == ["README.md"]

