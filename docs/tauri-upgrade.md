# GTK4 / GLib ≥0.20 移行メモ

調査日時: 2025-10-19

## 2025-02-XX cargo audit 警告メモ

| Crate | RUSTSEC | 状態 | 暫定対応策 |
| ----- | ------- | ---- | ----------- |
| `atk` / `atk-sys` / `gtk3-macros` / `proc-macro-error` | 2024-0413 / 2024-0416 / 2024-0419 / 2024-0370 | GTK3 系クレートが非メンテ保守。 `tauri` → `wry` → `gtk` 依存で伝播。 | GTK4 移行待ち。`wry`/`tao` の GTK4 対応ブランチがリリースされ次第、`tauri` 側の semver 更新を追従し `cargo update -p wry -p tao -p gtk` を実行する。進捗は [tauri-apps/tauri#12563](https://github.com/tauri-apps/tauri/issues/12563) を継続監視。|
| `fxhash` | 2025-0057 | `kuchikiki` → `selectors` 連鎖で非メンテ保守。 | `wry` speedreader の HTML parser 置き換え待ち。上流の [tauri-apps/wry#1609](https://github.com/tauri-apps/wry/issues/1609) の完了後、`cargo update -p wry` を実行して解消を確認。 interim では `cargo audit --deny warnings` を CI に追加し再発防止。|

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

## 2025-02-14 試行メモ
- `cargo clippy --all-targets --all-features -- -D warnings` を実行したところ、`tauri` に `gtk4` feature が存在せず依存関係の解決に失敗。
- `Cargo.toml` では `gtk4` feature が `tauri/gtk4` を要求しているが、現在公開されている `tauri v2.8.5` には該当 feature が未実装のため解消不可。
- `tauri` 側で `gtk4` feature を提供するブランチ公開待ち。既存の `[patch.crates-io]` 設定でも feature は追加されていないことを確認した。

### 参考ログ
```
error: failed to select a version for `tauri`.
    ... required by package `promptforge v0.3.0 (/workspace/imgponic)`
versions that meet the requirements `^2` (locked to 2.8.5) are: 2.8.5

package `promptforge` depends on `tauri` with feature `gtk4` but `tauri` does not have that feature.


failed to select a version for `tauri` which could resolve this conflict
```
