/**
 * Server-side <Include src="/_v/...">: a real sub-request to the app, `app(new Request(src))`.
 * Same URL, same Cache-Control, same view cache as when the browser fetches it.
 */
import { mergeCacheControl } from "./cache-control.ts";
import type { IncludeRecord, RequestContext } from "./context.ts";

export const VIEW_PREFIX = "/_v/";
const MAX_DEPTH = 5;
const DEPTH_HEADER = "X-Seam-Include-Depth";

/** Headers the sub-request must not inherit from the page request. */
const DROP = ["if-none-match", "if-modified-since", "x-seam-nav", "content-type", "content-length"];

export function includeDepth(request: Request): number {
  return Number(request.headers.get(DEPTH_HEADER) ?? 0) || 0;
}

/**
 * A sub-request to a view of this app, sent with the user's headers. Its Cache-Control and cookies
 * are recorded so the page can merge them (see finalizeCacheControl). Used by <Include> and by
 * <RscView> during SSR.
 */
export function viewSubrequest(ctx: RequestContext, src: string): Promise<Response> {
  const base = new URL(ctx.request.url);
  const url = new URL(src, base);
  if (url.origin !== base.origin || !url.pathname.startsWith(VIEW_PREFIX)) {
    return Promise.reject(new Error(`[seam] "${src}": must be a same-site /_v/ URL`));
  }
  if (ctx.includeDepth >= MAX_DEPTH) {
    return Promise.reject(new Error(`[seam] "${src}": more than ${MAX_DEPTH} nested includes (a loop?)`));
  }

  const record: IncludeRecord = { src, settled: false, cacheControl: null, setCookies: [] };
  ctx.includes.push(record);

  // Forward the user's headers (cookies, auth) so private views see the same user.
  const headers = new Headers(ctx.request.headers);
  for (const h of DROP) headers.delete(h);
  headers.set(DEPTH_HEADER, String(ctx.includeDepth + 1));

  return ctx.app(new Request(url, { headers, signal: ctx.request.signal }), ctx.platform).then((res) => {
    record.cacheControl = res.headers.get("Cache-Control");
    record.setCookies = res.headers.getSetCookie();
    record.settled = true;
    if (res.status !== 200) throw new Error(`[seam] "${src}" failed: ${res.status}`);
    checkLate(ctx, record);
    return res;
  });
}

export function fetchInclude(ctx: RequestContext, src: string): Promise<string> {
  return viewSubrequest(ctx, src).then((res) => res.text());
}

/**
 * An <Include> inside <Suspense> may settle after the page headers were sent.
 * If it is stricter than what we already promised (e.g. private inside a public page), say so loudly:
 * the fix is to move it out of <Suspense>, or to use <Include client>.
 */
function checkLate(ctx: RequestContext, record: IncludeRecord): void {
  const sent = ctx.committedCacheControl;
  if (sent === null) return;
  const merged = mergeCacheControl([sent, record.cacheControl]);
  if (merged !== mergeCacheControl([sent])) {
    console.error(
      `[seam] <Include src="${record.src}"> (Cache-Control: ${record.cacheControl ?? "none"}) finished after the page ` +
        `was sent with "Cache-Control: ${sent}". The page may be cached more widely than this view allows. ` +
        `Move the <Include> out of <Suspense>, or use <Include client>.`,
    );
  }
  if (record.setCookies.length > 0) {
    console.error(`[seam] <Include src="${record.src}"> set cookies after the page headers were sent; they were dropped.`);
  }
}

/** Merge the Cache-Control of the page's loaders with the includes that finished before the headers. */
export function finalizeCacheControl(ctx: RequestContext, base: (string | null)[], headers: Headers): string {
  const settled = ctx.includes.filter((r) => r.settled);
  const loaders = base.length > 0 ? base : [null];
  const withoutIncludes = mergeCacheControl(loaders);
  const merged = mergeCacheControl([...loaders, ...settled.map((r) => r.cacheControl)]);

  if (ctx.dev && withoutIncludes.startsWith("public") && !merged.startsWith("public")) {
    const culprits = settled.filter((r) => !mergeCacheControl([r.cacheControl]).startsWith("public")).map((r) => r.src);
    console.warn(
      `[seam] ${new URL(ctx.request.url).pathname}: the page is public, but <Include> of ${culprits.join(", ")} made it private. ` +
        `Use <Include client> for per-user parts to keep the page cacheable.`,
    );
  }
  for (const r of settled) for (const c of r.setCookies) headers.append("Set-Cookie", c);
  return merged;
}
