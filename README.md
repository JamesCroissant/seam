# Seam

An MVP of a web-standard, full-stack React framework.

A seam is where two pieces of fabric are joined. Seam keeps the boundary between server and client instead of hiding it: **the join stays visible, and it holds well.**

> Pages are plain HTML. React only ships for the parts that move (islands), together with their props.

- The core is one function: `(Request) => Promise<Response>`
- Reads go through loaders (GET); writes go through `'use server'` (`POST /_action/<id>` → 303 → GET)
- The framework keeps no cache of its own; HTTP `Cache-Control` and `ETag` do the job
- A page without islands loads no React — only a navigation script of about 3 KB gzipped
- To cache part of a page on its own terms, make that part a **view**: a fragment with its own URL and its own Cache-Control
- A **typed API** for reads (GET only). Types stay per function; there is no app-wide type
- **RSC is optional**: fetch a view as RSC data and compose it inside an island, plugging components into `<Slot>`s (server-rendered too)
- The same app runs on Node.js, Bun, Deno and Cloudflare Workers

Documentation:

- [docs/tutorial.md](docs/tutorial.md) — tutorial for app developers (a todo app)
- [docs/vision.md](docs/vision.md) — what Seam is aiming for: principles, non-goals, comparison
- [docs/original-prompt.md](docs/original-prompt.md) — the prompt the project started from

## Create an app

```sh
npm create seam@latest my-app   # not published yet; `pnpm test:create` below runs the same flow
cd my-app && npm install && npm run dev
```

The `seam` command:

| Command | What it does |
|---|---|
| `seam dev` | Development server |
| `seam build` | Production build (`dist/client`, `dist/server`, and `dist/rsc` when RSC is on) |
| `seam start` | Production server (always with `NODE_ENV=production`) |

Without a `vite.config.ts`, the config is just `seam()`. Add one only to change options:

```ts
seam({
  adapter: "node",        // "node" | "bun" | "deno" | "cloudflare"
  viewCache: "memory",    // "none" | "memory" | "cache-storage"
  rsc: true,              // use RSC (needs @vitejs/plugin-rsc and react-server-dom-webpack)
})
```

## Working on this repository

Node.js 22.12 or later is required (Vite 8). This repository pins Node 24.22.3 (`volta` in `package.json`, `useNodeVersion` in `pnpm-workspace.yaml`).

```sh
pnpm install
pnpm build           # compile packages/seam to dist/ (the example uses dist)
pnpm test            # unit and integration tests (vitest)
pnpm typecheck       # the framework source and the example (against the published dist types)
pnpm example:dev     # dev server (examples/invoices)
pnpm example:build   # production build
pnpm example:start   # seam start
pnpm e2e             # production build + E2E in Chrome, with and without JavaScript
pnpm test:create     # packed tgz → create-seam → npm install → build → start, outside the repo
pnpm test:adapters   # run the same app on Node / Bun / Deno / Workers (Miniflare)
```

## Layout

```
packages/seam/src/
  core/        app.ts (createApp), router.ts (trie), action.ts, cache-control.ts, flash.ts, context.ts,
               include.ts (sub-requests for <Include>), view-cache.ts
  react/       render.tsx (SSR for pages and views), include.tsx (<Include>)
  api/         server.ts (get(): typed GET API), standard-schema.ts
  rsc/         server.ts (renders views to Flight in the rsc environment), bridge.ts (ssr → rsc),
               client.tsx (<RscView>), slot.tsx (<Slot>)
  runtime/     server.ts (server side of 'use server'), client.ts (browser-side references),
               island.tsx (server side of 'use client'), api-client.ts (browser side of *.api.ts), api-shared.ts
  client/      entry.ts, nav.ts (navigation script), views.ts (loads <Include client>),
               islands.ts (hydration), index.ts (useNav, createStore)
  adapters/    node.ts, bun.ts, deno.ts, cloudflare.ts, static.ts
  vite/        plugin.ts, scan.ts
  cli.ts       the seam command
packages/seam/types.d.ts   types for apps ("seam/types" in tsconfig types)
packages/create-seam/      npm create seam (template/ is a todo app)
examples/invoices/         invoice app that exercises every feature
scripts/e2e.mjs            E2E in Chrome
scripts/create-check.mjs   creates an app from scratch outside the repo
scripts/adapters-check.mjs runs on four runtimes
docs/                      tutorial, design, the original prompt
```

## Writing an app (file conventions)

```
app/routes/_layout.tsx          layout (receives the inner route as children)
app/routes/index.tsx            /
app/routes/about.tsx            /about
app/routes/invoices/[id].tsx    /invoices/:id
app/routes/docs/[...path].tsx   /docs/*
app/views/invoices/summary.tsx  /_v/invoices/summary (a view; no _layout here)
app/actions/*.ts                'use server'
app/api/*.api.ts                typed GET API (`get("/api/...", {...})`)
app/islands/*.tsx               'use client'
**/*.server.ts                  server only (importing it from an island fails the build)
```

