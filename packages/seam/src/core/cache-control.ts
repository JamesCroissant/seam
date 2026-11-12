/** What a page gets when a loader says nothing: safe for per-user data. */
export const DEFAULT_CACHE_CONTROL = "private, no-cache";

function parse(value: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of value.split(",")) {
    const [k, v] = part.trim().toLowerCase().split("=");
    if (k) m.set(k, v ?? "");
  }
  return m;
}

/**
 * Merge the Cache-Control of every loader on a page. The strictest one wins:
 * - any `no-store`            → `no-store`
 * - any private (or not public) → `private`
 * - max-age / s-maxage        → the smallest, and only if every loader gave one
 * - a loader with no header counts as `private, no-cache`
 */
export function mergeCacheControl(values: (string | null | undefined)[]): string {
  if (values.length === 0) return DEFAULT_CACHE_CONTROL;
  const all = values.map((v) => parse(v || DEFAULT_CACHE_CONTROL));

  if (all.some((d) => d.has("no-store"))) return "no-store";

  const isPrivate = all.some((d) => d.has("private") || !d.has("public"));
  const min = (key: string): number | null => {
    const nums: number[] = [];
    for (const d of all) {
      const v = d.get(key);
      if (v === undefined || v === "" || Number.isNaN(Number(v))) return null;
      nums.push(Number(v));
    }
    return Math.min(...nums);
  };

  const parts = [isPrivate ? "private" : "public"];
  const anyNoCache = all.some((d) => d.has("no-cache"));
  const maxAge = min("max-age");
  if (anyNoCache || maxAge === null) parts.push("no-cache");
  else parts.push(`max-age=${maxAge}`);

  if (!isPrivate) {
    const sMaxAge = min("s-maxage");
    if (sMaxAge !== null) parts.push(`s-maxage=${sMaxAge}`);
    const swr = min("stale-while-revalidate");
    if (swr !== null) parts.push(`stale-while-revalidate=${swr}`);
  }
  return parts.join(", ");
}
