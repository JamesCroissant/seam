/**
 * Node.js adapter: IncomingMessage → Request, Response → ServerResponse.
 * The only adapter that has to convert; every other runtime speaks Request/Response.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { App } from "../core/types.ts";

export interface ToRequestOptions {
  /** Trust X-Forwarded-Proto / X-Forwarded-Host (only behind a proxy you control). */
  trustProxy?: boolean;
}

export function toRequest(req: IncomingMessage, res: ServerResponse, options: ToRequestOptions = {}): Request {
  const fwdProto = options.trustProxy ? first(req.headers["x-forwarded-proto"]) : undefined;
  const fwdHost = options.trustProxy ? first(req.headers["x-forwarded-host"]) : undefined;
  const proto = fwdProto ?? ((req.socket as { encrypted?: boolean }).encrypted ? "https" : "http");
  const host = fwdHost ?? req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${proto}://${host}`);

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v === undefined || k.startsWith(":")) continue;
    if (Array.isArray(v)) for (const x of v) headers.append(k, x);
    else headers.set(k, v);
  }

  // If the browser goes away, stop rendering (React streaming listens to request.signal).
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) controller.abort();
  });

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  return new Request(url, {
    method: req.method,
    headers,
    body: hasBody ? (Readable.toWeb(req) as unknown as ReadableStream<Uint8Array>) : undefined,
    signal: controller.signal,
    // Node's fetch needs this for a streaming request body.
    duplex: "half",
  } as RequestInit);
}

export async function writeResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {};
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") headers[key] = value;
  });
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) headers["set-cookie"] = cookies;

  res.writeHead(response.status, response.statusText || undefined, headers);
  if (!response.body) {
    res.end();
    return;
  }
  try {
    await pipeline(Readable.fromWeb(response.body as any), res);
  } catch (e) {
    if ((e as { code?: string }).code !== "ERR_STREAM_PREMATURE_CLOSE") throw e;
  }
}

/** Use the app as a `(req, res)` handler, e.g. inside Express or Vite's dev server. */
export function toNodeHandler(app: App, options: ToRequestOptions = {}) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    try {
      await writeResponse(res, await app(toRequest(req, res, options)));
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    }
  };
}

export interface ServeOptions extends ToRequestOptions {
  port?: number;
  hostname?: string;
  /** Directory with the client build (dist/client). Files under /assets/ are cached for a year. */
  staticDir?: string;
}

export function serve(app: App, options: ServeOptions = {}): Server {
  const handler = toNodeHandler(app, options);
  const staticRoot = options.staticDir ? resolve(options.staticDir) : null;

  const server = createServer(async (req, res) => {
    if (staticRoot && (req.method === "GET" || req.method === "HEAD") && (await serveStatic(staticRoot, req, res))) return;
    await handler(req, res);
  });
  if (process.env.NODE_ENV !== "production") {
    console.warn("[seam] NODE_ENV is not \"production\": React runs its development build (slower, and RSC responses include debug info such as file paths).");
  }
  const port = options.port ?? Number(process.env.PORT ?? 3000);
  server.listen(port, options.hostname, () => console.log(`[seam] http://localhost:${port}`));
  return server;
}

const TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
};

async function serveStatic(root: string, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (pathname === "/" || pathname.endsWith("/")) return false;
  const file = normalize(join(root, pathname));
  if (!file.startsWith(root + sep)) return false;
  try {
    const s = await stat(file);
    if (!s.isFile()) return false;
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Content-Length": s.size,
      "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
    });
    if (req.method === "HEAD") res.end();
    else await pipeline(createReadStream(file), res);
    return true;
  } catch {
    return false;
  }
}

function first(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return s?.split(",")[0].trim() || undefined;
}
