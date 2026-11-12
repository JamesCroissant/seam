import { isRedirect } from "./data.ts";
import { serializeFlash, type Flash } from "./flash.ts";
import type { ActionMap } from "./types.ts";

export const ACTION_PREFIX = "/_action/";

/**
 * Same-origin check (CSRF). Browsers send Origin on every POST.
 * - Origin present          → must equal the request origin
 * - else Sec-Fetch-Site set  → must be same-origin
 * - neither (curl, tests)    → allowed: a browser cannot be tricked into sending such a request
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (origin !== null) return origin === new URL(request.url).origin;
  const site = request.headers.get("Sec-Fetch-Site");
  if (site !== null) return site === "same-origin";
  return true;
}

/** Only same-site paths. Blocks open redirects such as `//evil.com` or `https://evil.com`. */
export function safeReturnPath(value: FormDataEntryValue | null, request: Request): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  const base = new URL(request.url);
  const url = new URL(value, base);
  if (url.origin !== base.origin) return "/";
  return url.pathname + url.search + url.hash;
}

/** Fallback when the form had no $return field (e.g. formProps()). Referer may be missing. */
function refererPath(request: Request): string | null {
  const ref = request.headers.get("Referer");
  if (!ref) return null;
  try {
    const u = new URL(ref);
    return u.origin === new URL(request.url).origin ? u.pathname + u.search : null;
  } catch {
    return null;
  }
}

/** Fields starting with `$` belong to the framework (or React) and are not passed to actions. */
function stripReserved(form: FormData): FormData {
  const out = new FormData();
  for (const [k, v] of form) if (!k.startsWith("$")) out.append(k, v);
  return out;
}

function decodeArgs(form: FormData): { args: unknown[]; bound: number } {
  const userForm = stripReserved(form);
  const rawArgs = form.get("$args");
  if (typeof rawArgs === "string") {
    // Called from JS (createServerReference): exact argument list, FormData marked as {$fd:1}.
    const list = JSON.parse(rawArgs) as unknown[];
    return { args: list.map((a) => (a && typeof a === "object" && "$fd" in a ? userForm : a)), bound: 0 };
  }
  // Plain HTML form post: bound args (e.g. useActionState's previous state) + the form.
  const rawBound = form.get("$bound");
  const bound = typeof rawBound === "string" ? (JSON.parse(rawBound) as unknown[]) : [];
  return { args: [...bound, userForm], bound: bound.length };
}

/**
 * POST /_action/<id>
 *
 * Header `X-Seam-Action: json` (sent by createServerReference) → 200 JSON `{ value }` or `{ redirect }`.
 * Otherwise (a plain <form>, with or without the navigation script) → always 303.
 */
export async function handleAction(request: Request, id: string, actions: ActionMap): Promise<Response> {
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
  if (!isSameOrigin(request)) return new Response("Forbidden: cross-origin action", { status: 403 });

  const load = actions[id];
  if (!load) {
    // Usually an old tab after a deploy. Ask the client to reload.
    return new Response("Unknown action. Please reload.", { status: 409, headers: { "X-Seam-Reload": "1" } });
  }

  const json = request.headers.get("X-Seam-Action") === "json";
  const form = await request.formData();
  const { args, bound } = decodeArgs(form);
  const fn = await load();

  let result: unknown;
  try {
    result = await fn(...args);
  } catch (e) {
    if (e instanceof Response) result = e;
    else throw e;
  }

  if (result instanceof Response) {
    if (json && isRedirect(result)) {
      return Response.json({ redirect: result.headers.get("Location") }, { headers: noStore() });
    }
    return result;
  }

  if (json) return Response.json({ value: result ?? null }, { headers: noStore() });

  const headers = noStore();
  headers.set("Location", safeReturnPath(form.get("$return") ?? refererPath(request), request));
  if (result !== undefined) {
    const key = form.get("$ACTION_KEY");
    // useActionState bound the previous state itself; React compares the count *without* it
    // (same as React's own decodeFormState: bound.length - 1).
    const flash: Flash = typeof key === "string" ? { id, value: result, key, bound: Math.max(0, bound - 1) } : { id, value: result };
    const cookie = serializeFlash(flash);
    if (cookie) headers.append("Set-Cookie", cookie);
  }
  return new Response(null, { status: 303, headers });
}

function noStore(): Headers {
  return new Headers({ "Cache-Control": "no-store" });
}
