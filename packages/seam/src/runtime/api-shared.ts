/** Used by both the server (`get()`) and the browser (`createApiReference`). No server-only imports here. */

export type QueryValue = string | number | boolean | null | undefined;

/** "/api/stock/:id" + { id: "a b" } + { w: 1 } → "/api/stock/a%20b?w=1" (query keys sorted: one URL per question, better caching). */
export function buildApiUrl(path: string, params: Record<string, string> = {}, query: Record<string, QueryValue | QueryValue[]> = {}): string {
  const pathname = path
    .split("/")
    .map((seg) => {
      if (!seg.startsWith(":") && !seg.startsWith("*")) return seg;
      const name = seg.slice(1);
      const value = params[name];
      if (value === undefined) throw new Error(`[seam] missing param "${name}" for ${path}`);
      return seg.startsWith("*") ? value.split("/").map(encodeURIComponent).join("/") : encodeURIComponent(value);
    })
    .join("/");
  const search = new URLSearchParams();
  for (const key of Object.keys(query).sort()) {
    const v = query[key];
    for (const item of Array.isArray(v) ? v : [v]) if (item !== undefined && item !== null) search.append(key, String(item));
  }
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Thrown by an API call when the server answers with a non-2xx status. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: unknown,
    url: string,
  ) {
    super(`GET ${url} failed: ${status}`);
    this.name = "ApiError";
  }
}
