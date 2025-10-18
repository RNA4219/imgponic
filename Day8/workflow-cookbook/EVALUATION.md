---
intent_id: INT-001
owner: your-handle
status: active   # draft|active|deprecated
last_reviewed_at: 2025-10-14
next_review_due: 2025-11-14
---

# Evaluation

## Acceptance Criteria

- 必須要件（フォーマット・件数・整合性など）
- PR本文に Priority Score（値と根拠）が記録されていること。
- governance/policy.yaml の forbidden_paths を変更しないこと。
- インシデント発生時は [`docs/INCIDENT_TEMPLATE.md`](../../docs/INCIDENT_TEMPLATE.md) に沿って作成し、最新例（[IN-20250215-001](../../docs/IN-20250215-001.md)）が該当PRおよびRUNBOOKから相互リンクされていること

## KPIs

- 例）処理時間、成功率、エラー率、再実行回数

## Test Outline

- 単体: 入力→出力の例テーブル
- 結合: 代表シナリオ
- 回帰: 重要パス再確認

## Verification Checklist

- [ ] 主要フローが動作する（手動確認）
- [ ] エラー時挙動が明示されている
- [ ] 依存関係が再現できる環境である
