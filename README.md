# Seam

Web 標準ベースの React フルスタックフレームワークの MVP です。

Seam は「縫い目」という意味です。サーバーとクライアントの境界をなくさず、**見える形のまま、きれいにつなぐ**ことを目指しています。

> ページはただの HTML。React は「動く部分」（アイランド）にだけ、その部分の props と一緒に届ける。

- コアは `(Request) => Promise<Response>` の1つの関数
- 読みこみは loader（GET）、書きこみは `'use server'`（`POST /_action/<id>` → 303 → GET）
- キャッシュはフレームワークが持たず、HTTP の `Cache-Control` / `ETag` にまかせる
- アイランドがないページは React を読みこまない（ナビゲーション用スクリプト 約 3KB gzip だけ）
- ページの一部だけキャッシュしたいときは、その部分を**ビュー**（自分の URL と Cache-Control を持つかけら）にする
- 読みこみ用の**型付き API**（GET だけ）。型は関数1つごとに閉じていて、アプリ全体の型は作らない
- **RSC はオプション**。ビューを RSC のデータとして取得し、島の中で `<Slot>` に部品を差しこんで組み立てる（SSR 対応）
- Node.js / Bun / Deno / Cloudflare Workers で、同じアプリが動く

ドキュメント：

- [docs/tutorial.md](docs/tutorial.md) … 使う人向けのチュートリアル（Todo アプリ）
- [docs/vision.md](docs/vision.md) … 作りたいもの（設計の原則、やらないこと、比較）
- [docs/original-prompt.md](docs/original-prompt.md) … 最初のプロンプト（原文）

## アプリを作る

```sh
npm create seam@latest my-app   # まだ未公開。今は下の pnpm test:create で同じ流れを試せる
cd my-app && npm install && npm run dev
```

`seam` コマンド：

| コマンド | すること |
|---|---|
| `seam dev` | 開発サーバー |
| `seam build` | 本番ビルド（`dist/client`、`dist/server`、RSC があれば `dist/rsc`） |
| `seam start` | 本番サーバー（必ず `NODE_ENV=production`） |

`vite.config.ts` がなければ `seam()` だけの設定で動きます。オプションを変えたいときだけ作ります。

```ts
seam({
  adapter: "node",        // "node" | "bun" | "deno" | "cloudflare"
  viewCache: "memory",    // "none" | "memory" | "cache-storage"
  rsc: true,              // RSC を使う（@vitejs/plugin-rsc と react-server-dom-webpack が必要）
})
```

## このリポジトリでの開発

Node.js 22.12 以上が必要です（Vite 8 の条件）。このリポジトリでは Node 24.22.3 に固定しています（`package.json` の `volta` と、`pnpm-workspace.yaml` の `useNodeVersion`）。

```sh
pnpm install
pnpm build           # packages/seam を dist/ にコンパイル（サンプルは dist を使う）
pnpm test            # 単体・結合テスト（vitest）
pnpm typecheck       # 本体（ソース）と、サンプル（配布する dist の型）の両方
pnpm example:dev     # 開発サーバー（examples/invoices）
pnpm example:build   # 本番ビルド
pnpm example:start   # seam start
pnpm e2e             # 本番ビルド + Chrome で E2E（JS あり / なし）
pnpm test:create     # 公開用 tgz → create-seam → npm install → build → start を、リポジトリの外で確認
pnpm test:adapters   # 同じアプリを Node / Bun / Deno / Workers（Miniflare）で動かして確認
```

## フォルダ

```
packages/seam/src/
  core/        app.ts（createApp）, router.ts（トライ木）, action.ts, cache-control.ts, flash.ts, context.ts,
               include.ts（<Include> のサブリクエスト）, view-cache.ts
  react/       render.tsx（ページとビューの SSR）, include.tsx（<Include>）
  api/         server.ts（get()：型付き GET API）, standard-schema.ts
  rsc/         server.ts（rsc 環境でビューを Flight にする）, bridge.ts（ssr → rsc）, client.tsx（<RscView>）, slot.tsx（<Slot>）
  runtime/     server.ts（'use server' のサーバー側）, client.ts（ブラウザ側の参照）, island.tsx（'use client' のサーバー側）,
               api-client.ts（*.api.ts のブラウザ側）, api-shared.ts
  client/      entry.ts, nav.ts（ナビゲーション用スクリプト）, views.ts（<Include client> の読み込み）,
               islands.ts（ハイドレーション）, index.ts（useNav, createStore）
  adapters/    node.ts, bun.ts, deno.ts, cloudflare.ts, static.ts
  vite/        plugin.ts, scan.ts
  cli.ts       seam コマンド
packages/seam/types.d.ts   使う側の型（tsconfig の types に "seam/types"）
packages/create-seam/      npm create seam（template/ が Todo アプリのひな形）
examples/invoices/         請求書アプリ（全機能の動作確認用）
scripts/e2e.mjs            Chrome での E2E
scripts/create-check.mjs   外で一から作る確認
scripts/adapters-check.mjs 4つのランタイムでの確認
docs/                      チュートリアル、設計、最初のプロンプト
```

