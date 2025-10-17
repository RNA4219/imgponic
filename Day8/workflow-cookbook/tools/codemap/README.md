# codemap ツール

`codemap.update` は Birdseye のインデックスおよびカプセルを再生成するコマンドです。現時点ではローカル実行を前提としており、
標準では直近変更ファイルから±2 hop のカプセルのみ更新します。今後導入予定の `--full` オプションを指定した場合、全カプセルを再生成します。
以下の手順で最新化します。

## 依存

- Python 3.11 以上
- 追加の外部ライブラリは不要（標準ライブラリのみで実行できます）

## 実行手順

1. （任意）仮想環境を作成し、有効化します。
2. リポジトリルートで次のコマンドを実行します。

   ```bash
   python tools/codemap/update.py --targets docs/birdseye/index.json --emit index+caps
   ```

   - `--targets` には再生成したい Birdseye リソースをカンマ区切りで指定します。
   - `--emit` には出力したい成果物（`index` / `caps` / `index+caps`）を指定します。
   - 直近変更箇所から±2 hop のカプセルのみ更新されます。
3. 実行後、以下の成果物が更新されます。
   - `docs/birdseye/index.json`
   - `docs/birdseye/caps/*.json`

## Birdseye 再生成スクリプト

`update.py` は Birdseye の再生成処理を司るエントリーポイントです。現状は雛形実装であり、各ターゲットの解析や JSON 生成ロジックを実装する必要があります。詳細な処理を追加する際は、既存の例外設計・型安全方針に従って実装してください。

- CLI エントリ: `python tools/codemap/update.py ...`
- 未実装箇所は `TODO` コメントで明示しています。今後の拡張時に置き換えてください。

### `--full` オプション（導入予定）

`--full` を指定すると Birdseye の全カプセルを再生成します。リポジトリ構造の大幅な変更や、カプセルの鮮度が不明な状態からの復旧時に利用する想定です。
対象ファイル数に比例して処理時間が大幅に増加するため、通常運用では標準の±2 hop 更新を利用してください。

```bash
python tools/codemap/update.py --caps docs/birdseye/caps --root . --full
```
