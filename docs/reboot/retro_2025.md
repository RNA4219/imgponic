# Reboot Retro 2025

## 凍結サマリ
- **凍結理由**: `Day8/workflow-cookbook` 配下の HUB/GUARDRAILS/BLUEPRINT ドキュメントは、SUNSET計画で定義された通り後継の `Day8/docs/day8/` 系列へ統合済みのため、旧プロセスと重複して維持コストが発生する状態を解消するために凍結。参照: [`docs/SUNSET_PLAN.md`](../SUNSET_PLAN.md)
- **影響範囲**: Blueprint/Runbook を参照するワークフロー刷新タスク、GTK4 対応調査 (`tools/sunset/gtk4LinkMonitor.ts` レポート) の棚卸し、Ollama モデル配備チェックなど、SUNSET計画で列挙された確認作業が凍結中は停止。
- **再開条件**: GTK4 依存ライブラリの安定版追従と `npm run ci:assert-gtk-stack` のグリーン維持、`check_ollama_setup` が `status: "ok"` を返すモデル群の確保、`Day8/docs/day8/` の差分取り込み完了など、SUNSET計画「再開前に実行する確認コマンド」「必要リソース一覧」の要件を満たすこと。

## 実装/プロセス観点のふりかえり
- **良かった点**: GTK4 依存確認を `npx tsx tools/sunset/gtk4LinkMonitor.ts` で自動化し、リンクウォッチと CI コマンド (`npm run ci:assert-gtk-stack`) が連動しているため、再開後も最低限の互換性担保が容易。
- **課題**: GTK4 対応ライブラリのアップデート待ちと、Ollama モデル (`ollama pull llama3:8b` など) のローカル環境整備に工数が掛かっており、再開判断のボトルネックになっている。SUNSET計画で示されたレビュー担当ごとの判定条件も依存解消まで進められていない。
- **次の一歩**: GTK4 ウォッチリストと Ollama 要件の進捗を月次レビューに合わせて記録し、`Day8/docs/day8/` 側の後継仕様へ取り込む差分を特定する。`Day8/workflow-cookbook/BLUEPRINT.md` など凍結告知の更新準備も並行して行う。

## 再開前チェックリストとフォローアップ
| 項目 | 担当 | 期限 | 状態 | 備考 |
|------|------|------|------|------|
| `npm run lint` / `npm run test` / `npm run test:node` の最新結果を取得し、回帰が無いことを確認 | app-lead | 2026-01-22 | 未着手 | SUNSET計画「再開前に実行する確認コマンド」に準拠 |
| `cargo test` と `npm run ci:assert-gtk-stack` を実行し、GTK4 依存が安定版へ追従したか確認 | workflow-qa | 2025-11-20 | 未着手 | 月次チェックと連動し、ウォッチリストを更新 |
| `npx tsx tools/sunset/gtk4LinkMonitor.ts --config tools/sunset/gtk4Links.config.json --out reports/gtk4-links` の最新レポートをレビュー | infra-lead | 2025-12-18 | 未着手 | GTK4 リンク監視結果を再開判断資料へ反映 |
| `check_ollama_setup` の `status: "ok"` を確認し、`ollama pull llama3:8b` 等のモデルを揃える | infra-lead | 2025-12-18 | 未着手 | SUNSET計画「必要リソース一覧 (Ollama モデル)」参照 |
| `Day8/docs/day8/` と凍結対象ドキュメントの差分を整理し、Blueprint/Runbook 更新方針を策定 | program-management | 2026-04-20 | 未着手 | SUNSET計画のフォローアップ最終判断に従う |
| `project/recipe-digest.template.md` に従い `pnpm tsx tools/sunset/recipeDigest.ts --output project/recipe-digest.md` を更新 | workflow-qa | 2025-11-20 | 未着手 | SUNSET計画「チェックリスト」を再開前に完了 |
| `npx tsx tools/sunset/archiveRuns.ts --runs runs --limit 5 --out archives` を実行し資産保全を確認 | security-review | 2026-02-19 | 未着手 | SUNSET計画「資産保全」を遵守 |

## フォローアップタスク
- [ ] GTK4 ウォッチリスト (`docs/gtk4_links.md`) のアップデート手順を `reports/gtk4-links-*.md` へ統合し、再開判断材料を一元化する。担当: workflow-qa / 期限: 2025-11-20
- [ ] Ollama モデル要件の検証結果を `Day8/docs/day8/README.md` の環境要件節へ反映する。担当: infra-lead / 期限: 2025-12-18
- [ ] Blueprint/Runbook 凍結告知を再開時に更新できるようドラフトを `Day8/workflow-cookbook/` 配下へ準備する。担当: program-management / 期限: 2026-04-20