## アプリの書き方（ファイル規約）

```
app/routes/_layout.tsx     レイアウト（children で中のルートを受け取る）
app/routes/index.tsx       /
app/routes/about.tsx       /about
app/routes/invoices/[id].tsx   /invoices/:id
app/routes/docs/[...path].tsx  /docs/*
app/views/invoices/summary.tsx  /_v/invoices/summary（ビュー。_layout は使えない）
app/actions/*.ts           'use server'
app/api/*.api.ts           型付き GET API（`get("/api/...", {...})`）
app/islands/*.tsx          'use client'
**/*.server.ts             サーバー専用（アイランドから import するとビルドエラー）
```

ビルドすると `.seam/` に、ビルドが決めた内容がそのまま読める形で書き出されます。

- `.seam/routes.gen.ts` … ルートのトライ木
- `.seam/views.gen.ts` … ビューのトライ木（`/_v/` の下）
- `.seam/api.gen.ts` … 型付き API の URL の一覧
- `.seam/actions.gen.ts` … action の ID と URL の一覧
- `.seam/islands.gen.ts` … ブラウザに送られるファイルの一覧

## ビュー（ページの一部だけキャッシュする）

ビューは「自分の URL と Cache-Control を持つ、ページのかけら」です。ファイルの形はルートと同じで（`loader` + コンポーネント）、`GET /_v/...` で HTML のかけらを返します。

```tsx
// app/views/invoices/summary.tsx → GET /_v/invoices/summary
export async function loader() {
  return data({ count: 3 }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=300" } });
}
export default function Summary({ data }: ViewProps<typeof loader>) {
  return <p>{data.count} invoices</p>;
}
```

ページへの組みこみ方は2つです。

| 書き方 | どこで組み立てるか | ページの Cache-Control | 向いているもの |
|---|---|---|---|
| `<Include src="/_v/...?v=..." />` | サーバー（ページの HTML に入る） | ビューの分も合成される（一番きびしいものが勝つ） | みんなに同じ内容 |
| `<Include src="/_v/me" client fallback={…} />` | ブラウザ（あとから fetch） | 影響しない | ユーザーごとの内容 |

ルールは次のとおりです。

- **消すためのタグはありません。** データが変わったら URL を変えます（`?v=<更新日時>`）。古い URL のキャッシュは、もう使われなくなります。
- `public` なページに `private` なビューをサーバーで組みこむと、ページも `private` になります。開発中は、そのことを警告で教えます（`<Include client>` を使えば、ページは `public` のままです）。
- `<Suspense>` の中の `<Include>` が、すでに送ったヘッダーよりきびしいと分かったときは、エラーを出します（ヘッダーは送ったあとで変えられないため）。
- `<Include>` を使ったページには、ETag を付けません（ビューは自分のバージョンを持つため）。
- action のあと（フォーム送信、島からの呼び出し）は、ブラウザ側のビューを `cache: "no-cache"` で取り直します。
- ビュー用の共有キャッシュは、プラグインの `viewCache` で選びます：`"none"`（初期値）/ `"memory"`（1台のサーバー内）/ `"cache-storage"`（Workers・Deno。未テスト）。保存するのは、`public` で、有効期間があり、`Set-Cookie` のない応答だけです。
- JS なしのときは、`<Include client>` は `fallback` だけが表示されます。

## 型付き API（読みこみ専用）

`*.api.ts` に、GET のエンドポイントを関数として書きます。書きこみは `'use server'` を使います。

