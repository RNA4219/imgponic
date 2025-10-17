from __future__ import annotations

from pathlib import Path
from typing import IO, Any, Dict, List

try:
    import yaml  # type: ignore
except ModuleNotFoundError:  # pragma: no cover - fallback for test envs without PyYAML
    class _MiniYAML:
        def safe_load(self, stream: IO[str] | str) -> Dict[str, Any]:
            if hasattr(stream, "read"):
                content = stream.read()
            else:
                content = str(stream)

            root: Dict[str, Any] = {}
            stack: list[Dict[str, Any]] = [root]
            indents = [0]

            for raw_line in content.splitlines():
                stripped = raw_line.lstrip()
                if not stripped or stripped.startswith("#"):
                    continue

                indent = len(raw_line) - len(stripped)
                key, _, value = stripped.partition(":")
                value = value.strip()

                while indent < indents[-1]:
                    stack.pop()
                    indents.pop()

                if value == "":
                    new_map: Dict[str, Any] = {}
                    stack[-1][key] = new_map
                    stack.append(new_map)
                    indents.append(indent + 2)
                else:
                    if value.startswith("[") and value.endswith("]"):
                        items = []
                        raw_items = value[1:-1].split(",") if value[1:-1].strip() else []
                        for raw_item in raw_items:
                            items.append(raw_item.strip().strip('"\''))
                        stack[-1][key] = items
                    else:
                        stack[-1][key] = value.strip('"\'')

            return root

    yaml = _MiniYAML()  # type: ignore


def _coerce_targets(raw_targets: Any) -> List[Dict[str, Any]]:
    if isinstance(raw_targets, dict):
        converted_target: Dict[str, Any] = {}
        if "- name" in raw_targets:
            converted_target["name"] = raw_targets["- name"]
        if "logs" in raw_targets:
            converted_target["logs"] = raw_targets["logs"]
        return [converted_target]
    return raw_targets


def test_reflection_manifest_present() -> None:
    project_root = Path(__file__).resolve().parents[1]
    reflection_manifest = project_root / "reflection.yaml"
    assert reflection_manifest.exists(), "workflow-cookbook/reflection.yaml が存在する必要があります"


def test_reflection_manifest_paths() -> None:
    project_root = Path(__file__).resolve().parents[1]
    reflection_manifest = project_root / "reflection.yaml"

    manifest = yaml.safe_load(reflection_manifest.read_text(encoding="utf-8"))

    targets = _coerce_targets(manifest["targets"])
    assert targets[0]["logs"] == ["logs/test.jsonl"], "targets[0].logs は logs/test.jsonl を指す必要があります"

    report = manifest["report"]
    output = report["output"]
    assert output == "reports/today.md", "report.output は reports/today.md を指す必要があります"
    assert not output.startswith("../"), "report.output で相対パス逸脱を許可しません"
