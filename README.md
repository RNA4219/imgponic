---
intent_id: imgponic-readme
owner: imgponic-team
status: active
last_reviewed_at: 2024-10-01
next_review_due: 2025-04-01
---

<!-- markdownlint-disable-next-line MD022 MD041 -->
# Imgponic — 想像を育てるプロンプト温室

**Version:** 1.0.0

**License:** MIT

**Theme:** main `#C4FCC4` / background `#FFFFEE`

Imgponic は、**プロンプトとコードを“育てる”ためのローカルツール**です。
左右2ペインで編集→整形→反映のループを高速に回せます。
Ollamaと連携し、**完全ローカル・Docker不要**。

<!-- LLM-BOOTSTRAP v1 -->

読む順番:

1. docs/birdseye/index.json …… ノード一覧・隣接関係（軽量）
2. docs/birdseye/caps/{path}.json …… 必要ノードだけ point read
   （個別カプセル）

フォーカス手順:

- 直近変更ファイル±2hopのノードIDを index.json から取得
- 対応する caps/*.json のみ読み込み

<!-- /LLM-BOOTSTRAP -->

---

## 🕔 5分で開始（Windows）

> 前提: Windows 10/11、**Node.js LTS**, **Rust (stable)**, **Ollama** が
> インストール済み

### 1) Ollamaを起動（モデル準備）

```powershell
## 例：Llama 3 8B
ollama pull llama3:8b
## サービスが http://localhost:11434 で応答する状態に
```

### 2) リリースを取得

- **NSISインストーラ** または **Portable ZIP** をダウンロード
  （Releases から）
- インストール or 展開して `imgponic` を起動

### 3) 初回ランディング

1. 画面上部の **Model** に `llama3:8b` を入力
2. **Recipe** に `data/recipes/demo.sora2.yaml` を指定（同梱例）
3. 左にテキストを貼り、**▶ 実行** → 右に整形出力
4. **⇧ 反映**で左に戻し、**保存**で `project/` に書き出し

> *Ollama未起動の場合、起動案内が表示されます。*

---

## ✨ 主な機能

- **レシピ合成**：テンプレ片（フラグメント）を順に連結し、`{key}` を展開
- **Ollama実行**：Rustコマンド `run_ollama_stream` が chunk を逐次送信し、React フック
  `useOllamaStream` が右ペインへ追記。ヘッダには Streaming インジケータと **停止** ボタン
  を表示し、任意タイミングでストリームを中断可能。
- **サンドボックスI/O**：`project/` で .py/.txt/.md/.json を安全に開く・保存
- **ワークスペース復元**：前回の編集状態を自動復元（約800msデバウンス保存）
- **ログ**：`runs/<ts>/` に合成プロンプト・レスポンスを保存
- **配色**：やさしいミント×アイボリー（温室の光）

---

## ⌨️ ショートカット

- **Ctrl/Cmd+Enter**：実行（▶）
- **Ctrl/Cmd+S**：左ペインを `project/` に保存
- **Ctrl/Cmd+C**：右ペインのコピー（フォーカス優先）

---

## Repository structure

```text
README.md       # 本ドキュメント
data/           # レシピ/フラグメント
project/        # 編集対象（サンドボックス）
runs/<ts>/      # 実行ログ
src/            # フロント（React/TypeScript）とバックエンド（Rust）が共存
src/main.rs     # Rust エントリポイント（Tauriコマンドもここから起動）
src/main.tsx    # React エントリポイント
scripts/*.bat   # 起動/ビルド補助
docs/           # 仕様/設計/配色ほか
icons/          # アプリ用アイコン
public/         # フロントエンドの静的アセット
tests/          # 結合/ユニットテスト
tools/          # 補助スクリプト群
```

---

## 📁 ディレクトリ

```text
data/           # レシピ/フラグメント
project/        # 編集対象（サンドボックス）
runs/<ts>/      # 実行ログ
src/            # フロント（React/TypeScript）とバックエンド（Rust）が共存
  ├─ main.rs    # Rust エントリポイント（Tauriコマンドもここから起動）
  └─ main.tsx   # React エントリポイント
scripts/*.bat   # 起動/ビルド補助
docs/           # 仕様/設計/配色ほか
icons/          # アプリ用アイコン
public/         # フロントエンドの静的アセット
tests/          # 結合/ユニットテスト
tools/          # 補助スクリプト群
```

---

## 🔒 セキュリティ

- 外部送信なし（完全ローカル）
- `ensure_under` による **サンドボックス**（`project/` などの外は拒否）
- Tauri allowlistで **Ollama以外のHTTP** を禁止

---

## 🧩 設定／テーマ

- 色トークンは `src/app.css` の `:root` で定義
- 配色仕様の詳細 → `docs/Imgponic_配色仕様_v1.0.md`

---

## 🆘 トラブルシュート

- **Ollama unreachable**: モデルが未pull/未起動。
  `ollama pull llama3:8b` を確認。
- **path out of sandbox**: `project/` や `prompts/` 等の**内側**で操作してください。
- **文字化け**: UTF-8（BOM推奨しない）で保存してください。
- **長文が重い**: チャット欄下部の「選択送信」チェックボックスをオンにし、送信対象テキストを範囲選択→`Ctrl+Enter`/送信ボタンで実行。プレビューには送信範囲と前後3行のコンテキスト、文字数バッジが表示されるので、送信前に内容と負荷を確認できます。

---

## 🚨 インシデント対応フロー

1. `docs/INCIDENT_TEMPLATE.md` をコピーし、`docs/IN-YYYYMMDD-XXX.md` として保存
   （例: [IN-20250215-001](docs/IN-20250215-001.md)、
   想定: [IN-20250310-001](docs/IN-20250310-001.md)）。
2. 検知・影響・5Whys・再発防止・タイムラインを Runbook/Evaluation の要件に沿って
   記入し、各節へ Blueprint/Evaluation の該当リンクを差し込む。
3. 対応完了後は関連PRと RUNBOOK/EVALUATION へ相互リンクを追加し、
   Preventive Actions の追跡Issueを更新して README の運用例を最新化。

---

## 🗺️ ロードマップ（抜粋）

- **v1.0**（本リリース）: 2ペイン/合成/Ollama/Project I-O/Workspace/ログ/テーマ
- **v0.4系**（計画）: タブ永続化、差分プレビュー、CI/Docs整備

---

## 📜 ライセンス

[MIT](LICENSE) © 2025 Imgponic contributors
