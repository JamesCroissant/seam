/**
 * Runs in the `rsc` environment (react-server condition), only when `seam({ rsc: true })`.
 *
 * GET /_v/<view>.rsc renders the same view file as GET /_v/<view>, but as RSC (Flight) data:
 * the loader runs here, the component is a Server Component, and 'use client' components
 * inside it become client references that the browser loads by itself.
 */
import { createElement } from "react";
import { renderToReadableStream } from "@vitejs/plugin-rsc/rsc/server";
import { mergeCacheControl } from "../core/cache-control.ts";
import { runWithContext, type RequestContext } from "../core/context.ts";
import { isDataResult } from "../core/data.ts";
import { hash } from "../core/hash.ts";
import { matchRoute } from "../core/router.ts";
import type { RouteNode } from "../core/types.ts";

export const RSC_SUFFIX = ".rsc";

export function createRscHandler(options: { views: RouteNode; buildId?: string }) {
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const viewPath = url.pathname.slice("/_v".length, -RSC_SUFFIX.length);
    const match = matchRoute(options.views, viewPath);
    if (!match) return new Response("View Not Found", { status: 404 });

    // This environment has its own copy of Seam's modules, so it needs its own request context.
    const ctx: RequestContext = {
      request,
      platform: {},
      flash: null,
      app: async () => new Response("<Include> is not supported inside RSC views", { status: 500 }),
      dev: false,
      includeDepth: 0,
      includes: [],
      includeCache: new Map(),
      committedCacheControl: null,
    };

    return runWithContext(ctx, async () => {
      const mod = await match.entries[match.entries.length - 1].load();
      let result: unknown;
      try {
        result = mod.loader ? await mod.loader({ request, params: match.params, platform: ctx.platform }) : undefined;
      } catch (e) {
        if (e instanceof Response) return e;
        throw e;
      }
      if (result instanceof Response) return result;

      const headers = new Headers({ "Content-Type": "text/x-component; charset=utf-8" });
      let value = result;
      let cacheControl: string | null = null;
      if (isDataResult(result)) {
        const h = new Headers(result.init.headers);
        cacheControl = h.get("Cache-Control");
        h.delete("Cache-Control");
        h.forEach((v, k) => (k === "set-cookie" ? undefined : headers.set(k, v)));
        for (const c of h.getSetCookie()) headers.append("Set-Cookie", c);
        value = result.value;
        if (result.init.etag !== undefined) {
          const etag = `W/"${hash([options.buildId ?? "", url.pathname + url.search, result.init.etag].join("\u0000"))}"`;
          headers.set("ETag", etag);
          if (request.headers.get("If-None-Match") === etag) {
            return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": mergeCacheControl([cacheControl]) } });
          }
        }
      }
      headers.set("Cache-Control", mergeCacheControl([mod.loader ? cacheControl : null]));

      const stream = renderToReadableStream(createElement(mod.default, { data: value, params: match.params }), {
        onError(error: unknown) {
          console.error("[seam] RSC render error:", error);
        },
      });
      return new Response(stream, { headers });
    });
  };
}