```ts
// app/api/invoices.api.ts
import { get } from "seam/api";
import { z } from "zod";

export const searchInvoices = get("/api/invoices", {
  query: z.object({ q: z.string().default("") }),        // Standard Schema なら何でもよい（Zod / Valibot / ArkType…）
  headers: { "Cache-Control": "private, max-age=0" },
  handler: async ({ query }) => db.search(query.q),       // JSON / data(value, { headers, etag }) / Response を返す
});
```

```tsx
// 島（ブラウザ）：GET /api/invoices?q=... を fetch するだけ。戻り値の型は handler から決まる
const results = await searchInvoices({ query: { q } });

// loader（サーバー）：HTTP を通さず、handler を直接呼ぶ
const results = await searchInvoices();
```

- **型は関数ごとに閉じています。** アプリ全体の型の木も、メソッドチェーンもないので、API が増えても型チェックが重くなりにくいです（Hono RPC の弱点への答え）。
- パスはソースに文字列で書きます。ビルドは、ソースを実行せずに読むだけで URL を決めます（`.seam/api.gen.ts` で確認できます）。
- クエリの検証に失敗すると、`400 { error, issues }` を返します。クエリの値は文字列で届くので、数値には `z.coerce.number()` のような変換を使います。
- ブラウザ側で失敗すると `ApiError`（`seam/client`）を投げます。`status` と `body` を持っています。
- ルールは、`/api/` で始まること、GET だけであること（POST は 405）です。同じ形のパス（`/api/a/:id` と `/api/a/:slug`）はビルドエラーになります。
- 戻り値は JSON を通るので、`Date` などは文字列になります。サーバーで直接呼んだときとは型の実体がずれることがあるので、JSON にできる値だけを返してください。
- 自分で書かずに、Hono のアプリを `createApp({ mount: { "/api": hono.fetch } })` で取り付けることもできます。

## RSC（オプション）：サーバーコンポーネントを「データ」として使う

`seam({ rsc: true })` にすると、ビューを **RSC（Flight）でも**取得できるようになります。`@vitejs/plugin-rsc` と `react-server-dom-webpack@19.3.1` が必要です。

```
GET /_v/invoices/1/card       → HTML のかけら（今までどおり）
GET /_v/invoices/1/card.rsc   → 同じビューを RSC のデータで（rsc 環境で描く）
```

```tsx
// app/views/invoices/[id]/card.tsx（サーバーコンポーネント。ファイルは HTML 版と同じ）
import { Slot } from "seam/slot";
export default function InvoiceCard({ data }) {
  return (
    <article>
      <h2>{data.invoice.title}</h2>
      {/* 穴。中身はブラウザ（島）が決める。props はサーバーから届く */}
      <Slot name="actions" props={{ id: data.invoice.id, status: data.invoice.status }} />
    </article>
  );
}
```

```tsx
// 島（ブラウザ）：木の持ち主は島。サーバーの UI は「取得したデータ」として木の一部になる
import { RscView } from "seam/rsc";
<RscView src={`/_v/invoices/${id}/card.rsc`} slots={{ actions: CardActions }} fallback={<p>Loading…</p>} />
```

- RSC のビューは、HTML のビューと同じように扱えます。普通の GET なので、Cache-Control・ETag・ビュー用キャッシュがそのまま使えます。
- action のあと（フォーム送信、島からの呼び出し）は、`<RscView>` も取り直します。新しい内容が届くまでは、古い表示のままです。
- Flight を読むしくみ（約 7KB gzip）は、`<RscView>` を使う島があるページだけが読みこみます。
- `'use server'` は、RSC を使っても Seam のしくみ（`POST /_action/<id>`）のままです。Seam の変換を plugin-rsc より先に動かしているからです。
- 今の制限
  - SSR では、島の中の `<RscView>` もサーバーで描きます（`<Include>` と同じサブリクエスト。Cache-Control もページに合成）。使った Flight を島に添えて送るので、ブラウザはもう一度取得せずにハイドレーションします。
  - RSC のビューの中では、`<Include>` は使えません。また、`'use server'` の関数をクライアントに渡すこともできません。渡したいときは、`<Slot>` に島側の部品を差しこみ、そこから呼んでください。
  - plugin-rsc の実験的なオプション（`customClientEntry`）を使っています。plugin-rsc を上げるときは、`pnpm e2e` で確かめてください。

## 公開 API

