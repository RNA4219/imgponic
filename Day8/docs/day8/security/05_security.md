# セキュリティ & ガバナンス

## ポリシー（例）
```yaml
# governance/policy.yaml（例）
owners: ["@RNA4219"]
slo:
  max_duration_p95_ms: 2000
  min_pass_rate: 0.95
allow_actions:
  - read_logs
  - open_issue_draft
  - commit_reports
deny_actions:
  - modify_prod_code
  - external_secrets_exfiltration
rate_limits:
  issues_per_day: 5
  report_commits_per_day: 3
protected_paths:
  - "src/**"
  - "infra/**"
```

## PII/機微情報の取り扱い
- ログ収集時にマスキングを適用
- 外部送信は行わない
