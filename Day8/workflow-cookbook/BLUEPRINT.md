---
intent_id: INT-001
owner: your-handle
status: deprecated   # draft|active|deprecated
last_reviewed_at: 2025-10-20
next_review_due: 2026-04-20
---

本資料は2025-10-20にワークフローポリシーを`docs/migration/tauri2-gtk4.md`へ移管したため凍結し、以降はそちらを参照してください。

# Blueprint

## 1. Problem Statement

ローカル LLM 指向のプロンプトエンジニア/クリエイターが、Imgponic 内で左ペインの草稿から右ペインの生成結果までを自己完結で回せるようにする。選択範囲を安全に整形し、Ollama への送信・監視・保存までを一つの温室（アプリ）で完了させ、外部クラウドへ情報を出さずに反復改善を行える状態を守る。

## 2. Scope

- In:
  - `src/main.rs`, `src/ollama_stream.rs`, `src/setup_check.rs`（Tauri バックエンドと Ollama 連携ロジック）
  - `src/App.tsx`, `src/useOllamaStream.ts`, `src/useSetupCheck.ts`, `src/security/`（UI と選択範囲整形・安全化）
  - `tests/`（Rust/TypeScript 双方のユニット・統合テスト）
  - `data/`, `project/`, `runs/`（レシピ・作業スペース・実行ログサンドボックス）
  - `Day8/workflow-cookbook/`（本ワークフロー資料の維持・更新）
- Out:
  - `node_modules/`, `dist/`, `target/`（ビルド生成物）
  - `icons/`, `public/`, `docs/birdseye/`（静的アセット/自動生成ドキュメント、参照のみ）
  - Windows/macOS 用配布物（`installer/`, `release/` 等）は別工程で管理し、ここでは扱わない

## 3. Constraints / Assumptions

- Node.js LTS（推奨: 20.x）と Rust stable（Tauri 2.x サポート版）が揃い、`npm run dev`/`cargo test` が共に緑であること。
- Ollama サービスが `http://localhost:11434` で稼働し、`check_ollama_setup` が `ok` を返すために必要なモデル（例: `llama3:8b`）が `ollama pull` 済みであること。
- TypeScript/React 側は ESM 構成を維持し、Tauri コマンド呼び出しのシグネチャを変更しない（後方互換を必須とする）。
- `PROMPTFORGE_DATA_DIR` で切り替えた場合も、`ensure_under` により `data/`, `project/`, `runs/` のサンドボックス境界外へ書き出さない。
- `runs/<timestamp>/` 配下のファイル命名（`recipe.path.txt`, `prompt.final.txt`, `response.raw.jsonl`）と JSON スキーマ互換を保持し、既存ログが再利用できるようにする。
- 凍結状態での運用判断と資産保全は [`docs/SUNSET_PLAN.md`](../../docs/SUNSET_PLAN.md) に従い、再開条件を満たすまでは新規機能開発をブロックする。
- 設計・資料更新は本 Blueprint から派生させ、実装差分は 100 行/2 ファイル以内へ収める（ドキュメントは例外）。

## 4. I/O Contract

### `compose_prompt`

- **Input:**
  - `recipePath: string` — `data/recipes/*.yaml` への相対/絶対パス（`PROMPTFORGE_DATA_DIR` を起点に正規化）。
  - `inlineParams: Record<string, unknown>` — `user_input` や `doc_excerpt` を含む追加パラメータ。
- **Output:** `ComposeResult`（`{ final_prompt: string, sha256: string, model: string }`）。
- **Example:**

  ```json
  {
    "recipePath": "data/recipes/demo.sora2.yaml",
    "inlineParams": { "user_input": "[Lines 10-12]\nfoo" }
  }
  ```

  ```json
  {
    "final_prompt": "...USER_INPUT (verbatim):\\n```text\\n[Lines 10-12]\\nfoo\\n```",
    "sha256": "f0f8...",
    "model": "llama3:8b"
  }
  ```

### `run_ollama_stream`

- **Input:** `model`, `system_text`, `user_text`（`ComposeResult` の `model` と左右ペインの整形結果）。
- **Behaviour:** Ollama JSONL を逐次読込み、Tauri ウィンドウへ `ollama:chunk`（本文追記）、`ollama:end`（完了）、`ollama:error`（失敗理由）を emit。
- **Output Example:**

  ```json
  { "event": "ollama:chunk", "payload": "Step 1: ..." }
  ```

### `save_run`

- **Input:** `recipe_path`, `final_prompt`, `response_text`（`response_text` は Ollama の RAW JSONL）。
- **Output:** `runs/<timestamp>/` ディレクトリを生成し、
  - `recipe.path.txt`
  - `prompt.final.txt`
  - `response.raw.jsonl`
  を書き出して保存先パスを返す。

### `check_ollama_setup`

- **Input:** `model?: string`（UI で選択された推論モデル）。
- **Output:** `{ status: 'ok' | 'offline' | 'missing-model', guidance: string }`。
  Ollama サービスの疎通とモデル有無を正規化し、
  `useSetupCheck` のリトライ案内へ渡す。

## 5. Minimal Flow

```mermaid
flowchart TD
  A[左ペインで送信範囲を決定
  (determineUserInput)] --> B[composePromptWithSelection
  + sanitizeUserInput]
  B --> C[tauri.invoke('compose_prompt')]
  C --> D{check_ollama_setup OK?}
  D -- YES --> E[run_ollama_stream 起動]
  E --> F[useOllamaStream が
    ollama:chunk/end/error を購読]
  F --> G[右ペインへ描画し
    完了後 save_run 要求]
  G --> H[save_run が runs/<ts>/
    へ書き出し]
  D -- NO --> I[useSetupCheck が
    ガイダンス表示→再試行]
  I --> D
```

## 6. Interfaces

- CLI / Commands:
  - `npm run dev`（Vite + React 開発サーバー）
  - `npm run tauri:dev` / `npm run tauri:build`（デスクトップアプリの開発/ビルド）
  - `npm run test` / `npm run test:node`（Vitest JSDOM・Node フロー）
  - `npm run lint`（ESLint で TypeScript フロントを検証）
  - `cargo test`（Tauri コマンド群・サンドボックス境界の Rust テスト）
  - `npm run ci:assert-gtk-stack`（CI での GTK 依存確認、Linux パッケージング前提）
- Key Files / Paths:
  - `src/main.rs`, `src/ollama_stream.rs`, `src/setup_check.rs`（バックエンド・Ollama I/F・環境チェック）
  - `src/App.tsx`, `src/useOllamaStream.ts`, `src/useSetupCheck.ts`, `src/security/`（UI と安全処理の中心）
  - `data/recipes/*.yaml`, `data/fragments/*.yaml`, `corpus/`（プロンプトレシピと補助テキスト）
  - `project/`（編集中ファイルのサンドボックス）
  - `runs/<timestamp>/`（`recipe.path.txt`, `prompt.final.txt`, `response.raw.jsonl` を格納するログディレクトリ）

---

## Incident References

- 運用中の実例: [`docs/IN-20250215-001.md`](../../docs/IN-20250215-001.md)
- 想定シナリオ: [`docs/IN-20250310-001.md`](../../docs/IN-20250310-001.md)
- テンプレート: [`docs/INCIDENT_TEMPLATE.md`](../../docs/INCIDENT_TEMPLATE.md)
