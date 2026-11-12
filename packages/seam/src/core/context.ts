import { AsyncLocalStorage } from "node:async_hooks";
import type { App, Platform } from "./types.ts";
import type { Flash } from "./flash.ts";

/** One <Include src> rendered on the server during this request. */
export interface IncludeRecord {
  src: string;
  settled: boolean;
  cacheControl: string | null;
  setCookies: string[];
}

/**
 * Per-request state. Uses AsyncLocalStorage, which exists in Node, Bun, Deno and
 * Cloudflare Workers (Workers: needs the `nodejs_compat` flag).
 */
export interface RequestContext {
  request: Request;
  platform: Platform;
  /** The result of the action that redirected here (read once from a cookie). */
  flash: Flash | null;
  /** The app itself: <Include> calls it for /_v/... sub-requests. */
  app: App;
  dev: boolean;
  /** How deep we are in nested <Include>s (guards against loops). */
  includeDepth: number;
  includes: IncludeRecord[];
  includeCache: Map<string, Promise<string>>;
  /** Set once the response headers are fixed; <Include>s that settle later are checked against it. */
  committedCacheControl: string | null;
  /** With seam({ rsc: true }): fetch an RSC view for SSR → its Flight text and the decoded React tree. */
  rscForSsr?: (src: string) => Promise<{ flight: string; tree: unknown }>;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function tryGetContext(): RequestContext | undefined {
  return storage.getStore();
}

/** The current request and platform. Usable in loaders, actions and server components. */
export function getContext(): { request: Request; platform: Platform } {
  const ctx = storage.getStore();
  if (!ctx) throw new Error("getContext() was called outside of a request.");
  return { request: ctx.request, platform: ctx.platform };
}

/**
 * When the last request was a no-JS form POST to `action`, returns what the action returned.
 * Use it to show validation errors after the 303 redirect.
 */
export function getActionResult<T = unknown>(action: (...args: any[]) => unknown): T | undefined {
  const flash = storage.getStore()?.flash;
  const id = (action as { $$id?: string }).$$id;
  if (!flash || !id || flash.id !== id) return undefined;
  return flash.value as T;
}
