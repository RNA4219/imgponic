# PromptForge 拡張仕様書（v0.4 計画）

**作成日**: 2025-10-18（Asia/Tokyo）
**対象版**: v0.4（v0.3 MVPの上に載せる増分）  
**スタック**: Rust（Tauri v1） + TypeScript（React + Vite） + Ollama（localhost:11434）

---

## 目次

1. [背景 / 目的](#1-背景--目的)
2. [変更概要](#2-変更概要)
3. [スコープ](#3-スコープ)
4. [機能仕様](#4-機能仕様)
    - 4.1 [ストリーミング + 停止ボタン](#41-ストリーミング--停止ボタン)
    - 4.2 [選択範囲だけ送信（自動コンテキスト付与）](#42-選択範囲だけ送信自動コンテキスト付与)
    - 4.3 [タブUI + 永続化（Workspace v2）](#43-タブui--永続化workspace-v2)
5. [運用 / 配布 / ライセンス](#5-運用--配布--ライセンス)
6. [CI / 品質保証](#6-ci--品質保証)
7. [セキュリティ / 堅牢化](#7-セキュリティ--堅牢化)
8. [UX 強化](#8-ux-強化)
9. [ドキュメント整備](#9-ドキュメント整備)
10. [診断 / エクスポート](#10-診断--エクスポート)
11. [互換性 / マイグレーション](#11-互換性--マイグレーション)
12. [受け入れ基準（全体）](#12-受け入れ基準全体)
13. [マイルストーン / ロードマップ](#13-マイルストーン--ロードマップ)
14. [付録A：イベント/API設計（案）](#14-付録aイベントapi設計案)
15. [付録B：正規表現マスク（案）](#15-付録b正規表現マスク案)

---

## 1. 背景 / 目的

v0.3のMVPはローカル整形・コーデモッドの“ループ最短化”に成功した。v0.4では、**体感速度・安全性・運用性**を底上げし、日常ツールとしての完成度を高める。

---

## 2. 変更概要

- **体感速度**：Ollama応答の**ストリーミング**、**途中停止**を実装
- **効率**：**選択範囲だけ送信**（前後数行の自動コンテキスト）
- **作業整理**：**タブUI**（名前・色・並べ替え・復元）
- **運用**：LICENSE/CHANGELOG、Portable ZIP + NSIS、コードサイニング、初回セットアップチェック
- **品質**：CI（build/lint/test）、スナップショット、サンドボックス単体テスト
- **安全**：秘密情報マスク、サイズ上限、workspaceのバックアップ
- **UX**：フォーカスモード、キーバインド早見、ハイコントラスト、**差分プレビュー**
- **Docs**：CONTRIBUTING、Issueテンプレ、RECIPES_PACK、Troubleshooting
- **診断**：収集スクリプト、設定エクスポート/インポート

---

## 3. スコープ

### インスコープ

- 4章～10章に記載の機能の実装とテスト

### アウトオブスコープ

- 外部API統合（Ollama以外）／実行系（コード実行・VCS操作）／モデル配布

---

## 4. 機能仕様

### 4.1 ストリーミング + 停止ボタン

**目的**：長文でも体感を軽くし、ユーザーが適切な地点で生成を止められるようにする。

**FR-STR-01** `run_ollama_chat`に**ストリーム版**を追加すること。

**FR-STR-02** UIは**逐次追記**し、**中断**ボタンで停止できること。

**FR-STR-03** 中断時は**直前までのテキスト**を保持すること。

**FR-STR-04** エラー（切断/タイムアウト）は中断扱いでUIへ明示すること。

#### UI要件（ストリーミング）

- 右ペイン上部に**進行インジケータ**と**停止**ボタン
- 停止後はボタン無効化→「停止しました」トースト（将来トースト化）

#### API要件（Rust/Tauri）

- `run_ollama_stream(model, system, user)`：イベントで**chunk**通知
- `abort_current_stream()`：現在のストリームを中断
- イベント名：`ollama:chunk` / `ollama:end` / `ollama:error`

#### 受け入れ（ストリーミング）

- 10秒超の応答で**1秒以内に最初の文字が表示**されること
- 停止で**1秒以内**に受信が止まり、UIが安定すること

---

### 4.2 選択範囲だけ送信（自動コンテキスト付与）

**目的**：巨大ファイルでも必要箇所だけで効率よく応答を得る。

**FR-SEL-01** 左ペインの**選択範囲**があれば、そのテキストを`USER_INPUT`に使うこと。

**FR-SEL-02** 選択がなければ、従来どおり**全文**を送ること。

**FR-SEL-03** `ctx_lines_before/after`（既定：3）を元に、選択範囲の前後行を付加すること。

**FR-SEL-04** 送信範囲はUIで確認可能にすること（切替オプション・簡易プレビュー）。

#### UI要件（選択送信）

- `「選択のみ送る」`チェックボックス（TopToolbar）
- 送信直前に**行数/概算トークン**のミニ表示

#### 受け入れ（選択送信）

- 1万行の`.py`から50行選択で、**送信サイズが大幅に減る**ことを確認（概算トークン表示）

---

### 4.3 タブUI + 永続化（Workspace v2）

**目的**：作業文脈ごとにプロンプトやファイルを切り替え、**再起動後も再現**。

**FR-TAB-01** タブの**追加/削除/並べ替え/色/名前**が可能であること。

**FR-TAB-02** タブごとに`left/right/recipe/model/params/project_path`が保持されること。

**FR-TAB-03** **Workspace v2**でタブ構成を**永続化**すること。

**FR-TAB-04** v1からの**自動マイグレーション**が行われること。

#### データモデル（Workspace v2）

```json
{
  "version": 2,
  "tabs": [
    {
      "id": "01J...ULID",
      "name": "Sora整形",
      "color": "#22c55e",
      "left": "...",
      "right": "...",
      "recipe": "data/recipes/demo.sora2.yaml",
      "model": "llama3:8b",
      "params": { "goal": "", "tone": "", "steps": 6 },
      "project_path": "src/example.py"
    }
  ],
  "activeTabId": "01J...",
  "updated_at": "2025-10-18T12:34:56Z"
}
```

#### 受け入れ（タブUI）

- 再起動後、**最後に開いていたタブ**がアクティブで、全状態が復元される

---

## 5. 運用 / 配布 / ライセンス

**FR-OPS-01** ルートに **LICENSE**（MITまたはApache-2.0）を置く。

**FR-OPS-02** **CHANGELOG.md**（Keep a Changelog形式可）を運用。

**FR-OPS-03** 配布形態を**Portable ZIP**と**NSISインストーラ**の2種にする。

**FR-OPS-04** **コードサイニング**（将来）に備えた署名手順ドキュメント。

**FR-OPS-05** 初回起動時に**セットアップチェック**（Ollama疎通 / 必要モデル案内）。

### 受け入れ（運用）

- 初回起動でOllama未起動の場合、**明確な案内**が表示される

---

## 6. CI / 品質保証

**FR-CI-01** GitHub Actionsで **build + lint + test** を実行。

**FR-CI-02** Rust：`clippy` / `fmt`、TS：`eslint` / `prettier`。

**FR-CI-03** **スナップショットテスト**で合成プロンプトの回帰検知。

**FR-CI-04** `ensure_under` の**パス試験**（シンボリックリンク・相対経路・UNC）。

### 受け入れ（CI）

- PR作成時にCIが走り、失敗時はマージできない

---

## 7. セキュリティ / 堅牢化

**FR-SEC-01** **秘密情報マスク**を送信前に適用（APIキー・秘密鍵など）。

**FR-SEC-02** 大きい入力に対して**サイズ上限**と警告（開く/送る/保存で別閾値）。

**FR-SEC-03** `workspace.json` の**バックアップ**（`workspace.bak`）を保持。

**FR-SEC-04** シンボリックリンクの循環を検知して拒否。

### 受け入れ（セキュリティ）

- 秘密鍵断片を含む入力でマスクが入ることを確認（付録Bの正規表現）

---

## 8. UX 強化

**FR-UX-01** **フォーカスモード**（片側全画面 / フォント拡大）。

**FR-UX-02** **キーバインド早見表**（`?`でトグル）。

**FR-UX-03** **ハイコントラスト** / 行間・文字間の微調整。

**FR-UX-04** **右→左の差分プレビュー**（丸ごと上書き前に変更点を確認）。

### 受け入れ（UX）

- 差分プレビューが**変更箇所のみ**を強調し、適用/キャンセルが選べる

---

## 9. ドキュメント整備

**FR-DOC-01** `CONTRIBUTING.md`（ブランチ戦略・レビュー・リリース）。

**FR-DOC-02** `.github/ISSUE_TEMPLATE/`（バグ/機能要望）。

**FR-DOC-03** `RECIPES_PACK.md`（推奨レシピ/フラグメント）。

**FR-DOC-04** `Troubleshooting.md`（Ollama未起動・ポート衝突・長パス問題）。

### 受け入れ（ドキュメント）

- 新規コントリビューターが**ドキュメントのみ**で環境構築～PRまで辿れる

---

## 10. 診断 / エクスポート

**FR-DIAG-01** `diagnostics:collect`（`runs/` `workspace.json` `logs` をzip化）。

**FR-DIAG-02** `workspace:export/import`（UIから設定エクスポート/復元）。

### 受け入れ（診断）

- 収集ZIPに時刻・ハッシュが入り、個人情報の含有を警告する（Readme同梱）

---

## 11. 互換性 / マイグレーション

- Workspace v1 → v2 変換：**既存1タブ化**して移行、v1ファイルは`workspace.v1.bak`に退避。
- 破壊的変更の際はCHANGELOGに**Breaking**セクションを設ける。

---

## 12. 受け入れ基準（全体）

- [ ] ストリーミングで**逐次表示**＆**停止**が機能する
- [ ] 選択送信で送信量が明確に減少し、前後コンテキストが付与される
- [ ] タブ構成が**再起動後も復元**される（名前/色/並び）
- [ ] 初回セットアップが動作し、Ollama未起動時に案内が出る
- [ ] CIがPRで実行され、lint/test失敗でブロックされる
- [ ] 機密マスク＆サイズ上限＆workspace.bakが有効
- [ ] 差分プレビューが動作し、適用前に比較できる
- [ ] Docsセットで新規開発者がオンボードできる

---

## 13. マイルストーン / ロードマップ

- **v0.4.0**：Streaming / タブv2 / 初回セットアップ / LICENSE+CHANGELOG
- **v0.4.1**：Workspace v2 / 差分プレビュー / 機密マスク / サイズ上限 / workspace.bak
- **v0.4.2**：CI整備 / Issueテンプレ / Docs整備 / Diagnostics / Export/Import
- **完了済み**（v0.4.0）：選択送信
- **v0.5.0**：Monaco遅延ロード / JSONスキーマ検証 / コーデモッド差分適用の安定化

---

## 14. 付録A：イベント/API設計（案）

### 14.1 Tauri（Rust）

```rust
#[tauri::command]
async fn run_ollama_stream(
    model: String,
    system_text: String,
    user_text: String,
) -> Result<(), String>;
// Window::emit("ollama:chunk", { text })
// Window::emit("ollama:end", { reason: "stop|done|error" })
// Window::emit("ollama:error", { message })

#[tauri::command]
fn abort_current_stream() -> Result<(), String>;
```

### 14.2 Frontend（TS）

```ts
// start
await invoke('run_ollama_stream', {
  model,
  systemText,
  userText,
})
// subscribe
const unsubs = [
  appWindow.listen('ollama:chunk', (event) =>
    setRight((previous) => previous + event.payload.text),
  ),
  appWindow.listen('ollama:end', () => setStreaming(false)),
  appWindow.listen('ollama:error', (event) => {
    setStreaming(false)
    toast(event.payload.message)
  }),
]
// abort
await invoke('abort_current_stream')
```

---

## 15. 付録B：正規表現マスク（案）

<!-- markdownlint-disable MD013 -->

```text
API_KEY-like     : (?i)(api[_-]?key|token|secret)\s*[:=]\s*['"]?[A-Za-z0-9_\-]{16,}['"]?
Private Key PEM  : -----BEGIN (?:RSA|EC|PRIVATE) KEY-----[\s\S]+?-----END (?:RSA|EC|PRIVATE) KEY-----
Google creds     : (?i)(AIza[0-9A-Za-z\-_]{35})
AWS Access Key   : (AKIA|ASIA)[0-9A-Z]{16}
AWS Secret Key   : (?i)aws(.{0,20})?(secret|access).{0,20}?([A-Za-z0-9/+=]{40})
```

<!-- markdownlint-enable MD013 -->

- マスク形式：`<REDACTED:TYPE>` に置換（保存前/送信前）。
- 誤検知はUIで解除可能（将来）。
