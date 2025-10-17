# PromptForge 仕様書（MVP + 近未来拡張）
**版**: v0.3（MVP）  
**日付**: 2025-10-18（Asia/Tokyo）  
**スタック**: Rust（Tauri v1） + TypeScript（React + Vite） + Ollama（localhost:11434）

---

## 1. 目的 / スコープ
ローカル環境で実行する**プロンプト合成＋整形ビューア**。  
- 左ペイン：任意テキスト／コードを編集  
- ▶ 実行：Ollamaで**System＋タスク的指示**に従い整形/要約/提案  
- 右ペイン：結果表示 → **⇧ 反映**で左へ戻す  
- **プロンプトはフォルダ管理**（System含む）  
- **TXT簡易RAG**（長文は抜粋＋ハッシュ）  
- **project/** 内の `.py/.txt/.md/.json` を**開く/保存**  
- **ワークスペース自動保存/復元**（アプリ再起動後も状態維持）  
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
- フロント：React（Vite）  
- ブリッジ：Tauri（Rustコマンド）  
- バック：ローカルFS／Ollama HTTP（`http://localhost:11434`）  
- 永続化：`app_data_dir()/workspace.json`（取得不可時はカレント）  
- ログ：`runs/<YYYYMMDD-HHMMSS>/`

---

## 5. ディレクトリ構成（アプリ直下）
```
data/
  fragments/ ... YAML（合成テンプレの分割片）
  profiles/  ... モデル設定（参考）
  recipes/   ... 合成レシピ（どのフラグメントを順に連結するか）

prompts/       # すべてのプロンプト（System含む）をここに保存（拡張時に活用）
corpus/        # 簡易RAG対象の .txt
project/       # 編集対象の .py/.txt/.md/.json（サンドボックス）

runs/<ts>/     # 実行ログ（自動生成）
src/           # React
src-tauri/     # Rust (Tauri)
scripts/*.bat  # Windows 起動/ビルド補助
```

---

## 6. UI/UX 仕様
### 6.1 画面レイアウト
- **上部ツールバー**  
  - Recipeパス入力（`data/recipes/*.yaml`）  
  - Model入力（例：`llama3:8b`）  
  - Params（`goal/tone/steps` 等の主要キー）  
  - ▶ 実行ボタン（**Ctrl/Cmd+Enter**）
- **ファイルバー**（`project/`サンドボックス）  
  - 相対パス入力（例：`src/example.py`）  
  - 「.py一覧」「← 左に開く」「→ 右に開く」「左を保存」「右を保存」
- **2ペイン**  
  - 左：テキスト入力（`textarea`）  
  - 右：LLM整形出力（`textarea`、**⇧ 反映**で左へコピー）
  - 各ペイン：**コピー**・**保存/別名保存**ボタン

### 6.2 ショートカット
- **Ctrl/Cmd+Enter**：実行（▶）  
- **Ctrl/Cmd+S**：`project/`へ左ペイン保存  
- **Ctrl/Cmd+C**：右ペインをコピー（フォーカス中のペイン優先）

### 6.3 状態/フィードバック
- ▶ 押下時：軽い縮小アニメ（押下感）  
- 右ペイン更新→**⇧ 反映**で左へ転送  
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

### 7.2 実行ログ（runs/<ts>/）
- `recipe.path.txt`：使用レシピパス  
- `prompt.final.txt`：最終合成テキスト（`USER_INPUT` を含む）  
- `response.raw.jsonl`：Ollama応答（RAW）

---

## 8. 合成・注入ルール
- YAMLレシピ `fragments` の順で**連結**  
- `params` で `{{key}}` プレースホルダを展開  
- **ユーザ入力は常にデータ扱い**。末尾に固定区切りで挿入：
  ```
  ---
  USER_INPUT (verbatim):
  ```text
  <左ペインそのまま>
  ```
  ```
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
> いずれも **同期/非同期** の区別は実装通り。`Result<T, String>` でエラーメッセージ返却。

### 10.1 プロンプト合成 / 実行 / 保存
- `compose_prompt(recipe_path: String, inline_params: Value) -> { final_prompt, sha256, model }`  
  - 入力：`recipe_path`（相対）、`inline_params`（`params`マージ）  
  - 出力：合成済みプロンプト・SHA-256  
- `run_ollama_chat(model: String, system_text: String, user_text: String) -> String`  
  - `POST /api/chat`（`stream=false`、`messages=[{role:'system'},{role:'user'}]`）  
  - 出力：OllamaのRAWテキスト  
- `save_run(recipe_path: String, final_prompt: String, response_text: String) -> String`  
  - 出力：保存先ディレクトリパス

### 10.2 TXT（簡易RAG）
- `load_txt_excerpt(path: String, max_bytes?: u64) -> { path, size_bytes, used_bytes, sha256, excerpt, truncated }`  
  - `path` は `corpus/` 相対（絶対指定なら拒否）

### 10.3 プロンプトファイル
- `list_prompt_files(kind: "system"|"task"|"style"|"constraints") -> [{ path, name }]`  
- `read_prompt_file(rel_path: String) -> { path, content }`

### 10.4 プロジェクトI/O（.py等）
- `list_project_files(exts?: string[]) -> [{ path, name, size }]`  
- `read_project_file(rel_path: String) -> { path, content }`  
- `write_project_file(rel_path: String, content: String) -> String`

### 10.5 ワークスペース永続化
- `read_workspace() -> Workspace | null`  
- `write_workspace(ws: Workspace) -> String`

> **エラーメッセージ例**：  
> `"path out of sandbox"`, `"file not found"`, `"invalid UTF-8"`, `"ollama unreachable"` など文字列で返却。

---

## 11. UI 詳細挙動
- ▶ 実行：  
  1) `compose_prompt`（左ペインを `user_input` として注入）  
  2) 合成結果から `system_text`（区切りより前）と `user_text`（区切り以降）分離  
  3) `run_ollama_chat` → **右ペインに反映**  
- **⇧ 反映**：右→左コピー  
- **コピー/保存**：各ペイン単位。`Ctrl/Cmd+S` は左ペインを `project/` に保存  
- **autosave**：入力・モデル・レシピ・パラメータ・`project_path` を800msデバウンスで `workspace.json` に書き出し

---

## 12. 設定（デフォルト値）
- `max_bytes`（TXT抜粋上限）：**40,000**  
- 危険語ヒューリスティクス：`["ignore previous", "jailbreak", "developer mode", "system prompt"]`（UI警告のみ）  
- 色プリセット（将来のタブ用）：`#3b82f6,#22c55e,#eab308,#ef4444,#a855f7,#06b6d4,#f97316,#64748b`

---

## 13. ビルド / 起動（Windows）
- `scripts/dev.bat`：開発起動（Vite + Tauri）  
- `scripts/build.bat`：NSISインストーラ作成（`src-tauri/target/release/bundle`）  
- `scripts/run-built.bat`：生成EXEを検索して起動  
- `scripts/check-ollama.bat`：`/api/tags` で疎通確認  
> 依存：Node.js、Rust（stable）、Ollama（対象モデルは事前pull）

---

## 14. 受け入れ基準（QA チェックリスト）
- [ ] アプリを閉じて再起動しても**左/右テキスト・レシピ・モデル・params・project_path**が復元される  
- [ ] `project/src/example.py` を**左に開き**、編集→**左を保存**→実ファイルに反映  
- [ ] `corpus/` の長文TXTで**抜粋＋SHA**が表示され、`{{doc_excerpt}}` 経由で合成に入る  
- [ ] ▶ 実行で**右ペインに反映**、**⇧ 反映**で左へ戻る  
- [ ] `runs/<ts>/` に3ファイル（`recipe.path.txt`, `prompt.final.txt`, `response.raw.jsonl`）が生成  
- [ ] `prompts/` / `corpus/` / `project/` 以外は**読めない/書けない**（サンドボックス有効）  
- [ ] Ollama停止時、実行で**わかりやすいエラー**がUIに出る

---

## 15. 既知の制約 / リスク
- **非ストリーミング**：長文応答は待機時間が出る  
- **`textarea`ベース**：巨大ファイル編集・差分レビューは不得手  
- **UTF-8前提**：他エンコーディングは未対応（要注意）

---

## 16. 近未来拡張（優先順）
1) **ストリーミング**（`stream:true` + 中断ボタン）  
2) **選択範囲だけ送信**＋前後行の自動コンテキスト  
3) **タブUI**（名前/色/並べ替え/永続化）  
4) **差分モード**：右ペインを**Unified Diff**で出力 → Rustで安全適用（失敗ハンクはスキップ）  
5) **Monaco Editor**（遅延ロード、Python/JSON/MDハイライト、折りたたみ）  
6) **スキーマ固定整形**：JSONスキーマ検証→自動リトライ  
7) **RAGの要約パイプ**：スライディングウィンドウ→メタ要約→抽出リンク

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
