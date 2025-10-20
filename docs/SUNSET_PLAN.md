---
status: active
last_updated: 2025-10-20
owner: workflow-qa
---

# Workflow Cookbook Sunset Plan

## 凍結理由

- `Day8/workflow-cookbook/HUB.codex.md`
- `Day8/workflow-cookbook/GUARDRAILS.md`
- `Day8/workflow-cookbook/BLUEPRINT.md`

上記ドキュメントは 2025-10-20 時点で後継の設計管理プロセスへ移行済みであり、最新版は `docs/migration/workflow_v2.md` と `docs/design/` 配下の個別仕様へ統合されました。

## 移行先

| 項目 | 移行先 | 備考 |
|------|--------|------|
| ハブ仕様 | `docs/migration/workflow_v2.md` | タスク自動分割の新手順を定義 |
| ガードレール | `docs/design/governance.md` | 行動指針と例外処理を統合 |
| ブループリント | `docs/design/system_overview.md` | 新ワークフローの要求とスコープ |

## レビュー計画

- **凍結レビュー実施日**: 2025-10-20
- **次回確認予定**: 2026-04-20（移行先ドキュメント群の保守状況を棚卸し）

## 再開前提

- 依存ライブラリの GTK4 対応状況は [`docs/gtk4_links.md`](./gtk4_links.md) のウォッチリストで月次点検し、再開判断の材料とする。

## 連絡先

- オーナー: workflow-qa（`#imgponic-governance` チャンネル）
- エスカレーション: `governance/policy.yaml` に定義されたプロセスへ従うこと。
