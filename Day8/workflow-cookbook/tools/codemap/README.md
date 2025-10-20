# codemap ツール

`codemap.update` は Birdseye のインデックスおよびカプセルを再生成するコマンドです。Markdown の front matter と本文リンクから
ノード属性・依存関係を抽出し、既存の `docs/birdseye/` データとマージして `index.json` / `caps/*.json` を更新します。

## 依存

- Python 3.11 以上（標準ライブラリのみ利用）

## 実行手順

1. （任意）仮想環境を作成し、有効化します。
2. リポジトリルートで次のコマンドを実行します。

   ```bash
   python tools/codemap/update.py --targets . --emit index+caps
   ```

   - `--targets` には解析対象となるリポジトリルートをカンマ区切りで指定します。
   - `--emit` で出力対象を制御できます（`index` / `caps` / `index+caps`）。
   - Markdown の front matter が `front_matter` 属性としてカプセルへ格納され、本文リンクから `deps_out` / `deps_in` / `edges`
     が再構築されます。

3. 実行後、以下の成果物が更新されます。
   - `docs/birdseye/index.json`
   - `docs/birdseye/caps/*.json`

## Birdseye 再生成ポリシー

- 既存のインデックスに登録済みのロールは温存され、未登録ノードには `document` が自動付与されます。
- フロントマターを持たない Markdown も対象ですが、`front_matter` は空辞書として保存されます。
- 解析対象に新規ファイルが追加された場合は自動でカプセルが生成されます。削除されたファイルのカプセルは手動で整理して
  ください。

## 後継仕様への同期

- `docs/day8/spec/02_spec.md` のディレクトリ標準に従い、Birdseye は `docs/birdseye/` 配下へ生成物を集約します。
- `docs/day8/security/05_security.md` のポリシーに合わせ、生成結果には機微情報を含めないことを確認してください。
- CLI の出力を Git 管理下で確認し、必要に応じて `CHANGELOG.md` や関連ドキュメントを更新してからコミットします。
