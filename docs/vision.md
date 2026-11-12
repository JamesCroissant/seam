# What Seam is aiming for

> **Pages are plain HTML. React only ships for the parts that move, together with their props.**
> Keep the boundary. **Make it visible as URLs, and make it easy to cross.**

A seam is where two pieces of fabric are joined. Seam joins server and client while keeping the join visible.

The prompt the project started from is in [original-prompt.md](original-prompt.md). This document is the current design that came out of it.

---

## 1. Why build it

Next.js asks for too much Next.js-only knowledge:

- the `'use client'` / `'use server'` boundary, Server Actions, RSC-specific mechanisms
- caching that keeps changing (implicit caching, `revalidatePath` / `revalidateTag`, `'use cache'`, `cacheLife`, `cacheTag`, …)
- so many compiler transforms that the code you write is not the code that runs

React Router v7 already has many good parts: loaders and actions, forms that work without JavaScript, web-standard Request / Response, nested routes, adapters. **Seam differs by treating pages as HTML and sending JavaScript only for the parts that move.** After hydration, React Router runs the whole app as a SPA and basically ships the JavaScript of every page component.

## 2. The five core ideas

1. **Send less JavaScript**: HTML swaps and islands; only moving parts get JavaScript
2. **RSC as data**: fetch, cache and display RSC as data, compose it with slots (optional)
3. **Writes are `'use server'`**: no route actions. A `'use server'` function is a plain POST to a fixed URL
4. **A small core, a small API**: nothing like `clientLoader`, `useFetcher` or `shouldRevalidate`
5. **A typed API**: GET only, with types that stay per function (avoiding the weight and the method chains of Hono RPC)

## 3. Design principles

1. **Pages are HTML. JavaScript only for islands**
2. **The boundary is a URL**: reads, writes, fragments, RSC and the API each have a fixed URL (table below)
3. **Read with GET; write with POST → 303 → GET**: after a write every loader runs again. There is no `revalidate` API
4. **Islands know only their props**
5. **Caching is HTTP only**: to cache part of a page differently, give that part its own URL (a view)
6. **Transforms you can count**: their output is visible in `.seam/*.gen.ts`
7. **Borrow loaders and nested routes from React Router**: do not reinvent them

## 4. Every boundary is a visible URL

| What | URL | What happens |
|---|---|---|
| Show a page | `GET /invoices/1` | Nested loaders run in parallel; HTML streams |
| Write | `POST /_action/<id>` | A `'use server'` function. 303 without JavaScript, JSON from JavaScript |
| Part of a page (a view) | `GET /_v/...` | An HTML fragment with its own Cache-Control |
| A view as RSC | `GET /_v/....rsc` | The same view as Flight (with `rsc: true`) |
| Typed API | `GET /api/...` | JSON; the query is validated with a Standard Schema |

## 5. Three levels of weight

| Level | What moves | JavaScript sent | Good for |
|---|---|---|---|
| ① HTML | `<form>` and links | The navigation script (about 3 KB) | Lists, details, settings, articles |
| ② Islands | `'use client'` components | React plus those components | Buttons, search, charts |
| ③ App regions | A large island + `<RscView>` | ② plus the Flight decoder (about 7 KB) | Dashboards, admin screens |

**Start every page at ①, and move only the parts that need it to ② or ③.**

## 6. Non-goals

1. A framework-owned data cache (`'use cache'`, automatic fetch memoization)
2. Tags for cache invalidation (`revalidatePath` / `revalidateTag` / `cacheTag`). When data changes, change the URL
3. A client router cache (the browser's HTTP cache does this)
4. A SPA router that owns the whole React tree (a small navigation script that swaps HTML is fine)
5. Route `action`s (writes are `'use server'` only)
6. Reads through `'use server'` (reads are GETs)
7. `'use server'` inside functions (closure encryption)
8. Equivalents of `clientLoader` / `useFetcher` / `shouldRevalidate` / `useMatches` / a `meta` export
9. RPC that ties the whole app into one type
10. Two ways to define routes (file-based only)
11. Switching to Preact or similar (stay with standard React)
12. CDN-specific purge APIs
13. Image and font optimization

## 7. Answers to known weak spots

| Weak spot | Answer |
|---|---|
| Hono: folder structure differs across a team | File conventions (`routes/`, `views/`, `actions/`, `islands/`, `api/`, `*.server.ts`) |
| Hono: heavy RPC types, method chains for types | Typed API with types per function, no chains |
| Hono: differences between runtimes | A check that runs the same app on Node / Bun / Deno / Workers |
| Sharing state between islands is hard | `createStore()` |
| State is lost on navigation | `persist` islands are moved, not re-created; `useNav()` reports URL changes |
| Islands do not suit app-like screens | ③ app regions (a large island + RSC) |
| Deciding what becomes an island | A fixed order of decisions ([tutorial.md](tutorial.md)) |
| Fragments mean many requests and more server load | They are GETs, so CDNs, ETag (304) and the view cache all work |
| The flow of updates is hard to follow | One update = one request, always a URL in the Network tab |
| Caching only part of a page | Give the part its own URL as a view; assemble with `<Include>` and `<Include client>` |

## 8. Comparison

| | Reads | Writes | Caching | RSC | JavaScript sent |
|---|---|---|---|---|---|
| **Seam** | loaders (GET) | `'use server'` → POST to a fixed URL + 303 | HTTP only | Optional (as data + slots) | Islands only |
| Next.js | Server Components | Server Actions | Its own (`'use cache'` and more) | Required | Every client component of the page |
| React Router v7 | loaders | route actions | HTTP + revalidation | In progress | The whole app (SPA) |
| TanStack Start | loaders + `createServerFn` | `createServerFn` | Router / Query | Supported (as data) | The whole app |
| Astro | `.astro` templates | Actions | HTTP | No | Islands only |
| HonoX | Hono handlers | Hono handlers | HTTP | No | Islands only |

Seam's spot: **everything in React / TSX, React Router's loader model, and JavaScript only for islands.**

## 9. Where it stands

**Done (MVP)**
- The core, file-based routing, loaders, `'use server'` (including `useActionState` without JavaScript)
- Islands and the navigation script (URL notifications, scroll and focus, loading state)
- Views (`<Include>` / `<Include client>`) and the view cache
- The typed API
- RSC (optional): Flight fetches, slots, SSR (shown in the first HTML, hydrated without fetching again)
- Adapters for Node / Bun / Deno / Cloudflare Workers (all four run in checks)
- The `seam` command, `create-seam`, a publishable build

**Next**
- Pick an npm name and publish (`seam` is taken on npm)
- `X-Seam-Partial` (the server rendering only part of a page)
- `<Include>` and passing `'use server'` functions inside RSC views
- RSC on Workers
- A documentation site
