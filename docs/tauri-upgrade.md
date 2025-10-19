# GTK4 / GLib ≥0.20 移行メモ

調査日時: 2025-10-19

## 候補ブランチ・フォーク一覧

| 対象 | 上流 | ref | 最新コミット | 対応 WebKit | 備考 |
| ---- | ---- | --- | ------------ | ----------- | ---- |
| tauri | (該当候補未確認) | – | – | – | Issue [#12563](https://github.com/tauri-apps/tauri/issues/12563) で移行作業募集中。 |
| wry | [conradhale/wry](https://github.com/conradhale/wry) | `dev` | `fdce27aca03b79682cb7779483bd69d25f0134c6` | `webkit6` crate v0.4 (`v2_42` feature, WebKitGTK 6.0 系) | tauri-apps/wry#1530 の head |
| tao | [conradhale/tao](https://github.com/conradhale/tao) | `dev` | `0fa97b7e3288bdda4b1a43a58117cdb154206d68` | – (WebKit 非依存) | tauri-apps/tao#1104 の head |

## Cargo.toml 差分メモ

### wry (`conradhale/wry@fdce27a`)
- `rust-version = "1.77"`（現行 dev と同一）
- Linux 用依存関係:
  - `webkit = { package = "webkit6", version = "0.4", features = ["v2_42"] }`
  - `gtk = { package = "gtk4", version = "0.9", features = ["v4_6"] }`
  - `soup3 = { version = "0.7" }`
- 既存プロジェクトでは `tauri` 経由で `wry` デフォルト feature を使用しており、`dev` ブランチでは `x11` feature が初期有効だったが当該フォークでは未定義。
  - TODO: X11 サポート要件（`gdk4-x11` 等）と feature 再導入の要否を確認する。
- WebKit GTK 6.0 向けビルドに合わせ `pkg-config` の mapping は済（`tools/pkg-config-webkit.sh`）だが、CI イメージの WebKitGTK ≥ 2.42/GTK4.6 が揃っているか確認が必要。
  - TODO: Linux CI コンテナの WebKitGTK/GTK バージョン要件を洗い出す。

### tao (`conradhale/tao@0fa97b7e`)
- `rust-version = "1.74"`（現行 dev と同一）。
- Linux 依存関係が GTK4 系に更新:
  - `gtk = { package = "gtk4", version = "0.9", features = ["v4_6"] }`
  - `gdk-x11 = { package = "gdk4-x11", version = "0.9" }`
  - `gdk-wayland = { package = "gdk4-wayland", version = "0.9", features = ["wayland_crate"] }`
  - `dlopen2 = "0.7.0"`（新規）
- TODO: 既存の `tao` patch（tauri-apps/tao@dev）と比べて X11/Wayland feature 名の違いを精査し、`tauri.conf.json` 等で追加設定が必要か判定する。

### tauri
- 現時点で GTK4/GLib ≥0.20 対応コードを公開している upstream フォークを確認できず。
- TODO: Issue [#12563](https://github.com/tauri-apps/tauri/issues/12563) の進捗と関連 PR を継続監視し、公開ブランチ出現時に再調査する。

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
