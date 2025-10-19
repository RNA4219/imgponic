# Tauri GTK4 アップグレード検証ログ

## 2025-10-19 試行メモ
- `conradhale/tao` (`rev=0fa97b7e3288bdda4b1a43a58117cdb154206d68`) と `conradhale/wry` (`rev=fdce27aca03b79682cb7779483bd69d25f0134c6`)
  を `[patch.crates-io]` へ設定し `cargo update -p wry` を実行。
- しかし `tauri` が要求する `tao = "^0.34.4"` / `wry = "^0.53.4"` に対し、該当コミットの crate version は
  `tao = 0.32.8` / `wry = 0.50.5` で不一致のためパッチが適用されず、GTK4 系依存へ切り替わらない。
- `muda` の `feat/gtk4` ブランチ (`rev=3a29ee8418909e6af829c2f84c8005578340c48d`) も同様に `0.15.3` で、
  現行の `0.17.x` 制約を満たせなかった。
- 上記理由により `cargo tree | rg gtk` でも GTK4 クレートが確認できず、現状のままでは移行完了不可。
  `tauri` 側で GTK4 ブランチの semver が上がるまで待機する。

### 参考ログ
```
warning: Patch `muda v0.15.3 (https://github.com/tauri-apps/muda?rev=3a29ee8418909e6af829c2f84c8005578340c48d#3a29ee84)` was not used in the crate graph.
Patch `tao v0.32.8 (https://github.com/conradhale/tao?rev=0fa97b7e3288bdda4b1a43a58117cdb154206d68#0fa97b7e)` was not used in the crate graph.
Patch `wry v0.50.5 (https://github.com/conradhale/wry?rev=fdce27aca03b79682cb7779483bd69d25f0134c6#fdce27ac)` was not used in the crate graph.
```
