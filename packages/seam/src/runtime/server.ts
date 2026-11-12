/**
 * Server half of a 'use server' module. The Vite plugin appends, for every export:
 *
 *   registerServerReference(updateInvoice, "a1b2c3d4e5f6");
 *
 * It adds three things React's SSR (Fizz) looks for, so that
 * `<form action={updateInvoice}>` renders as a working HTML form without JS:
 *
 *   $$FORM_ACTION(prefix)      → { name, action: "/_action/<id>", method, encType, data: hidden fields }
 *   bind(this, ...args)        → keeps $$FORM_ACTION and records bound args (useActionState binds prevState)
 *   $$IS_SIGNATURE_EQUAL(id,n) → lets useActionState pick up the result after the 303 (formState)
 *
 * NOTE: $$FORM_ACTION / $$IS_SIGNATURE_EQUAL are React internals, not public API.
 * Checked against react-dom@19.3.1. If they change, use `formProps(action)` instead.
 */
import { tryGetContext } from "../core/context.ts";

export const ACTION_URL = (id: string) => `/_action/${id}`;

interface ReferenceMeta {
  $$id: string;
  url: string;
}

export type ServerReference<F> = F & ReferenceMeta;

function currentReturnPath(): string {
  const req = tryGetContext()?.request;
  if (!req) return "/";
  const u = new URL(req.url);
  return u.pathname + u.search;
}

function hiddenFields(bound: unknown[]): FormData {
  const data = new FormData();
  data.append("$return", currentReturnPath());
  if (bound.length > 0) data.append("$bound", JSON.stringify(bound));
  return data;
}

function attach<F extends (...args: any[]) => unknown>(fn: F, id: string, bound: unknown[]): ServerReference<F> {
  const url = ACTION_URL(id);
  Object.defineProperties(fn, {
    $$id: { value: id },
    url: { value: url },
    $$FORM_ACTION: {
      value: (_prefix: string) => ({
        // Fizz writes the `data` fields only when `name` is set (React's own convention: $ACTION_ID_<id>).
        name: `$ACTION_ID_${id}`,
        action: url,
        method: "POST",
        encType: "multipart/form-data",
        data: hiddenFields(bound),
      }),
    },
    $$IS_SIGNATURE_EQUAL: {
      value: (referenceId: string, numberOfBoundArgs: number) => referenceId === id && numberOfBoundArgs === bound.length,
    },
    bind: {
      value: function (this: unknown, thisArg: unknown, ...args: unknown[]) {
        const b = Function.prototype.bind.call(fn, thisArg, ...args) as F;
        return attach(b, id, [...bound, ...args]);
      },
    },
  });
  return fn as ServerReference<F>;
}

export function registerServerReference<F extends (...args: any[]) => unknown>(fn: F, id: string): ServerReference<F> {
  if (typeof fn !== "function") return fn;
  return attach(fn, id, []);
}

/**
 * The escape hatch that uses only public API:
 *   <form {...formProps(updateInvoice)}> ... </form>
 * renders the same HTML as <form action={updateInvoice}>, minus the hidden `$return` field.
 * After the action, the 303 goes to the Referer (or "/" when the browser sends none).
 */
export function formProps(action: unknown): { action: string; method: "post"; encType: "multipart/form-data" } {
  const url = (action as Partial<ReferenceMeta>)?.url;
  if (typeof url !== "string") throw new Error("formProps() expects a function exported from a 'use server' file.");
  return { action: url, method: "post", encType: "multipart/form-data" };
}
