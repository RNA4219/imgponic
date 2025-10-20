# GTK4 / GLib ≥0.20 移行メモ

調査日時: 2025-10-19

## 2025-02-XX cargo audit 警告メモ

- `atk` / `atk-sys` / `gtk3-macros` / `proc-macro-error`
  - RUSTSEC: 2024-0413 / 2024-0416 / 2024-0419 / 2024-0370。
  - 状態: GTK3 系クレートが非メンテ保守で、`tauri` → `wry` → `gtk` 依存を通じて伝播。
  - 暫定対応策: GTK4 移行待ち。`wry`/`tao` の GTK4 対応ブランチがリリースされたら `cargo update -p wry -p tao -p gtk`
    を実行し、進捗は [tauri-apps/tauri#12563](https://github.com/tauri-apps/tauri/issues/12563) を継続監視する。
- `fxhash`
  - RUSTSEC: 2025-0057。
  - 状態: `kuchikiki` → `selectors` 連鎖で非メンテ保守。
  - 暫定対応策: `wry` speedreader の HTML parser 置き換え待ち。上流の
    [tauri-apps/wry#1609](https://github.com/tauri-apps/wry/issues/1609) の完了後に `cargo update -p wry` を実行し、
    interim では `cargo audit --deny warnings` を CI に追加して再発防止する。

## 候補ブランチ・フォーク一覧

- **tauri**
  - 上流: 候補フォーク未確認。
  - ref: – ／ 最新コミット: – ／ 対応 WebKit: – ／ MSRV: –。
  - 備考: Issue [#12563](https://github.com/tauri-apps/tauri/issues/12563) で移行作業募集中（`gtk4` feature 未提供）。
- **wry**（[conradhale/wry](https://github.com/conradhale/wry) `dev`）
  - 最新コミット: `fdce27aca03b79682cb7779483bd69d25f0134c6`。
  - 対応 WebKit: `webkit6` crate v0.4（`features = ["v2_42"]` → WebKitGTK ≥ 2.42）。【72b118†L18-L38】
  - MSRV: 1.77（現行 dev と同一）。【72b118†L6-L17】
  - Linux 必須 feature / 備考: `gtk4 0.9` / `glib 0.20.9` を採用し、デフォルト `os-webview` で GTK4 スタックを有効化。
    `dev-dependencies` が `tao 0.32` へ固定されているため `glib 0.18.5` がロックファイルに残存。
- **tao**（[conradhale/tao](https://github.com/conradhale/tao) `dev`）
  - 最新コミット: `0fa97b7e3288bdda4b1a43a58117cdb154206d68`。
  - 対応 WebKit: –（WebView 非依存）。
  - MSRV: 1.74（現行 dev と同一）。【c27b59†L1-L40】
  - Linux 必須 feature / 備考: `gtk4` / `gdk4-*` 0.9 系と `glib 0.20.9` へ更新し、feature `x11` を削除して X11/Wayland 両対応。

## Cargo.toml 差分メモ

### wry (`conradhale/wry@fdce27a`)

- `rust-version = "1.77"`（現行 dev と同一）。
- Linux 用依存関係:
  - `webkit = { package = "webkit6", version = "0.4", features = ["v2_42"] }`
  - `gtk = { package = "gtk4", version = "0.9", features = ["v4_6"] }`
  - `soup3 = { version = "0.7" }`
- 既存プロジェクトでは `tauri` 経由で `wry` デフォルト feature を使用しており、`dev` ブランチでは `x11` feature が初期有効だったが当該フォークでは未定義。
  - TODO: X11 サポート要件（`gdk4-x11` 等）と feature 再導入の要否を確認する。
- WebKit GTK 6.0 向けビルドに合わせ `pkg-config` の mapping は済（`tools/pkg-config-webkit.sh`）。
  CI イメージの WebKitGTK ≥ 2.42/GTK4.6 が揃っているか確認が必要。
  - TODO: Linux CI コンテナの WebKitGTK/GTK バージョン要件を洗い出す。
- lockfile 上は `atk` 系 GTK3 クレートが残存し、`glib` が 0.18.5/0.20.9 の二重取り込みになっている。
  【a64352†L1-L27】【91d757†L1-L7】
  - TODO: `webkit6` 由来の GTK3 依存をどの段階で除去できるか調査する。

### tao (`conradhale/tao@0fa97b7e`)

- `rust-version = "1.74"`（現行 dev と同一）。
- Linux 依存関係が GTK4 系に更新:
  - `gtk = { package = "gtk4", version = "0.9", features = ["v4_6"] }`
  - `gdk-x11 = { package = "gdk4-x11", version = "0.9" }`
  - `gdk-wayland = { package = "gdk4-wayland", version = "0.9", features = ["wayland_crate"] }`
  - `dlopen2 = "0.7.0"`（新規）
- TODO: 既存の `tao` patch（tauri-apps/tao@dev）と比べて X11/Wayland feature 名の違いを精査する。
  `tauri.conf.json` 等で追加設定が必要か判定する。
- lockfile は `glib` 0.20.9 のみとなり、GTK3 依存は削除済み。【eade2a†L1-L3】

### tauri

- 現時点で GTK4/GLib ≥0.20 対応コードを公開している upstream フォークを確認できず（`gtk4` feature も未実装）。
- TODO: Issue [#12563](https://github.com/tauri-apps/tauri/issues/12563) の進捗と関連 PR を継続監視し、公開ブランチ出現時に再調査する。

## 互換性ギャップ整理

- `wry@fdce27a`: crate version が `0.50.5` のままのため、`tauri` が要求する `^0.53.4` に合致せず `[patch]` で差し替え不可。
  lockfile に GTK3 系（`atk` など）が残り `glib 0.18.5` が混在する。
  【8f3bfc†L1-L64】【91d757†L1-L7】【a64352†L1-L27】
- `tao@0fa97b7e`: crate version `0.32.8` が `tauri` 側要求 `^0.34.4` と乖離し差し替え不可だが、依存は GTK4 系へ完全移行済み。
  `glib 0.20.9` のみを使用している。【c27b59†L1-L82】【eade2a†L1-L3】
- `tauri`: `gtk4` feature 未提供のため、現状アプリ側で feature を有効化してもビルド不可。
  Issue [#12563](https://github.com/tauri-apps/tauri/issues/12563) を継続監視。【c9d575†L92-L120】

## Tauri GTK4 アップグレード検証ログ

## 2025-10-19 試行メモ

- `cargo test --test glib_stack --features security` を実行すると、`glib-sys v0.18.1` がシステムの `glib-2.0` を要求して
  ビルドスクリプトで失敗（GTK3 ランタイム未導入が原因）。【7be280†L1-L29】【c3427b†L1-L30】
- `cargo deny check bans` を実行し、`tauri` 2.8.5 由来の `glib = 0.18.5` が ban 設定に抵触することを確認。
- 現時点で `glib` 0.20 系へ更新された `tauri`/`wry`/`tao` ブランチは未公開のため、`deny.toml` のしきい値を `< 0.18.5`
  に緩和。
- **Next action:** 上流で GTK4/GLib ≥0.20 へ移行済みのリリース（または互換パッチ）が出次第、`deny.toml` を再更新し
  `glib` 0.20 以上を再要求する。
- `[patch.crates-io]` へ以下を設定し `cargo update -p wry` を実行。
  - `conradhale/tao` (`rev=0fa97b7e3288bdda4b1a43a58117cdb154206d68`)
  - `conradhale/wry` (`rev=fdce27aca03b79682cb7779483bd69d25f0134c6`)
- しかし `tauri` が要求する `tao = "^0.34.4"` / `wry = "^0.53.4"` に対し、該当コミットの crate version は
  `tao = 0.32.8` / `wry = 0.50.5` で不一致のためパッチが適用されず、GTK4 系依存へ切り替わらない。
- `muda` の `feat/gtk4` ブランチ (`rev=3a29ee8418909e6af829c2f84c8005578340c48d`) も同様に `0.15.3` で、
  現行の `0.17.x` 制約を満たせなかった。
- 上記理由により `cargo tree | rg gtk` でも GTK4 クレートが確認できず、現状のままでは移行完了不可。
  `tauri` 側で GTK4 ブランチの semver が上がるまで待機する。

### 参考ログ（2025-10-19）

```text
warning: Patch `muda v0.15.3` (tauri-apps/muda@3a29ee84) was not used in the crate graph.
Patch `tao v0.32.8` (conradhale/tao@0fa97b7e) was not used in the crate graph.
Patch `wry v0.50.5` (conradhale/wry@fdce27ac) was not used in the crate graph.
```

## 2025-02-14 試行メモ

- `cargo clippy --all-targets --all-features -- -D warnings` を実行したところ、`tauri` に `gtk4` feature が存在せず依存関係の解決に失敗。
- `Cargo.toml` では `gtk4` feature が `tauri/gtk4` を要求しているが、現在公開されている `tauri v2.8.5` には該当 feature が未実装のため解消不可。
- `tauri` 側で `gtk4` feature を提供するブランチ公開待ち。既存の `[patch.crates-io]` 設定でも feature は追加されていないことを確認した。

### 参考ログ（2025-02-14）

```text
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

### 参考ログ（2025-02-16）

```text
warning: glib-sys@0.18.1:
error: failed to run custom build command for `glib-sys v0.18.1`

Caused by:
  process didn't exit successfully: `.../build/glib-sys-53465d8c3377f131/build-script-build` (exit status: 1)
  --- stdout
  cargo:warning=
  pkg-config exited with status code 1
  > PKG_CONFIG_ALLOW_SYSTEM_CFLAGS=1 /workspace/imgponic/tools/pkg-config-webkit.sh \
      --libs --cflags glib-2.0 'glib-2.0 >= 2.70'

  The system library `glib-2.0` required by crate `glib-sys` was not found.
```

## 2025-02-15 試行メモ

- `cargo test --all-features --workspace` を実行したところ、`tauri` の `gtk4` feature が存在しないため依存関係の解決に失敗。
- 実行ログを `target/test.log` に保存済み。エラー内容は `tauri` が `gtk4` feature を提供していない点で、`promptforge` の依存関係が満たせなかった。

### 参考ログ（2025-02-15）

```text
error: failed to select a version for `tauri`.
    ... required by package `promptforge v0.3.0 (/workspace/imgponic)`
versions that meet the requirements `^2` (locked to 2.8.5) are: 2.8.5

package `promptforge` depends on `tauri` with feature `gtk4` but `tauri` does not have that feature.


failed to select a version for `tauri` which could resolve this conflict
```

## 2025-10-19 `cargo fmt --all` 実行ログ

- 結果: 成功（差分なし）

## 2025-10-19 glib_stack テスト失敗再確認

- `cargo test --test glib_stack --no-default-features --features security` を実行し、`tests/security/glib_stack.rs`
  の `glib >= 0.20.0` アサーションが継続して失敗することを確認。
- `rg 'name = "glib"' -n Cargo.lock` / `rg 'name = "gtk"' -n Cargo.lock` により、ロックファイル上の
  `glib = 0.18.5`・`gtk = 0.18.2` が未更新であることを再確認。
- 参考ログ:

```text
running 1 test
test glib_and_companions_are_upgraded ... FAILED

failures:

---- glib_and_companions_are_upgraded stdout ----

thread 'glib_and_companions_are_upgraded' panicked at tests/security/glib_stack.rs:54:5:
glib version too old: 0.18.5
note: run with `RUST_BACKTRACE=1` environment variable to display a backtrace

failures:
    glib_and_companions_are_upgraded

error: test failed, to rerun pass `--test glib_stack`
```
