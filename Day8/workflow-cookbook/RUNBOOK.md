---
intent_id: INT-001
owner: your-handle
status: active   # draft|active|deprecated
last_reviewed_at: 2025-10-14
next_review_due: 2025-11-14
---

# Runbook

## Environments

- **Local**
  - Windows 10/11 で Node.js LTS / npm、Rust (stable) toolchain、Tauri CLI（`npm install` で取得）を用意する。
  - Ollama を `ollama pull llama3:8b` でモデル取得後に起動し、`http://localhost:11434` が応答する状態へ。`scripts/check-ollama.bat` で疎通確認可能。
- **CI**
  - Node.js LTS と Rust (stable) をインストールし、`npm ci` → `npm run lint` → `npm run test` → `cargo test` を順に実行する（`package.json` 定義のスクリプトを利用）。
  - Ollama はモック前提のため未起動でもテストは通るが、エンドツーエンド確認時は上記 Local 手順でサービスを起動する。
- **Prod**
  - 専用環境は未提供。夜間ビルドの代替として `npm run tauri:build` で Tauri バイナリを生成し、配布物を検証する。

## Execute

- **準備**
  - `npm install`（CI では `npm ci`）でフロント依存を解決。
  - `cargo test --package promptforge --lib tests::workspace_backup` などクリティカルテストを先行実行し、ワークスペースバックアップを確認。
- **実行**
  - `npm run tauri:dev` でアプリを起動し、Model に `llama3:8b` を指定してストリーミング実行を確認。
  - CLI / CI での検証は `npm run lint` → `npm run test` → `cargo test` を順に実行。
- **確認**
  - UI 右ペインでストリーミングインジケータが点灯し、停止ボタンで中断できることを確認。
  - 実行後に `runs/<YYYYMMDD-HHMMSS>/` 配下へ `prompt.txt` / `response.raw.jsonl` などのログが生成されていることを確認。

## Observability

- Ollama 停止時は UI バナーに「Start Ollama」案内や `Ollamaエラー:` メッセージが表示され、ログにも `Ollama unreachable` が出力される。
- 疎通確認に失敗したら `scripts/check-ollama.bat` を実行し、HTTP 200 かつモデル pull を再確認。
- 実行アーティファクトは `runs/<ts>/` に時刻単位で保存される（`prompt.txt` / `response.raw.jsonl` / `meta.json`）。失敗時は該当フォルダの最終更新時刻と内容をエスカレーション資料に添付。
- インシデント発生時は [`docs/INCIDENT_TEMPLATE.md`](../../docs/INCIDENT_TEMPLATE.md) に沿って記録し、最新サンプル（[IN-20250215-001](../../docs/IN-20250215-001.md)）を併記する。

## Rollback / Retry

- ストリーム暴走時は UI の停止ボタン、または `invoke('abort_current_stream')` で即時中断して再実行する。
- ワークスペースが破損した場合は `app_data_dir()/workspace.bak` を `workspace.json` にリストアし、再度 `write_workspace` を実行して反映する。
- 実行ログ破損時は直近の `runs/<ts>/` を退避後、`npm run tauri:build` で再ビルドしたバイナリで再試行し、再現ログを取得する。
