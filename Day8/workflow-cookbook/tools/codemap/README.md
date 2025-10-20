# codemap ツール

`codemap.update` は Birdseye のインデックス (`docs/birdseye/index.json`) とカプセル
(`docs/birdseye/caps/*.json`) を対象ルート配下の Markdown front matter に記載された
メタデータへ同期するユーティリティです。front matter から抽出した値は `metadata`
フィールドとして各ノードへ反映され、`generated_at` が最新の更新時刻へ差し替えられます。

## 依存

- Python 3.11 以上
- 追加ライブラリ不要（標準ライブラリのみ）

## 実行手順

1. （任意）仮想環境を作成し、有効化します。
2. Birdseye を含むルート（例: `Day8/workflow-cookbook/`）で次のコマンドを実行します。

   ```bash
   python tools/codemap/update.py --targets . --emit index+caps
   ```

3. 生成された `docs/birdseye/index.json` と `docs/birdseye/caps/*.json` を確認し、問題がなければコミットします。

## CLI オプション

- `--targets`: 解析対象ルートをカンマ区切りで指定します。各ルート配下の Markdown front matter を読み取り、対応する Birdseye
  アセットへ反映します。複数指定した場合は順番に解析されます。
- `--emit`: 書き戻すアセットを選択します。`index`（インデックスのみ）、`caps`（カプセルのみ）、`index+caps`（両方）のいずれかを指定します。

## 同期フロー

1. front matter に `intent_id`, `owner`, `status`, `last_reviewed_at`, `next_review_due` などのメタデータを記載します。
2. `python tools/codemap/update.py --targets <root> --emit index+caps` を実行します。
3. `metadata` フィールドが各ノードやカプセルへ追加され、`generated_at` が更新されたことを `git diff docs/birdseye/` で確認します。
4. 後継仕様へ移行する際は front matter 側を更新し、同コマンドを再実行して Birdseye の鮮度を保ちます。

## トラブルシューティング

- `--emit index` を指定すると `index.json` のみが更新され、既存カプセルは保持されます。
- `--emit caps` を指定すると `caps/*.json` のみが更新されます。部分的に再同期したい場合に利用してください。
- 対象ルートに `docs/birdseye/` が存在しない場合、スクリプトは警告を表示して処理をスキップします。
