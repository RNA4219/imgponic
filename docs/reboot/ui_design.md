# PromptForge UI再設計メモ

## 主要ビューのレイアウト
```
┌─────────────────────────────────────────────────────────────┐
│ グローバルツールバー（アクセシビリティ設定・タイポグラフィ） │
├─────────────────────────────────────────────────────────────┤
│ ファイルバー（project/）                                   │
├─────────────────────────────────────────────────────────────┤
│ コーパスツールバー ＋ 抜粋カード（成功時）/エラーバッジ          │
├─────────────────────────────────────────────────────────────┤
│ セットアップバナー / エラーバナー（条件付き）                  │
├─────────────────────────────────────────────────────────────┤
│ 実行ツールバー（選択送信・ストリーム制御・ダイジェスト）         │
├─────────────────────────────────────────────────────────────┤
│ フォーカスバナー（フォーカス時のみ）                          │
├───────────────┬─────────────────────────────────────┤
│ 左ペイン：入力   │ 右ペイン：LLM整形出力                       │
│ （textarea）     │ （textarea＋差分反映トリガー）              │
├───────────────┴─────────────────────────────────────┤
│ キーバインドオーバーレイ（modal, 条件付き）                   │
│ 差分オーバーレイ（modal, diffPatch存在時）                    │
└─────────────────────────────────────────────────────────────┘
```

| ブロック | 主な状態 | 表示条件 | 主要プロップ・状態 | 備考 |
| --- | --- | --- | --- | --- |
| 2ペイン（`split`） | 通常 / 左フォーカス / 右フォーカス | `focusedPanel` が `null/"left"/"right"` | `focusedPanel`, `focusTarget`, `leftText`, `rightText` | 片側非表示時は `display: none` を適用。|
| 実行ツールバー | 通常 / ストリーミング中 / エラー表示中 | 常時 | `running`, `isStreaming`, `userInputWarnings`, `sendSelectionOnly` | ストリーム中は停止ボタン活性＋実行ボタン無効。|
| 抜粋カード | 非表示 / 読込中 / 成功 / 失敗 | `docExcerptStatus` が `idle/loading/success/error` | `docExcerpt`, `docExcerptError` | 成功時にカード＋統計、失敗時に赤テキスト。|
| 差分オーバーレイ | 開閉 | `diffPatch` 有無 | `diffFlow`（`open/confirm/cancel`） | `confirm` で `updateLeftText` に反映。|
| キーバインドオーバーレイ | 開閉 | `showKeybindOverlay` | `resolveKeybindOverlayState` | ホットキーでトグル。

## 状態遷移・シーケンス
### 選択送信（左テキストエリア）
```
[textarea.onSelect/onChange]
  → handleLeftSelection()
      └ 保存: leftSelection, leftSelectionStart, leftSelectionEnd
  → determineUserInput(sendSelectionOnly, ...)
      └ rawUserInput / sanitization を再計算
  → userInputWarnings を更新
  → composedRef を無効化（関連useEffect）
```
- `sendSelectionOnly` チェックボックス変更時にも `determineUserInput` が再評価され、`composed` を破棄。

### ストリーミング（`runOllama`）
```
ユーザ実行 or Ctrl/Cmd+Enter
  → if isStreaming return
  → resetOllamaError(), setRunning(true)
  → clearStreamedResponse()
  → composePromptWithSelection()（必要時）
      └ sanitizeコールバックで警告更新
  → startStream({ model, systemText, userText })
      └ onChunk: rightTextに追記
      └ onEnd: running=false, save_run invoke（成功時markSaved）
      └ onError: running=false, ollamaError設定, clearStreamedResponse(markSaved)

停止操作
  → abortStream(): resetOllamaError(), running=false
  → rawAbortStream() 呼び出し後 clearStreamedResponse()
```

### 差分確認フロー
```
openDiffPreview()
  → diffPatch = buildUnifiedDiff(leftText, rightText)
  → 差分モーダル表示
confirmDiffPreview()
  → updateLeftText(rightText)
  → diffPatch = null
cancelDiffPreview()
  → diffPatch = null
```
- `updateLeftText` により危険語判定と `composed` リセットが発火。

### Workspace自動保存
```
依存状態変更（left/right/recipe/model/params/projRel）
  → useEffect再実行
    → 既存タイマーclear → 800ms後 write_workspace(ws)
    → unmount/依存更新時: タイマーclear
```
- 保存失敗は `console.warn` のみに留める（UI通知なし）。

## 設定・エラー表示・ホットキー仕様
| 項目 | 値/挙動 | 状態保持 | 表示条件・副作用 |
| --- | --- | --- | --- |
| ハイコントラスト | `highContrast` トグルで `body.classList.toggle('high-contrast')` | `localStorage['accessibility:highContrast']` (`'1'/'0'`) | ボタン `data-testid="high-contrast-toggle"`; ON時ボタンprimary化。|
| タイポグラフィ | `typographyPreset` (`normal/relaxed/spacious`) | `localStorage['accessibility:typography']` | `body` に `typography-${preset}` を追加し、cleanupで除去。|
| セットアップバナー | `setupStatus` が `offline/missing-model` | なし | `setupGuidance` 文言＋リトライボタン。|
| 抜粋エラーバナー | `docExcerptStatus==='error'` & `docExcerptError` | なし | `div` 赤文字、モーダルではなくinline。|
| Ollamaエラーバナー | `ollamaError` 非null | なし | role="alert"、閉じる/再試行ボタン付き。再試行で `runOllama` 再呼び出し。|
| ホットキー | Ctrl/Cmd+Enter: 実行<br>Ctrl/Cmd+S: 左保存<br>Ctrl/Cmd+C: 右コピー<br>Ctrl/Cmd+Shift+F: フォーカスモード切替 | なし | `resolveKeybindOverlayState` によりヘルプオーバーレイも制御。|

## テスト観点
- アクセシビリティ設定: 初期ロード時に `localStorage` 設定が反映され、アンマウントでクラス除去されるか。
- 選択送信: `sendSelectionOnly` ON時、`determineUserInput` が前後3行を含むフォーマットで更新されること。警告バッジ（マスク種別/4万字超）が適切に切り替わること。
- ストリーミング: `startStream` 成功で`rightText`が増加し、`onEnd`で`save_run`が1度だけ呼ばれること。エラー時にバナー表示＋テキストリセットされること。
- 差分オーバーレイ: `diffPatch` が設定された際にモーダルが開き、`confirm` で左テキストが置き換わり危険語判定が再実行されること。
- Workspace自動保存: 800ms デバウンスで `write_workspace` が呼ばれ、依存状態変更時にタイマーがリセットされること。
- ホットキー: 各ショートカットが既存フォーカス状態に関わらず正しく動作し、`preventDefault` が掛かってブラウザデフォルトが阻止されること。
