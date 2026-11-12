/**
 * Deno adapter. Deno.serve gives a Request and wants a Response.
 * Used by seam({ adapter: "deno" }); run with `deno run -A dist/server/server.js`.
 */
import type { App } from "../core/types.ts";
import { contentType, staticCacheControl, staticPath } from "./static.ts";

declare const Deno: {
  serve(options: { port?: number; onListen?(addr: { port: number }): void }, handler: (req: Request) => Response | Promise<Response>): unknown;
  readFile(path: string): Promise<Uint8Array>;
  stat(path: string): Promise<{ isFile: boolean }>;
  env: { get(name: string): string | undefined };
};

export function serve(app: App, options: { port?: number; staticDir?: string } = {}) {
  const port = options.port ?? Number(Deno.env.get("PORT") ?? 3000);
  return Deno.serve({ port, onListen: ({ port }) => console.log(`[seam] http://localhost:${port} (deno)`) }, async (request) => {
    const pathname = options.staticDir ? staticPath(request) : null;
    if (pathname) {
      const file = options.staticDir + pathname;
      const isFile = await Deno.stat(file).then((s) => s.isFile, () => false);
      if (isFile) {
        const body = request.method === "HEAD" ? null : await Deno.readFile(file);
        return new Response(body as BodyInit | null, {
          headers: { "Content-Type": contentType(pathname), "Cache-Control": staticCacheControl(pathname) },
        });
      }
    }
    return app(request);
  });
}
