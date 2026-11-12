# Tutorial: build a todo app with Seam

Build a todo app and learn Seam's features **in the order you would reach for them**.
The basic idea in Seam: build with HTML first, and add JavaScript only where it is missing.

You need Node.js 22.12 or later.

## 0. Create the project

```sh
npm create seam@latest my-todos
cd my-todos
npm install
npm run dev
```

> Seam is not published to npm yet. For now, `pnpm test:create` in this repository runs the same flow.

This is all you get. There is no `vite.config.ts`; the `seam` command's defaults are enough.

```
app/
  routes/_layout.tsx      the frame of every page (<html>)
  routes/index.tsx        / (the todo list)
  routes/about.tsx        /about
  actions/todos.ts        'use server' (writes)
  islands/DoneToggle.tsx  'use client' (an island)
  server/db.server.ts     server only (stands in for a database)
```

---

## 1. Show data: pages and loaders

Put a file in `app/routes/` and it becomes a URL.

| File | URL |
|---|---|
| `index.tsx` | `/` |
| `about.tsx` | `/about` |
| `todos/[id].tsx` | `/todos/:id` |
| `_layout.tsx` | A frame around the pages in its folder |

Read data in a `loader`. It runs on the server for GET requests, and what it returns becomes the component's `data`.

```tsx
export async function loader() {
  return data({ todos: await db.list() }, { headers: { "Cache-Control": "private, max-age=0" } });
}

export default function Todos({ data }: PageProps<typeof loader>) {
  return <ul>{data.todos.map((t) => <li key={t.id}>{t.text}</li>)}</ul>;
}
```

- Loaders of nested layouts run **at the same time**.
- `Cache-Control` decides caching. Without it you get `private, no-cache` (a safe default).
- This page sends no React to the browser.

## 2. Change data: `'use server'` and `<form>`

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

That is all it takes:

1. Without JavaScript: `POST /_action/<id>` → **303** → `GET /` → the loader runs again and shows the new todo
2. With JavaScript: the same request goes through fetch and only `<main>` is swapped (no full page reload)

When the action returns an error, read it on the next page with `getActionResult(addTodo)`:

```tsx
export async function loader() {
  return data({ todos: await db.list(), result: getActionResult<{ error?: string }>(addTodo) });
}
```

Open `.seam/actions.gen.ts` to see which function became which URL.

## 3. JavaScript only where it moves: islands

Put only the parts that change on every interaction into `'use client'` files.

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

- **Islands know only their props.** Props must be JSON values.
- A `<form>` inside an island works without JavaScript too (React's `useActionState` and Seam work together).
- Only pages with at least one island load React.

To share state between islands, use `createStore()`. To keep an island alive across navigations, use `export const persist = true` (both from `seam/client`).

## 4. Cache part of a page: views

When a page mixes "the same for everyone" with "different per user", make those parts **views**. A view is a fragment of a page with its own URL and its own Cache-Control.

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
<Include src={`/_v/stats?v=${version}`} />                      {/* assembled on the server */}
<Include src="/_v/me" client fallback={<span>…</span>} />     {/* loaded by the browser */}
```

- Assembled on the server, the view's Cache-Control is merged into the page's (the strictest wins).
- Make per-user parts `client`, and the page stays cacheable on a CDN (`public`).
- There are no cache tags. When data changes, change the URL (`?v=...`).

## 5. Read data from an island: the typed API

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
// In an island: just fetches GET /api/todos?q=...; the return type comes from the handler
const results = await searchTodos({ query: { q } });
```

## 6. Put server UI inside an island: RSC (optional)

With `seam({ rsc: true })` in `vite.config.ts`, views can also be fetched as RSC data.

```tsx
// The view (a Server Component) leaves a hole
<Slot name="actions" props={{ id }} />

// The island fetches the server UI and fills the hole with its own component
<RscView src={`/_v/todos/${id}/card.rsc`} slots={{ actions: MyButtons }} />
```

The card is in the first HTML, and the browser hydrates it without fetching again.

---

## When in doubt

Go down this list and move on only when the current step is not enough.

| You want to | Use | JavaScript sent |
|---|---|---|
| Show data | A page + `loader` | None |
| Change data | `<form action={fn}>` + `'use server'` | None (enhanced when available) |
| React to every keystroke | An island (`'use client'`) | React + the component |
| Cache part of a page | A view + `<Include>` | None |
| Keep the page on a CDN despite per-user parts | `<Include client>` | A little |
| Read data from an island | The typed API (`*.api.ts`) | Just fetch |
| Put server UI inside an island | RSC (`<RscView>` + `<Slot>`) | +7 KB |

## Running in production

```sh
npm run build
npm start          # starts with NODE_ENV=production
```

To run somewhere else, add a `vite.config.ts` and choose an adapter:

```ts
import { defineConfig } from "vite";
import seam from "seam/vite";
export default defineConfig({ plugins: [seam({ adapter: "bun" })] }); // "node" | "bun" | "deno" | "cloudflare"
```

| adapter | How to run it |
|---|---|
| `node` (default) | `npm start` |
| `bun` | `NODE_ENV=production bun dist/server/server.js` |
| `deno` | `NODE_ENV=production deno run -A dist/server/server.js` |
| `cloudflare` | wrangler (`main = dist/server/server.js`, `assets = dist/client`, `nodejs_compat`) |
