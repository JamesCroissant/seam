/**
 * Client half of a 'use server' module. In the browser bundle, the Vite plugin replaces
 * the whole file with:
 *
 *   import { createServerReference } from "seam/runtime/client";
 *   export const updateInvoice = createServerReference("a1b2c3d4e5f6");
 *
 * Calling it is a plain `fetch("POST /_action/<id>")`. Arguments must be FormData or JSON values.
 */
import { refreshViews } from "../client/views.ts";
export function createServerReference(id: string) {
  return make(id, []);
}

function make(id: string, bound: unknown[]) {
  const url = `/_action/${id}`;
  const fn = (...args: unknown[]) => callAction(url, [...bound, ...args]);
  Object.defineProperties(fn, {
    $$id: { value: id },
    url: { value: url },
    bind: { value: (_this: unknown, ...more: unknown[]) => make(id, [...bound, ...more]) },
  });
  return fn;
}

async function callAction(url: string, args: unknown[]): Promise<unknown> {
  const body = new FormData();
  const form = args.find((a): a is FormData => a instanceof FormData);
  if (form) for (const [k, v] of form) body.append(k, v);
  body.append("$args", JSON.stringify(args.map((a) => (a instanceof FormData ? { $fd: 1 } : a))));

  const res = await fetch(url, { method: "POST", body, headers: { "X-Seam-Action": "json" } });

  if (res.headers.get("X-Seam-Reload")) {
    location.reload();
    return new Promise(() => {});
  }
  if (!res.ok) throw new Error(`Action ${url} failed: ${res.status}`);

  const result = (await res.json()) as { value?: unknown; redirect?: string };
  if (result.redirect) {
    const nav = (globalThis as any).navigation;
    if (nav) nav.navigate(result.redirect);
    else location.assign(result.redirect);
    return undefined;
  }
  // The action may have changed data shown by client views (<Include client>): re-fetch them.
  void refreshViews(null);
  return result.value ?? undefined;
}
