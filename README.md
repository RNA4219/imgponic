---
intent_id: imgponic-readme
owner: imgponic-team
status: frozen
last_reviewed_at: 2024-10-01
next_review_due: 2025-04-01
---

<!-- markdownlint-disable-next-line MD022 MD041 -->
# Imgponic — 想像を育てるプロンプト温室

**Version:** 1.0.0

**License:** MIT

**Theme:** main `#C4FCC4` / background `#FFFFEE`

> **開発凍結中**：`tauri` GTK4 系依存が未解決のため、新機能開発とメンテナンスを停止しています
> （Issue #12563 等の上流対応待ち）。凍結下の運用方針は [`docs/SUNSET_PLAN.md`](docs/SUNSET_PLAN.md) を参照してください。

Imgponic は、**プロンプトとコードを“育てる”ためのローカルツール**です。
左右2ペインで編集→整形→反映のループを高速に回せます。
Ollamaと連携し、**完全ローカル・Docker不要**。

## 🛑 撤退中の利用ガイド

撤退スケジュールやサポート体制の詳細は [docs/SUNSET_PLAN.md](docs/SUNSET_PLAN.md) を参照してください。

- **最終リリースの取得**: 最終版アーカイブは GitHub Releases の `v1.0.0` を保持し、必要時のみ再配布してください。
- **ログ保全**: `runs/<timestamp>/` 配下の作業ログは各自の責任でバックアップし、検証証跡として保全します。
- **問い合わせ窓口**: 撤退期間中の連絡は `sunset@imgponic.dev`（対応: 平日 10:00-16:00 JST）へお願いします。

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

> **参考情報**: 本セクションは開発凍結前のセットアップメモです。現行では新規環境構築を推奨していませんが、検証や資料確認目的で参照できます。
> 前提: Windows 10/11、**Node.js LTS**, **Rust (stable)**, **Ollama** がインストール済み

### 1) Ollamaを起動（モデル準備）

```powershell
## 例：Llama 3 8B
ollama pull llama3:8b
## サービスが http://localhost:11434 で応答する状態に
```

### 2) アーカイブ版を確認

- **NSISインストーラ** または **Portable ZIP** の最終リリース（`v1.0.0`）を必要時のみダウンロード（Releases 参照）
- テストや監査目的で利用する場合はオフライン環境で実行し、変更配布は行わない

### 3) 初回ランディング

1. 画面上部の **Model** に `llama3:8b` を入力
2. **Recipe** に `data/recipes/demo.sora2.yaml` を指定（同梱例）
3. 左にテキストを貼り、**▶ 実行** → 右に整形出力
4. **⇧ 反映**で左に戻し、**保存**で `project/` に書き出し

> *Ollama未起動の場合、起動案内が表示されます。*

---

## 🐧 Linux セットアップ

Rust/React 開発用に GTK/WebKit のビルドチェーンをそろえるには、以下を実行してください。

1. `./scripts/install-gtk4-webkit6-dev.sh`
   - まず WebKitGTK 6.0 系パッケージ（例: `libwebkitgtk-6.0-dev`）の有無をディストロごとに確認します。
   - 見つからない場合は 4.1 系（例: `libwebkit2gtk-4.1-dev`, `libjavascriptcoregtk-4.1-dev`, `libsoup-3.0-dev`）へ自動フォールバックします。
2. `tools/ci/assert-gtk-stack.sh`
   - `pkg-config --exists webkitgtk-6.0` が失敗した際は `webkit2gtk-4.1` を許容し、いずれも無い場合にのみエラーで終了します。

> フォールバックは Ubuntu/Debian, Fedora, Arch Linux で検出可能なパッケージ名を対象にしています。必要に応じて各ディストロの WebKit パッケージ提供状況を確認してください。

Arch Linux 系では `libsoup3` への移行（`libsoup-3.0.pc` 提供を想定）が必須です。

---

## ✨ 主な機能

- **レシピ合成**：テンプレ片（フラグメント）を順に連結し、`{key}` を展開
- **Ollama実行**：Rustコマンド `run_ollama_stream` が chunk を逐次送信し、React フック
  `useOllamaStream` が右ペインへ追記。ヘッダには Streaming インジケータと **停止** ボタン
  を表示し、任意タイミングでストリームを中断可能。
- **コーパス抜粋注入**：`load_txt_excerpt` で `corpus/` 内テキストの抜粋と SHA-256 を取得し、プレビューカードで使用バイト・トランケート状態と併せて表示。成功時は `doc_excerpt` として合成パラメータに注入し、失敗時はバッジとダイアログで通知して自動巻き戻し。
- **サンドボックスI/O**：`project/` で .py/.txt/.md/.json を安全に開く・保存
- **ワークスペース復元**：前回の編集状態を自動復元（約800msデバウンス保存）
- **ログ**：`runs/<ts>/` に合成プロンプト・レスポンスを保存
- **配色**：やさしいミント×アイボリー（温室の光）

---

## ⌨️ ショートカット

- **Ctrl/Cmd+Enter**：現在の左ペイン内容を実行（▶）
- **Ctrl/Cmd+S**：左ペインのテキストを `project/` に保存
- **Ctrl/Cmd+C**：右ペインの生成結果をコピー（フォーカス中のペインを優先）
- **Ctrl/Cmd+Shift+F**：フォーカスモードを切り替え（片側全画面⇔2ペイン）
- **?**：キーバインドオーバーレイの表示／非表示
- **Esc**：キーバインドオーバーレイを閉じる

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
- **長文が重い**: TopToolbar の「選択のみ送る」チェックを入れると、送信対象を現在の選択範囲に絞れます。送信前に右上プレビューで自動付与される前後3行コンテキストと概算トークンバッジを確認し、必要に応じてチェックを外して全文送信に戻してください。

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
- **v0.4.2**（整備フェーズ準備中）: CIパイプライン拡張、Issueテンプレ更新、Docs整備、Diagnostics、Export/Import
- **v0.4.1**（進行中）: Workspace v2、タブ永続化、差分プレビュー、機密マスク、サイズ上限、workspace.bak
- **完了済み**（v0.4.0）: 選択送信

---

## 📜 ライセンス

[MIT](LICENSE) © 2025 Imgponic contributors
