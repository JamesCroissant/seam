import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { z } from "zod";
import { get } from "../src/api/server.ts";
import type { StandardSchemaV1 } from "../src/api/standard-schema.ts";
import { createApp } from "../src/core/app.ts";
import { data } from "../src/core/data.ts";
import type { ApiEntry } from "../src/core/types.ts";
import { createRenderer } from "../src/react/render.tsx";
import { createApiReference } from "../src/runtime/api-client.ts";
import { ApiError, buildApiUrl } from "../src/runtime/api-shared.ts";
import { checkApiConflicts, extractApiExports } from "../src/vite/scan.ts";

// ---- endpoints, as a *.api.ts file would declare them ----
const items = [
  { id: "1", name: "Apple", price: 3 },
  { id: "2", name: "Banana", price: 1 },
];

const search = get("/api/items", {
  query: z.object({ q: z.string().default(""), max: z.coerce.number().optional() }),
  headers: { "Cache-Control": "public, max-age=0, s-maxage=30" },
  handler: ({ query }) => items.filter((i) => i.name.toLowerCase().includes(query.q.toLowerCase()) && (query.max === undefined || i.price <= query.max)),
});

const byId = get("/api/items/:id", {
  handler: ({ params }) => {
    const item = items.find((i) => i.id === params.id);
    if (!item) throw new Response("Not Found", { status: 404 });
    return data(item, { headers: { "Cache-Control": "private, max-age=0" }, etag: `v${item.price}` });
  },
});

const newest = get("/api/items/newest", { handler: () => items[1] });
const files = get("/api/files/*path", { handler: ({ params }) => ({ path: params.path }) });

// A hand-written Standard Schema: Seam needs no validation library.
const evenOnly: StandardSchemaV1<{ n: string }, { n: number }> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (v: any) => (Number(v?.n) % 2 === 0 ? { value: { n: Number(v.n) } } : { issues: [{ message: "must be even", path: ["n"] }] }),
  },
};
const even = get("/api/even", { query: evenOnly, handler: ({ query }) => ({ half: query.n / 2 }) });

const entry = (path: string, fn: unknown): ApiEntry => ({ method: "GET", path, load: async () => fn as any });
const app = createApp({
  routes: {},
  actions: {},
  render: createRenderer({ scripts: [] }),
  api: [
    entry("/api/items", search),
    entry("/api/items/:id", byId),
    entry("/api/items/newest", newest),
    entry("/api/files/*path", files),
    entry("/api/even", even),
  ],
});
const fetchApp = (path: string, init?: RequestInit) => app(new Request(`http://t${path}`, init));

afterEach(() => vi.unstubAllGlobals());

describe("server: GET /api/...", () => {
  it("validates the query with the schema and returns JSON with the declared Cache-Control", async () => {
    const res = await fetchApp("/api/items?q=an&max=2");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=30");
    expect(await res.json()).toEqual([{ id: "2", name: "Banana", price: 1 }]);
  });

  it("answers 400 with the schema's issues", async () => {
    const res = await fetchApp("/api/even?n=3");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid query", issues: [{ path: "n", message: "must be even" }] });
    expect(await (await fetchApp("/api/even?n=4")).json()).toEqual({ half: 2 });
  });

  it("path params, static-before-param priority, catch-all", async () => {
    expect(await (await fetchApp("/api/items/1")).json()).toMatchObject({ name: "Apple" });
    expect(await (await fetchApp("/api/items/newest")).json()).toMatchObject({ name: "Banana" });
    expect(await (await fetchApp("/api/files/a/b%20c")).json()).toEqual({ path: "a/b c" });
  });

  it("data(value, { etag }) gives an ETag and 304", async () => {
    const first = await fetchApp("/api/items/1");
    const etag = first.headers.get("ETag")!;
    expect(first.headers.get("Cache-Control")).toBe("private, max-age=0");
    expect((await fetchApp("/api/items/1", { headers: { "If-None-Match": etag } })).status).toBe(304);
  });

  it("a thrown Response becomes the response", async () => {
    expect((await fetchApp("/api/items/9")).status).toBe(404);
  });

  it("is GET only: writes belong to 'use server'", async () => {
    const res = await fetchApp("/api/items", { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("GET, HEAD");
  });
});

describe("server: calling the function directly (e.g. in a loader)", () => {
  it("runs the handler without HTTP and unwraps data()", async () => {
    expect(await search({ query: { q: "app" } })).toEqual([items[0]]);
    expect(await byId({ params: { id: "2" } })).toEqual(items[1]);
  });

  it("throws ApiError for invalid input or an error Response", async () => {
    await expect(even({ query: { n: "3" } })).rejects.toBeInstanceOf(ApiError);
    await expect(byId({ params: { id: "9" } })).rejects.toMatchObject({ status: 404 });
  });
});

describe("browser: createApiReference", () => {
  it("builds the URL (sorted query, encoded params) and returns the JSON", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => Response.json({ url }));
    vi.stubGlobal("fetch", fetchMock);
    const ref = createApiReference("/api/items/:id") as any;
    expect(await ref({ params: { id: "a/b" }, query: { z: 1, a: "x y", skip: undefined } })).toEqual({ url: "/api/items/a%2Fb?a=x+y&z=1" });
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
    expect(ref.url({ params: { id: "1" } })).toBe("/api/items/1");
  });

  it("throws ApiError with the status and body", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "nope" }, { status: 400 }));
    const ref = createApiReference("/api/items") as any;
    await expect(ref()).rejects.toMatchObject({ name: "ApiError", status: 400, body: { error: "nope" } });
  });

  it("buildApiUrl keeps catch-all slashes", () => {
    expect(buildApiUrl("/api/files/*path", { path: "a/b c" })).toBe("/api/files/a/b%20c");
  });
});

describe("types (checked by tsc)", () => {
  it("infers params, query input and the result from the declaration", () => {
    expectTypeOf(search).returns.resolves.toEqualTypeOf<{ id: string; name: string; price: number }[]>();
    expectTypeOf(byId).returns.resolves.toEqualTypeOf<{ id: string; name: string; price: number }>();
    expectTypeOf(byId).parameter(0).toEqualTypeOf<{ params: { id: string } } & { query?: undefined }>();
    expectTypeOf(search).parameter(0).toExtend<{ query?: { q?: string; max?: unknown } } | undefined>();
    // @ts-expect-error params are required when the path has them
    void (() => byId());
    // @ts-expect-error unknown param name
    void (() => byId({ params: { nope: "1" } }));
  });
});

describe("build: reading *.api.ts", () => {
  it("reads export names and literal paths", () => {
    const js = `export const a = get("/api/a", { handler() {} });\nexport const b = get('/api/b/:id', { handler() {} });`;
    expect(extractApiExports(js, "x.api.ts", ["a", "b"])).toEqual([
      { file: "x.api.ts", name: "a", path: "/api/a" },
      { file: "x.api.ts", name: "b", path: "/api/b/:id" },
    ]);
  });

  it("rejects non-literal paths, paths outside /api/, and ambiguous endpoints", () => {
    expect(() => extractApiExports("export const a = get(p, {})", "x.api.ts", ["a"])).toThrow(/string literal path/);
    expect(() => extractApiExports('export const a = get("/x", {})', "x.api.ts", ["a"])).toThrow(/must start with \/api\//);
    expect(() =>
      checkApiConflicts([
        { file: "a.api.ts", name: "a", path: "/api/u/:id" },
        { file: "b.api.ts", name: "b", path: "/api/u/:slug" },
      ]),
    ).toThrow(/conflicts/);
  });
});
