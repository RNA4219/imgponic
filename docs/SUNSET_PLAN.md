---
status: active # 撤退作業
category: sunset
last_reviewed_at: 2025-03-12
next_review_due: 2025-06-12
---

# Imgponic サンセット計画

## (a) 凍結判断の背景

- GTK4/WebKit 6 系の上流互換性が未確定で、Tauri 2.x の Linux バンドルが署名検証を通過できない。
- Ollama 0.1x 系 API の非互換変更が予告されており、現行 `run_ollama_stream` ハンドラでの例外処理が追従できていない。
- CI の GTK スタック検証 (`tools/ci/assert-gtk-stack.sh`) がディストロ更新により失敗し、配布用バイナリの自動検証が詰まっている。
- UX 改修ロードマップよりも依存アップグレードのリスクが高く、優先度を切り替えるために全面的な凍結を宣言した。

## (b) 資産保全チェックリスト

- 実行ログ (`runs/<timestamp>/`)
  - [ ] `runs/` 直下の最新 10 セッションを `tar.gz` でアーカイブし、SHA-256 を記録した上で耐久ストレージへ移送する。
  - [ ] `response.raw.jsonl` の JSONL 形式をサンプリング検証し、行末改行と UTF-8 エンコーディングが保たれているか確認する。
- レシピ/フラグメント (`data/`, `corpus/`)
  - [ ] `data/recipes/*.yaml` のハッシュリストを `project/recipe-digest.md` として生成し、差分監視の基準点を確保する。
  - [ ] `corpus/` のライセンス要件を再確認し、外部再配布許諾が必要なファイルを `docs/migration/` へ隔離する。
- 配布物 (`target/release/bundle/`)
  - [ ] 直近ビルド済みの AppImage/MSI/DMG をウイルススキャン・署名検証済みストレージへ退避し、取得元コミットハッシュとともに目録化する。
  - [ ] `tauri.conf.json` のバージョニングと署名証明書の有効期限を記録し、期限切れ 90 日前に更新タスクを起票する。

## (c) 再開時の技術的前提

- GTK4 / WebKitGTK 6.0 の安定版が主要ディストロで提供され、`pkg-config --exists webkitgtk-6.0` が成功すること。
- Tauri 2.x の Linux/Windows/macOS バンドラが上流で GTK4 / WebKit6 を正式サポートし、`npm run tauri:build` が警告なく完了すること。
- Ollama サーバーが 0.2x 系へ更新され、`/api/generate` のストリーミングレスポンス形式が確定し、`run_ollama_stream` の互換レイヤーを Rust 側で検証済みであること。
- Node.js 20 LTS と Rust stable のサポート期間が残っているか、次期 LTS への移行計画（`Day8/workflow-cookbook/BLUEPRINT.md`）に沿って見直されていること。
- セキュリティ監査（`cargo audit`, `npm audit --production`）が重大アラート 0 件で通過し、依存ロックファイルが再生成済みであること。

## (d) 想定タイムラインと担当ロール

- T0（凍結宣言日） — PM/Tech Lead: 凍結告知・Sunset Plan の周知、Issue/PR の新規受付停止。
- T0+7d — Infra/DevOps: 資産保全チェックリストを完了し、退避ログと配布物の整合性を監査。
- T0+14d — QA: `Day8/workflow-cookbook/RUNBOOK.md` の更新要否を判断し、再開時の回帰テストセットをドラフト。
- T0+30d — Steering Committee: GTK4/Ollama の上流状況をレビューし、再開判断または凍結延長を決定。

## (e) 再開時チェックコマンド

- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run test:node`
- [ ] `cargo test`
- [ ] `cargo test --test workspace_backup`
- [ ] `cargo deny check`
- [ ] `cargo audit`
