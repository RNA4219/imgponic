# GTK4 / GLib 0.20 対応関連リンク

## 再確認サイクル: 月次レビュー（毎月第1営業日）

- 月次確認サイクル: 月次レビュー（毎月第1営業日）に棚卸しを実施。
- 担当者ローテーション: `workflow-qa` → `runtime-maintainers` → `docs-support` の順に月単位で交代し、完了報告は `#imgponic-governance` チャンネルへ掲示。
- 監視スクリプト: `npx tsx tools/sunset/gtk4LinkMonitor.ts --config tools/sunset/gtk4Links.config.json --out reports/gtk4-links` を実行し、`reports/gtk4-links/report.{json,md}` の結果を一次ソースとする（CI は `.github/workflows/gtk4-link-monitor.yml` で月次実行）。
- 手動追記が必要な場合は `tools/sunset/gtk4Links.config.json` の `id` ごとにローカル mirror や RSS アーカイブを更新する。

| リンク | 現状ステータス | 最終確認日 | 担当メモ |
| --- | --- | --- | --- |
| [tauri-apps/tao の GTK4 対応 PR](https://github.com/tauri-apps/tao/pull/1104) | `reports/gtk4-links/report.md` （ID: `tauri-tao-pr-1104`） | 2025-10-20 | ローカル mirror で `git fetch origin pull/1104/head:pr-1104` を実行し、ブランチを更新してからスクリプトを再実行する。 |
| [conradhale/tao リポジトリ](https://github.com/conradhale/tao) | `reports/gtk4-links/report.md` （ID: `conradhale-tao`） | 2025-10-20 | `data/mirrors/conradhale-tao` を `git fetch --all --prune` で更新し、差分を確認。 |
| [conradhale/wry リポジトリ](https://github.com/conradhale/wry) | `reports/gtk4-links/report.md` （ID: `conradhale-wry`） | 2025-10-20 | `data/mirrors/conradhale-wry` の `main` を更新後、GTK4 ブランチとの差分をレビュー。 |
| [tauri-apps/tauri Issue #11928](https://github.com/tauri-apps/tauri/issues/11928) | `reports/gtk4-links/report.md` （ID: `tauri-issue-11928`） | 2025-10-20 | GitHub Atom フィード (`issues/11928.atom`) を取得して `data/feeds/tauri-issue-11928.xml` に保存。 |
| [tauri-apps/muda Issue #259](https://github.com/tauri-apps/muda/issues/259) | `reports/gtk4-links/report.md` （ID: `muda-issue-259`） | 2025-10-20 | Issue フィードを `data/feeds/muda-issue-259.xml` に保存してからスクリプトを実行。 |
| [tauri-runtime-wry のドキュメント](https://docs.rs/tauri-runtime-wry) | `reports/gtk4-links/report.md` （ID: `tauri-runtime-wry-docs`） | 2025-10-20 | `docs.rs` のリリースフィードを `data/feeds/tauri-runtime-wry-releases.xml` に保存。 |
| [GNOME フォーラム: GTK4 のシステムトレイアイコン](https://discourse.gnome.org/t/system-tray-icons-in-gtk4/22615) | `reports/gtk4-links/report.md` （ID: `gnome-gtk4-tray-forum`） | 2025-10-20 | Discourse の RSS (`.rss`) を `data/feeds/gnome-gtk4-tray.xml` へ保存し更新点を確認。 |
| [Tauri v2 アーキテクチャガイド](https://v2.tauri.app/concept/architecture/) | `reports/gtk4-links/report.md` （ID: `tauri-architecture-guide`） | 2025-10-20 | サイト更新を `wget` 等で取得し、`data/feeds/tauri-architecture.xml` を差し替える。 |

※ GitHub/API への直接アクセスが遮断されているため、ローカル mirror やアーカイブを更新したうえでスクリプトの結果を参照する。
