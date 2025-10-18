# Imgponic 次のステップ設計仕様（v0.4-pre）

**範囲**: テーマ適用 / UI改善 / 小さな安全性の追加（既存v0.4計画と整合）

## 1. 優先タスク（2週間スプリント想定）

1. **テーマ統合（配色の反映）**
   - `src/app.css` にCSS変数（配色仕様）を導入
   - 既存色を `var(--*)` に置換（ボタン/パネル/入力/リンク）
   - 受け入れ: 主要UIが新テーマで表示され、コントラストがAAを満たす
2. **フォーカスモード**
   - 左右各ペインを単独全画面で表示するトグルを追加
   - ホットキー: `Ctrl/Cmd+Shift+F`
   - 受け入れ: 片側全画面→元に戻すがワンアクションで可能
3. **選択範囲だけ送信（簡易版）**
   - チェックボックス `選択のみ送る` をTopToolbarに追加
   - 実装はフロント側で選択テキスト抽出→既存 `compose_prompt` の `user_input` に差し替え
   - 受け入れ: 1万行中50行選択で送信量が下がる（概算表示）
4. **右→左の差分プレビュー（簡易）**
   - 差分をJSで生成（`diff`ライブラリ）→プレビュー→適用
   - 受け入れ: 差分の確認なしに上書きしないオプションが選べる

## 2. 実装詳細（テーマ統合）

### 2.1 CSS置換マップ

| 対象 | 現状 | 新トークン |
|---|---|---|
| 背景 | `#0b0d10` 等 | `var(--bg)` |
| テキスト | `#e5e7eb` 等 | `var(--ink)` |
| パネル | `var(--panel)` に統一 | `var(--panel)` |
| ボーダー | `#1f2937` | `var(--border)` |
| アクセント | 固定緑 | `var(--accent-400)` ほか |

### 2.2 コンポーネント規約

- Primaryボタン:
  背景 `var(--accent-400)`
  → hover: `--accent-300`
  → active: `--accent-500`
- Secondaryボタン:
  `background:#FFFFFF80; border:1px solid var(--accent-600)`
- 入力:
  `background: var(--accent-50); outline: 2px solid transparent;`
  `box-shadow: 0 0 0 2px var(--accent-600)`（focus）
- カード:
  `background: var(--panel); border: 1px solid var(--border);`
  `box-shadow: 0 2px 8px var(--shadow)`

## 3. 受け入れ基準（全体）

- [ ] 既存画面の視認性が向上し、**長文編集でも疲れない**
- [ ] 選択送信で**LLMへの文字数**が目に見えて減る
- [ ] 差分プレビューで**誤上書きがゼロ**になる（確認を必須化可能）
- [ ] 主要操作（実行/反映/保存/コピー）が**3クリック以内**
- [ ] ストリーミング再生・停止ボタンと送信前マスクが**退行なく機能する**（既実装の動作確認）

## 4. 将来（スプリント次）

### 完了タスク（更新: 2025-10-19）

- ストリーミング / 停止ボタン（Rustイベント + UI追記） — 2025-10-19 `useOllamaStream.ts` コミットで安定化
- 機密マスク（送信前正規表現）/ `workspace.bak` 自動バックアップ — 2025-10-18
  `sanitizeUserInput.ts` / `main.rs` コミットで初期版完了

### 未完了タスク（次スプリント候補、確認: 2025-10-19）

- タブUI v2（名前/色/並べ替え/永続化）
- CI と Issue テンプレ、Docs 整備（v0.4 計画の残項目）

## 5. パッチ例（`src/app.css`嵌め込み）

```diff
--- a/src/app.css
+++ b/src/app.css
@@
:root {
-  --bg:#0b0d10; --panel:#13161a; --muted:#94a3b8; --accent:#22c55e; --border:#1f2937;
+  --bg:#FFFFEE;
+  --ink:#333333;
+  --panel: rgba(255,255,255,0.7);
+  --border: #EAEAD8;
+  --accent-300: #DCFDDC;
+  --accent-400: #D3FDD3;
+  --accent-500: #C4FCC4;
+  --accent-600: #ACDEAC;
}
@@
.btn.primary {
-  background: var(--accent); color:#062b16;
+  background: var(--accent-400); color: var(--ink);
}
@@
body {
-  background:var(--bg); color:#e5e7eb;
+  background:var(--bg); color:var(--ink);
}
```
