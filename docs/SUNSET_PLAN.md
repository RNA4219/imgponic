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

## チェックリスト

- [ ] [`project/recipe-digest.template.md`](../project/recipe-digest.template.md) に従ってダイジェストを更新する。
  - `pnpm tsx tools/sunset/recipeDigest.ts --output project/recipe-digest.md` を実行し結果を確認する。

## 資産保全

- `runs/` 配下の最新ログは `npx tsx tools/sunset/archiveRuns.ts --runs runs --limit 5 --out archives` で一括アーカイブする。
- コマンド成功時に `archives/` 配下へ `*.tar.gz` と `*.sha256.json` が生成される。マニフェスト内の SHA-256 をもとに転送先で整合性を確認すること。
- JSONL 破損などで失敗した場合はエラー内容を修正してから再実行し、`NoRunsFoundError` が出た場合は新規ログの生成を待ってから再試行する。

