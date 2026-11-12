/**
 * Cloudflare Workers adapter. Used by seam({ adapter: "cloudflare" }).
 * - Static files (dist/client): Workers Static Assets serve them before the Worker runs.
 * - getContext() uses AsyncLocalStorage: enable the `nodejs_compat` compatibility flag.
 * - The build bundles everything into one file (dist/server/server.js) with React's edge build.
 */
import type { App } from "../core/types.ts";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export function toWorker(app: App) {
  return {
    fetch(request: Request, env: unknown, ctx: ExecutionContext) {
      return app(request, { env, waitUntil: (p) => ctx.waitUntil(p) });
    },
  };
}
