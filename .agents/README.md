# .agents

Codex（OpenAI Codex CLI）用のフォルダです。プロジェクトの指示はルートの [AGENTS.md](../AGENTS.md) にあります。

| フォルダ | 中身 |
|---|---|
| `skills/git-commit/` | コミットメッセージとコミットの分け方 |
| `skills/git-branch/` | ブランチの種類と名前の付け方 |
| `skills/git-sync/` | リモートとの同期（pull / push）とコンフリクトの解決 |

中身は `.claude/skills/` と同じです。スキルは `$git-commit` のように呼び出せます。
