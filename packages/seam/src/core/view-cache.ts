/**
 * Shared caches for view responses (/_v/...). Only HTTP semantics, no tags:
 * a response is stored only if it is `public`, has no Set-Cookie, and has a positive
 * s-maxage (or max-age). To "invalidate", change the URL (e.g. `?v=<updatedAt>`).
 */
import type { ViewCache } from "./types.ts";

/** Lifetime in seconds for a shared cache, or 0 if it must not be stored. */
export function sharedTtl(cacheControl: string | null, headers: Headers): number {
  if (!cacheControl || headers.has("Set-Cookie")) return 0;
  const d = new Map(
    cacheControl
      .toLowerCase()
      .split(",")
      .map((p) => {
        const [k, v] = p.trim().split("=");
        return [k, v] as const;
      }),
  );
  if (!d.has("public") || d.has("private") || d.has("no-store") || d.has("no-cache")) return 0;
  const ttl = Number(d.get("s-maxage") ?? d.get("max-age") ?? 0);
  return Number.isFinite(ttl) && ttl > 0 ? ttl : 0;
}

/** In-process cache. Good for one Node/Bun server; each instance has its own copy. */
export function memoryViewCache(options: { maxEntries?: number } = {}): ViewCache {
  const max = options.maxEntries ?? 500;
  const entries = new Map<string, { body: string; status: number; headers: [string, string][]; stored: number; expires: number }>();
  return {
    async match(key) {
      const e = entries.get(key);
      if (!e) return undefined;
      if (e.expires <= Date.now()) {
        entries.delete(key);
        return undefined;
      }
      const headers = new Headers(e.headers);
      headers.set("Age", String(Math.floor((Date.now() - e.stored) / 1000)));
      headers.set("X-Seam-Cache", "HIT");
      return new Response(e.body, { status: e.status, headers });
    },
    async put(key, body, init, ttl) {
      if (entries.size >= max) entries.delete(entries.keys().next().value!);
      entries.set(key, { body, status: init.status, headers: [...init.headers], stored: Date.now(), expires: Date.now() + ttl * 1000 });
    },
  };
}

/**
 * Web-standard CacheStorage (Cloudflare Workers, Deno). The runtime applies Cache-Control itself.
 * NOTE: not tested in this repo yet (no such runtime here).
 */
export function cacheStorageViewCache(name = "seam-views"): ViewCache {
  const open = () => (globalThis as unknown as { caches: CacheStorage }).caches.open(name);
  return {
    async match(key) {
      const res = await (await open()).match(new Request(key));
      if (!res) return undefined;
      const headers = new Headers(res.headers);
      headers.set("X-Seam-Cache", "HIT");
      return new Response(res.body, { status: res.status, headers });
    },
    async put(key, body, init) {
      await (await open()).put(new Request(key), new Response(body, init));
    },
  };
}
