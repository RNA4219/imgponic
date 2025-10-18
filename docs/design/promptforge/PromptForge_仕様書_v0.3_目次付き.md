# 0. PromptForge 仕様書（番号付き / 目次つき）

**版**: v0.3（MVP）  
**日付**: 2025-10-18（Asia/Tokyo）  
**スタック**: Rust（Tauri v1） + TypeScript（React + Vite） + Ollama（localhost:11434）

---

## 目次

1. [概要](#1-概要)
2. [目的 / スコープ](#2-目的--スコープ)
3. [用語集](#3-用語集)
4. [システム構成](#4-システム構成)
5. [ディレクトリ構成](#5-ディレクトリ構成)
6. [UI/UX 仕様](#6-uiux-仕様)
7. [データモデル](#7-データモデル)
8. [合成・注入ルール](#8-合成注入ルール)
9. [セキュリティ / サンドボックス](#9-セキュリティ--サンドボックス)
10. [Tauri コマンド仕様（API）](#10-tauri-コマンド仕様api)
11. [動作シーケンス](#11-動作シーケンス)
12. [設定（デフォルト）](#12-設定デフォルト)
13. [ビルド / 起動（Windows）](#13-ビルド--起動windows)
14. [受け入れ基準（QA チェックリスト）](#14-受け入れ基準qa-チェックリスト)
15. [既知の制約 / リスク](#15-既知の制約--リスク)
16. [近未来拡張（優先順）](#16-近未来拡張優先順)
17. [エラーハンドリング方針](#17-エラーハンドリング方針)
18. [テレメトリ / ログ](#18-テレメトリ--ログ)
19. [付録](#19-付録)
20. [変更履歴](#20-変更履歴)

---

## 1. 概要

ローカル環境で実行する**プロンプト合成＋整形ビューア**。  

- 左ペイン：任意テキスト／コードを編集  
- ▶ 実行：Ollamaで**System＋タスク的指示**に従い
  整形/要約/提案
- 右ペイン：結果表示 →
  **⇧ 反映**で左へ戻す
- **プロンプトはフォルダ管理**（System含む）
- **TXT簡易RAG**（長文は抜粋＋ハッシュ）
- **project/** 内の `.py/.txt/.md/.json`
  を**開く/保存**
- **ワークスペース自動保存/復元**（アプリ再起動後も状態維持）
- **Windowsは .bat 起動**、Docker不要

> 将来的に：**コーデモッド（差分適用）/ ストリーミング / タブUI永続化 / Monaco** にスムーズ拡張。

---

## 2. 目的 / スコープ

- 目的：プロンプト/コードの**整形・説明・テンプレ化**を、**完全ローカル**に安全・高速に回す。  
- スコープ（MVP）：
  - 左右2ペイン、▶/⇧反映、コピー/保存、ワークスペース永続化
  - レシピ（YAML）×フラグメント合成、Ollama呼び出し
  - `corpus/` のTXT抜粋、`project/` のテキスト系ファイルI/O
- 非スコープ：ネットワークAPI連携（Ollama以外）、外部コマンド実行、VCS操作

---

## 3. 用語集

- **レシピ**: 使用するフラグメント列と既定パラメータを記すYAML  
- **フラグメント**: System/Task/Style/Constraintsなどの文面断片（YAML）  
- **簡易RAG**: TXT抜粋をテンプレに流し込む簡易参照機構  
- **Workspace**: 最終編集状態（UIの直近値）

---

## 4. システム構成

- フロント：React（Vite）  
- ブリッジ：Tauri（Rustコマンド）  
- バック：ローカルFS／Ollama HTTP（`http://localhost:11434`）  
- 永続化：`app_data_dir()/workspace.json`（取得不可時はカレント）  
- ログ：`runs/<YYYYMMDD-HHMMSS>/`

---

## 5. ディレクトリ構成

```text
data/
  fragments/ ... YAML（合成テンプレの分割片）
  profiles/  ... モデル設定（参考）
  recipes/   ... 合成レシピ

prompts/       # すべてのプロンプト（System含む）
corpus/        # 簡易RAG対象の .txt
project/       # 編集対象の .py/.txt/.md/.json（サンドボックス）

runs/<ts>/     # 実行ログ
src/           # React
src-tauri/     # Rust (Tauri)
scripts/*.bat  # Windows 起動/ビルド
```

---

## 6. UI/UX 仕様

### 6.1 画面レイアウト

- 上部ツールバー：Recipe、Model、主要Params、▶ 実行（Ctrl/Cmd+Enter）
- ファイルバー（project/）：相対パス、`.py一覧`、左右に開く、左右保存
- 2ペイン：左（入力）、右（LLM整形出力・⇧反映）／各ペインにコピー/保存

### 6.2 ショートカット

- Ctrl/Cmd+Enter：実行  
- Ctrl/Cmd+S：左ペインを `project/` へ保存  
- Ctrl/Cmd+C：フォーカス優先でコピー（既定は右）

### 6.3 状態/フィードバック

- ▶ 押下アニメ／`composed.sha256` 先頭16桁表示  
- Workspaceオートセーブ（約800msデバウンス）

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
  project_path?: string
  updated_at: string
}
```

### 7.2 実行ログ（`runs/<ts>/`）

- `recipe.path.txt` / `prompt.final.txt` / `response.raw.jsonl`

---

## 8. 合成・注入ルール

- `fragments` を順連結 → `{{key}}` 展開（params）  
- 末尾に`USER_INPUT`固定区切りで左ペイン内容を**そのまま**挿入  
- TXT簡易RAG：上限超過時は **Head 75% + Tail 25%** 抜粋＋全文SHA-256

---

## 9. セキュリティ / サンドボックス

- `prompts/` `corpus/` `project/` の**内側のみ**読み書き可（`ensure_under`）  
- `project/` は `.py/.txt/.md/.json` を前提（拡張可）  
- HTTPスコープ：`http://localhost:11434/*` のみ

---

## 10. Tauri コマンド仕様（API）

- `compose_prompt(recipe_path, inline_params) -> { final_prompt, sha256, model }`
- `run_ollama_chat(model, system_text, user_text) -> string`
- `save_run(recipe_path, final_prompt, response_text) -> string`
- `list_project_files(exts?) -> [{ path, name, size }]`
- `read_project_file(rel_path) -> { path, content }`
- `write_project_file(rel_path, content) -> string`
- `read_workspace() -> Workspace | null`
- `write_workspace(ws) -> string`

---

## 11. 動作シーケンス

1. ▶ 実行  
   a. `compose_prompt`（左を `user_input`）  
   b. 合成結果を system/user に分割  
   c. `run_ollama_chat` → 右に表示  
2. ⇧ 反映：右→左コピー  
3. 保存：`project/` 直下に書き出し

---

## 12. 設定（デフォルト）

- TXT `max_bytes`：40,000  
- 危険語ヒューリスティクス（UI警告用）：`ignore previous` など

---

## 13. ビルド / 起動（Windows）

- `scripts/dev.bat` / `scripts/build.bat` /
  `scripts/run-built.bat` / `scripts/check-ollama.bat`
- 依存：Node.js、Rust、Ollama（モデルは事前pull）

---

## 14. 受け入れ基準（QA チェックリスト）

- [ ] 再起動で**左/右/レシピ/モデル/params/project_path**が復元  
- [ ] `project/src/example.py` の開く→編集→保存が反映  
- [ ] TXT抜粋＋SHAが表示・合成される  
- [ ] ▶ 実行で右に反映、⇧で左に戻せる  
- [ ] `runs/<ts>/` に3ファイル生成  
- [ ] サンドボックス外アクセスは拒否  
- [ ] Ollama停止時に明確なエラー表示

---

## 15. 既知の制約 / リスク

- 応答ストリーミング未対応、巨大ファイル編集は不得手、UTF-8前提

---

## 16. 近未来拡張（優先順）

1) ストリーミング（途中停止）  
2) 選択範囲だけ送信（前後行自動付与）  
3) タブUI永続化（名前・色・並べ替え）  
4) 差分モード（Unified Diff → 安全適用）  
5) Monaco Editor（遅延ロード）  
6) JSONスキーマ検証→自動再プロンプト  
7) RAG要約パイプ

---

## 17. エラーハンドリング方針

- ユーザー起因：パス/存在/サイズ → 明示メッセージ  
- 環境起因：Ollama疎通不可 → 起動/pull誘導  
- 保存失敗：権限/パス長ヒント

---

## 18. テレメトリ / ログ

- 外部送信なし  
- `runs/<ts>/` にアーティファクト保存

---

## 19. 付録

### 19.1 Ollama リクエスト例

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

### 19.2 TXT抜粋アルゴリズム

- `size <= max` → 全文  
- それ以外 → Head 75% + Tail 25% + `...[TRUNCATED]...`  
- 併せて全文SHA-256を計算・表示

---

## 20. 変更履歴

- v0.3（2025-10-18）MVP仕様確定／Workspace永続化／project I/O／.bat起動
