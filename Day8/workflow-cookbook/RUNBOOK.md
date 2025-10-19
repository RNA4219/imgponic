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
  - **前提ツール**: Node.js 20 LTS（`node --version`）、npm、Rust stable (`rustup show active-toolchain`)、Cargo。
    `npm install` で導入される `@tauri-apps/cli`（`npx tauri --help` で確認）。
  - **起動サービス**: Ollama を `ollama serve` で常駐させ、`ollama pull llama3:8b` でモデル取得後に
    `http://localhost:11434/api/tags` が 200 を返すことを確認（Windows は `scripts/check-ollama.bat` を利用）。
  - **環境変数**: `PROMPTFORGE_DATA_DIR` を設定すると `data/` サンドボックスのルートを差し替え可能
    （未設定時はリポジトリ直下）。Rust/Cargo を導入した端末では `%USERPROFILE%\.cargo\bin` / `~/.cargo/bin` を
    PATH に追加する。
- **CI**
  - **前提ツール**: Node.js LTS + npm（`npm ci` を使用）、Rust stable（`rustup toolchain install stable`）。
    Linux ランナーは Tauri 依存の GTK/WebKit ライブラリを `tools/ci/assert-gtk-stack.sh` で検証する。
  - **サービス**: 標準テスト (`npm run test` / `cargo test`) は Ollama をスタブ化しているため未起動で可。
    エンドツーエンド検証ジョブのみ、Local と同じく Ollama を事前起動する。
  - **環境変数**: 一時ディレクトリを `PROMPTFORGE_DATA_DIR=$(mktemp -d)` で確保し、`CI=true`（npm が自動設定）を維持する。
    `runs/` 配下は CI アーティファクトとして保存し、トリアージ用にダウンロードできるようにする。
- **Prod**
  - 常設の本番環境は提供されていない。配布が必要な場合は署名済み端末で
    `npm run tauri:build` を実行し、生成された `src-tauri/target/release/bundle/` 配下の成果物を
    夜間リグレッション代替として配布・検証する。

## Execute

- **準備**
  - `npm install`（CI では `npm ci`）で Node 依存を解決し、`npm run lint` が通ることを確認。
  - `cargo test --test workspace_backup`（統合テスト。ローカルではバックアップ関連の修正前後に必ず実行し、CI では `cargo test` ワークフロー内で自動起動される。`--lib` オプションではない点に注意）でバックアップ作成ロジックを検証後、
    `cargo test` を全件実行。
  - Ollama が起動済みかを `ollama list | findstr llama3:8b`（Windows）/`ollama list | grep llama3:8b`（Unix）で確認し、
    未登録なら `ollama pull llama3:8b` を実行。
  - 必要に応じて `export PROMPTFORGE_DATA_DIR=$(pwd)/data`（PowerShell: `$env:PROMPTFORGE_DATA_DIR=...`）で
    サンドボックスの位置を固定。
- **実行**
  - ローカル検証: `npm run dev` で Vite を起動後、別ターミナルで `npm run tauri:dev` を実行して
    Tauri ウィンドウを立ち上げる。右ペインの ▶ ボタンから `llama3:8b` を指定しストリーミングを開始。
  - CI/CLI: `npm run test`（Vitest）、`cargo test`（Rust）を順に実行し、最後に
    `npm run tauri:build` のドライランでビルドが成功することを確認。
  - 長時間ストリームを停止する場合は UI の停止ボタン、もしくは DevTools コンソールで
    `await window.__TAURI__.core.invoke('abort_current_stream')` を呼び出す。
- **確認**
  - ストリーミング中は ▶ ボタンがハイライトされ、進捗テキストが右ペインに追記される。
    完了または停止でハイライトが解除されることを確認。
  - Setup バナーが `Start Ollama` から空表示へ遷移し、`Ollamaエラー:` トーストが出ていないことを確認。
  - 実行後に `runs/<YYYYMMDD-HHMMSS>/`（`recipe.path.txt` / `prompt.final.txt` / `response.raw.jsonl`）が作成され、
    `app_data_dir()/workspace.json` と `workspace.bak` の更新時刻が揃っていることを確認。

## Observability

- ストリーミング失敗の兆候: Setup チェックが `Start Ollama` バナーを維持、`Ollamaエラー: ...` トーストが継続表示、
  右ペインの進捗が停止したままになる。併せて DevTools > Console で `invoke('run_ollama_stream')` の失敗ログや
  スタックトレースを確認する。
- Ollama 疎通: Windows は `scripts/check-ollama.bat`、Unix 系は `curl http://localhost:11434/api/tags` で HTTP 200 を確認し、
  レスポンスの `models` に `llama3:8b` が含まれることを確かめる。
- アプリログ/成果物: Rust 側の出力は `npm run tauri:dev` を実行したターミナルに流れる。配布版では OS のアプリログディレクトリ
  （例: macOS `~/Library/Logs/PromptForge/`, Windows `%APPDATA%/com.promptforge.app/logs/`,
    Linux `~/.local/share/com.promptforge.app/logs/`）を参照する。
  実行アーティファクトは `runs/<timestamp>/`（`recipe.path.txt` / `prompt.final.txt` / `response.raw.jsonl`）にまとまり、
  エラー時は該当ディレクトリをそのまま添付する。
- インシデントは [`docs/INCIDENT_TEMPLATE.md`](../../docs/INCIDENT_TEMPLATE.md) に従い、関連ログ（`runs/<timestamp>/` とターミナル出力）を添えて記録する。
  直近事例は [IN-20250215-001](../../docs/IN-20250215-001.md) を参照。

## Rollback / Retry

- ストリームが停止しない場合は UI の停止ボタンか `await window.__TAURI__.core.invoke('abort_current_stream')` で即時中断し、
  `ollama list` でモデルが利用可能か確認後に再実行する。
- ワークスペース破損時: アプリを終了し、`app_data_dir()`（Windows: `%APPDATA%/com.promptforge.app/`,
  macOS: `~/Library/Application Support/com.promptforge.app/`, Linux: `~/.local/share/com.promptforge.app/`）にある
  `workspace.bak` を `workspace.json` に上書きコピーする。再起動後にレシピが復元されるか確認し、必要なら
  `write_workspace` コマンドを呼び出して保存する。
- `runs/<timestamp>/` が欠損・破損した場合は該当フォルダをバックアップし、新しい空ディレクトリを作成した上で
  再度 `npm run dev` → `npm run tauri:dev` で再現実行し、新しいログを収集する。
