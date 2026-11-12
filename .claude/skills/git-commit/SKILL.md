---
name: git-commit
description: Commit messages and commit strategy based on Conventional Commits
---

# Git commit skill

## Goal
Keep a consistent, readable commit history.

## Message format

```
<type>: <description>
```

### Types

| type | Use for |
|------|---------|
| `feat` | A new feature |
| `fix` | A bug fix |
| `refactor` | Code changes that do not change behavior |
| `docs` | Documentation only |
| `test` | Adding or fixing tests |
| `chore` | Configuration, dependencies, build setup |
| `style` | Formatting that does not change meaning |
| `perf` | Performance improvements |

### Description rules

- **Write it in English**, naturally and concisely
- **Start with a lowercase letter**
- **Use the imperative mood** (add, fix, update, remove, …)
- **No trailing period**
- **No emoji**

### Good and bad examples

```
feat: add user authentication with JWT
fix: resolve login redirect loop on expired sessions
refactor: extract validation logic into shared utility
docs: update API endpoint documentation
chore: upgrade Next.js to v15.1

# Bad
feat: Add User Authentication.   ← capitalized, trailing period
🎉 feat: add login                ← emoji
fix: fixed bug                    ← past tense, vague
update stuff                      ← no type, unclear
```

## What goes into one commit

- **Group changes of the same kind**
  - Do not mix a feature and a bug fix in one commit
  - Keep refactoring apart from new features
  - Put documentation changes in their own commit
- **One commit = one logical change**
  - Keep commits small enough to review and revert

### Grouping example

```bash
# 1: refactoring
git commit -m "refactor: extract email validation into shared helper"

# 2: the feature that uses the helper
git commit -m "feat: add email verification on signup"

# 3: related documentation
git commit -m "docs: add signup flow documentation"
```

## Never

- Put emoji in commit messages
- Bundle unrelated changes in one commit
- Write commit messages in Japanese
- Write meaningless messages such as `fix: fix bug`
- Add generated footers such as `🤖 Generated with Claude Code` or `Co-Authored-By: Claude`
