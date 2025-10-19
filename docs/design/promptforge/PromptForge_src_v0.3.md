# PromptForge 仕様書（MVP + 近未来拡張）

**版**: v0.3（MVP）  
**日付**: 2025-10-18（Asia/Tokyo）  
**スタック**: Rust（Tauri v2 / `src/main.rs` エントリ） + TypeScript（React + Vite） + Ollama（localhost:11434）

---

## 1. 目的 / スコープ

ローカル環境で実行する**プロンプト合成＋整形ビューア**。  

- 左ペイン：任意テキスト／コードを編集
- ▶ 実行：Ollamaで**System＋タスク的指示**に従い整形/要約/提案（ストリーミング対応）
- 右ペイン：結果表示 → **⇧ 反映**で左へ戻す（逐次追記）
- **プロンプトはフォルダ管理**（System含む）  
- **TXT簡易RAG**（長文は抜粋＋ハッシュ）  
- **project/** 内の `.py/.txt/.md/.json` を**開く/保存**  
- **ワークスペース自動保存/復元**（アプリ再起動後も状態維持）
- **フォーカスモード**（片側全画面⇔2ペイン）と**選択送信**（前後3行＋概算トークンのプレビュー）
- **Windowsは .bat 起動**、Docker不要

> 将来的に：**コーデモッド（差分適用）/ ストリーミング / タブUI永続化 / Monaco** にスムーズ拡張。

---

## 2. 想定ユースケース

- 動画/画像生成向けの**プロンプト整形**（Sora系含む）
- コードの**整形・説明・Docstring付与**（Copilot-lite）
- ローカル資料（TXT）を部分参照して**構造化サマリ**を得る

---

## 3. 非スコープ（MVP）

- ネットワーク越しAPI（Ollama以外）  
- コードの実行やビルド、外部ツール呼び出し  
- 生成物の自動コミットや外部VCS操作

---

## 4. アーキテクチャ概要

- フロント：React（Vite） + TypeScript（JSDOMテストは Vitest）
- ブリッジ：Tauri 2（Rustコマンド／`src/main.rs` で `tauri::Builder` を構成）
- バック：ローカルFS／Ollama HTTP（`http://localhost:11434`）
- 永続化：`app_data_dir()/workspace.json`（取得不可時はカレント）
- ログ：`runs/<YYYYMMDD-HHMMSS>/`

---

## 5. ディレクトリ構成（アプリ直下）

```text
data/
  fragments/ ... YAML（合成テンプレの分割片）
  profiles/  ... モデル設定プリセット
  recipes/   ... 合成レシピ（どのフラグメントを順に連結するか）

prompts/         # すべてのプロンプト（System含む）を保存（初回起動時に作成）
corpus/          # 簡易RAG対象の .txt（初回利用で作成）
project/         # 編集対象の .py/.txt/.md/.json（サンドボックス）

runs/<ts>/       # 実行ログ（ストリーミング含む記録）
src/
  main.rs             # Tauri 2 エントリポイント（`tauri::Builder` でコマンド登録）
  lib.rs              # Rustコマンド実装（compose/run/IO/Workspace）
  ollama_stream.rs    # ストリーミング送信と中断制御
  setup_check.rs      # Ollama疎通チェック
  txt_excerpt.rs      # TXT抜粋処理
  tests.rs            # Rust側ユーティリティテスト
  main.tsx            # Reactエントリポイント
  App.tsx             # 2ペインUIとツールバー
  KeybindOverlay.tsx  # ショートカットオーバーレイ（フォーカスモード含む）
  useOllamaStream.ts  # ストリーミングhooks（停止/再開）
  useSetupCheck.ts    # 起動時のセットアップ確認
  app.css             # 共通スタイルとフォーカスモードテーマ
  security/           # allowlist などの設定モジュール
  test/setup.ts       # Vitest の JSDOM 初期化
scripts/*.bat    # Windows 起動/ビルド補助
```

---

## 6. UI/UX 仕様

### 6.1 画面レイアウト

- **上部ツールバー**
  - Recipeパス入力（`data/recipes/*.yaml`）
  - Model入力（例：`llama3:8b`）
  - Params（`goal/tone/steps` 等の主要キー）
  - 「選択のみ送る」チェックボックス＋前後行プレビュー（自動で概算トークンと前後3行を提示）
  - ▶ 実行ボタン（**Ctrl/Cmd+Enter**）とストリーミング状態（送信中インジケータ／**停止**ボタン）
- **ファイルバー**（`project/`サンドボックス）
  - 相対パス入力（例：`src/example.py`）
  - 「.py一覧」「← 左に開く」「→ 右に開く」「左を保存」「右を保存」
- **2ペイン**
  - 左：テキスト入力（`textarea`）。選択範囲がある場合は送信対象とコンテキストがプレビューされる
  - 右：LLM整形出力（`textarea`、ストリーミングで逐次追記・**⇧ 反映**で左へコピー）
  - 各ペイン：**コピー**・**保存/別名保存**ボタン
  - フォーカスモード：UIトグルまたはショートカットで片側全画面表示に切替、バッジに状態を表示

### 6.2 ショートカット

- **Ctrl/Cmd+Enter**：実行（▶）
- **Ctrl/Cmd+S**：`project/`へ左ペイン保存
- **Ctrl/Cmd+C**：右ペインをコピー（フォーカス中のペイン優先）
- **Ctrl/Cmd+Shift+F**：フォーカスモード切り替え（片側全画面⇔2ペイン）
- **?**：キーバインドオーバーレイ
- **Esc**：キーバインドオーバーレイを閉じる

### 6.3 状態/フィードバック

- ▶ 押下時：軽い縮小アニメ（押下感）＋ストリーミング開始インジケータ
- 送信中は進捗がステータスバッジに表示され、**停止**で中断可能
- 右ペイン更新→**⇧ 反映**で左へ転送
- 「選択のみ送る」有効時は選択範囲と前後3行の要約（概算トークン含む）をサマリに表示
- `composed.sha256` をツールバー右に表示（先頭16桁）

---

## 7. データモデル

### 7.1 Workspace（v1）

```ts
type Workspace = {
  version: 1
  left_text: string
  right_text: string
  recipe_path: string
  model: string
  params: Record<string, any>
  project_path?: string   // 直近の project 相対パス
  updated_at: string      // ISO8601
}
```

> 保存先：`app_data_dir()/workspace.json`（取得不可時はローカル）
> 保存トリガ：入力変更から**約800msデバウンス**
> 保存時に `workspace.bak` を同階層に生成（失敗時は警告ログ）

### 7.2 Workspace v2（計画）

タブUIと永続化を目的に、以下の構造へ移行予定。

```json
{
  "version": 2,
  "tabs": [
    {
      "id": "01J...",         // ULID
      "name": "Sora整形",      // 任意名
      "color": "#22c55e",     // UIテーマ
      "left": "...",          // 左ペインテキスト
      "right": "...",         // 右ペインテキスト
      "recipe": "data/recipes/demo.sora2.yaml",
      "model": "llama3:8b",
      "params": {"goal": "", "tone": "", "steps": 6},
      "project_path": "src/example.py"
    }
  ],
  "activeTabId": "01J...",
  "updated_at": "2025-10-18T12:34:56Z"
}
```

> v1 → v2 マイグレーションは起動時に自動実行し、既存ワークスペースを単一タブとして取り込む計画。
> Workspace v2 ロードマップと整合させ、タブ永続化・色プリセットを段階的に開放する。

### 7.3 実行ログ（`runs/<ts>/`）

- `recipe.path.txt`：使用レシピパス  
- `prompt.final.txt`：最終合成テキスト（`USER_INPUT` を含む）  
- `response.raw.jsonl`：Ollama応答（RAW）

---

## 8. 合成・注入ルール

- YAMLレシピ `fragments` の順で**連結**  
- `params` で `{{key}}` プレースホルダを展開  
- **ユーザ入力は常にデータ扱い**。末尾に固定区切りで挿入：

  ````text
  ---
  USER_INPUT (verbatim):
  ```text
  <左ペインそのまま>
  ```

  ````

- 簡易RAG（TXT）：  
  - `corpus/*.txt` を読み込み、**max_bytes** 超過時は **Head 75% + Tail 25%** の抜粋  
  - `...[TRUNCATED]...` 挿入、全文の **SHA-256** 併記  
  - 抜粋は `{{doc_excerpt}}` に挿入可能（テンプレ側で参照）

---

## 9. セキュリティ / サンドボックス

- **パス制限**：  
  - `prompts/` / `corpus/` / `project/` のみ許可  
  - `canonicalize` + `starts_with` による **`ensure_under`** で外部拒否  
- **拡張子ホワイトリスト（project）**：`.py/.txt/.md/.json`（MVP範囲。必要に応じ追加）  
- **HTTPスコープ**：`http://localhost:11434/*` のみ（Tauri allowlist）  
- **Shell禁止**：任意コマンド実行は実装しない  
- **サイズ上限**：TXT抜粋の `max_bytes`（既定40,000）を超えるとトランケート

---

## 10. Tauri コマンド仕様（API）
>
> いずれも **同期/非同期** の区別は実装通り。`Result<T, String>` でエラーメッセージ返却。

### 10.1 プロンプト合成 / 実行 / 保存

- `compose_prompt`
  - シグネチャ：

    ```text
    compose_prompt(recipe_path: String, inline_params: Value)
      -> { final_prompt, sha256, model }
    ```

  - 入力：`recipe_path`（相対）、`inline_params`（`params`マージ）
  - 出力：合成済みプロンプト・SHA-256
- `run_ollama_stream`（GTK4ビルドで有効）
  - シグネチャ：

    ```text
    run_ollama_stream(window: WebviewWindow,
                      state: State<StreamState>,
                      model: String,
                      system_text: String,
                      user_text: String)
      -> ()
    ```

  - API：`POST /api/chat`（`stream=true`）を起動し、`ollama:chunk` / `ollama:jsonl` / `ollama:end` / `ollama:error` イベントをemit
  - 持続中のストリームは `StreamState` で単一管理し、後続呼び出しで前のハンドルを `abort()`
- `abort_current_stream`（GTK4ビルドで有効）
  - シグネチャ：

    ```text
    abort_current_stream(state: State<StreamState>) -> ()
    ```

  - 動作中のストリームを即時中断し、UIへ完了イベントを送出
- `run_ollama_chat`
  - シグネチャ：

    ```text
    run_ollama_chat(model: String, system_text: String, user_text: String)
      -> String
    ```

  - API：`POST /api/chat`（`stream=false`）
    `messages=[{ role: 'system' }, { role: 'user' }]`
  - 出力：OllamaのRAWテキスト（互換用のフォールバック）
- `save_run`
  - シグネチャ：

    ```text
    save_run(recipe_path: String,
             final_prompt: String,
             response_text: String,
             response_jsonl?: String)
      -> String
    ```

  - 出力：保存先ディレクトリパス。ストリーミング時は`response_jsonl`でJSONL履歴を保持

### 10.2 TXT（簡易RAG）

- `load_txt_excerpt`
  - シグネチャ：

    ```text
    load_txt_excerpt(path: String, max_bytes?: u64)
      -> { path, size_bytes, used_bytes, sha256, excerpt, truncated }
    ```

  - `path` は `corpus/` 相対（絶対指定なら拒否）

### 10.3 プロンプトファイル

- `list_prompt_files`
  - シグネチャ：

    ```text
    list_prompt_files(kind: "system" | "task" | "style" | "constraints")
      -> [{ path, name }]
    ```

- `read_prompt_file`
  - シグネチャ：

    ```text
    read_prompt_file(rel_path: String) -> { path, content }
    ```

### 10.4 プロジェクトI/O（.py等）

- `list_project_files`
  - シグネチャ：

    ```text
    list_project_files(exts?: string[]) -> [{ path, name, size }]
    ```

- `read_project_file`
  - シグネチャ：

    ```text
    read_project_file(rel_path: String) -> { path, content }
    ```

- `write_project_file`
  - シグネチャ：

    ```text
    write_project_file(rel_path: String, content: String) -> String
    ```

### 10.5 ワークスペース永続化

- `read_workspace`
  - シグネチャ：

    ```text
    read_workspace() -> Workspace | null
    ```

- `write_workspace`
  - シグネチャ：

    ```text
    write_workspace(ws: Workspace) -> String
    ```

> **エラーメッセージ例**：
>
> - `"path out of sandbox"`
> - `"file not found"`
> - `"invalid UTF-8"`
> - `"ollama unreachable"`
>
> など文字列で返却。

---

## 11. UI 詳細挙動

- ▶ 実行：
  1) `compose_prompt`
     （左ペインを `user_input` として注入）
  2) 合成結果から `system_text`（区切りより前）と
     `user_text`（区切り以降）を分離
  3) `run_ollama_stream`（GTK4）で逐次イベントをemit→ **右ペインに反映**
     （非GTK4時は `run_ollama_chat` で同等処理を同期実行）
  4) 完了またはエラー時に `ollama:end` / `ollama:error` を受信し、ストリームを閉じる
- **⇧ 反映**：右→左コピー
- **コピー/保存**：各ペイン単位。
  `Ctrl/Cmd+S` は左ペインを `project/` に保存
- **autosave**：
  入力・モデル・レシピ・パラメータ・`project_path` を800msデバウンスで
  `workspace.json` に書き出し
- **停止**：`abort_current_stream` コマンドを叩き、現行ストリームを`AbortHandle`で破棄
- **フォーカスモード**：`Ctrl/Cmd+Shift+F` またはツールバーのトグルで片側全画面⇔2ペインを切替。ステータスバッジとアニメーションで状態を通知

---

## 12. 設定（デフォルト値）

- `max_bytes`（TXT抜粋上限）：**40,000**  
- 危険語ヒューリスティクス：
  `["ignore previous", "jailbreak", "developer mode", "system prompt"]`
  （UI警告のみ）
- 色プリセット（将来のタブ用）：
  `#3b82f6, #22c55e, #eab308, #ef4444, #a855f7, #06b6d4, #f97316, #64748b`

---

## 13. ビルド / 起動（Windows）

- `scripts/dev.bat`：開発起動（Vite + Tauri）
- `scripts/build.bat`：NSISインストーラ作成（`target/release/bundle`）
- `scripts/run-built.bat`：生成EXEを検索して起動
- `scripts/check-ollama.bat`：`/api/tags` で疎通確認

> 依存：Node.js、Rust（stable）、Ollama（対象モデルは事前pull）

### 13.1 開発時の標準チェック

- `npm run lint`：React/TypeScript の ESLint（Workspace v2 以降も継続）
- `npm test`：Vitest（JSDOM）
- `npm run tauri:dev`：Tauri 2 デバッグ（Rustコマンドの変更時）

---

## 14. 受け入れ基準（QA チェックリスト）

- [ ] アプリを閉じて再起動しても
  **左/右テキスト・レシピ・モデル・params・project_path**が復元される
- [ ] `project/src/example.py` を**左に開き**、編集→**左を保存**→実ファイルに反映
- [ ] `corpus/` の長文TXTで**抜粋＋SHA**が表示され、`{{doc_excerpt}}` 経由で合成に入る
- [ ] ▶ 実行で**右ペインに反映**、**⇧ 反映**で左へ戻る
- [ ] `runs/<ts>/` に3ファイル
  （`recipe.path.txt`, `prompt.final.txt`, `response.raw.jsonl`）が生成
- [ ] `prompts/` / `corpus/` / `project/` 以外は**読めない/書けない**（サンドボックス有効）
- [ ] Ollama停止時、実行で**わかりやすいエラー**がUIに出る

---

## 15. 既知の制約 / リスク

- **ストリーミング制限**：同時に1セッションのみ。長文応答はchunk待機が発生
- **`textarea`ベース**：巨大ファイル編集・差分レビューは不得手
- **UTF-8前提**：他エンコーディングは未対応（要注意）

---

## 16. 将来計画（ロードマップ整合）

- **v0.4.1（進行中）**
  1) **Workspace v2 / タブ永続化**：ULID管理・タブ名/色/並べ替えを Workspace v2 モデルで永続化
  2) **差分プレビュー**：右ペインを Unified Diff 表示し、適用時は安全ハンクスキップで `project/` に反映
  3) **機密マスク**：送信前に正規表現で機密トークンを検知し、自動マスク
  4) **サイズ上限ハンドリング**：巨大入力時の段階トリミングと自動リトライ案内
  5) **workspace.bak 強化**：バックアップ復元UIと RUNBOOK の検証手順を同期
- **v0.4.2（整備フェーズ）**
  - CIパイプライン拡張、Issueテンプレ更新、Docs整備、Diagnostics、Export/Import
- **将来候補**
  - **Monaco Editor**：遅延ロードと言語別ハイライト/フォールディング
  - **RAG要約パイプライン強化**：スライディングウィンドウ→メタ要約→抽出リンク
- **完了済み（注記）**
  - **選択送信**：v0.4.0 で実装済み。前後3行プレビューと概算トークン表示を提供

---

## 17. エラーハンドリング方針

- **ユーザー起因**：サンドボックス外パス、存在しないファイル、サイズ超過 → 明示メッセージ  
- **環境起因**：Ollama疎通不可 → モデルpull/起動案内  
- **保存失敗**：パスを含む詳細を出し、権限/パス長などヒントを併記  
- 落とし穴（Windows）：シンボリックリンクは`ensure_under`で拒否／循環リンク検知

---

## 18. テレメトリ / ログ

- 外部送信なし（完全ローカル）  
- 実行ごとに `runs/<ts>/` に**追跡可能なアーティファクト**を残す

---

### 付録A：Ollama リクエスト（例）

```json
POST /api/chat
{
  "model": "llama3:8b",
  "stream": false,
  "messages": [
    {"role":"system","content":"<合成システム文>"},
    {"role":"user","content":"<USER_INPUT 含む本文>"}
  ]
}
```

### 付録B：TXT抜粋アルゴリズム

- `size_bytes <= max_bytes` → 全文  
- それ以外 →  
  - `head = floor(max_bytes * 0.75)`  
  - `tail = max_bytes - head`  
  - `head + "\n\n...[TRUNCATED]...\n\n" + tail`  
- 併せて**全文SHA-256**を計算し、監査/再現用に保持
