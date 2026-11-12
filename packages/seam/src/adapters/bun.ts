/**
 * Bun adapter. Bun speaks Request/Response, so there is nothing to convert.
 * Used by seam({ adapter: "bun" }); run with `bun dist/server/server.js`.
 */
import type { App } from "../core/types.ts";
import { contentType, staticCacheControl, staticPath } from "./static.ts";

declare const Bun: {
  serve(options: { port?: number; fetch(req: Request): Response | Promise<Response> }): { port: number };
  file(path: string): Blob & { exists(): Promise<boolean> };
  env: Record<string, string | undefined>;
};

export function serve(app: App, options: { port?: number; staticDir?: string } = {}) {
  const port = options.port ?? Number(Bun.env.PORT ?? 3000);
  const server = Bun.serve({
    port,
    async fetch(request) {
      const pathname = options.staticDir ? staticPath(request) : null;
      if (pathname) {
        const file = Bun.file(options.staticDir + pathname);
        if (await file.exists()) {
          return new Response(request.method === "HEAD" ? null : file, {
            headers: { "Content-Type": contentType(pathname), "Cache-Control": staticCacheControl(pathname) },
          });
        }
      }
      return app(request);
    },
  });
  console.log(`[seam] http://localhost:${server.port} (bun)`);
  return server;
}
