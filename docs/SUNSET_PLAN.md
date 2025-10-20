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

上記ドキュメントは 2025-10-20 時点で後継の設計管理プロセスへ移行済みであり、最新版は `Day8/docs/day8/README.md` と `Day8/docs/day8/` 配下の個別仕様へ統合されました。

## 移行先

| 項目 | 移行先 | 備考 |
|------|--------|------|
| ハブ仕様 | `Day8/docs/day8/spec/02_spec.md` | タスク自動分割の新手順を定義 |
| ガードレール | `Day8/docs/day8/security/05_security.md` | 行動指針と例外処理を統合 |
| ブループリント | `Day8/docs/day8/design/03_architecture.md` | 新ワークフローの要求とスコープ |

## レビュー計画

- **凍結レビュー実施日**: 2025-10-20
- **次回確認予定**: 2026-04-20（移行先ドキュメント群の保守状況を棚卸し）

## 再開前提

- 依存ライブラリの GTK4 対応状況は [`docs/gtk4_links.md`](./gtk4_links.md) のウォッチリストで月次点検し、再開判断の材料とする。

## 再開判断フロー

1. `Day8/workflow-cookbook/BLUEPRINT.md`・`Day8/workflow-cookbook/RUNBOOK.md` の凍結告知を再確認し、再開時にも参照元が最新方針と矛盾しないかを確認する。
2. [`Day8/docs/day8/README.md`](../Day8/docs/day8/README.md) と `Day8/docs/day8/` 配下の後継仕様を点検し、差分取り込みの必要性を評価する。
3. 下記「必要リソース一覧」と「再開前に実行する確認コマンド」の要件を満たすかをチェックし、満たさない場合はタスク化してフォローアップスケジュールへ登録する。
4. レビュー担当が「フォローアップスケジュール」で定義された判定条件を満たしたかを確認し、`workflow-qa` へ再開可否を報告する。
5. 再開可と判断した場合は本ドキュメントと Blueprint/Runbook の凍結告知を更新し、凍結解除日と再開理由を明記する。

## 再開前に実行する確認コマンド（npm run test / cargo test 等）

| カテゴリ | コマンド | 目的 |
|----------|----------|------|
| TypeScript/React | `npm run lint` | ESM/TS 方針と lint ルールの逸脱が無いか確認 |
| TypeScript テスト | `npm run test` | UI 層の回帰を検知する（JSDOM） |
| Node.js テスト | `npm run test:node` | Node ランタイムでのユーティリティ回帰を検知する |
| Rust | `cargo test` | Tauri バックエンドと GTK4 依存コードの健全性を確認 |
| E2E/環境 | `npm run ci:assert-gtk-stack` | GTK4 対応バージョンの依存欠落を早期検知 |

## 必要リソース一覧（Ollamaモデル、GTK4対応状況）

| リソース | 要件 | 備考 |
|----------|------|------|
| Ollama モデル | `ollama pull llama3:8b` など、`check_ollama_setup` が `status: "ok"` を返すモデルが揃っていること | モデル差し替え時は `Day8/workflow-cookbook/BLUEPRINT.md` の推奨一覧と同期する |
| GTK4 対応 | [`docs/gtk4_links.md`](./gtk4_links.md) に列挙された依存が GTK4 安定版に追従済みであること | Linux パッケージング CI（`npm run ci:assert-gtk-stack`）の結果で確認 |
| ビルド環境 | Node.js LTS (20.x) / Rust stable (対応する Tauri 版) が導入済みであること | Blueprint の環境要件節と一致させる |

## フォローアップスケジュール（直近6か月）

| 月次チェック日 | レビュー担当 | 判定条件 |
|-----------------|--------------|------------|
| 2025-11-20 | workflow-qa | GTK4 LTS の安定版公開状況を確認し、`npm run ci:assert-gtk-stack` のグリーンを維持できるか評価 |
| 2025-12-18 | infra-lead | Ollama 主要モデル（`llama3:8b`, `qwen2:7b`）の互換性とローカル推論性能を検証 |
| 2026-01-22 | app-lead | React/Tauri 依存アップデートによるビルド互換性と CLI 変更有無をチェック |
| 2026-02-19 | security-review | サンドボックス境界 (`ensure_under`) の監査ログを確認し、逸脱がないか検証 |
| 2026-03-19 | workflow-qa | 後継ドキュメントの差分取り込みが完了しているか、再開判断に必要なタスクが残っていないか確認 |
| 2026-04-20 | program-management | GTK4 安定版が GA となった場合の再開可否を最終判断し、Blueprint/Runbook の凍結告知更新要否を決定 |

## 連絡先

- オーナー: workflow-qa（`#imgponic-governance` チャンネル）
- エスカレーション: `governance/policy.yaml` に定義されたプロセスへ従うこと。

## チェックリスト

- [ ] [`project/recipe-digest.template.md`](../project/recipe-digest.template.md) に従ってダイジェストを更新し、`pnpm tsx tools/sunset/recipeDigest.ts --output project/recipe-digest.md` を実行した結果を確認する。
## 資産保全

- `runs/` 配下の最新ログは `npx tsx tools/sunset/archiveRuns.ts --runs runs --limit 5 --out archives` で一括アーカイブする。
- コマンド成功時に `archives/` 配下へ `*.tar.gz` と `*.sha256.json` が生成される。マニフェスト内の SHA-256 をもとに転送先で整合性を確認すること。
- JSONL 破損などで失敗した場合はエラー内容を修正してから再実行し、`NoRunsFoundError` が出た場合は新規ログの生成を待ってから再試行する。

