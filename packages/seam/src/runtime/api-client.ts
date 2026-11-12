/**
 * Browser half of a *.api.ts file. The Vite plugin replaces the whole file with:
 *
 *   import { createApiReference } from "seam/runtime/api-client";
 *   export const searchInvoices = createApiReference("/api/invoices");
 *
 * Calling it is `fetch("GET /api/invoices?q=...")` and `res.json()`. Nothing else.
 */
import { ApiError, buildApiUrl, type QueryValue } from "./api-shared.ts";

interface Input {
  params?: Record<string, string>;
  query?: Record<string, QueryValue | QueryValue[]>;
}

export function createApiReference(path: string) {
  const call = async (input: Input = {}, init: RequestInit = {}) => {
    const url = buildApiUrl(path, input.params, input.query);
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    const res = await fetch(url, { ...init, method: "GET", headers });
    const body = (res.headers.get("Content-Type") ?? "").includes("json") ? await res.json() : await res.text();
    if (!res.ok) throw new ApiError(res.status, body, url);
    return body;
  };
  Object.defineProperties(call, {
    method: { value: "GET" },
    path: { value: path },
    url: { value: (input: Input = {}) => buildApiUrl(path, input.params, input.query) },
  });
  return call;
}
