---
intent_id: imgponic-changelog
owner: imgponic-team
status: active
last_reviewed_at: 2024-10-01
next_review_due: 2025-04-01
---

# Changelog

<!-- markdownlint-disable MD024 -->

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- （予定）ストリーミング応答 / 停止ボタン
- （予定）選択範囲だけ送信（前後コンテキスト）
- （予定）タブUI永続化（Workspace v2）
- （予定）差分プレビューの適用（Unified Diff）

### Changed

- （予定）Monaco Editor の遅延ロード対応

### Security

- （予定）送信前の機密情報マスク（APIキー/秘密鍵 ほか）

## [1.0.0] - 2025-10-18

### Added

- 左右2ペインエディタ（入力／LLM整形出力）
- レシピ（YAML）×フラグメント合成、`{placeholder}` 展開
- Ollama連携（`/api/chat`）での実行（System/User 分離）
- `project/` サンドボックス内の **.py/.txt/.md/.json** の開く・保存・一覧
- ワークスペース自動保存／復元（閉じても再開）
- 実行ログ `runs/<ts>/`（レシピパス／最終プロンプト／生レスポンス）
- Windows向け `.bat`（dev/build/run/check）で Docker不要
- 配色テーマ（メイン `#C4FCC4`、背景 `#FFFFEE`）

### Changed

- ブランドを **Imgponic** に統一（旧: PromptForge）
- UIトーンを“温室／空中栽培”コンセプトへ刷新

### Security

- サンドボックス `ensure_under` によるパス逸脱防止
- TauriのHTTPスコープを `http://localhost:11434/*` のみに制限

<!-- markdownlint-enable MD024 -->