A build writes what it decided into `.seam/`, in readable form:

- `.seam/routes.gen.ts` — the route trie
- `.seam/views.gen.ts` — the view trie (under `/_v/`)
- `.seam/api.gen.ts` — typed API URLs
- `.seam/actions.gen.ts` — action IDs and URLs
- `.seam/islands.gen.ts` — the files sent to the browser

## Views (caching part of a page)

A view is a fragment of a page with its own URL and its own Cache-Control. It looks like a route (`loader` + component) and `GET /_v/...` returns an HTML fragment.

```tsx
// app/views/invoices/summary.tsx → GET /_v/invoices/summary
export async function loader() {
  return data({ count: 3 }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=300" } });
}
export default function Summary({ data }: ViewProps<typeof loader>) {
  return <p>{data.count} invoices</p>;
}
```

There are two ways to put a view into a page:

| Syntax | Assembled | Page Cache-Control | Good for |
|---|---|---|---|
| `<Include src="/_v/...?v=..." />` | On the server (part of the page HTML) | Merged with the view's (the strictest wins) | Content that is the same for everyone |
| `<Include src="/_v/me" client fallback={…} />` | In the browser (fetched afterwards) | Unaffected | Per-user content |

Rules:

- **No cache tags.** When the data changes, change the URL (`?v=<updatedAt>`). The old URL's cache entry is simply never used again.
- Including a `private` view on the server in a `public` page makes the page `private`. In development Seam warns about it (with `<Include client>` the page stays `public`).
- If an `<Include>` inside `<Suspense>` turns out stricter than the headers already sent, Seam logs an error (headers cannot change once sent).
- Pages that use `<Include>` get no ETag (views carry their own versions).
- After an action (form submit or a call from an island), client views are fetched again with `cache: "no-cache"`.
- Pick the shared view cache with the plugin's `viewCache` option: `"none"` (default), `"memory"` (in one server process) or `"cache-storage"` (Workers, Deno; not tested yet). Only `public` responses with a lifetime and no `Set-Cookie` are stored.
- Without JavaScript, `<Include client>` shows only its `fallback`.

## Typed API (reads only)

Write GET endpoints as functions in `*.api.ts`. Writes use `'use server'`.

```ts
// app/api/invoices.api.ts
import { get } from "seam/api";
import { z } from "zod";

export const searchInvoices = get("/api/invoices", {
  query: z.object({ q: z.string().default("") }),        // any Standard Schema (Zod, Valibot, ArkType, ...)
  headers: { "Cache-Control": "private, max-age=0" },
  handler: async ({ query }) => db.search(query.q),       // return JSON, data(value, { headers, etag }) or a Response
});
```

```tsx
// In an island (browser): just fetches GET /api/invoices?q=...; the return type comes from the handler
const results = await searchInvoices({ query: { q } });

// In a loader (server): calls the handler directly, no HTTP
const results = await searchInvoices();
```

