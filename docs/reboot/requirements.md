# Imgponic Reboot 要求整理

## 1. プロダクトサマリ

### 1.1 目的
- プロンプトとコードの編集→整形→反映サイクルを左右2ペインで高速に回し、完全ローカル環境で創作を継続できる温室を提供する。
- Ollama と連携した Docker 不要な体験を維持し、ローカル GPU/CPU 上での推論を前提とした検証・資料作成を支える。

### 1.2 想定ペルソナ
- ローカル実行を優先し、Ollama を含む開発環境を手元で管理するプロンプト/コード制作者。
- `.py/.txt/.md/.json` を中心としたテキスト資産を `project/` 以下で安全に扱いながらログとレシピを反復更新する利用者。

### 1.3 成功指標
- 左ペイン→Ollama 実行→右ペイン整形→左ペイン反映→`project/` 保存の一連操作が中断なく完了するセッション率。
- 完全ローカルでネットワーク送信先が `http://localhost:11434` のみとなり、外部 HTTP へ出ていないことを確認できる監査結果。
- `runs/<timestamp>/` へのプロンプト・レスポンス保存とワークスペース自動復元が連続 5 セッションで成功した割合。

## 2. 必須非機能要件（Rust/React/Tauri 実装からの抽出）

- **ローカル専用 Ollama 呼び出し**: `run_ollama_chat`/`run_ollama_stream` は `http://localhost:11434/api/chat` への POST のみを許容し、完全オフライン接続を前提とする。
- **ストリーム中断と同時実行制御**: GTK4 ビルド時は `AbortHandle` 登録で旧ストリームを中断し、`StreamState` により同時ストリームを抑制する。
- **データディレクトリのサンドボックス**: `PROMPTFORGE_DATA_DIR` で指定した `data/` を基準にレシピとフラグメントを解決し、`ensure_under` によってサンドボックス外アクセスを拒否する。
- **プロジェクト I/O 制限**: `project/` 配下のみ `.py/.txt/.md/.json` を許容し、存在しない親ディレクトリは自動作成しつつ `ensure_under` で境界を強制する。
- **ログ／ワークスペースの永続化**: 実行結果は `runs/<timestamp>/` に時刻ディレクトリを作成して保存し、ワークスペースはアプリケーションハンドル経由で読み書きして復元に備える。

## 3. 凍結解除条件と共有チェックリスト

### 3.1 凍結解除条件（SUNSET_PLAN 準拠）
1. **GTK4 依存解消**: `docs/gtk4_links.md` のウォッチリストにある依存が GTK4 安定版へ追従し、`npm run ci:assert-gtk-stack` が成功する。
2. **Ollama モデル準備**: `ollama pull llama3:8b` 等で推奨モデルを取得し、`check_ollama_setup` が `status: "ok"` を返すまで整備する。

### 3.2 共有チェックリスト
- [ ] `docs/gtk4_links.md` の依存更新状況と最新レポート（`reports/gtk4-links-*.json`）を確認した。
- [ ] `npm run ci:assert-gtk-stack` を実行し、GTK4 互換性チェックがグリーンである。
- [ ] `ollama pull llama3:8b` など推奨モデルを取得し、`ollama list` で存在を確認した。
- [ ] アプリから `check_ollama_setup` を実行し、`status: "ok"` を得た。
- [ ] 上記結果と再開判断を `workflow-qa` へ共有した。
