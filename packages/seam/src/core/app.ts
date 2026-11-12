import { ACTION_PREFIX, handleAction } from "./action.ts";
import { mergeCacheControl } from "./cache-control.ts";
import { runWithContext, type RequestContext } from "./context.ts";
import { isDataResult, isRedirect } from "./data.ts";
import { CLEAR_FLASH, readFlash } from "./flash.ts";
import { hash } from "./hash.ts";
import { finalizeCacheControl, includeDepth, VIEW_PREFIX, viewSubrequest } from "./include.ts";
import { matchRoute, rootLayouts } from "./router.ts";
import type {
  ActionMap,
  ApiEntry,
  App,
  FormState,
  Platform,
  RenderLayer,
  Renderer,
  RouteEntry,
  RouteModule,
  RouteNode,
  ViewCache,
} from "./types.ts";
import { sharedTtl } from "./view-cache.ts";

export interface AppOptions {
  /** The route trie generated into .seam/routes.gen.ts. */
  routes: RouteNode;
  /** The view trie generated into .seam/views.gen.ts (served under /_v/). */
  views?: RouteNode;
  /** The action table generated into .seam/actions.gen.ts. */
  actions: ActionMap;
  /** Typed GET endpoints generated into .seam/api.gen.ts (from *.api.ts files). */
  api?: ApiEntry[];
  render: Renderer;
  /** RSC views (GET /_v/....rsc), rendered in the `rsc` environment. Set by seam({ rsc: true }). */
  rsc?: {
    handle(request: Request): Promise<Response>;
    /** Turn Flight text into a React tree in the SSR environment (for <RscView> during SSR). */
    decode?(flight: string): Promise<unknown>;
  };
  /** Shared cache for public view responses (see memoryViewCache / cacheStorageViewCache). */
  viewCache?: ViewCache;
  /** Other fetch handlers mounted on a path prefix, e.g. { "/api": honoApp.fetch }. */
  mount?: Record<string, (request: Request, platform: Platform) => Response | Promise<Response>>;
  /** Changes on every deploy; part of ETags. */
  buildId?: string;
  /** Development mode: extra warnings. */
  dev?: boolean;
}

export function createApp(options: AppOptions): App {
  const mounts = Object.entries(options.mount ?? {}).sort((a, b) => b[0].length - a[0].length);
  const matchApi = compileApi(options.api ?? []);

  const app: App = async function app(request, platform = {}) {
    const ctx: RequestContext = {
      request,
      platform,
      flash: null,
      app,
      dev: options.dev ?? false,
      includeDepth: includeDepth(request),
      includes: [],
      includeCache: new Map(),
      committedCacheControl: null,
    };
    const decode = options.rsc?.decode;
    if (decode) {
      ctx.rscForSsr = async (src) => {
        const flight = await (await viewSubrequest(ctx, src)).text();
        return { flight, tree: await decode(flight) };
      };
    }
    return runWithContext(ctx, async () => {
      const url = new URL(request.url);
      try {
        for (const [prefix, handler] of mounts) {
          if (url.pathname === prefix || url.pathname.startsWith(prefix.endsWith("/") ? prefix : prefix + "/")) {
            return await handler(request, platform);
          }
        }

        if (url.pathname.startsWith(ACTION_PREFIX)) {
          return await handleAction(request, url.pathname.slice(ACTION_PREFIX.length), options.actions);
        }

        const api = matchApi(url.pathname);
        if (api) {
          if (request.method !== "GET" && request.method !== "HEAD") {
            return new Response("Method Not Allowed: API endpoints are GET only; use a 'use server' action to write.", {
              status: 405,
              headers: { Allow: "GET, HEAD" },
            });
          }
          return await (await api.entry.load()).serve(request, api.params);
        }

        if (request.method !== "GET" && request.method !== "HEAD") {
          return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
        }

        if (url.pathname.startsWith(VIEW_PREFIX)) return await serveView(request, ctx, options);
        return await renderPage(request, ctx, options);
      } catch (e) {
        if (e instanceof Response) return e;
        console.error(e);
        return new Response("Internal Server Error", { status: 500 });
      }
    });
  };
  return app;
}

// ---------- typed API ----------

/** Static segments before params; ":name" one segment; "*name" the rest. */
function compileApi(entries: ApiEntry[]) {
  // Same priority as routes: static > :param > *rest, segment by segment.
  const rank = (seg: string) => (seg.startsWith("*") ? 2 : seg.startsWith(":") ? 1 : 0);
  const compiled = entries
    .map((entry) => ({ entry, segs: entry.path.split("/").filter(Boolean) }))
    .sort((a, b) => {
      for (let i = 0; i < Math.max(a.segs.length, b.segs.length); i++) {
        const d = rank(a.segs[i] ?? "") - rank(b.segs[i] ?? "");
        if (d !== 0) return d;
      }
      return b.segs.length - a.segs.length;
    });
  return (pathname: string): { entry: ApiEntry; params: Record<string, string> } | null => {
    const parts = pathname.split("/").filter(Boolean).map((p) => {
      try {
        return decodeURIComponent(p);
      } catch {
        return p;
      }
    });
    for (const { entry, segs } of compiled) {
      const params = matchSegments(segs, parts);
      if (params) return { entry, params };
    }
    return null;
  };
}

