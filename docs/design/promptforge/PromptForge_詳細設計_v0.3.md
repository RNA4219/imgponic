# PromptForge 詳細設計（v0.3 / MVP）

**日付**: 2025-10-18（Asia/Tokyo）

---

## 1. フロントエンド詳細

### 1.1 コンポーネントツリー

```text
App
├─ FileBar
├─ TopToolbar
├─ SplitPane
│  ├─ LeftEditor
│  └─ RightEditor
└─ Toast/Modal (将来)
```

### 1.2 状態管理

- `useState` ベース（小規模前提）。将来は **Zustand**/Contextへ移行可能。
- `Workspace` は変更イベントを800msデバウンスして `write_workspace`。  
- ホットキー：`keydown` でグローバル捕捉（衝突防止に `preventDefault`）。

### 1.3 主要UI仕様

- **FileBar**
  - 入力：`projRel`（`project/`相対）
  - 操作：`.py一覧` / `←左開く` / `→右開く` / `左保存` / `右保存`
- **TopToolbar**
  - `recipePath`, `ollamaModel`, `params(goal/tone/steps)`、`▶`、`SHA-256`バッジ
- **Editors**
  - `<textarea>`（行数に応じてCSSで高さ確保）
  - 右→左の**⇧反映**ボタン

## 2. ブリッジ（Tauri/Rust）詳細

### 2.1 コマンドI/F

```rust
#[tauri::command]
fn compose_prompt(
    recipe_path: String,
    inline_params: serde_json::Value,
) -> Result<ComposeResult, String>;

#[tauri::command]
async fn run_ollama_chat(
    model: String,
    system_text: String,
    user_text: String,
) -> Result<String, String>;

#[tauri::command]
fn save_run(
    recipe_path: String,
    final_prompt: String,
    response_text: String,
) -> Result<String, String>;

#[tauri::command]
fn list_project_files(
    exts: Option<Vec<String>>,
) -> Result<Vec<ProjectEntry>, String>;

#[tauri::command]
fn read_project_file(rel_path: String) -> Result<FileContent, String>;

#[tauri::command]
fn write_project_file(
    rel_path: String,
    content: String,
) -> Result<String, String>;

#[tauri::command]
fn read_workspace(app: tauri::AppHandle) -> Result<Option<Workspace>, String>;

#[tauri::command]
fn write_workspace(
    app: tauri::AppHandle,
    ws: Workspace,
) -> Result<String, String>;
```

### 2.2 型

```rust
#[derive(Serialize)]
struct ComposeResult {
    final_prompt: String,
    sha256: String,
    model: String,
}

#[derive(Serialize)]
struct ProjectEntry {
    path: String,
    name: String,
    size: u64,
}

#[derive(Serialize)]
struct FileContent {
    path: String,
    content: String,
}

#[derive(Serialize, Deserialize, Default)]
struct Workspace {
    version: u32,
    left_text: String,
    right_text: String,
    recipe_path: String,
    model: String,
    params: serde_json::Value,
    project_path: Option<String>,
    updated_at: String,
}
```

### 2.3 主要アルゴリズム

- **プレースホルダ展開**：`{{key}}` を `params` から単純置換（未定義はそのまま）
- **ユーザ入力注入**：合成末尾に `USER_INPUT` 区切りを追加し **逐語** で挿入
- **SHA-256**：合成テキスト全体をハッシュ化（`hex` エンコード）
- **サンドボックス**：

  ```rust
  fn ensure_under(base: &Path, target: &Path) -> io::Result<()> {
      let base = base.canonicalize()?;
      let target = target.canonicalize()?;
      if !target.starts_with(&base) {
          return Err(io_err(PermissionDenied));
      }
      Ok(())
  }
  ```

## 3. データ・ファイル形式

- **Workspace**：JSON（UTF-8, pretty）
- **runs**：テキスト（UTF-8）
- **レシピ/フラグメント**：YAML（UTF-8）

## 4. 例外・エラー設計

| 事象 | Rust側返却 | UI挙動 |
| --- | --- | --- |
| Ollama未起動 | `"ollama unreachable"` | トースト＋起動案内 |
| サンドボックス外 | `"path out of sandbox"` | モーダル（パスを確認） |
| ファイル未検出 | `"file not found"` | トースト |
| 書き込み不可 | OSエラー文字列 | モーダル（権限/パス長ヒント） |
| JSON/YAML不正 | serdeエラー文字列 | トースト（レシピ/フラグメントを開いて修正誘導） |

## 5. 設定値

- `TXT max_bytes`：40,000（将来設定ファイル化）
- `Debounce`：800ms
- `Window Size`：1150×820（初期）

## 6. 拡張詳細（実装ガイド）

### 6.1 ストリーミング

- Rust：
  `reqwest` の `bytes_stream()` を
  `tauri::Window::emit("ollama:chunk", data)` で逐次通知
- Frontend：
  `useEffect` でイベント購読→右ペインに `append`。**中断** は `AbortHandle` 共有

### 6.2 タブ永続化

- `Workspace v2` の `tabs[]` 採用。ULID 生成で安定 ID
- 起動時：v1→v2 マイグレ（単一タブ化）
- UI：タブバー（色/名前/並べ替え/追加/削除）

### 6.3 差分適用

- 右ペイン出力を **Unified Diff** に固定（System 側で強制）
- Rust：差分適用（失敗ハンクを集計し UI に返却）
- UI：レビュー→適用→`project/` へ保存

### 6.4 Monaco Editor

- `import()` による遅延ロード。テーマはダーク固定
- Python/JSON/Markdown の言語サポート追加
- 検索・置き換え・折りたたみ・複数カーソル

## 7. テスト

- **ユニット**：`compose_prompt` / `ensure_under` / `workspace IO`
- **統合**：`run_ollama_chat`（Ollama 起動時/未起動時）
- **QA**：仕様書の受け入れ基準テンプレに沿って手順化

---

以上
