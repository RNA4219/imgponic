# Imgponic Reboot System Spec

## 1. Tauriコマンド/API整理

### compose_prompt
- **入力**: `recipe_path: String`, `inline_params: Value` を受け取り、Tauri から `promptforge::compose_prompt` を呼び出す。`inline_params` はレシピの `params` を上書き統合した上でプレースホルダを解決する。 【F:src/main.rs†L14-L20】【F:src/lib.rs†L112-L213】
- **出力**: `ComposeResult { final_prompt, sha256, model }`。最終プロンプトを SHA-256 でハッシュ化して返す。 【F:src/lib.rs†L83-L213】
- **前提条件**: レシピ・フラグメントは `PROMPTFORGE_DATA_DIR`（既定は `data/`）配下。`ensure_under` によりサンドボックス外のパスは拒否される。 【F:src/lib.rs†L141-L189】【F:src/lib.rs†L430-L464】
- **エラー挙動**: サンドボックス違反、YAML 読込失敗、パラメータ不整合は `Err(String)` で呼び出し元へ伝播する。

### run_ollama_chat
- **入力**: `model`, `system_text`, `user_text`。同期レスポンスを期待するチャット実行。 【F:src/main.rs†L22-L28】
- **出力**: Ollama `/api/chat` のレスポンステキスト。 【F:src/lib.rs†L228-L258】
- **前提条件**: Ollama が `http://localhost:11434` で稼働していること。
- **エラー挙動**: HTTP 送信／受信エラーは `Err(String)` に変換される。 【F:src/lib.rs†L248-L257】

### run_ollama_stream *(gtk4 ビルドのみ)*
- **入力**: `WebviewWindow`, `State<StreamState>`, `model`, `system_text`, `user_text`。ストリーミング応答をフロントへイベント配信。 【F:src/main.rs†L31-L41】【F:src/lib.rs†L260-L401】
- **出力**: 成功時は `()`。内部で `ollama:chunk` / `ollama:jsonl` / `ollama:end` / `ollama:error` を emit。完了時に `StreamState` をクリア。 【F:src/lib.rs†L293-L386】
- **前提条件**: 既存ストリームは `StreamState::register` でキャンセル。Ollama のストリームレスポンスは JSONL。 【F:src/lib.rs†L283-L341】
- **エラー挙動**: ネットワーク／パース失敗時に `ollama:error` を emit、`Err(String)` を返す。AbortHandle により中断可能。 【F:src/lib.rs†L312-L387】

### abort_current_stream *(gtk4 ビルドのみ)*
- **入力**: `State<StreamState>`。 【F:src/main.rs†L43-L47】
- **出力**: `()`。登録済みストリームがあれば `AbortHandle` を呼び出し中断。 【F:src/lib.rs†L404-L410】
- **エラー挙動**: 登録が無い場合は何もせず成功。

### save_run
- **入力**: `recipe_path`, `final_prompt`, `response_text`, `response_jsonl`。 【F:src/main.rs†L49-L57】
- **出力**: タイムスタンプ付き `runs/<ts>/` ディレクトリへの保存パス文字列。 【F:src/lib.rs†L412-L427】
- **前提条件**: 書き込み先ディレクトリ作成が可能であること。
- **エラー挙動**: FS 書込失敗時に `Err(String)`。 【F:src/lib.rs†L418-L425】

### list_prompt_files / read_prompt_file
- **入力**: `kind: String`（system/task/style/constraints）および `rel_path: String`。 【F:src/main.rs†L59-L67】
- **出力**: 種別フィルタ済みリスト、またはファイル内容とフルパス。 【F:src/lib.rs†L466-L525】
- **前提条件**: `prompts/` 配下のみアクセス可。無効種別は拒否。 【F:src/lib.rs†L475-L516】
- **エラー挙動**: サンドボックス外・未存在ファイルは `Err(String)`。 【F:src/lib.rs†L499-L516】

### list_project_files / read_project_file / write_project_file
- **入力**: 許可拡張子フィルタ `exts`, 相対パス `rel_path`, 書込内容 `content`。 【F:src/main.rs†L69-L82】
- **出力**: ファイル一覧（パス・名称・サイズ）またはファイル内容、書込結果パス。 【F:src/lib.rs†L526-L616】
- **前提条件**: `project/` 配下かつ拡張子が `py|txt|md|json`。書込時は親ディレクトリを自動生成。 【F:src/lib.rs†L527-L615】
- **エラー挙動**: 拡張子違反／サンドボックス外／FS エラーで `Err(String)`。 【F:src/lib.rs†L529-L615】

### load_txt_excerpt
- **入力**: `path`, `max_bytes`（任意）。 【F:src/main.rs†L84-L90】
- **出力**: `TxtExcerpt`（パス、サイズ、使用バイト数、SHA256、抜粋本文、切捨てフラグ）。 【F:src/txt_excerpt.rs†L10-L85】
- **前提条件**: ファイルは `corpus/` 配下（絶対パスでも許可だがサンドボックス検証あり）。既定で最大 40,000 bytes を読み込む。 【F:src/txt_excerpt.rs†L20-L68】
- **エラー挙動**: 未存在ファイル／サンドボックス違反／FS エラーは `Err(String)`。 【F:src/txt_excerpt.rs†L29-L35】【F:src/txt_excerpt.rs†L88-L95】

### read_workspace / write_workspace
- **入力**: `AppHandle`, `Workspace`。 【F:src/main.rs†L92-L100】
- **出力**: JSON から復元した `Workspace` もしくは保存先パス。既存ファイルがあれば `.bak` を生成。 【F:src/lib.rs†L662-L715】
- **前提条件**: `app_data_dir()/workspace.json` またはカレントディレクトリ直下へのアクセスが可能。 【F:src/lib.rs†L662-L714】
- **エラー挙動**: 未存在時の読込は `Ok(None)`、その他 IO/シリアライズ失敗は `Err(String)`。 【F:src/lib.rs†L676-L714】

