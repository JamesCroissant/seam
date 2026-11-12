---
name: git-commit
description: Conventional Commits に基づくコミットメッセージとコミット戦略
---

# Git コミットスキル

## 目的
一貫性のある、読みやすいコミット履歴を維持する

## コミットメッセージ形式

```
<type>: <description>
```

### type 一覧

| type | 用途 |
|------|------|
| `feat` | 新機能追加 |
| `fix` | バグ修正 |
| `refactor` | 挙動を変えないコード改善 |
| `docs` | ドキュメントのみの変更 |
| `test` | テストの追加・修正 |
| `chore` | 設定変更、依存関係更新、ビルド周り |
| `style` | フォーマット修正（コードの意味に影響しない変更） |
| `perf` | パフォーマンス改善 |

### description のルール

- **英語で書く**（自然で端的な表現）
- **小文字で始める**（先頭を大文字にしない）
- **命令形で書く**（add, fix, update, remove など）
- **末尾にピリオドを付けない**
- **絵文字は使わない**

### 良い例 / 悪い例

```
feat: add user authentication with JWT
fix: resolve login redirect loop on expired sessions
refactor: extract validation logic into shared utility
docs: update API endpoint documentation
chore: upgrade Next.js to v15.1

# NG
feat: Add User Authentication.   ← 大文字、ピリオド
🎉 feat: add login                ← 絵文字
fix: fixed bug                    ← 過去形、曖昧
update stuff                      ← type なし、内容不明
```

## コミット単位のルール

- **似た属性の変更をグループ化してコミットする**
  - 機能追加とバグ修正を1つのコミットに混ぜない
  - リファクタリングと新機能を分ける
  - ドキュメント変更はドキュメントだけでまとめる
- **1コミット = 1つの論理的変更**
  - レビューしやすく、revert しやすい粒度を保つ

### グループ化の例

```bash
# 1つ目: リファクタリング
git commit -m "refactor: extract email validation into shared helper"

# 2つ目: そのヘルパーを使った新機能
git commit -m "feat: add email verification on signup"

# 3つ目: 関連ドキュメント
git commit -m "docs: add signup flow documentation"
```

## 禁止事項

- 絵文字をコミットメッセージに含めない
- 無関係な変更を1コミットにまとめない
- 日本語でコミットメッセージを書かない
- `fix: fix bug` のような意味のないメッセージを書かない
- `🤖 Generated with Claude Code` や `Co-Authored-By: Claude` 等の自動生成フッターを付けない
