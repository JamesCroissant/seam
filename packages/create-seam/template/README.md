# {{name}}

A Seam app.

```sh
npm run dev     # development server
npm run build   # production build into dist/
npm start       # run the production build
```

## Where things go

| File | What it is |
|---|---|
| `app/routes/*.tsx` | Pages. The file path is the URL (`[id].tsx` → `:id`). `loader` reads data (GET). |
| `app/routes/_layout.tsx` | Layout around the pages in its folder. |
| `app/actions/*.ts` (`"use server"`) | Writes. `<form action={fn}>` works with and without JavaScript. |
| `app/islands/*.tsx` (`"use client"`) | Interactive parts. The only code sent to the browser. |
| `app/server/*.server.ts` | Server-only code. Importing it from an island is a build error. |
| `.seam/` | What the build decided (routes, actions, islands). Generated; read it, don't edit it. |

Start simple and go down this list only when you need to:

1. Show data → a page with a `loader`
2. Change data → `<form action={fn}>` with a `"use server"` function
3. Something reacts to every keystroke → an island (`"use client"`)
4. Cache one part of a page differently → a view (`app/views/`) and `<Include>`
5. An island reads data → a typed API (`app/api/*.api.ts`)