| サーバー（`seam`） | クライアント（`seam/client`） |
|---|---|
| `loader` / `default` / `ErrorBoundary`（ルートの export） | `export const hydrate = "load" \| "idle" \| "visible"`（アイランド） |
| `data(value, { headers, etag })` | `export const persist = true`（アイランド） |
| `redirect(url)` | `useNav()` → `{ url, pending }` |
| `getContext()` | `createStore(initial)` |
| `getActionResult(action)` | |
| `<Include src client? fallback?>` | |
| `get(path, { query, headers, handler })`（`seam/api`） | `ApiError` |
| `<Slot name props>`（`seam/slot`。RSC のビューの中で使う） | `<RscView src slots fallback>`（`seam/rsc`） |
| `formProps(action)`（逃げ道） | |
| `memoryViewCache()` / `cacheStorageViewCache()` | |
| `createApp({ routes, views, actions, api, render, viewCache, mount })` | |

## ビルド時の変換（全部で4つ。`rsc: true` のときは plugin-rsc の変換も加わる）

1. **`'use server'`**
   - ブラウザ側：`export const f = createServerReference("<id>")` に置きかえる（中身は fetch するだけ）
   - サーバー側：書いたままのコードに `registerServerReference(f, "<id>")` を足す
2. **`'use client'`**
   - サーバー側：`createIsland(...)` で包み、`<seam-island>` として描く
   - ブラウザ側：そのまま
3. **`*.api.ts`**
   - ブラウザ側：`export const f = createApiReference("/api/...")` に置きかえる（中身は fetch するだけ）
   - サーバー側：そのまま
4. **ガード**：`*.server.*` や `server-only` が、ブラウザ用のバンドルに入ったらビルドエラー

## 確認済みのこと

- `vitest`：75件（ルーター、Cache-Control の合成、action、SSR、`$$FORM_ACTION`、JS なしの `useActionState`、Node アダプター、ガード、ビューと `<Include>`、型付き API と型の推論、RSC への振り分け、`<Slot>`）
- Chrome での E2E：20件（JS なしのフォーム、島の JS なし動作、React を読まないページ、`<main>` の差しかえ、`persist` の島、スクロールとフォーカス、戻る、`aria-busy`、ビュー、型付き API、RSC と slot と RSC の SSR、コンソールエラーなし）
- 公開用の tgz から `create-seam` で作ったアプリが、リポジトリの外で `npm install` → build → start で動く（`pnpm test:create`）
- 同じアプリが Node 24 / Bun 1.4.4 / Deno 2.9.6 / Cloudflare Workers（Miniflare = workerd）で動く（`pnpm test:adapters`）
- 開発サーバー（`vite`）でも、RSC の取得・slot・action のあとの取り直しを確認
- 開発サーバー（`vite`）での SSR、action、島のハイドレーション

## 注意点・未確認のこと

- **React の内部の仕組みに頼っています。** `$$FORM_ACTION` / `$$IS_SIGNATURE_EQUAL` / `formState` は、react-dom@19.3.1 のソースで動きを確認しました。ただし公開 API ではありません。そのため React は `19.3.1` に固定しています（peerDependencies も同じ）。上げるときは `pnpm test` で確かめてください。壊れたときの逃げ道は `formProps()` です。
- **本番では `NODE_ENV=production` で起動してください。** 指定しないと React の開発用ビルドが動き、遅くなるうえ、RSC の応答にファイルパスなどのデバッグ情報が入ります（Node アダプターは警告を出します）。
- **Cloudflare Workers** では、`getContext()` のために `nodejs_compat` が必要です。Workers で RSC を使う構成（`adapter: "cloudflare"` + `rsc: true`）はまだ対応していません。
- **npm には未公開です。** パッケージ名の `seam` は npm ですでに使われているので、公開するときはスコープ付きの名前（例：`@seamjs/core`）にする必要があります。
- **ナビゲーション用スクリプトは Navigation API が前提**です。対応していないブラウザでは何もせず、普通のページ移動になります。
- **アイランドの制限**
  - props は JSON にできる値だけです。
  - アイランドは別々の React ルートとして描くので、中の `<Suspense>` は全部そろってから HTML に入ります（ストリーミングされません）。
- **ナビゲーション用スクリプトのリクエスト（`X-Seam-Nav: 1`）は、Suspense を全部待ってから返します**（DOMParser では React のストリーミング用 `<script>` が動かないため）。
- まだ作っていないもの：サーバーが一部だけを描く `X-Seam-Partial`、RSC のビューの中での `<Include>` と `'use server'` の受け渡し。
