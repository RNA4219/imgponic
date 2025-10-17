# 運用（Operations）

## 導入手順（サブディレクトリ運用の例）
1. `workflow-cookbook/` をリポジトリ直下に配置
2. `.github/workflows/test.yml` と `reflection.yml` を配置
3. コミット＆プッシュ → `test` 実行 → `reflection` 連動

## 失敗時の切り分け
- `test` がこける: ログが生成されているか確認（Artifacts）
- `reflection` がこける: `analyze.py` のパスと Python バージョンを確認
- 既存の CI と競合する場合: ワークフロー名やトリガを調整

## 併用例（Codex 近似環境）
- 失敗時のみ `ghcr.io/openai/codex-universal` で再実行し、環境差分を切り分ける

## 外部 git-dir 運用（.git 外出し）
Day8 配下に `.git/` を作成せず、別ディレクトリで Git メタデータを管理する場合の手順です。

### 初期設定
1. ワークツリーと Git ディレクトリのパスを決める（例）
   - `$W = "C:\\Users\\ryo-n\\Downloads\\github_dev\\作業フォルダ\\Day8"`
   - `$D = "C:\\Users\\ryo-n\\gitdirs\\Day8.git"`
2. 既存の `.git/` を退避するか、新規に初期化する
   ```powershell
   if (Test-Path "$W\.git") {
     New-Item -ItemType Directory -Path (Split-Path $D) -Force | Out-Null
     Move-Item "$W\.git" $D
   } else {
     git init $D
   }
   ```
3. ワークツリーを紐づけ、リモートを設定する
   ```powershell
   git --git-dir=$D config core.worktree $W
   if (-not (git --git-dir=$D remote)) {
     git --git-dir=$D remote add origin https://github.com/RNA4219/Day8.git
   }
   ```

### 運用コマンドのエイリアス化
PowerShell の `$PROFILE` などに以下を追記し、`day8` コマンド経由で Git 操作を統一します。
```powershell
$env:DAY8_GITDIR = "C:\\Users\\ryo-n\\gitdirs\\Day8.git"
$env:DAY8_WORK   = "C:\\Users\\ryo-n\\Downloads\\github_dev\\作業フォルダ\\Day8"
function day8 { param([Parameter(ValueFromRemainingArguments=$true)]$Args)
  git --git-dir=$env:DAY8_GITDIR --work-tree=$env:DAY8_WORK @Args
}
```

### 典型操作
- `day8 status`
- `day8 add .`
- `day8 commit -m "update Day8"`
- `day8 pull --rebase origin main`
- `day8 push origin main`

> **注意**: Day8 フォルダ直下では通常の `git` コマンドを実行しないこと。誤って `.git/` が再作成されるのを防止するためです。