- **Types stay per function.** There is no app-wide type tree and no method chain, so type checking stays fast as the API grows (Seam's answer to the weak spot of Hono RPC).
- Paths are string literals in the source. The build reads the source without running it to decide URLs (see `.seam/api.gen.ts`).
- A failed query validation returns `400 { error, issues }`. Query values arrive as strings, so use conversions such as `z.coerce.number()` for numbers.
- In the browser, failures throw an `ApiError` (`seam/client`) with `status` and `body`.
- Paths must start with `/api/`, and endpoints are GET only (POST gets 405). Paths with the same shape (`/api/a/:id` and `/api/a/:slug`) fail the build.
- Results travel as JSON, so a `Date` becomes a string. A direct server-side call does not go through JSON, so return JSON-compatible values only.
- You can also mount a Hono app instead: `createApp({ mount: { "/api": hono.fetch } })`.

## RSC (optional): Server Components as data

With `seam({ rsc: true })`, views can **also** be fetched as RSC (Flight). This needs `@vitejs/plugin-rsc` and `react-server-dom-webpack@19.3.1`.

```
GET /_v/invoices/1/card       → HTML fragment (as before)
GET /_v/invoices/1/card.rsc   → the same view as RSC data (rendered in the rsc environment)
```

```tsx
// app/views/invoices/[id]/card.tsx (a Server Component; the same file as the HTML version)
import { Slot } from "seam/slot";
export default function InvoiceCard({ data }) {
  return (
    <article>
      <h2>{data.invoice.title}</h2>
      {/* A hole. The browser (the island) decides what goes in; the props come from the server. */}
      <Slot name="actions" props={{ id: data.invoice.id, status: data.invoice.status }} />
    </article>
  );
}
```

```tsx
// In an island (browser): the island owns the tree; the server UI becomes part of it as fetched data
import { RscView } from "seam/rsc";
<RscView src={`/_v/invoices/${id}/card.rsc`} slots={{ actions: CardActions }} fallback={<p>Loading…</p>} />
```

- RSC views behave like HTML views. They are plain GETs, so Cache-Control, ETag and the view cache all apply.
- After an action (form submit or a call from an island), `<RscView>` fetches again. The old content stays on screen until the new one arrives.
- The Flight decoder (about 7 KB gzipped) is loaded only on pages with an island that uses `<RscView>`.
- `'use server'` keeps Seam's protocol (`POST /_action/<id>`) even with RSC, because Seam's transform runs before plugin-rsc's.
- SSR renders `<RscView>` inside islands on the server too (a sub-request, like `<Include>`; its Cache-Control is merged into the page). The Flight text travels with the island, so the browser hydrates without fetching again.
- Current limits
  - `<Include>` does not work inside RSC views, and `'use server'` functions cannot be passed to the client from them. Plug an island component into a `<Slot>` and call the action from there.
  - Seam uses an experimental plugin-rsc option (`customClientEntry`). Run `pnpm e2e` when upgrading plugin-rsc.

## Public API

| Server (`seam`) | Client (`seam/client`) |
|---|---|
| `loader` / `default` / `ErrorBoundary` (route exports) | `export const hydrate = "load" \| "idle" \| "visible"` (islands) |
| `data(value, { headers, etag })` | `export const persist = true` (islands) |
| `redirect(url)` | `useNav()` → `{ url, pending }` |
| `getContext()` | `createStore(initial)` |
| `getActionResult(action)` | |
| `<Include src client? fallback?>` | |
| `get(path, { query, headers, handler })` (`seam/api`) | `ApiError` |
| `<Slot name props>` (`seam/slot`, inside RSC views) | `<RscView src slots fallback>` (`seam/rsc`) |
| `formProps(action)` (escape hatch) | |
| `memoryViewCache()` / `cacheStorageViewCache()` | |
| `createApp({ routes, views, actions, api, render, viewCache, mount })` | |

## Build-time transforms (four; plugin-rsc adds its own when `rsc: true`)

1. **`'use server'`**
   - Browser: replaced by `export const f = createServerReference("<id>")` (just a fetch)
   - Server: the code as written, plus `registerServerReference(f, "<id>")`
2. **`'use client'`**
   - Server: wrapped with `createIsland(...)` and rendered as `<seam-island>`
   - Browser: unchanged
3. **`*.api.ts`**
   - Browser: replaced by `export const f = createApiReference("/api/...")` (just a fetch)
   - Server: unchanged
4. **Guard**: `*.server.*` or `server-only` in the browser bundle fails the build

## Verified

- `vitest`: 75 tests (router, Cache-Control merging, actions, SSR, `$$FORM_ACTION`, `useActionState` without JavaScript, the Node adapter, the guard, views and `<Include>`, the typed API and its type inference, RSC routing, `<Slot>`)
- E2E in Chrome: 20 checks (forms without JavaScript, islands without JavaScript, pages that load no React, `<main>` swaps, `persist` islands, scroll and focus, back navigation, `aria-busy`, views, the typed API, RSC with slots and SSR, no console errors)
- An app created by `create-seam` from the packed tgz runs outside the repo: `npm install` → build → start (`pnpm test:create`)
- The same app runs on Node 24, Bun 1.4.4, Deno 2.9.6 and Cloudflare Workers (Miniflare = workerd) (`pnpm test:adapters`)
- The dev server (`vite`): SSR, actions, island hydration, RSC fetches, slots, and refetching after actions

## Caveats and open questions

- **Seam relies on React internals.** `$$FORM_ACTION`, `$$IS_SIGNATURE_EQUAL` and `formState` were checked against the react-dom@19.3.1 source, but they are not public API. That is why React is pinned to `19.3.1` (peerDependencies too). Run `pnpm test` when upgrading. If they break, `formProps()` is the escape hatch.
- **Run production with `NODE_ENV=production`.** Otherwise React runs its development build: slower, and RSC responses include debug info such as file paths (the Node adapter warns about it).
- **Cloudflare Workers** needs `nodejs_compat` for `getContext()`. RSC on Workers (`adapter: "cloudflare"` + `rsc: true`) is not supported yet.
- **Not on npm yet.** The name `seam` is already taken on npm, so publishing needs a scoped name (for example `@seamjs/core`).
- **The navigation script needs the Navigation API.** Browsers without it get plain page loads.
- **Island limits**
  - Props must be JSON values.
  - Each island is its own React root, so its `<Suspense>` boundaries are resolved before the HTML is sent (no streaming inside islands).
- **Requests from the navigation script (`X-Seam-Nav: 1`) wait for every Suspense boundary** (React's streaming `<script>`s do not run in DOMParser).
- Not built yet: `X-Seam-Partial` (the server rendering only part of a page), `<Include>` and passing `'use server'` functions inside RSC views.

## License

[MIT](LICENSE)