function matchSegments(segs: string[], parts: string[]): Record<string, string> | null {
  const params: Record<string, string> = {};
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.startsWith("*")) {
      if (i >= parts.length) return null;
      params[seg.slice(1)] = parts.slice(i).join("/");
      return params;
    }
    if (i >= parts.length) return null;
    if (seg.startsWith(":")) params[seg.slice(1)] = parts[i];
    else if (seg !== parts[i]) return null;
  }
  return segs.length === parts.length ? params : null;
}

// ---------- loader results ----------

interface Extracted {
  value: unknown;
  cacheControl: string | null;
  etag?: string;
  status?: number;
}

/** Split a loader result into data and HTTP bits. Non-Cache-Control headers go straight to `headers`. */
function extract(v: unknown, headers: Headers): Extracted {
  if (!isDataResult(v)) return { value: v, cacheControl: null };
  const h = new Headers(v.init.headers);
  const cacheControl = h.get("Cache-Control");
  h.delete("Cache-Control");
  h.forEach((value, key) => (key === "set-cookie" ? undefined : headers.set(key, value)));
  for (const c of h.getSetCookie()) headers.append("Set-Cookie", c);
  return { value: v.value, cacheControl, etag: v.init.etag, status: v.init.status };
}

// ---------- pages ----------

async function renderPage(request: Request, ctx: RequestContext, options: AppOptions): Promise<Response> {
  const url = new URL(request.url);
  // X-Seam-Nav: the navigation script gets fully resolved HTML (no streaming), so caches must keep both.
  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8", Vary: "X-Seam-Nav" });

  // A no-JS action redirected here with a result: read it once and delete it.
  ctx.flash = readFlash(request);
  if (ctx.flash) headers.append("Set-Cookie", CLEAR_FLASH);
  const formState: FormState | null =
    ctx.flash?.key !== undefined ? [ctx.flash.value, ctx.flash.key, ctx.flash.id, ctx.flash.bound ?? 0] : null;

  const match = matchRoute(options.routes, url.pathname);
  if (!match) {
    return renderError(request, rootLayouts(options.routes), [], new Response("Not Found", { status: 404 }), 0, options, headers, formState);
  }

  const modules = await Promise.all(match.entries.map((e) => e.load()));

  // All loaders run at the same time.
  const results = await Promise.allSettled(
    modules.map((m) => (m.loader ? m.loader({ request, params: match.params, platform: ctx.platform }) : undefined)),
  );

  const failed = results.findIndex((r) => r.status === "rejected");
  if (failed !== -1) {
    const reason = (results[failed] as PromiseRejectedResult).reason;
    if (reason instanceof Response && isRedirect(reason)) return reason;
    const values = results.slice(0, failed).map((r) => (r as PromiseFulfilledResult<unknown>).value);
    return renderError(request, match.entries.slice(0, failed + 1), values, reason, failed, options, headers, formState, modules, match.params);
  }

  const values = results.map((r) => (r as PromiseFulfilledResult<unknown>).value);

  // A loader may also *return* a Response (e.g. redirect) instead of data.
  const returned = values.find((v): v is Response => v instanceof Response);
  if (returned) return returned;

  const cacheControls: (string | null)[] = [];
  const etags: string[] = [];
  let status = 200;
  const layers: RenderLayer[] = modules.map((mod, i) => {
    const x = extract(values[i], headers);
    if (mod.loader) cacheControls.push(x.cacheControl);
    if (x.etag !== undefined) etags.push(x.etag);
    if (x.status) status = x.status;
    return layer(mod, x.value, match.params);
  });

  // ETag only when every loader on the page gave a version (and, below, no <Include> was rendered).
  const loaderCount = modules.filter((m) => m.loader).length;
  let etag: string | null = null;
  if (!ctx.flash && loaderCount > 0 && etags.length === loaderCount) {
    etag = `W/"${hash([options.buildId ?? "", url.pathname, ...etags].join("\u0000"))}"`;
    if (request.headers.get("If-None-Match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": mergeCacheControl(cacheControls) } });
    }
  }

  const stream = await options.render({ request, layers, formState });

  // The shell is ready: <Include>s outside <Suspense> have finished and count toward Cache-Control.
  // The flash cookie makes this response personal and one-time.
  const cacheControl = ctx.flash ? "private, no-store" : finalizeCacheControl(ctx, cacheControls, headers);
  headers.set("Cache-Control", cacheControl);
  ctx.committedCacheControl = cacheControl;
  // Included views have their own versions, which the page ETag does not cover.
  if (etag && ctx.includes.length === 0) headers.set("ETag", etag);

  return new Response(request.method === "HEAD" ? null : stream, { status, headers });
}