### check_ollama_setup
- **入力**: `base_url?`, `model?`。 【F:src/main.rs†L102-L108】
- **出力**: `SetupCheckOutcome { status, guidance }`。タグ一覧からモデル有無を判定。 【F:src/setup_check.rs†L82-L174】
- **前提条件**: Ollama `/api/tags` が JSON で応答。`model` が指定されれば存在チェック。 【F:src/setup_check.rs†L134-L159】
- **エラー挙動**: HTTP/JSON 失敗や未到達は `server_unavailable`、モデル欠如は `model_missing`。Tauri には `Ok(Outcome)` を返す。 【F:src/setup_check.rs†L134-L174】

## 2. フロントユースケースと受け入れ基準

### シナリオA: 選択範囲のみ送信
- ユーザーが左ペインでテキストを選択し「選択のみ送信」を有効化すると、選択範囲と前後3行を `determineUserInput` が整形する。 【F:src/App.tsx†L71-L90】
- `composePromptWithSelection` は選択内容をサニタイズし、`compose_prompt` へ `inlineParams.user_input` として渡す。 【F:src/App.tsx†L107-L135】
- 実行時は直前の合成結果が無ければ再合成し、抽出した USER_INPUT セクションとサニタイズ結果をストリームに投入する。 【F:src/App.tsx†L441-L515】
- 受け入れ基準: 選択が無い/無効な場合は全文送信となり、サニタイズ結果のマスク種別と長さ警告が UI ステートに反映される。 【F:src/App.tsx†L71-L135】【F:src/App.tsx†L465-L488】

### シナリオB: 抜粋読込
- ユーザーがコーパス相対パスを入力し `loadDocExcerpt` を起動すると、`load_txt_excerpt` コマンドを呼び抜粋を `params.doc_excerpt` に反映。 【F:src/App.tsx†L347-L371】
- 読込前に空文字を許可し、その場合は抜粋とパラメータをリセット。 【F:src/App.tsx†L347-L360】
- 失敗時はステータスを `error` にし、UI エラー表示と `alert` で通知する。 【F:src/App.tsx†L371-L385】
- 受け入れ基準: 成功すれば抜粋情報が状態に保存され、他条件変更で再合成がリセットされる。 【F:src/App.tsx†L230-L244】【F:src/App.tsx†L340-L345】

### シナリオC: 差分反映
- 右ペインの結果を左ペインへ反映する際、`createDiffPreviewFlow` が左右テキストから統一 diff を生成しモーダルへ表示。 【F:src/App.tsx†L532-L544】【F:src/App.tsx†L973-L983】
- ユーザーが確認を選ぶと `apply` が左テキストを更新、キャンセルで diff を閉じるのみ。 【F:src/App.tsx†L533-L544】
- 受け入れ基準: diff 表示中は差分プレビューが描画され、確定時に左テキストへ反映かつモーダルを閉じる。 【F:src/App.tsx†L973-L983】

### シナリオD: ストリーム中断
- `useOllamaStream` から取得した `abortStream` を UI が呼ぶと、`abort_current_stream` コマンドを起動し finalize でリスナを解放。 【F:src/App.tsx†L295-L306】【F:src/useOllamaStream.ts†L58-L88】
- 中断処理はエラー表示をリセットし、右ペインをクリアして再実行待ち状態に戻す。 【F:src/App.tsx†L295-L305】
- 受け入れ基準: 中断直後に `isStreaming` が false になり、後続のストリームを再開できる。 【F:src/useOllamaStream.ts†L21-L89】

## 3. セキュリティ/安全性仕様

### サンドボックス
- `compose_prompt`、プロンプト/プロジェクト I/O、テキスト抜粋はいずれも `ensure_under` でルート外アクセスを拒否。プロジェクトは許可拡張子のみ処理。 【F:src/lib.rs†L141-L189】【F:src/lib.rs†L430-L616】【F:src/txt_excerpt.rs†L20-L95】
- 期待動作: ルート外パスは `PermissionDenied` として `Err(String)` を返し、フロントにはエラーメッセージを伝達する。
- エラーハンドリング: フロントは失敗時に警告を表示し、状態更新をロールバック（例: 抜粋リセット）。 【F:src/App.tsx†L371-L385】

### 機密マスク
- `sanitizeUserInput` が API キー/秘密鍵を `<REDACTED:TYPE>` へ置換し、4万文字超過を検出。 【F:src/security/sanitizeUserInput.ts†L1-L52】
- フロントはサニタイズ結果とマスク種別を `userInputWarnings` に保持し、送信前プレビューを安全長に整形。 【F:src/App.tsx†L441-L488】
- エラーハンドリング: サニタイズ自体は失敗しない設計。過長入力は `overLimit` で UI 警告、送信は継続可能。

### セットアップ検証
- バックエンドは `/api/tags` を照会し、サーバー到達性・モデル有無を `SetupStatus` で通知。 【F:src/setup_check.rs†L82-L174】
- フロントの `useSetupCheck` は応答をバリデーションし、失敗時は `offline` ステータスと既定ガイダンスを設定、`retry` で再試行。 【F:src/useSetupCheck.ts†L19-L96】
- エラーハンドリング: HTTP 例外やスキーマ不一致時でも `offline` として UI 通知、再試行は安全に繰り返せる。 【F:src/useSetupCheck.ts†L70-L96】
