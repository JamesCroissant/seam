const BRAND = Symbol.for("seam.data");

export interface DataInit {
  status?: number;
  headers?: HeadersInit;
  /**
   * A version string for this loader's data (e.g. updatedAt).
   * When every loader of a page gives one, the page gets an ETag and can answer 304.
   */
  etag?: string;
}

export class DataResult<T> {
  readonly [BRAND] = true;
  constructor(
    readonly value: T,
    readonly init: DataInit,
  ) {}
}

/** Return data together with HTTP headers (Cache-Control, Set-Cookie, ...) from a loader. */
export function data<T>(value: T, init: DataInit = {}): DataResult<T> {
  return new DataResult(value, init);
}

export function isDataResult(v: unknown): v is DataResult<unknown> {
  return typeof v === "object" && v !== null && (v as any)[BRAND] === true;
}

/** A 303 See Other. Return it from an action, or throw it from a loader. */
export function redirect(location: string, init: { status?: 301 | 302 | 303 | 307 | 308; headers?: HeadersInit } = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Location", location);
  return new Response(null, { status: init.status ?? 303, headers });
}

export function isRedirect(res: Response): boolean {
  return res.status >= 300 && res.status < 400 && res.headers.has("Location");
}
