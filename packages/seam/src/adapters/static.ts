/** Shared by the Bun and Deno adapters (no Node.js APIs here). */

const TYPES: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  html: "text/html; charset=utf-8",
  json: "application/json",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  ico: "image/x-icon",
  woff2: "font/woff2",
  txt: "text/plain; charset=utf-8",
};

export function contentType(pathname: string): string {
  return TYPES[pathname.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** Hashed build assets never change; everything else must be revalidated. */
export function staticCacheControl(pathname: string): string {
  return pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate";
}

/** A request path that is safe to map onto a folder (no "..", not a directory). */
export function staticPath(request: Request): string | null {
  if (request.method !== "GET" && request.method !== "HEAD") return null;
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname);
  } catch {
    return null;
  }
  if (pathname.endsWith("/") || pathname.includes("..") || pathname.includes("\0")) return null;
  return pathname;
}