function layer(mod: RouteModule, data: unknown, params: Record<string, string>): RenderLayer {
  return { Component: mod.default, props: { data, params } };
}

/**
 * Render the nearest ErrorBoundary at or above the failing route.
 * Routes above the boundary render normally with their data.
 */
async function renderError(
  request: Request,
  entries: RouteEntry[],
  values: unknown[],
  error: unknown,
  failedIndex: number,
  options: AppOptions,
  headers: Headers,
  formState: FormState | null,
  loadedModules?: RouteModule[],
  params: Record<string, string> = {},
): Promise<Response> {
  const status = error instanceof Response ? error.status : 500;
  if (!(error instanceof Response)) console.error(error);

  const modules = loadedModules ? loadedModules.slice(0, entries.length) : await Promise.all(entries.map((e) => e.load()));
  let boundary = -1;
  for (let i = Math.min(failedIndex, modules.length - 1); i >= 0; i--) {
    if (modules[i].ErrorBoundary) {
      boundary = i;
      break;
    }
  }
  if (boundary === -1) {
    return error instanceof Response ? error : new Response("Internal Server Error", { status: 500 });
  }

  const errorValue =
    error instanceof Response ? { status: error.status, statusText: error.statusText, message: await error.text() } : error;
  const layers: RenderLayer[] = modules.slice(0, boundary).map((m, i) => layer(m, unwrap(values[i]), params));
  layers.push({ Component: modules[boundary].ErrorBoundary!, props: { error: errorValue } });

  headers.set("Cache-Control", "no-store");
  const stream = await options.render({ request, layers, formState });
  return new Response(request.method === "HEAD" ? null : stream, { status, headers });
}

// ---------- views (/_v/...) ----------

/** GET /_v/... through the shared view cache, when one is configured. */
async function serveView(request: Request, ctx: RequestContext, options: AppOptions): Promise<Response> {
  const cache = options.viewCache;
  const render = () => {
    if (!new URL(request.url).pathname.endsWith(".rsc")) return renderView(request, ctx, options);
    if (!options.rsc) return Promise.resolve(new Response("RSC is not enabled (seam({ rsc: true }))", { status: 404 }));
    return options.rsc.handle(request);
  };
  if (!cache || request.method !== "GET") return render();

  const key = request.url;
  const hit = await cache.match(key);
  if (hit) {
    // A cached copy still answers conditional requests.
    const etag = hit.headers.get("ETag");
    if (etag && request.headers.get("If-None-Match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": hit.headers.get("Cache-Control") ?? "" } });
    }
    return hit;
  }

  const res = await render();
  const ttl = res.status === 200 ? sharedTtl(res.headers.get("Cache-Control"), res.headers) : 0;
  if (ttl === 0) return res;
  const body = await res.text();
  await cache.put(key, body, { status: res.status, headers: res.headers }, ttl);
  const headers = new Headers(res.headers);
  headers.set("X-Seam-Cache", "MISS");
  return new Response(body, { status: res.status, headers });
}

/** A view is one route module: loader + component, rendered as an HTML fragment (no layouts, no <html>). */
async function renderView(request: Request, ctx: RequestContext, options: AppOptions): Promise<Response> {
  const url = new URL(request.url);
  const match = options.views ? matchRoute(options.views, url.pathname.slice(VIEW_PREFIX.length - 1)) : null;
  if (!match) return new Response("View Not Found", { status: 404 });

  const mod = await match.entries[match.entries.length - 1].load();
  let result: unknown;
  try {
    result = mod.loader ? await mod.loader({ request, params: match.params, platform: ctx.platform }) : undefined;
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
  if (result instanceof Response) return result;

  const headers = new Headers({ "Content-Type": "text/html; charset=utf-8" });
  const x = extract(result, headers);

  let etag: string | null = null;
  if (x.etag !== undefined) {
    etag = `W/"${hash([options.buildId ?? "", url.pathname + url.search, x.etag].join("\u0000"))}"`;
    if (request.headers.get("If-None-Match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag, "Cache-Control": mergeCacheControl([x.cacheControl]) } });
    }
  }

  const stream = await options.render({
    request,
    layers: [layer(mod, x.value, match.params)],
    formState: null,
    fragment: { idPrefix: `v${hash(url.pathname + url.search)}-` },
  });

  // Fragments are fully rendered before we get here, so every nested <Include> has settled.
  const cacheControl = finalizeCacheControl(ctx, [mod.loader ? x.cacheControl : null], headers);
  headers.set("Cache-Control", cacheControl);
  ctx.committedCacheControl = cacheControl;
  if (etag && ctx.includes.length === 0) headers.set("ETag", etag);

  return new Response(request.method === "HEAD" ? null : stream, { status: x.status ?? 200, headers });
}

function unwrap(v: unknown): unknown {
  return isDataResult(v) ? v.value : v;
}
