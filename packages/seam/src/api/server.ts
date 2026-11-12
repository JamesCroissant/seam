/**
 * Typed GET endpoints. In a file named *.api.ts:
 *
 *   export const searchInvoices = get("/api/invoices", {
 *     query: z.object({ q: z.string().default("") }),        // any Standard Schema (Zod, Valibot, ArkType, ...)
 *     headers: { "Cache-Control": "private, max-age=0" },
 *     handler: async ({ query }) => db.search(query.q),       // return JSON, data(value, { headers, etag }) or a Response
 *   });
 *
 * - Server: GET /api/invoices?q=... is answered by `handler` (query validated → 400 with issues on failure).
 *   Calling `searchInvoices({ query: { q: "a" } })` in a loader runs the handler directly (no HTTP).
 * - Browser: the Vite plugin replaces the file with `createApiReference("/api/invoices")`,
 *   a plain fetch. The types come from this declaration; no app-wide type, no method chain.
 *
 * Only GET: reads are cacheable with Cache-Control. Writes are 'use server' actions.
 */
import { mergeCacheControl } from "../core/cache-control.ts";
import { tryGetContext } from "../core/context.ts";
import { isDataResult, type DataResult } from "../core/data.ts";
import { hash } from "../core/hash.ts";
import type { Params, Platform } from "../core/types.ts";
import { ApiError, buildApiUrl, type QueryValue } from "../runtime/api-shared.ts";
import type { InferInput, InferOutput, StandardIssue, StandardSchemaV1 } from "./standard-schema.ts";

export { ApiError };
export type { StandardSchemaV1 };

type AnySchema = StandardSchemaV1<any, any>;
type QueryOf<S> = S extends AnySchema ? InferOutput<S> : Record<string, never>;
type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T];

export interface ApiHandlerArgs<P extends string, Q> {
  request: Request;
  params: Params<P>;
  query: Q;
  platform: Platform;
}

/** What the caller passes: path params (if the path has any) and the query (typed by the schema's input). */
export type ApiInput<P extends string, S> = (keyof Params<P> extends never ? { params?: undefined } : { params: Params<P> }) &
  (S extends AnySchema
    ? {} extends InferInput<S>
      ? { query?: InferInput<S> }
      : { query: InferInput<S> }
    : { query?: undefined });

/** What the endpoint returns, after JSON: data(value) is unwrapped, a raw Response is `unknown`. */
export type ApiResult<R> = R extends Response ? unknown : R extends DataResult<infer T> ? T : R;

export interface ApiFunction<P extends string, S, R> {
  (
    ...args: RequiredKeys<ApiInput<P, S>> extends never
      ? [input?: ApiInput<P, S>, init?: RequestInit]
      : [input: ApiInput<P, S>, init?: RequestInit]
  ): Promise<R>;
  readonly method: "GET";
  readonly path: P;
  /** The URL this call fetches, e.g. for <link rel="prefetch"> or a cache key. */
  url(input?: ApiInput<P, S>): string;
}

export interface ApiDefinition<P extends string, S, R> {
  query?: S;
  /** Default headers, e.g. Cache-Control. data(value, { headers }) from the handler overrides them. */
  headers?: HeadersInit;
  handler: (args: ApiHandlerArgs<P, QueryOf<S>>) => R | Promise<R>;
}

export function get<P extends `/api/${string}`, R, S extends AnySchema | undefined = undefined>(
  path: P,
  def: ApiDefinition<P, S, R>,
): ApiFunction<P, S, ApiResult<Awaited<R>>> {
  // Called on the server, e.g. from a loader: run the handler directly.
  const call = async (input: { params?: Record<string, string>; query?: unknown } = {}) => {
    const ctx = tryGetContext();
    const query = def.query ? await validate(def.query, input.query ?? {}) : {};
    if (query instanceof Response) throw new ApiError(400, await query.json(), path);
    const url = new URL(buildApiUrl(path, input.params, (input.query ?? {}) as Record<string, QueryValue>), "http://localhost");
    const result = await def.handler({
      request: ctx?.request ?? new Request(url),
      params: (input.params ?? {}) as Params<P>,
      query: query as QueryOf<S>,
      platform: ctx?.platform ?? {},
    });
    if (result instanceof Response) {
      if (!result.ok) throw new ApiError(result.status, await result.text(), path);
      return result.json();
    }
    return isDataResult(result) ? result.value : result;
  };

  /** Answer GET <path> (used by createApp through .seam/api.gen.ts). */
  const serve = async (request: Request, params: Record<string, string>): Promise<Response> => {
    const url = new URL(request.url);
    const query = def.query ? await validate(def.query, searchToObject(url.searchParams)) : {};
    if (query instanceof Response) return query;

    let result: unknown;
    try {
      result = await def.handler({
        request,
        params: params as Params<P>,
        query: query as QueryOf<S>,
        platform: tryGetContext()?.platform ?? {},
      });
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }
    if (result instanceof Response) return result;

    const headers = new Headers(def.headers);
    let value = result;
    let etag: string | undefined;
    let status = 200;
    if (isDataResult(result)) {
      const h = new Headers(result.init.headers);
      h.forEach((v, k) => (k === "set-cookie" ? undefined : headers.set(k, v)));
      for (const c of h.getSetCookie()) headers.append("Set-Cookie", c);
      value = result.value;
      etag = result.init.etag;
      status = result.init.status ?? 200;
    }
    headers.set("Cache-Control", mergeCacheControl([headers.get("Cache-Control")]));

    if (etag !== undefined) {
      const tag = `W/"${hash(url.pathname + url.search + "\u0000" + etag)}"`;
      headers.set("ETag", tag);
      if (request.headers.get("If-None-Match") === tag) {
        return new Response(null, { status: 304, headers: { ETag: tag, "Cache-Control": headers.get("Cache-Control")! } });
      }
    }
    return Response.json(value ?? null, { status, headers });
  };

  Object.defineProperties(call, {
    method: { value: "GET" },
    path: { value: path },
    url: { value: (input: { params?: Record<string, string>; query?: Record<string, QueryValue> } = {}) => buildApiUrl(path, input.params, input.query) },
    serve: { value: serve },
  });
  return call as unknown as ApiFunction<P, S, ApiResult<Awaited<R>>>;
}

/** ?a=1&b=2&b=3 → { a: "1", b: ["2", "3"] } — strings, as on the wire. Use z.coerce for numbers. */
function searchToObject(search: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const key of new Set(search.keys())) {
    const all = search.getAll(key);
    out[key] = all.length === 1 ? all[0] : all;
  }
  return out;
}

async function validate(schema: AnySchema, value: unknown): Promise<unknown | Response> {
  const result = await schema["~standard"].validate(value);
  if (!result.issues) return result.value;
  return Response.json(
    { error: "Invalid query", issues: result.issues.map(formatIssue) },
    { status: 400, headers: { "Cache-Control": "no-store" } },
  );
}

function formatIssue(issue: StandardIssue): { path: string; message: string } {
  const path = (issue.path ?? []).map((p) => String(typeof p === "object" ? p.key : p)).join(".");
  return { path, message: issue.message };
}
