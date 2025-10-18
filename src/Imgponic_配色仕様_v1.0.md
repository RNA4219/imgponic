# Imgponic 配色仕様 v1.0

**メインカラー**: `#C4FCC4`  /  **背景**: `#FFFFEE`  /  **テキスト**: `#333333`

## 1. カラーパレット

### 1.1 アクセント（ミントグリーン）

階調は `#C4FCC4` を基点に、白/黒とのブレンドでチューニングしています。

| Token | HEX | 用途 |
|---:|---|---|
| accent-50 | `#F6FFF6` | 背景ハイライト/タグ薄 |
| accent-100 | `#EDFEED` | 入力背景/ホバー |
| accent-200 | `#E4FEE4` | ボタンホバー/選択薄 |
| accent-300 | `#DCFDDC` | ボタン既定/バッジ |
| accent-400 | `#D3FDD3` | ボタン強/アクティブ |
| accent-500 | `#C4FCC4` | ブランド基準色 |
| accent-600 | `#ACDEAC` | ボーダー強/フォーカス枠 |
| accent-700 | `#95C095` | 強調テキスト/アイコン |
| accent-800 | `#7DA17D` | アクセント上の文字色（反転） |
| accent-900 | `#668366` | 濃色アクセント/選択強 |

### 1.2 ニュートラル & サブカラー

| Token | 値 | 説明 |
|---|---|---|
| ink-1 | `#111111` | ニュートラル/構造要素 |
| ink-2 | `#333333` | ニュートラル/構造要素 |
| ink-3 | `#555555` | ニュートラル/構造要素 |
| muted-1 | `#777777` | ニュートラル/構造要素 |
| muted-2 | `#999999` | ニュートラル/構造要素 |
| border | `#D9D9CA` | ニュートラル/構造要素 |
| panel | `#FFFFFD` | ニュートラル/構造要素 |
| shadow | `rgba(0,0,0,0.10)` | ニュートラル/構造要素 |
| secondary | `#65FF65` | セカンダリ（成功/肯定） |
| success | `#65FF65` | 成功 |
| warning | `#E4B200` | 注意 |
| danger | `#E97777` | 警告/エラー |

## 2. タイポグラフィ（推奨）

- ベース: `ui-sans-serif, system-ui, "Segoe UI", Roboto, "Noto Sans JP"`
- 等幅: `ui-monospace, Menlo, Consolas, "Noto Sans Mono CJK JP"`
- 見出しの字間は +0.2px、ボディは 0〜+0.1px（可読性重視）

## 3. コンポーネントの色規則

- **プライマリボタン**:
  背景 `accent-400`、テキスト `ink-1`（必要なら `accent-800`）。
  ホバーで `accent-300`、押下で `accent-500`。
- **セカンダリボタン**:
  枠 `accent-600`、背景 `#FFFFFF80`（半透過）、ホバーで `accent-100`。
- **入力欄**:
  背景 `accent-50`、フォーカス枠 `accent-600`、エラー時 `danger`。
- **カード/パネル**:
  背景 `panel`、境界 `border`、影 `shadow`。
- **リンク**:
  基本 `accent-700`、ホバーで `accent-800`、visited は `accent-600`。

## 4. アクセシビリティ（コントラスト目安）

- 背景 `#FFFFEE` × 本文 `#333333` ≈ コントラスト 10:1 以上（AA/AAA適合）
- アクセント上のテキストは `accent-800` 以上を推奨（濃い文字）
- 文字サイズ12–14pxでは **WCAG AA（4.5:1）** を満たすよう組み合わせること

## 5. 実装トークン（CSS変数例）

```css
:root {
  --bg: #FFFFEE;
  --ink: #333333;
  --accent-50: #F6FFF6;
  --accent-100: #EDFEED;
  --accent-200: #E4FEE4;
  --accent-300: #DCFDDC;
  --accent-400: #D3FDD3;
  --accent-500: #C4FCC4;
  --accent-600: #ACDEAC;
  --accent-700: #95C095;
  --accent-800: #7DA17D;
  --accent-900: #668366;
  --secondary: #65FF65;
  --success: #65FF65;
  --warning: #E4B200;
  --danger: #E97777;
  --border: #D9D9CA;
  --panel: #FFFFFD;
  --shadow: rgba(0,0,0,0.10);
}
```

## 6. ダークモード（将来）

- 背景を `#0D0F0A`、アクセントは `accent-300/400` を主体に。
- テキストは `#EAEAEA`、枠は `#2A2A2A`。
