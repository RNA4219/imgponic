# Pull Request テンプレート

Intent: INT-___
Links: [Acceptance Criteria](EVALUATION.md#acceptance-criteria)
Priority Score: `number`

## 記入項目

> **必須**: `Intent: INT-xxx` と `EVALUATION` のアンカーを本文に含めないと CI が失敗します。

### 概要

- Intent: INT-123 <!-- 必ず INT-123 の形式で記載。必ず実際の Intent 番号に置き換えてください -->
- 種別: feature / fix / chore / docs

### リンク

- BLUEPRINT: <!-- path or permalink -->
- TASK: <!-- path -->

## EVALUATION

- 検収条件の見出し/アンカー:
  - [Acceptance Criteria](../EVALUATION.md#acceptance-criteria)
  - 受入条件の見出しアンカーを指定

### リスクとロールバック

- 主要リスク:
- Canary条件: （/governance/policy.yaml に準拠）
- Rollback手順: RUNBOOK の該当手順リンク

### チェックリスト

- [ ] 受入基準（EVALUATION）緑
- [ ] CHECKLISTS 該当項目完了
- [ ] CHANGELOG 追記
- [ ] REQUIREMENTS（REQUIREMENTS.md or docs/requirements.md）がある（無ければ後追いで作る）
- 禁止パス遵守チェック（governance/policy.yaml）: <!-- 例: OK / 対象外 / 詳細 -->
- Priority Score: <!-- 例: 5 / prioritization.yaml#phase1 -->

## Docs matrix (FYI)

- REQUIREMENTS: present?  [] yes / [] later
- SPEC:         present?  [] yes / [] later
- DESIGN:       present?  [] yes / [] later
