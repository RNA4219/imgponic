---
intent_id: INT-001
owner: your-handle
status: active   # draft|active|deprecated
last_reviewed_at: 2025-10-14
next_review_due: 2025-11-14
---

# Workflow Cookbook / Codex Task Kit

This repo defines QA/Governance-first workflows (not application code).
AI agents implement changes under these policies with acceptance tests and
canary rules.

<!-- LLM-BOOTSTRAP v1 -->
読む順番:

1. docs/birdseye/index.json  …… ノード一覧・隣接関係（軽量）
2. docs/birdseye/caps/`<path>`.json …… 必要ノードだけ point read（個別カプセル）

フォーカス手順:

- 直近変更ファイル±2hopのノードIDを index.json から取得
- 対応する caps/*.json のみ読み込み

<!-- /LLM-BOOTSTRAP -->

任意のリポジトリに貼るだけで、**仕様→実装→検収**まで一貫して回せるMD群。

- 人間にもエージェント（Codex等）にも読ませやすい最小フォーマット
- 言語・技術スタック非依存（存在するコマンドだけ使う）

## Repository structure

```text
README.md                # この概要
workflow-cookbook/docs/  # Birdseye カプセルほかドキュメント
workflow-cookbook/governance/ # ポリシーとゲート設定
workflow-cookbook/tools/      # ガバナンス関連ツール
workflow-cookbook/tests/      # ガバナンス検証用テスト
workflow-cookbook/scripts/    # CI/運用スクリプト
workflow-cookbook/examples/   # テンプレートとサンプル
workflow-cookbook/reports/    # 実行ログやレポート
workflow-cookbook/logs/       # 実行ログ（ローテーション不要）
```

## 使い方（最短）

1. これらのMDをリポジトリ直下に配置
   - この5ファイルを別リポにコピー
     - `BLUEPRINT.md`
     - `RUNBOOK.md`
     - `EVALUATION.md`
     - `CHECKLISTS.md`
     - `CHANGELOG.md`
2. `BLUEPRINT.md` で要件と制約を1ページに集約
3. 実行手順は `RUNBOOK.md`、評価基準は `EVALUATION.md` に記述し、
   以下で Birdseye の最小読込とタスク分割の前提を共有

    - [`GUARDRAILS.md`](GUARDRAILS.md) …… 行動指針と Birdseye の `deps_out`
      と整合する最小読込ガードレールを確認
    - [`tools/codemap/README.md`](tools/codemap/README.md) …… Birdseye カプセル
      再生成前提と `codemap.update` の流れを把握
    - [`tools/codemap/update.py`](tools/codemap/update.py) ……
      `python tools/codemap/update.py` で `codemap.update` を実行し
      Birdseye カプセルを再生成する。標準では直近変更ファイルから±2 hop の
      カプセルのみ更新し、今後導入予定の `--full` オプション指定時に
      全カプセルを再生成する（`GUARDRAILS.md` の
      [鮮度管理](GUARDRAILS.md#鮮度管理staleness-handling)
      参照）。

      ```sh
      # 例: カプセル出力先と解析ルートを指定して再生成
      python tools/codemap/update.py --caps docs/birdseye/caps --root .
      ```

    - [`HUB.codex.md`](HUB.codex.md) …… 仕様集約とタスク分割ハブを整備し、Birdseye カプセルの依存関係を維持
    - [`docs/IN-20250115-001.md`](docs/IN-20250115-001.md) …… インシデントログを参照し
      Birdseye カプセル要約で指示される `deps_out` を照合
4. タスクごとに `TASK.codex.md` を複製して内容を埋め、エージェントに渡す
   - 雛形との差分を確認したい場合は `examples/TASK.sample.md` を参照し、実在の値が埋め込まれたダミーサンプルと比較する
5. リリースは `CHECKLISTS.md` をなぞり、差分は `CHANGELOG.md` に追記

### 最小導入セット

- [`BLUEPRINT.md`](BLUEPRINT.md) …… Intent と仕様全体の骨子を提示
- [`RUNBOOK.md`](RUNBOOK.md) …… 実装および運用手順を逐次記載
- [`EVALUATION.md`](EVALUATION.md) …… 受入基準と検証観点を定義
- [`GUARDRAILS.md`](GUARDRAILS.md) …… 行動指針と Birdseye 連携の制約を明示
- [`HUB.codex.md`](HUB.codex.md) …… タスク分割と依存グラフの中核ハブを維持
- [`CHECKLISTS.md`](CHECKLISTS.md) …… リリースとレビューフローのチェックリストを提供
- [`governance-gate.yml`](.github/workflows/governance-gate.yml)
  …… Intent 検証 CI を常時有効化
- Intent ゲートは
  [`tools/ci/check_governance_gate.py`](tools/ci/check_governance_gate.py) により
  自動適用されるため、CI の設定だけで運用に組み込めます

<!-- markdownlint-disable MD013 -->
![lint](https://github.com/RNA4219/workflow-cookbook/actions/workflows/markdown.yml/badge.svg)
![links](https://github.com/RNA4219/workflow-cookbook/actions/workflows/links.yml/badge.svg)
![lead_time_p95_hours](https://img.shields.io/badge/lead__time__p95__hours-72h-blue)
![mttr_p95_minutes](https://img.shields.io/badge/mttr__p95__minutes-60m-blue)
![change_failure_rate_max](https://img.shields.io/badge/change__failure__rate__max-0.10-blue)
<!-- markdownlint-enable MD013 -->

> バッジ値は `governance/policy.yaml` の `slo` と同期。更新時は同ファイルの値を修正し、上記3つのバッジ表示を揃える。

### Commit message guide

- feat: 〜 を追加
- fix: 〜 を修正
- chore/docs: 〜 を整備
- semver:major/minor/patch ラベルでリリース自動分類

### Pull Request checklist (CI 必須項目)

- PR 本文に `Intent: INT-xxx`（例: `Intent: INT-123`）を含めること。
- `EVALUATION` 見出し（例:
  `[Acceptance Criteria](EVALUATION.md#acceptance-criteria)`）へのリンクを本文に
  明示すること。
- 可能であれば `Priority Score: number` を追記し、`prioritization.yaml` の
  値を参照する。
- ローカルでゲートを確認する場合は `PR_BODY` に PR 本文を渡してから
  `python tools/ci/check_governance_gate.py` を実行する。

  ```sh
  PR_BODY=$(cat <<'EOF'
  Intent: INT-123
  ## EVALUATION
  - [Acceptance Criteria](EVALUATION.md#acceptance-criteria)
  Priority Score: 1
  EOF
  ) python tools/ci/check_governance_gate.py
  ```
