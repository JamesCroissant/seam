import { Suspense, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/core/app.ts";
import { data } from "../src/core/data.ts";
import type { RouteEntry, RouteModule, RouteNode } from "../src/core/types.ts";
import { memoryViewCache } from "../src/core/view-cache.ts";
import { Include } from "../src/react/include.tsx";
import { createRenderer } from "../src/react/render.tsx";
import { createIsland } from "../src/runtime/island.tsx";

const mod = (m: Partial<RouteModule> & Pick<RouteModule, "default">): RouteEntry => ({ file: "x", load: async () => m as RouteModule });
const cc = (value: string) => ({ headers: { "Cache-Control": value } });

let publicLoads = 0;
let slow: () => void = () => {};
function BadgeImpl({ n }: { n: number }) {
  return <b>{n}</b>;
}
const Badge = createIsland("islands/Badge.tsx", "Badge", BadgeImpl, {}) as typeof BadgeImpl;

const views: RouteNode = {
  static: {
    pub: { index: mod({ loader: () => (publicLoads++, data({ n: 1 }, { ...cc("public, max-age=0, s-maxage=60"), etag: "e1" })), default: ({ data }: any) => <p>pub {data.n}</p> }) },
    priv: { index: mod({ loader: () => data({}, cc("private, max-age=0")), default: () => <p>priv</p> }) },
    island: { index: mod({ default: () => <Badge n={7} /> }) },
    outer: { index: mod({ loader: () => data({}, cc("public, s-maxage=60")), default: () => <div>outer <Include src="/_v/priv" /></div> }) },
    late: {
      index: mod({
        loader: async () => {
          await new Promise<void>((r) => (slow = r));
          return data({}, cc("private, no-store"));
        },
        default: () => <p>late</p>,
      }),
    },
  },
  param: { name: "id", node: { index: mod({ default: ({ params }: any) => <p>item {params.id}</p> }) } },
};

const Html = ({ children }: { children?: ReactNode }) => (
  <html>
    <body>
      <main>{children}</main>
    </body>
  </html>
);
const page = (loaderCC: string, body: () => ReactNode, etag?: string): RouteEntry =>
  mod({ loader: () => data({}, { ...cc(loaderCC), etag }), default: body });

const routes: RouteNode = {
  layout: mod({ default: Html }),
  static: {
    "public-with-public": { index: page("public, max-age=0, s-maxage=300", () => <Include src="/_v/pub" />) },
    "public-with-private": { index: page("public, max-age=0, s-maxage=300", () => <Include src="/_v/priv" />) },
    "public-with-client": { index: page("public, max-age=0, s-maxage=300", () => <Include src="/_v/priv" client fallback={<i>…</i>} />) },
    "with-etag": { index: page("private, max-age=0", () => <Include src="/_v/pub" />, "v1") },
    "island-page": { index: mod({ default: () => <><Badge n={1} /><Include src="/_v/island" /></> }) },
    "late-include": {
      index: page("public, s-maxage=60", () => (
        <Suspense fallback={<i>…</i>}>
          <Include src="/_v/late" />
        </Suspense>
      )),
    },
  },
};

function makeApp(opts: { cache?: boolean; dev?: boolean } = {}) {
  const viewCache = opts.cache === false ? undefined : memoryViewCache();
  return createApp({ routes, views, actions: {}, render: createRenderer({ scripts: ["/entry.js"] }), viewCache, dev: opts.dev });
}
const get = (app: ReturnType<typeof makeApp>, path: string, headers: Record<string, string> = {}) => app(new Request(`http://t${path}`, { headers }));

afterEach(() => vi.restoreAllMocks());

describe("GET /_v/...", () => {
  it("returns just the component's HTML with the view's own Cache-Control", async () => {
    const res = await get(makeApp(), "/_v/pub");
    const html = await res.text();
    expect(html).toBe("<p>pub <!-- -->1</p>");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=60");
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("matches params like routes, and 404s unknown views", async () => {
    const app = makeApp();
    expect(await (await get(app, "/_v/42")).text()).toBe("<p>item <!-- -->42</p>");
    expect((await get(app, "/_v/a/b")).status).toBe(404);
  });

  it.each([true, false])("answers 304 when the view's ETag matches (shared cache: %s)", async (cache) => {
    const app = makeApp({ cache });
    const etag = (await get(app, "/_v/pub")).headers.get("ETag")!;
    expect(etag).toMatch(/^W\//);
    const res = await get(app, "/_v/pub", { "If-None-Match": etag });
    expect(res.status).toBe(304);
    expect(res.headers.get("ETag")).toBe(etag);
  });

  it("stores only public views in the shared cache", async () => {
    const app = makeApp();
    publicLoads = 0;
    const first = await get(app, "/_v/pub?v=1");
    const second = await get(app, "/_v/pub?v=1");
    expect(first.headers.get("X-Seam-Cache")).toBe("MISS");
    expect(second.headers.get("X-Seam-Cache")).toBe("HIT");
    expect(await second.text()).toBe("<p>pub <!-- -->1</p>");
    expect(publicLoads).toBe(1);

    await get(app, "/_v/pub?v=2"); // a new version is a new URL
    expect(publicLoads).toBe(2);

    expect((await get(app, "/_v/priv")).headers.get("X-Seam-Cache")).toBeNull();
    expect((await get(app, "/_v/priv")).headers.get("X-Seam-Cache")).toBeNull();
  });

  it("islands inside a view get ids that cannot clash with the page's", async () => {
    const html = await (await get(makeApp(), "/island-page")).text();
    expect(html).toContain('data-prefix="i0-"');
    expect(html).toMatch(/<seam-view src="\/_v\/island"><seam-island [^>]*data-prefix="v[0-9a-z]+-i0-"/);
  });
});

describe("<Include>", () => {
  it("server include: inlines the view and merges its Cache-Control (strictest wins)", async () => {
    const res = await get(makeApp(), "/public-with-public");
    expect(await res.text()).toContain('<seam-view src="/_v/pub"><p>pub <!-- -->1</p></seam-view>');
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=60");
  });

  it("a private view makes the page private, and dev mode explains why", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await get(makeApp({ dev: true }), "/public-with-private");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=0");
    expect(warn.mock.calls[0][0]).toMatch(/\/_v\/priv made it private.*<Include client>/);
  });

  it("client include: a placeholder that does not touch the page's Cache-Control", async () => {
    const res = await get(makeApp(), "/public-with-client");
    expect(await res.text()).toContain('<seam-view src="/_v/priv" data-load="client"><i>…</i></seam-view>');
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=0, s-maxage=300");
  });

  it("nested includes count toward the outer view", async () => {
    const res = await get(makeApp(), "/_v/outer");
    expect(await res.text()).toBe('<div>outer <seam-view src="/_v/priv"><p>priv</p></seam-view></div>');
    expect(res.headers.get("Cache-Control")).toBe("private, no-cache");
  });

  it("a page that includes views gets no ETag (the views have their own versions)", async () => {
    const res = await get(makeApp(), "/with-etag");
    expect(res.headers.get("ETag")).toBeNull();
  });

  it("warns when an include inside <Suspense> turns out stricter than the headers already sent", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await get(makeApp(), "/late-include");
    expect(res.headers.get("Cache-Control")).toBe("public, no-cache, s-maxage=60"); // sent before the view finished
    slow();
    await res.text();
    expect(error.mock.calls.some((c) => /finished after the page was sent.*<Include client>/.test(String(c[0])))).toBe(true);
  });

  it("rejects src outside /_v/", () => {
    expect(() => Include({ src: "/admin" })).toThrow(/must start with \/_v\//);
  });
});

describe("RSC views (GET /_v/....rsc)", () => {
  it("are handed to the rsc environment, through the same view cache", async () => {
    const seen: string[] = [];
    const app = createApp({
      routes,
      views,
      actions: {},
      render: createRenderer({ scripts: [] }),
      viewCache: memoryViewCache(),
      rsc: {
        handle: async (req) => {
          seen.push(new URL(req.url).pathname);
          return new Response("0:\"flight\"", { headers: { "Content-Type": "text/x-component", "Cache-Control": "public, s-maxage=60" } });
        },
      },
    });
    const first = await app(new Request("http://t/_v/pub.rsc?v=1"));
    expect(await first.text()).toBe('0:"flight"');
    expect(first.headers.get("X-Seam-Cache")).toBe("MISS");
    expect((await app(new Request("http://t/_v/pub.rsc?v=1"))).headers.get("X-Seam-Cache")).toBe("HIT");
    expect(seen).toEqual(["/_v/pub.rsc"]);
  });

  it("404 when RSC is not enabled", async () => {
    const res = await makeApp().call(null, new Request("http://t/_v/pub.rsc"));
    expect(res.status).toBe(404);
    expect(await res.text()).toMatch(/rsc: true/);
  });
});

describe("<Slot>", () => {
  it("renders its children when no component is plugged in (e.g. in the HTML version of a view)", async () => {
    const { renderToString } = await import("react-dom/server");
    const { Slot, SlotContext } = await import("../src/rsc/slot.tsx");
    expect(renderToString(<Slot name="a" props={{ x: 1 }}><i>none</i></Slot>)).toBe("<i>none</i>");
    const A = ({ x }: { x: number }) => <b>{x}</b>;
    expect(renderToString(<SlotContext value={{ a: A }}><Slot name="a" props={{ x: 1 }} /></SlotContext>)).toBe("<b>1</b>");
  });
});
