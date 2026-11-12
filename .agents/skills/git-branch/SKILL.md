---
name: git-branch
description: Gitブランチの作成、命名規則に従ったブランチ名の生成
argument-hint: [作業内容の説明]
---

# Gitブランチ作成スキル

## 目的
ブランチ戦略に基づいた適切なブランチを作成する

## ブランチの種類（役割）

| 種類 | 用途 | 分岐元 | マージ先 |
|------|------|--------|----------|
| `main` | 本番環境 | - | PR経由のみ |
| `dev` | 開発ベース | main（初期のみ） | main |
| `feature/` | 新機能開発 | dev | dev |
| `release/` | リリース準備 | dev | main, dev |
| `hotfix/` | 緊急修正 | main | main, dev |

## ブランチ命名規則（プレフィックス）

| プレフィックス | 用途 | 例 |
|----------------|------|-----|
| `fix/` | バグ修正 | `fix/login-error` |
| `refactor/` | リファクタリング | `refactor/api-cleanup` |
| `chore/` | 設定変更・依存関係更新 | `chore/update-dependencies` |
| `docs/` | ドキュメント修正 | `docs/readme-update` |
| `test/` | テスト追加 | `test/unit-tests` |

## 組み合わせパターン

### featureブランチ + プレフィックス
```
feature/fix/login-bug
feature/refactor/api-structure
feature/docs/user-manual
```

### 直接使用（devから分岐）
```
fix/login-error
refactor/component-structure
chore/update-dependencies
```

### hotfixブランチ
```
hotfix/security-patch
hotfix/fix/critical-bug
```

## ワークフロー

### 1. 作業内容の分類
ユーザーの作業内容から以下を判断：
- ブランチの種類（feature/hotfix/release）
- プレフィックス（fix/refactor/chore/docs/test）

### 2. ブランチ名の生成
```
{ブランチ種類}/{プレフィックス}/{説明}
```
または
```
{プレフィックス}/{説明}
```

### 3. ブランチ作成コマンドの生成
```bash
# 通常の機能開発
git checkout -b feature/xxx dev

# バグ修正のみ
git checkout -b fix/xxx dev

# 緊急修正
git checkout -b hotfix/xxx main
```

## mainブランチの保護

### 必須設定

- **ブランチ保護ルールを有効化**: GitHubのブランチ保護設定で以下を設定
  - 直接プッシュを禁止
  - PR必須
  - レビュー必須（承認者1名以上）
  - ステータスチェック必須（CI/CDが通るまでマージ不可）

### 禁止事項

- ❌ `main`ブランチへの直接コミット
- ❌ `main`ブランチへの直接プッシュ
- ❌ `main`ブランチへの直接マージ（PR経由のみ）
- ❌ `main`ブランチから直接`feature/`ブランチを作成

### 許可事項

- ✅ `main`ブランチから`dev`ブランチを作成（初期セットアップ時のみ）
- ✅ `main`ブランチから`hotfix/`ブランチを作成（緊急修正時のみ）
- ✅ `release/`ブランチから`main`ブランチにマージ（PR経由、レビュー必須）

## ベストプラクティス

- **ブランチ名は明確に**: 何のためのブランチかが分かるように命名
- **小さく分ける**: 1つのブランチで複数の機能を開発しない
- **定期的にマージ**: 長期間ブランチを分離しない
- **レビューを実施**: マージ前に必ずコードレビュー
- **コミットメッセージを明確に**: 何を変更したかが分かるように記述
- **mainブランチは絶対に直接変更しない**: すべてPR経由でマージ

## 出力形式
1. 推奨ブランチ名
2. 作成コマンド
3. 作業完了後のマージ先
