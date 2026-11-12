# チュートリアル：Seam で Todo アプリを作る

このチュートリアルでは、Todo アプリを作りながら、Seam の機能を**使う順番どおり**に覚えます。
Seam では「まず HTML で作り、足りないときだけ JS を足す」のが基本です。

必要なもの：Node.js 22.12 以上

## 0. プロジェクトを作る

```sh
npm create seam@latest my-todos
cd my-todos
npm install
npm run dev
```

> まだ npm に公開していないので、今はこのリポジトリで `pnpm test:create` を実行すると、同じ流れを試せます。

できるフォルダはこれだけです。`vite.config.ts` はありません（`seam` コマンドの初期設定で動きます）。

```
app/
  routes/_layout.tsx    ページ全体の枠（<html>）
  routes/index.tsx      /（Todo の一覧）
  routes/about.tsx      /about
  actions/todos.ts      'use server'（書きこみ）
  islands/DoneToggle.tsx 'use client'（島）
  server/db.server.ts   サーバー専用（データベースの代わり）
```

---

## 1. データを見せる：ページと loader

`app/routes/` にファイルを置くと、そのまま URL になります。

| ファイル | URL |
|---|---|
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `todos/[id].tsx` | `/todos/:id` |
| `_layout.tsx` | そのフォルダのページを包む枠 |

データは `loader` で読みます。`loader` は GET のときにサーバーで動き、戻り値がコンポーネントの `data` になります。

```tsx
export async function loader() {
  return data({ todos: await db.list() }, { headers: { "Cache-Control": "private, max-age=0" } });
}

export default function Todos({ data }: PageProps<typeof loader>) {
  return <ul>{data.todos.map((t) => <li key={t.id}>{t.text}</li>)}</ul>;
}
```

- 入れ子のレイアウトの loader は、**同時に**動きます。
- キャッシュは `Cache-Control` で決めます。何も書かないと `private, no-cache`（安全な初期値）になります。
- このページは、ブラウザに React を送りません。

## 2. データを書きかえる：`'use server'` と `<form>`

```ts
// app/actions/todos.ts
"use server";
export async function addTodo(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Please write something." };
  await db.add(text);
}
```

```tsx
<form action={addTodo}>
  <input name="text" />
  <button>Add</button>
</form>
```

これだけで、次のように動きます。

1. JS なし：`POST /_action/<id>` → **303** → `GET /` → loader がもう一度動いて、新しい Todo が出る
2. JS あり：同じリクエストを fetch で送り、`<main>` だけを差しかえる（ページ全体を読み直さない）

エラーを返したときは、`getActionResult(addTodo)` で、次のページで受け取れます。

```tsx
export async function loader() {
  return data({ todos: await db.list(), result: getActionResult<{ error?: string }>(addTodo) });
}
```

`.seam/actions.gen.ts` を開くと、どの関数がどの URL になったかが分かります。

## 3. 動く部分だけ JS：アイランド

入力のたびに画面が変わる部分だけを、`'use client'` のファイルにします。

```tsx
// app/islands/DoneToggle.tsx
"use client";
import { useActionState } from "react";
import { toggleTodo } from "../actions/todos";

export function DoneToggle({ id, done }: { id: string; done: boolean }) {
  const [state, action, pending] = useActionState(toggleTodo, { done });
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button disabled={pending}>{state.done ? "✓" : "○"}</button>
    </form>
  );
}
```

- **島が知っているのは props だけ**です。props は JSON にできる値にしてください。
- 島の中の `<form>` も、JS なしで動きます（React の `useActionState` と Seam が連携します）。
- 島が1つでもあるページだけが React を読みこみます。

島どうしで状態を共有したいときは `createStore()`、ページを移動しても島を残したいときは `export const persist = true` を使います（`seam/client`）。

## 4. ページの一部だけキャッシュする：ビュー

ページの中に「みんなに同じ部分」と「ユーザーごとの部分」があるときは、その部分を**ビュー**にします。ビューは自分の URL と Cache-Control を持つ、ページのかけらです。

```tsx
// app/views/stats.tsx → GET /_v/stats
export async function loader() {
  return data({ count: (await db.list()).length }, { headers: { "Cache-Control": "public, s-maxage=300" } });
}
export default function Stats({ data }: ViewProps<typeof loader>) {
  return <p>{data.count} todos</p>;
}
```

```tsx
<Include src={`/_v/stats?v=${version}`} />                      {/* サーバーで組みこむ */}
<Include src="/_v/me" client fallback={<span>…</span>} />     {/* ブラウザで読む */}
```

- サーバーで組みこむと、ビューの Cache-Control がページに合成されます（一番きびしいものが勝つ）。
- ユーザーごとの部分を `client` にすると、ページは CDN にキャッシュできるまま（`public`）です。
- キャッシュを消すためのタグはありません。データが変わったら、URL（`?v=...`）を変えます。

## 5. 島からデータを読む：型付き API

```ts
// app/api/todos.api.ts
import { get } from "seam/api";
import { z } from "zod";

export const searchTodos = get("/api/todos", {
  query: z.object({ q: z.string().default("") }),
  handler: async ({ query }) => (await db.list()).filter((t) => t.text.includes(query.q)),
});
```

```tsx
// 島の中：GET /api/todos?q=... を fetch するだけ。戻り値の型は handler から決まる
const results = await searchTodos({ query: { q } });
```

## 6. 島の中にサーバーの UI を入れる：RSC（オプション）

`vite.config.ts` で `seam({ rsc: true })` にすると、ビューを RSC のデータとしても取れます。

```tsx
// ビュー（サーバーコンポーネント）：穴をあける
<Slot name="actions" props={{ id }} />

// 島：サーバーの UI を取ってきて、穴に自分の部品を入れる
<RscView src={`/_v/todos/${id}/card.rsc`} slots={{ actions: MyButtons }} />
```

最初の HTML からカードが表示され、ブラウザはもう一度取得せずにハイドレーションします。

---

## どれを使うか迷ったら

上から順に考えて、足りないときだけ下に進みます。

| やりたいこと | 使うもの | 送る JS |
|---|---|---|
| データを見せる | ページ + `loader` | なし |
| データを書きかえる | `<form action={fn}>` + `'use server'` | なし（あれば上乗せ） |
| 入力のたびに画面が変わる | 島（`'use client'`） | React + その部品 |
| ページの一部だけキャッシュしたい | ビュー + `<Include>` | なし |
| ユーザーごとの部分があるが、ページは CDN に置きたい | `<Include client>` | 少し |
| 島からデータを読む | 型付き API（`*.api.ts`） | fetch だけ |
| 島の中にサーバーの UI を入れたい | RSC（`<RscView>` + `<Slot>`） | +7KB |

## 本番で動かす

```sh
npm run build
npm start          # NODE_ENV=production で起動する
```

ほかの場所で動かすときは、`vite.config.ts` を作ってアダプターを選びます。

```ts
import { defineConfig } from "vite";
import seam from "seam/vite";
export default defineConfig({ plugins: [seam({ adapter: "bun" })] }); // "node" | "bun" | "deno" | "cloudflare"
```

| adapter | 起動のしかた |
|---|---|
| `node`（初期値） | `npm start` |
| `bun` | `NODE_ENV=production bun dist/server/server.js` |
| `deno` | `NODE_ENV=production deno run -A dist/server/server.js` |
| `cloudflare` | wrangler（`main = dist/server/server.js`、`assets = dist/client`、`nodejs_compat`） |
