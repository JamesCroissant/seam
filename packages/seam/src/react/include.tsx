/**
 * <Include src="/_v/..."> puts a view into a page.
 *
 *   <Include src="/_v/invoices/summary?v=123" />        server: rendered into the page's HTML.
 *       The view's Cache-Control is merged into the page's (strictest wins).
 *
 *   <Include src="/_v/me" client fallback={<Spinner/>} />  browser: fetched after the page loads.
 *       Does not affect the page's Cache-Control: use it for per-user parts of a cacheable page.
 *       Without JavaScript only the fallback is shown.
 *
 * Both render a <seam-view src="..."> element, so the boundary is visible in the HTML.
 */
import { createElement, use, type ReactNode } from "react";
import { tryGetContext } from "../core/context.ts";
import { fetchInclude, VIEW_PREFIX } from "../core/include.ts";

export interface IncludeProps {
  /** A /_v/ URL. Put a version in it (e.g. ?v=updatedAt) to bust caches when the data changes. */
  src: string;
  /** Load in the browser after the page (per-user parts). */
  client?: boolean;
  /** Shown until a client view has loaded (and always without JS). */
  fallback?: ReactNode;
}

export function Include({ src, client, fallback }: IncludeProps) {
  if (!src.startsWith(VIEW_PREFIX)) throw new Error(`[seam] <Include src="${src}">: src must start with ${VIEW_PREFIX}`);

  if (client) return createElement("seam-view", { src, "data-load": "client" }, fallback ?? null);

  const ctx = tryGetContext();
  if (!ctx) throw new Error("[seam] <Include> must be rendered on the server by a Seam app.");
  let html = ctx.includeCache.get(src);
  if (!html) {
    html = fetchInclude(ctx, src);
    ctx.includeCache.set(src, html);
  }
  return createElement("seam-view", { src, dangerouslySetInnerHTML: { __html: use(html) } });
}
