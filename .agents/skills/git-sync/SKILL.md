---
name: git-sync
description: Sync with the remote, pull/push, and resolve conflicts
---

# Git sync skill

## Goal
Sync with the remote repository safely and efficiently.

## Steps

### 1. Check the state

```bash
# Local state
git status

# Differences with the remote
git fetch origin main
git log --oneline HEAD..origin/main   # on the remote, not local
git log --oneline origin/main..HEAD   # local, not on the remote
```

### 2. Pull (bring in remote changes)

```bash
# Rebase keeps the history clean
git pull --rebase origin main
```

### 3. Resolve conflicts

When a conflict happens:

```bash
# Check the state
git status

# After editing the files to resolve the conflict
git add <resolved-file>
git rebase --continue

# Or keep the remote side
git checkout --theirs <file>
git add <file>
git rebase --continue

# Or keep the local side
git checkout --ours <file>
git add <file>
git rebase --continue

# For a deleted file
git rm <file>
git rebase --continue
```

### 4. Push

```bash
git push origin main
```

## Troubleshooting

### A lock file is left behind

```bash
rm -f .git/*.lock
```

### A process is hanging

```bash
# Check
ps aux | grep -E 'git|credential' | grep -v grep

# Stop
pkill -f "git-remote-https"
pkill -f "gh auth login"
```

### The credential helper is slow

```bash
# Find the cause
git config --show-origin --get-all credential.helper

# If osxkeychain is the problem, disable it
git config --global credential.helper ""
```

### The branches have diverged

```bash
# Check
git status
# shows "Your branch and 'origin/main' have diverged"

# Integrate with a rebase
git pull --rebase origin main
```

## Never

- Use `git push --force` (it destroys history)
- Use `--theirs` or `--ours` without looking at the conflict
- Delete lock files without checking them first
