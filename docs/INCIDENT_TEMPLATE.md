---
title: インシデントレポート テンプレート
status: active
last_reviewed_at: 2025-02-15
next_review_due: 2025-08-15
blueprint: ../Day8/workflow-cookbook/BLUEPRINT.md
evaluation: ../Day8/workflow-cookbook/EVALUATION.md
---

# インシデントレポート テンプレート

<!-- markdownlint-disable MD013 -->

[← README](../README.md#🚨-インシデント対応フロー) ｜ [BLUEPRINT](../Day8/workflow-cookbook/BLUEPRINT.md) ｜ [EVALUATION](../Day8/workflow-cookbook/EVALUATION.md)

## 利用手順

1. 本テンプレートを `docs/IN-YYYYMMDD-XXX.md` としてコピーし、
   Front Matter の `incident_id` と各時刻を更新する。
2. Runbook の該当節を参照しながら
   「検知→影響→5 Whys→再発防止→タイムライン」の順に追記する。
3. 記入後、Blueprint/Evaluation の関連節へインシデントIDをリンクし、
   Preventive Actions は Issue/PR と紐付ける。

## メタデータ

- インシデントID:
- 発生日:
- 対応責任者:
- ステータス: 発生中 / 調査中 / 再発防止策実行中 / クローズ
- 関連Runbook/Evaluation節: `RUNBOOK.md` の節番号 /
  `EVALUATION.md` の Acceptance Criteria 番号

## 検知 (Detection)

- 初動トリガー（監視アラート・サポート問い合わせなど）
- 参照ログ/メトリクスのリンク
- 検知タイムスタンプ（UTC/JST の双方）

## 影響 (Impact)

- 影響範囲（ユーザー/システム/データ）
- 発生期間と影響度（Major/Minor など）
- ビジネス/顧客へのインパクト

## 5 Whys (Root Cause)

1. なぜ発生したのか？
2. その原因はなぜ起きたのか？
3. さらに深い原因は何か？
4. 防げなかった理由は？
5. 恒久対応で塞ぐべき点は？

> パレート図や因果関係図がある場合は別途添付し、因果の確からしさを検証する。

## 再発防止策 (Preventive Actions)

- [ ] 対策A（担当 / 期限 / 成果物）
- [ ] 対策B（担当 / 期限 / 成果物）
- 対策の追跡方法（Jira/GitHub Issue 等）

## タイムライン (Timeline)

| 時刻 (UTC/JST) | イベント | 詳細/担当 |
| --- | --- | --- |
| 00:00 / 09:00 | アラート検知 | 監視システムから Slack #alerts へ通知 |
| 00:10 / 09:10 | 初動確認 | オンコール担当が Runbook の手順で現状把握 |
| 01:00 / 10:00 | 恒久対応策決定 | 影響範囲レビューと対策プラン合意 |

---

最新例: [IN-20250215-001](IN-20250215-001.md) / 想定例: [IN-20250310-001](IN-20250310-001.md) を参照し、
Runbook と Evaluation の要件に対する整合性を確認すること。

<!-- markdownlint-enable MD013 -->
