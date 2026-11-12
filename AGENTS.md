# Seam — guide for AI agents

Instructions for AI agents (Claude Code, Codex) working in this repository.
CLAUDE.md imports this file, so everything lives here.

## The project

Seam is a web-standard, full-stack React framework.

> Pages are plain HTML. React only ships for the parts that move (islands).
> Keep the boundary between server and client, make it visible as URLs, and make it easy to cross.

Design decisions must follow these documents:

- [docs/vision.md](docs/vision.md) — the five core ideas, design principles, **non-goals**, comparison
- [docs/original-prompt.md](docs/original-prompt.md) — the prompt the project started from (do not edit)
- [docs/tutorial.md](docs/tutorial.md) — tutorial for app developers
- [README.md](README.md) — features, public API, what is verified, caveats

## Talking to the user

- Reply in plain, natural Japanese. Avoid stiff phrasing and heavy jargon.
- Prefer concrete steps and code over abstract explanations.
- Start from why something is done.
- When unsure about a library's current API (React, Vite, @vitejs/plugin-rsc, …), read its source or type definitions instead of guessing. If it cannot be verified, say so.

## Layout

```
packages/seam/          the framework (src/ → tsc → dist/)
  src/core/             createApp, router, actions, Cache-Control, views, request context
  src/react/            SSR, <Include>
  src/runtime/          what 'use server' / 'use client' / *.api.ts compile to
  src/client/           navigation script, island hydration, useNav
  src/rsc/              RSC (optional)
  src/api/              typed GET API (get())
  src/adapters/         node / bun / deno / cloudflare
  src/vite/             Vite plugin (scan.ts holds the file conventions)
  src/cli.ts            the seam command
  test/                 vitest
packages/create-seam/   npm create seam (template/ is a todo app)
examples/invoices/      example using every feature (uses seam from dist; rsc: true)
scripts/                E2E, out-of-repo install check, four-runtime check
docs/                   design and tutorial
```

## Commands

Node is pinned to 24.22.3 (`volta` in `package.json`, `useNodeVersion` in `pnpm-workspace.yaml`). Use pnpm.

| Command | When |
|---|---|
| `pnpm build` | Compile `packages/seam` to `dist/`. **The example uses dist, so run this after changing the framework.** |
| `pnpm test` | Unit and integration tests (vitest, against `src`) |
| `pnpm typecheck` | Type-check the framework source and the example (against the published dist types) |
| `pnpm e2e` | Production build of the example, then Chrome with and without JavaScript |
| `pnpm test:create` | Packed tgz → create-seam → npm install → build → start, outside the repo (needs network) |
| `pnpm test:adapters` | The same app on Node / Bun / Deno / Workers (Miniflare) (needs network) |
| `pnpm example:dev` | Dev server for the example |

## Checks after a change

| What changed | Run at least |
|---|---|
| Anything | `pnpm test` and `pnpm typecheck` |
| Pages, navigation, islands, views, RSC, the Vite plugin | the above plus `pnpm e2e` |
| Packaging (package.json exports, the CLI, create-seam, the template) | the above plus `pnpm test:create` |
| Adapters, build settings | the above plus `pnpm test:adapters` |

When a check fails, report its output as is. Never claim it passed.

GitHub Actions (`.github/workflows/ci.yml`) runs `pnpm test`, `pnpm typecheck` and `pnpm e2e` on pull requests and on pushes to `main` / `dev`.

## Rules

- **Do not add non-goals** (section 6 of docs/vision.md): a framework data cache, cache-busting tags, a SPA router, route `action`s, reads through `'use server'`, and so on.
- **Every new public API needs a reason**: only add what you can justify as one more row in the README's "Public API" table.
- **Do not add build-time transforms**: there are four (`'use server'`, `'use client'`, `*.api.ts`, the server-only guard). Their output must stay readable in `.seam/*.gen.ts`.
- **React is pinned to 19.3.1**: Seam relies on React internals (`$$FORM_ACTION`, `$$IS_SIGNATURE_EQUAL`, `formState`). Before upgrading, check their behavior in the react-dom source and pass every check.
- **The `'use server'` transform runs with `enforce: "pre"`**, before @vitejs/plugin-rsc, so actions keep Seam's protocol (`POST /_action/<id>`).
- **Production runs with `NODE_ENV=production`**: without it React runs its development build and RSC responses carry debug info.
- Imports inside the framework source keep the `.ts` extension (tsc rewrites them to `.js`).
- Never edit generated files (`.seam/`, `dist/`) by hand.

## Environment notes

- With Volta's pnpm, use `PATH=$HOME/.volta/bin:$PATH`. `useNodeVersion` makes scripts run on Node 24.
- E2E drives the installed Google Chrome through `playwright-core` (no browser download).
- Start child servers with `process.execPath`, not `node`: under Volta, killing `node` only stops the shim and leaves the server running.

## Skills

Always use the matching skill.

| Task | Skill |
|---|---|
| Commit | `git-commit` |
| Create a branch | `git-branch` |
| Sync with the remote, pull, push | `git-sync` |

Claude's copies live in `.claude/skills/`, Codex's in `.agents/skills/` (same content).

Commit rules (summary of the skill):

- Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, …). Lowercase, imperative, no trailing period.
- One commit = one logical change. Keep different kinds of changes apart.
- **No generated footers** such as `Co-Authored-By: Claude` or `Generated with Claude Code`.

Branch and sync rules (summary of the skills):

- Never commit or push to `main` directly. Changes reach `main` through pull requests only.
- Branch everyday work off `dev` (`feature/…`, `fix/…`, `refactor/…`, `chore/…`, `docs/…`, `test/…`). Only urgent fixes branch off `main` as `hotfix/…`.
- Integrate with `git pull --rebase`. Never `git push --force`.
