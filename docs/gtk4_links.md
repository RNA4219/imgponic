# GTK4 / GLib 0.20 対応関連リンク

## 再確認サイクル: 月次レビュー（毎月第1営業日）

- 月次確認サイクル: 月次レビュー（毎月第1営業日）に棚卸しを実施。
- 担当者ローテーション: `workflow-qa` → `runtime-maintainers` → `docs-support` の順に月単位で交代し、完了報告は `#imgponic-governance` チャンネルへ掲示。

| リンク | 現状ステータス | 最終確認日 | 担当メモ |
| --- | --- | --- | --- |
| [tauri-apps/tao の GTK4 対応 PR](https://github.com/tauri-apps/tao/pull/1104) | 要確認（API403） | 2025-10-20 | GitHub API が 403 を返すためマージ状況は VPN 復旧後に再確認。 |
| [conradhale/tao リポジトリ](https://github.com/conradhale/tao) | 要確認（API403） | 2025-10-20 | フォークの default branch 追従状況をブラウザから確認。 |
| [conradhale/wry リポジトリ](https://github.com/conradhale/wry) | 要確認（API403） | 2025-10-20 | GTK4 向けブランチの更新有無を手動で確認。 |
| [tauri-apps/tauri Issue #11928](https://github.com/tauri-apps/tauri/issues/11928) | 要確認（API403） | 2025-10-20 | Issue の open/close 進捗を確認し依存タスクへ反映。 |
| [tauri-apps/muda Issue #259](https://github.com/tauri-apps/muda/issues/259) | 要確認（API403） | 2025-10-20 | GTK4 対応議論の更新点をサマリし共有。 |
| [tauri-runtime-wry のドキュメント](https://docs.rs/tauri-runtime-wry) | 要確認（API403） | 2025-10-20 | docs.rs へ直接アクセス不可のためリリースノート経由で API 変化を把握。 |
| [GNOME フォーラム: GTK4 のシステムトレイアイコン](https://discourse.gnome.org/t/system-tray-icons-in-gtk4/22615) | 要確認（API403） | 2025-10-20 | Discourse トピックの更新を確認し上流方針変更をチェック。 |
| [Tauri v2 アーキテクチャガイド](https://v2.tauri.app/concept/architecture/) | 要確認（API403） | 2025-10-20 | オフライン環境のため公式サイト更新を手動で確認。 |

※ GitHub/API へのアクセスが遮断されているため、現時点では手動確認者による追跡が必要。

### 自動監視レポート

- `npx tsx tools/sunset/linkMonitor.ts --config tools/sunset/gtk4Links.config.ts --out reports` を実行すると、上記テーブルの全リンクを対象にローカル mirror や手動取得したアーカイブ (`data/gtk4/link-statuses.json`) を解析し、`reports/` 配下へ JSON/Markdown のレポートを生成する。
- 月次レビュー前に `.github/workflows/links.yml` の `gtk4-sunset-monitor` ジョブが同コマンドをスケジュール実行し、生成物をアーティファクト (`gtk4-link-monitor`) として保存する。
- 自動判定結果は [`docs/SUNSET_PLAN.md`](./SUNSET_PLAN.md) の再開判断フローで参照し、手動チェックの代替として最新状況を確認する。
