# Seam — AI エージェント向けガイド

このリポジトリで作業する AI エージェント（Claude Code / Codex）のための指示書です。
CLAUDE.md はこのファイルを読みこんでいるので、内容はここだけに書きます。

## このプロジェクト

Seam は、Web 標準ベースの React フルスタックフレームワークです。

> ページはただの HTML。React は「動く部分」（アイランド）にだけ届ける。
> 境界はなくさず、URL として見えるようにして、越えるのを楽にする。

設計の判断は、必ず次のドキュメントに合わせてください。

- [docs/vision.md](docs/vision.md) … 5つの中心、設計の原則、**やらないこと**、比較
- [docs/original-prompt.md](docs/original-prompt.md) … 最初のプロンプト（原文。変更しない）
- [docs/tutorial.md](docs/tutorial.md) … 使う人向けのチュートリアル
- [README.md](README.md) … 機能、公開 API、確認済みのこと、注意点

## ユーザーへの返答

- **やさしく自然な日本語**で書く。かたい言い回しや、むずかしすぎる専門用語は避ける
- 抽象的な説明より、具体的なステップやコードで説明する
- 「なぜそうするのか」から説明する
- ライブラリの今の API（React、Vite、@vitejs/plugin-rsc など）に確信がないときは、推測で書かずに、ソースや型定義を読んで確かめる。確かめられないときは「確認が必要」と書く

## 構成

```
packages/seam/          フレームワーク本体（src/ → tsc → dist/）
  src/core/             createApp、ルーター、action、Cache-Control、ビュー、コンテキスト
  src/react/            SSR、<Include>
  src/runtime/          'use server' / 'use client' / *.api.ts の変換後に使う部品
  src/client/           ナビゲーション用スクリプト、島のハイドレーション、useNav
  src/rsc/              RSC（オプション）
  src/api/              型付き GET API（get()）
  src/adapters/         node / bun / deno / cloudflare
  src/vite/             Vite プラグイン（scan.ts がファイル規約）
  src/cli.ts            seam コマンド
  test/                 vitest
packages/create-seam/   npm create seam（template/ が Todo アプリ）
examples/invoices/      全機能を使うサンプル（dist の seam を使う。rsc: true）
scripts/                E2E と、外でのインストール・4ランタイムの確認
docs/                   設計とチュートリアル
```

## コマンド

Node は 24.22.3 に固定しています（`package.json` の `volta`、`pnpm-workspace.yaml` の `useNodeVersion`）。pnpm を使います。

| コマンド | いつ使う |
|---|---|
| `pnpm build` | `packages/seam` を `dist/` にコンパイル。**サンプルは dist を使うので、本体を変えたら先に実行** |
| `pnpm test` | 単体・結合テスト（vitest。`src` を直接テスト） |
| `pnpm typecheck` | 本体（ソース）と、サンプル（配布する dist の型）の両方 |
| `pnpm e2e` | サンプルを本番ビルドし、Chrome で JS あり・なしを確認 |
| `pnpm test:create` | 公開用 tgz → create-seam → npm install → build → start（リポジトリの外。ネットワークが必要） |
| `pnpm test:adapters` | 同じアプリを Node / Bun / Deno / Workers（Miniflare）で確認（ネットワークが必要） |
| `pnpm example:dev` | サンプルの開発サーバー |

## 変更したあとの確認

| 変えたもの | 最低限やること |
|---|---|
| どこでも | `pnpm test` と `pnpm typecheck` |
| 画面・ナビゲーション・島・ビュー・RSC・プラグイン | 上に加えて `pnpm e2e` |
| 配布の形（package.json の exports、cli、create-seam、テンプレート） | 上に加えて `pnpm test:create` |
| アダプター、ビルドの設定 | 上に加えて `pnpm test:adapters` |

テストが失敗したら、出力をそのまま報告してください。通ったことにしないでください。

## 守ること

- **やらないこと（docs/vision.md の6章）を足さない**：フレームワーク独自のデータキャッシュ、キャッシュを消すタグ、SPA ルーター、route の `action`、`'use server'` での読みこみ、など
- **公開 API を増やすときは理由を書く**：README の「公開 API」の表に1行足す理由を説明できるものだけ
- **ビルド時の変換を増やさない**：今は4つ（`'use server'`、`'use client'`、`*.api.ts`、サーバー専用コードのガード）。変換後の姿は `.seam/*.gen.ts` で見えるようにする
- **React は 19.3.1 に固定**：`$$FORM_ACTION` / `$$IS_SIGNATURE_EQUAL` / `formState` という React の内部の仕組みに頼っている。上げるときは react-dom のソースで動きを確かめ、全部のテストを通す
- **`'use server'` の変換は `enforce: "pre"`**：@vitejs/plugin-rsc より先に動かして、action の仕組み（`POST /_action/<id>`）を Seam のものに保つ
- **本番は `NODE_ENV=production`**：付け忘れると React の開発用ビルドが動き、RSC の応答にデバッグ情報が入る
- 本体のソースの import は `.ts` 拡張子付きで書く（tsc が `.js` に書きかえる）
- 生成ファイル（`.seam/`、`dist/`）は手で直さない

## 環境の注意

- volta の pnpm を使うときは `PATH=$HOME/.volta/bin:$PATH` にする。`useNodeVersion` により、スクリプトは Node 24 で動く
- E2E は、インストール済みの Google Chrome を `playwright-core` から使う（ブラウザのダウンロードは不要）
- サーバーを子プロセスで起動するときは `node` ではなく `process.execPath` を使う（volta の中継役だけが止まって、サーバーが残るため）

## スキル

作業の内容に合わせて、対応するスキルを必ず使ってください。

| やること | スキル | 場所 |
|---|---|---|
| コミット | `git-commit` | `.claude/skills/git-commit/`（Claude）、`.agents/skills/git-commit/`（Codex） |

コミットのルール（スキルの要点）：

- Conventional Commits（`feat:` `fix:` `refactor:` `docs:` `test:` `chore:` など）。説明は英語・小文字始まり・命令形・ピリオドなし
- 1コミット = 1つの論理的な変更。種類のちがう変更は分ける
- **`Co-Authored-By: Claude` や `Generated with Claude Code` などの自動生成フッターを付けない**
