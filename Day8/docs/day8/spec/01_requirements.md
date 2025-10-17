# 要件（Requirements）

## 機能要件
1. 反省パイプラインの自動実行
   - 入力: テスト/運用ログ（JSONL 等）
   - 出力: `reports/today.md`（日次レポート）、必要に応じた Issue 草案
2. 自動改変の抑止
   - 本番コードへの自動書き込みは禁止。提案（Issue/ドラフトPR）のみ。
3. サブディレクトリ運用
   - `defaults.run.working-directory` による `workflow-cookbook/` 下での実行をサポート。

## 非機能要件
- 冪等性: 同一ログに対して同一レポートが生成されること
- 可観測性: 実行ログは JSON 形式で保存可能（Actions/Artifacts）
- 拡張性: 解析エンジンをヒューリスティック→LLM に差し替え可能
- セキュリティ: 秘匿情報を含む外部送信を禁止。PII マスク方針を文書化。
