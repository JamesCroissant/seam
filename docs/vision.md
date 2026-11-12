# Seam が目指すもの

> **ページはただの HTML。React は「動く部分」にだけ、その部分の props と一緒に届ける。**
> 境界はなくさない。**URL として見えるようにして、越えるのを楽にする。**

Seam は「縫い目」という意味です。サーバーとクライアントの境界を、見える形のまま、きれいにつなぎます。

最初のプロンプトは [original-prompt.md](original-prompt.md) にあります。このファイルは、そこから会話で決めたことをまとめた「今の設計」です。

---

## 1. なぜ作るのか

Next.js には、Next.js だけの知識が多すぎます。

- `'use client'` / `'use server'` の境界、Server Actions、RSC 独自の仕組み
- 何度も変わってきたキャッシュ（暗黙のキャッシュ、`revalidatePath` / `revalidateTag`、`'use cache'`、`cacheLife`、`cacheTag` など）
- コンパイラの変換が多く、書いたコードと動くコードがちがう

React Router v7 は、loader / action、JS なしのフォーム、Web 標準の Request / Response、入れ子ルート、アダプターなど、良い部分をすでに持っています。**Seam がちがうのは、ページを HTML として扱い、動く部分にだけ JS を送るところ**です。React Router は、ハイドレーションしたあとアプリ全体が SPA として動き、ページの部品の JS を基本的に全部送ります。

## 2. 5つの中心

1. **ブラウザに送る JS を減らす**：HTML の差しかえとアイランドで、動く部分だけ JS を送る
2. **RSC をデータとして扱う**：RSC を「取得・キャッシュ・表示できるデータ」として扱い、slot で組み立てる（オプション）
3. **書きこみは `'use server'`**：route の action は持たない。`'use server'` は「決まった URL への普通の POST」にする
4. **コアは小さく、API は少なく**：`clientLoader`、`useFetcher`、`shouldRevalidate` に当たるものは作らない
5. **型付き API**：GET だけ。型は関数ごとに閉じる（Hono RPC の重さとメソッドチェーンを避ける）

## 3. 設計の原則

1. **ページは HTML。JS はアイランドの分だけ**
2. **境界は URL**：読みこみ・書きこみ・かけら・RSC・API が、それぞれ決まった URL を持つ（下の表）
3. **読むのは GET、書くのは POST → 303 → GET**：書いたあとは loader が全部動きなおす。`revalidate` 系の API はない
4. **アイランドが知っているのは props だけ**
5. **キャッシュは HTTP だけ**：ページの一部をキャッシュしたいなら、その部分を別の URL（ビュー）にする
6. **変換は数えられるだけ**：変換後の姿を `.seam/*.gen.ts` で見せる
7. **loader と入れ子ルートは React Router の考え方を借りる**：新しく発明しない

## 4. 境界の一覧（全部 URL で見える）

| 何をする | URL | 中身 |
|---|---|---|
| ページを見る | `GET /invoices/1` | 入れ子の loader を並行して実行し、HTML をストリーミングする |
| 書きこむ | `POST /_action/<id>` | `'use server'` の関数。JS なしなら 303、JS からなら JSON |
| ページの一部（ビュー） | `GET /_v/...` | HTML のかけら。自分の Cache-Control を持つ |
| ビューを RSC で | `GET /_v/....rsc` | 同じビューを Flight で返す（`rsc: true` のとき） |
| 型付き API | `GET /api/...` | JSON。Standard Schema でクエリを検証する |

## 5. 画面の重さの3段階

| 段階 | 動くもの | 送る JS | 向いている画面 |
|---|---|---|---|
| ① HTML | `<form>` とリンク | ナビゲーション用スクリプト（約 3KB） | 一覧、詳細、設定、記事 |
| ② アイランド | `'use client'` の部品 | React と、その部品 | ボタン、検索、グラフ |
| ③ アプリ領域 | 大きな島 + `<RscView>` | ②に加えて Flight を読むしくみ（約 7KB） | ダッシュボード、管理画面 |

**ページは①から始めて、必要になった部分だけ②、③に上げます。**

## 6. やらないこと

