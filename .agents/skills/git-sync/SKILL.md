---
name: git-sync
description: リモートとの同期、pull/push、コンフリクト解決
---

# Git Sync スキル

## 目的
リモートリポジトリとの同期を安全かつ効率的に行う

## 実行手順

### 1. 状態確認

```bash
# ローカルの状態確認
git status

# リモートとの差分確認
git fetch origin main
git log --oneline HEAD..origin/main   # リモートにあってローカルにない
git log --oneline origin/main..HEAD   # ローカルにあってリモートにない
```

### 2. Pull（リモートの変更を取り込む）

```bash
# rebase で取り込む（履歴がきれいになる）
git pull --rebase origin main
```

### 3. コンフリクト解決

コンフリクトが発生した場合：

```bash
# 状態確認
git status

# ファイルを編集してコンフリクト解決後
git add <resolved-file>
git rebase --continue

# または、リモート側を採用する場合
git checkout --theirs <file>
git add <file>
git rebase --continue

# または、ローカル側を採用する場合
git checkout --ours <file>
git add <file>
git rebase --continue

# 削除されたファイルの場合
git rm <file>
git rebase --continue
```

### 4. Push

```bash
git push origin main
```

## トラブルシューティング

### ロックファイルが残っている場合

```bash
rm -f .git/*.lock
```

### ハングしているプロセスがある場合

```bash
# 確認
ps aux | grep -E 'git|credential' | grep -v grep

# 停止
pkill -f "git-remote-https"
pkill -f "gh auth login"
```

### credential helper が遅い場合

```bash
# 原因確認
git config --show-origin --get-all credential.helper

# osxkeychain が問題の場合、無効化
git config --global credential.helper ""
```

### ブランチが分岐している場合

```bash
# 状態確認
git status
# "Your branch and 'origin/main' have diverged" と表示される

# rebase で統合
git pull --rebase origin main
```

## 禁止事項

- `git push --force` は使用しない（履歴が破壊される）
- コンフリクトを確認せずに `--theirs` や `--ours` を使わない
- ロックファイルを確認せずに削除しない
