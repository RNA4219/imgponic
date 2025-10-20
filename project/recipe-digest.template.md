---
expected_recipes:
  - data/recipes/demo.sora2.yaml
---

# Recipe Digest

この文書は `data/recipes/*.yaml` の各レシピについて SHA256 チェックサムを集約し、
差分検知と棚卸しに利用します。テンプレート上の `expected_recipes` は最低限揃えるべき
レシピの一覧であり、欠損時は CLI が警告を出します。

## 更新手順

```bash
pnpm tsx tools/sunset/recipeDigest.ts --output project/recipe-digest.md
```

## フィールド定義

- `Recipe Path`: レポジトリルートからの相対パス。
- `SHA256`: レシピファイル本文から算出した SHA256 チェックサム。

## チェックサム一覧

<!-- RECIPE_DIGEST:START -->
| Recipe Path | SHA256 |
| --- | --- |
| _No recipes found_ | - |
<!-- RECIPE_DIGEST:END -->