1. フレームワーク独自のデータキャッシュ（`'use cache'`、fetch の自動メモ化）
2. キャッシュを消すためのタグ（`revalidatePath` / `revalidateTag` / `cacheTag`）。データが変わったら URL を変える
3. クライアントルーターのキャッシュ（ブラウザの HTTP キャッシュを使う）
4. React の木全体を持つ SPA ルーター（HTML を差しかえる小さなナビゲーション用スクリプトは持つ）
5. route の `action`（書きこみは `'use server'` だけ）
6. `'use server'` での読みこみ（読みこみは GET）
7. 関数の中に書く `'use server'`（クロージャの暗号化）
8. `clientLoader` / `useFetcher` / `shouldRevalidate` / `useMatches` / `meta` export に当たるもの
9. アプリ全体の型を1つにつなぐ RPC
10. ルートの書き方を2通り持つこと（ファイルベースだけ）
11. Preact などへの切りかえ（React 標準を守る）
12. CDN ごとのパージ API
13. 画像・フォントの最適化

## 7. 弱点への対策

| 弱点 | 対策 |
|---|---|
| Hono：フォルダ構成がバラバラになる | ファイル規約（`routes/` `views/` `actions/` `islands/` `api/` `*.server.ts`） |
| Hono：RPC の型が重い、メソッドチェーンが必要 | 型付き API は関数ごとに型を閉じる。チェーンなし |
| Hono：ランタイムごとの差 | 同じアプリを Node / Bun / Deno / Workers で動かす確認を、テストとして持つ |
| 島どうしで状態を共有しにくい | `createStore()` |
| ページ移動で状態が消える | `persist` の島は消さずに移す。`useNav()` で URL の変化を知る |
| アプリっぽい画面に向かない | ③アプリ領域（大きな島 + RSC） |
| どこを島にするか迷う | 判断の順番を決めておく（[tutorial.md](tutorial.md)） |
| かけら方式は通信が多い、サーバーの負担が増える | GET なので CDN・ETag（304）・ビュー用キャッシュが効く |
| 更新の流れが追いにくい | 1回の更新 = 1回のリクエスト。全部 URL で Network タブに見える |
| ページの一部だけキャッシュしたい | ビューを別 URL にして、`<Include>` と `<Include client>` で組み立てる |

## 8. ほかのフレームワークとの比較

| | 読みこみ | 書きこみ | キャッシュ | RSC | 送る JS |
|---|---|---|---|---|---|
| **Seam** | loader（GET） | `'use server'` → 決まった URL に POST + 303 | HTTP だけ | オプション（データとして + slot） | 島の分だけ |
| Next.js | サーバーコンポーネント | Server Actions | 独自（`'use cache'` など） | 必須 | ページ全体のクライアント部品 |
| React Router v7 | loader | route action | HTTP + 再取得 | 対応中 | アプリ全体（SPA） |
| TanStack Start | loader + `createServerFn` | `createServerFn` | ルーター / Query | 対応（データとして） | アプリ全体 |
| Astro | `.astro` テンプレート | Actions | HTTP | なし | 島の分だけ |
| HonoX | Hono のハンドラー | Hono のハンドラー | HTTP | なし | 島の分だけ |

Seam の位置は、**「全部 React / TSX で書けて、React Router と同じ loader の考え方で、JS は島の分だけ」**です。

## 9. 今の状態とこれから

**できていること（MVP）**
- コア、ファイルベースルーティング、loader、`'use server'`（JS なしでも `useActionState` まで動く）
- アイランド、ナビゲーション用スクリプト（URL の通知、スクロールとフォーカス、読みこみ中の表示）
- ビュー（`<Include>` / `<Include client>`）とビュー用キャッシュ
- 型付き API
- RSC（オプション）：Flight での取得、slot、SSR（最初の HTML から表示し、取得しなおさずにハイドレーション）
- アダプター：Node / Bun / Deno / Cloudflare Workers（4つとも実際に動かして確認）
- `seam` コマンド、`create-seam`、配布用のビルド

**これから**
- npm の名前を決めて公開する（`seam` は npm で取られている）
- サーバーが一部だけを描く `X-Seam-Partial`
- RSC のビューの中での `<Include>` や `'use server'` の受け渡し
- Workers で RSC を使えるようにする
- ドキュメントのサイト
