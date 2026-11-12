# The original prompt

The prompt Seam started from, followed by the direction added during the conversation.
What was decided or changed afterwards is in [vision.md](vision.md).

---

You are a senior engineer who knows web framework design well.
Help me design what I want to build: "a web-standard, full-stack React framework that keeps the boundary between frontend and backend simple."

# About me
- Frontend engineer (mainly React / TypeScript / Next.js)
- I have used Next.js so far, and I am unhappy with how much Next.js-specific knowledge it demands

# Why I want to build it (my problems with Next.js)
- I have to learn concepts that are not web standards: Server Actions, the 'use client' / 'use server' boundary, RSC-specific mechanisms
- Caching is complicated (the old implicit caching, revalidatePath / revalidateTag, and since Next.js 16: Cache Components, 'use cache', cacheLife, cacheTag, Partial Prefetching, …)
- The compiler transforms so much that the code I write differs from the code that runs, which makes behavior hard to follow

# Direction
- Lightweight like Hono, with a core built only on web standards (Request / Response / ReadableStream / FormData / fetch, …)
- The core is a single function: `(Request) => Promise<Response>`
- One adapter per platform (Node.js, Bun, Deno, Cloudflare Workers, …). Only Node.js needs to convert between IncomingMessage and Request/Response
- The idea is not "remove the boundary" but "make the boundary visible and make it easy to cross"

# Design decisions so far
1. Reads are per-route loaders (GET)
2. Writes are actions. They work with an HTML <form method="post">, finish with a 303 redirect, and the following GET runs the loaders again. No dedicated API like revalidate
3. When JS is available, the client intercepts form submissions and does the same thing with fetch. The server code is the same with and without JS
4. The framework keeps no cache; HTTP Cache-Control headers handle it
5. Keep build-time transforms (magic) to a minimum. What is needed: keeping server code out of the client bundle, and transforming 'use server'. Document clearly what the transformed code looks like
6. Rendering is built on SSR. Slow parts stream (ReadableStream). Partial updates return "HTML fragments". Only the parts that need fine-grained interaction hydrate React as islands
7. Nested layouts come from nested routes, each with its own loader (the Remix / React Router idea). Loaders run in parallel

# Ideas to take from TanStack Start
- "RSC is data": treat Server Components not as a tree the server owns, but as data (a React Flight stream) that can be fetched, cached and displayed
- The client owns the tree (client-first)
- A "slot" mechanism like Composite Components: the server renders the frame of the UI, and the client plugs in components it controls through children, render props or component props
- Make the boundary with the server explicit
- But RSC must not be required: an option, used only where wanted

# But keep the code close to standard React
- TanStack Start draws the boundary with createServerFn instead of 'use server'. I want to make good use of React's standard 'use server'
- Proposal: writes (mutations) use 'use server' (they combine with <form action={fn}> and useActionState). Reads are GET loaders / functions, cacheable with Cache-Control ('use server' is basically POST, which does not suit caching)
- I want to state clearly that a 'use server' function compiles to "a plain POST endpoint at a fixed URL (Request → Response inside)"
- 'use client' follows React's rules as they are

# Things to watch out for
- Make up for Hono's weak spots (no conventions such as folder structure, so code differs across a team; RPC type inference gets heavy; method chains are needed for types; differences between runtimes) by adding conventions only where needed
- The problem Next.js Cache Components solves, "cache only part of a page", is hard with HTTP Cache-Control alone. Think about approaches such as giving each part of a page its own URL with its own Cache-Control, and assembling them as HTML fragments or RSC data
- Decide clearly what we will not do

# What I would like from you
Answer in this order.
1. Design principles (5–7) and the reason for each
2. The flow of one request, step by step (showing a page with GET, posting a form, a partial update with JS, fetching RSC as data)
3. What developers write (a route file, a loader, a 'use server' action, an example with a slot)
4. How 'use server' is transformed (code before and after)
5. A minimal core implementation (TypeScript) and sketches of each adapter (Node.js, Bun, Deno, Cloudflare Workers)
6. The build setup (what the Vite plugin does)
7. The first scope (MVP) and the roadmap after it
8. Downsides and trade-offs of this design, and a comparison with Next.js / React Router / TanStack Start / Remix 3 / HonoX

# How to answer
- Write gentle, natural Japanese that a middle school student could follow. Avoid stiff phrasing and overly technical terms
- Prefer concrete steps and code over abstract explanations
- Explain from the underlying reasoning (why we do it)
- For the current APIs of React, Vite, @vitejs/plugin-rsc and other libraries, do not guess when unsure; say clearly that it needs to be checked

---

# Direction added during the conversation

## How this differs from React Router v7

Unlike React Router v7, my design sends JS only for the parts that move.

React Router v7 (framework mode) already has:
- loader / action, forms that work without JS through <Form>, automatic loader revalidation after actions
- Web-standard Request / Response
- Caching with Cache-Control through the `headers` export
- Nested routes with loaders running in parallel
- Adapters for each platform, a Vite plugin

## The core of this framework

So my decisions 1–4 and 7 are nearly the same as React Router v7. To make building my own worthwhile, these are the core of the framework:
1. Send less JS to the browser: after hydration, React Router runs the whole app as a SPA and basically ships the JS for every page component. My framework uses HTML fragments and islands and sends JS only for the parts that move
2. Treat RSC as data: React Router's RSC support is experimental, in the form "a loader may also return React elements". Like TanStack Start, I want to fetch and cache RSC as data and compose it with slots
3. Writes center on 'use server' (React Router centers on route actions)
4. Keep the core as small as Hono and keep the API surface small (do not keep adding equivalents of clientLoader, useFetcher, shouldRevalidate, …)
5. Include a typed API / RPC like Hono's in the core if needed

## Things to watch out for

- Make up for Hono's weak spots (no conventions such as folder structure, so code differs across a team; RPC type inference gets heavy; method chains are needed for types; differences between runtimes) by adding conventions only where needed
- Find answers to the weak spots of islands (sharing state between islands is hard, state is easily lost on navigation, app-like screens are a poor fit, deciding what becomes an island every time) and of HTML fragments (a server round trip for every interaction, fine-grained interaction is hard, more load on the server, the flow of updates is harder to follow)
- The problem Next.js Cache Components solves, "cache only part of a page", is hard with HTTP Cache-Control alone. Think about approaches such as giving each part of a page its own URL with its own Cache-Control, and assembling them as HTML fragments or RSC data
- Decide clearly what we will not do

## Navigation

Start with option A. But rewrite "do not build a SPA router" as "do not build a SPA router that owns the whole React tree; do keep a small navigation script that swaps HTML". And put these into option A's MVP: (1) a way to tell kept islands that the URL changed, (2) handling of scroll position and focus, (3) a loading indicator.
