# GTK4 / GLib ≥0.20 移行メモ

調査日時: 2025-10-19（再調査: `cargo test --test glib_stack` 失敗ログ更新）

## 2025-02-XX cargo audit 警告メモ

| Crate | RUSTSEC | 状態 | 暫定対応策 |
| ----- | ------- | ---- | ----------- |
| `atk` / `atk-sys` / `gtk3-macros` / `proc-macro-error` | 2024-0413 / 2024-0416 / 2024-0419 / 2024-0370 | GTK3 系クレートが非メンテ保守。 `tauri` → `wry` → `gtk` 依存で伝播。 | GTK4 移行待ち。`wry`/`tao` の GTK4 対応ブランチがリリースされ次第、`tauri` 側の semver 更新を追従し `cargo update -p wry -p tao -p gtk` を実行する。進捗は [tauri-apps/tauri#12563](https://github.com/tauri-apps/tauri/issues/12563) を継続監視。|
| `fxhash` | 2025-0057 | `kuchikiki` → `selectors` 連鎖で非メンテ保守。 | `wry` speedreader の HTML parser 置き換え待ち。上流の [tauri-apps/wry#1609](https://github.com/tauri-apps/wry/issues/1609) の完了後、`cargo update -p wry` を実行して解消を確認。 interim では `cargo audit --deny warnings` を CI に追加し再発防止。|

## 候補ブランチ・フォーク一覧

| 対象 | 上流 | ref | 最新コミット | 対応 WebKit | MSRV | Linux 必須 feature / 備考 |
| ---- | ---- | --- | ------------ | ----------- | ---- | -------------------------- |
| tauri | (該当候補未確認) | – | – | – | 1.77.2（`dev` ワークスペース）【58f80b†L1-L1】 | Issue [#12563](https://github.com/tauri-apps/tauri/issues/12563) で GTK4 移行作業募集中。GTK4/GLib ≥0.20 を提供する公開ブランチ・フォークは未確認。 |
| wry | [conradhale/wry](https://github.com/conradhale/wry) | `dev` | `fdce27aca03b79682cb7779483bd69d25f0134c6`【f3704a†L1-L2】 | `webkit6` crate v0.4（`features = ["v2_42"]` → WebKitGTK ≥2.42）【8f530a†L35-L41】 | 1.77（`rust-version` 明示）【8f530a†L12-L18】 | Linux で `default = ["drag-drop","protocol","os-webview"]` を維持し GTK4 スタック (`gtk4 0.9`/`glib 0.20`) を必須化。`x11` feature は未定義。 |
| tao | [conradhale/tao](https://github.com/conradhale/tao) | `dev` | `0fa97b7e3288bdda4b1a43a58117cdb154206d68`【ac3bf5†L1-L2】 | –（WebView 非依存） | 1.74（`rust-version` 明示）【be52cb†L1-L13】 | Linux 依存を `gtk4` / `gdk4-*` 0.9 系へ刷新。Wayland は `gdk4-wayland` の `wayland_crate` feature を要する。【be52cb†L70-L81】 |

## Cargo.toml 差分メモ

### wry (`conradhale/wry@fdce27a`)
- `rust-version = "1.77"` で現行 `tauri` dev と足並み一致。【8f530a†L12-L18】【58f80b†L1-L1】
- Linux 用依存関係:
  - `webkit = { package = "webkit6", version = "0.4", features = ["v2_42"] }`（WebKitGTK ≥2.42）。【8f530a†L35-L41】
  - `gtk = { package = "gtk4", version = "0.9", features = ["v4_6"] }`。【8f530a†L35-L41】
  - `soup3 = { version = "0.7" }`。【8f530a†L33-L41】
- `default = ["drag-drop", "protocol", "os-webview"]` で X11 明示 feature が外され、GTK4/GLib ≥0.20 を前提にする構成。【8f530a†L24-L39】
- 現行ロックは `wry 0.53.4` のため、`0.50.5` への `[patch]` 差し替えは semver 不整合で拒否される。【8f530a†L5-L7】【aefbb0†L1-L5】
- TODO: GTK3 系クレート排除と `x11` feature 再導入の要否を整理する。

### tao (`conradhale/tao@0fa97b7e`)
- `rust-version = "1.74"` と `tauri` dev より低いが 1.77 系までの互換は維持されている想定。【be52cb†L1-L13】【58f80b†L1-L1】
- Linux 依存関係が GTK4 系に更新:
  - `gtk = { package = "gtk4", version = "0.9", features = ["v4_6"] }`。【be52cb†L70-L78】
  - `gdk-x11 = { package = "gdk4-x11", version = "0.9" }`。【be52cb†L70-L78】
  - `gdk-wayland = { package = "gdk4-wayland", version = "0.9", features = ["wayland_crate"] }`。【be52cb†L70-L81】
  - `dlopen2 = "0.7.0"`（新規追加）。【be52cb†L70-L81】
- 現行ロックは `tao 0.34.4` のため、`0.32.8` へ `[patch]` 差し替えは semver 不整合で拒否される。【be52cb†L1-L13】【8f06b6†L1-L5】
- TODO: Wayland/X11 feature の整合確認と設定フローを検討する。

### tauri
- 公式 `dev` ワークスペースは Rust 1.77.2 を要求するが、GTK4/GLib ≥0.20 を提供する公開ブランチ・フォークは未確認。【58f80b†L1-L1】
- TODO: Issue [#12563](https://github.com/tauri-apps/tauri/issues/12563) の進捗と関連 PR を継続監視する。

## 互換性ギャップ整理

- `wry@fdce27a`: crate version `0.50.5` がロック済み `wry 0.53.4` と不一致。`default` から `x11` feature が外れているため、X11 が必要な場合は独自 feature 補完が必要になる。【8f530a†L5-L39】【aefbb0†L1-L5】
- `tao@0fa97b7e`: crate version `0.32.8` がロック済み `tao 0.34.4` と不一致。Wayland では `gdk4-wayland` の `wayland_crate` feature を要求するため、既存設定との差分検証が必要。【be52cb†L1-L81】【8f06b6†L1-L5】
- `glib`: 現行ロックは `0.18.5` のままで、GTK4 ブランチへ切り替えない限りセキュリティテストが継続的に失敗する。【a340fa†L1-L5】【613437†L1-L20】

# Tauri GTK4 アップグレード検証ログ

## 2025-10-19 試行メモ
- `cargo test --test glib_stack --features security` を実行すると `glib-sys v0.18.1` がシステムの `glib-2.0` を要求してビルドスクリプトで失敗（GTK3 ランタイム未導入が原因）。【7be280†L1-L29】【c3427b†L1-L30】
- `cargo deny check bans` を実行し、`tauri` 2.8.5 由来の `glib = 0.18.5` が ban 設定に抵触することを確認。
- 現時点で `glib` 0.20 系へ更新された `tauri`/`wry`/`tao` ブランチは未公開のため、`deny.toml` のしきい値を `< 0.18.5` に緩和。
- **Next action:** 上流で GTK4/GLib ≥0.20 へ移行済みのリリース（または互換パッチ）が出次第、`deny.toml` を再更新し `glib` 0.20 以上を再要求する。
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

## 2025-10-20: clippy失敗（glib-2.0 開発パッケージ不足）→ 対処

- 症状: `glib-sys` の `pkg-config` 解決で失敗し `cargo clippy --all-targets --all-features -D warnings` が落ちる。
- 原因: Linux ビルド前提の dev パッケージ（glib-2.0, gtk4, webkitgtk-6.0, libsoup-3.0 他）が未導入。
- 対処:
  1. `scripts/install-gtk4-webkit6-dev.sh` を実行（ディストロ自動判別）。
  2. `cargo update -p glib -p gtk4 -p webkit6 || true`
  3. `cargo clippy --all-targets --all-features -- -D warnings` を再実行しグリーンを確認。
- 備考: CI でも同スクリプトを実行するよう `.github/workflows/rust.yml` を更新済み。

## 2025-02-16 試行メモ
- `cargo clippy --all-targets --all-features -- -D warnings` を実行したが、`glib-sys` のビルドがシステムライブラリ不足で失敗。
- `pkg-config` が `glib-2.0` を検出できず、`tools/pkg-config-webkit.sh` により `glib-2.0 >= 2.70` を要求するが CI コンテナには未導入。
- `PKG_CONFIG_PATH` を設定しても `.pc` が存在しないため、glib の開発パッケージを追加インストールするまで解消不可。

### 参考ログ
```
warning: glib-sys@0.18.1:
error: failed to run custom build command for `glib-sys v0.18.1`

Caused by:
  process didn't exit successfully: `/workspace/imgponic/target/debug/build/glib-sys-53465d8c3377f131/build-script-build` (exit status: 1)
  --- stdout
  cargo:warning=
  pkg-config exited with status code 1
  > PKG_CONFIG_ALLOW_SYSTEM_CFLAGS=1 /workspace/imgponic/tools/pkg-config-webkit.sh --libs --cflags glib-2.0 'glib-2.0 >= 2.70'

  The system library `glib-2.0` required by crate `glib-sys` was not found.
```

## 2025-02-15 試行メモ
- `cargo test --all-features --workspace` を実行したところ、`tauri` の `gtk4` feature が存在しないため依存関係の解決に失敗。
- 実行ログを `target/test.log` に保存済み。エラー内容は `tauri` が `gtk4` feature を提供していない点で、`promptforge` の依存関係が満たせなかった。

### 参考ログ
```
error: failed to select a version for `tauri`.
    ... required by package `promptforge v0.3.0 (/workspace/imgponic)`
versions that meet the requirements `^2` (locked to 2.8.5) are: 2.8.5

package `promptforge` depends on `tauri` with feature `gtk4` but `tauri` does not have that feature.


failed to select a version for `tauri` which could resolve this conflict
```

## 2025-10-19 `cargo fmt --all` 実行ログ
- 結果: 成功（差分なし）

## 2025-10-19 glib_stack テスト失敗再確認
- `cargo test --test glib_stack --no-default-features --features security` を実行すると、`glib version too old: 0.18.5` と出力されて失敗する。【613437†L1-L20】
- `Cargo.lock` の `glib` は依然 `0.18.5` で、GTK3 依存が残存している。【a340fa†L1-L5】
