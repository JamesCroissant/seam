import { Suspense, use, useActionState, useId, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/core/app.ts";
import { getActionResult } from "../src/core/context.ts";
import { data, redirect } from "../src/core/data.ts";
import type { RouteEntry, RouteModule, RouteNode } from "../src/core/types.ts";
import { createRenderer } from "../src/react/render.tsx";
import { createIsland } from "../src/runtime/island.tsx";
import { registerServerReference } from "../src/runtime/server.ts";

// ---- what the Vite plugin would generate ----
const save = registerServerReference(async (form: FormData) => (form.get("title") ? undefined : { error: "Title is required" }), "save01");
const bump = registerServerReference(async (prev: { n: number }) => ({ n: prev.n + 1 }), "bump01");

function CounterImpl({ start }: { start: number }) {
  const id = useId();
  const [state, action] = useActionState(bump, { n: start });
  return (
    <form action={action}>
      <label htmlFor={id}>count</label>
      <output id={id}>{state.n}</output>
      <button>+1</button>
    </form>
  );
}
const Counter = createIsland("islands/Counter.tsx", "Counter", CounterImpl, {}) as typeof CounterImpl;

// ---- routes ----
const mod = (m: Partial<RouteModule> & Pick<RouteModule, "default">): RouteEntry => ({ file: "x", load: async () => m as RouteModule });

const root = mod({
  default: ({ children }: { children?: ReactNode }) => (
    <html>
      <body>
        <main>{children}</main>
      </body>
    </html>
  ),
  ErrorBoundary: ({ error }: { error: any }) => (
    <html>
      <body>
        <main>
          <h1>Error {error.status}</h1>
        </main>
      </body>
    </html>
  ),
});

let slowResolve: () => void = () => {};
const routes: RouteNode = {
  layout: root,
  index: mod({
    loader: async () => data({ msg: "hello", result: getActionResult<{ error: string }>(save) }, { headers: { "Cache-Control": "public, max-age=60" }, etag: "v1" }),
    default: ({ data }: any) => (
      <>
        <p>{data.msg}</p>
        {data.result && <p role="alert">{data.result.error}</p>}
        <form action={save}>
          <input name="title" />
        </form>
        <Counter start={1} />
      </>
    ),
  }),
  static: {
    private: { index: mod({ loader: () => data(1, { headers: { "Cache-Control": "private, max-age=5" } }), default: () => <p>p</p> }) },
    old: { index: mod({ loader: () => redirect("/"), default: () => null }) },
    boom: { index: mod({ loader: () => Promise.reject(new Response("gone", { status: 410 })), default: () => null }) },
    slow: {
      index: mod({
        loader: () => ({ later: new Promise<string>((r) => (slowResolve = () => r("done"))) }),
        default: ({ data }: any) => (
          <Suspense fallback={<i>wait</i>}>
            <Later p={data.later} />
          </Suspense>
        ),
      }),
    },
  },
};
function Later({ p }: { p: Promise<string> }) {
  return <b>{use(p)}</b>;
}

const app = createApp({
  routes,
  actions: { save01: async () => save, bump01: async () => bump },
  render: createRenderer({ scripts: ["/entry.js"] }),
});

const get = (path: string, headers: Record<string, string> = {}) => app(new Request(`http://t${path}`, { headers }));

describe("createApp: GET", () => {
  it("renders layouts + page, adds the script, merges Cache-Control and sets an ETag", async () => {
    const res = await get("/");
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("<main><p>hello</p>");
    expect(html).toContain('src="/entry.js"');
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(res.headers.get("ETag")).toMatch(/^W\/"/);

    const again = await get("/", { "If-None-Match": res.headers.get("ETag")! });
    expect(again.status).toBe(304);
  });

  it("<form action={serverFn}> renders as a plain HTML form (React's $$FORM_ACTION)", async () => {
    const html = await (await get("/?q=1")).text();
    expect(html).toContain('<form action="/_action/save01" encType="multipart/form-data" method="POST">');
    expect(html).toContain('<input type="hidden" name="$return" value="/?q=1"/>');
  });

  it("islands render inside <seam-island> with JSON props, their own useId prefix and useActionState fields", async () => {
    const html = await (await get("/")).text();
    expect(html).toMatch(/<seam-island data-island="islands\/Counter.tsx" data-export="Counter" data-props="\{&quot;start&quot;:1\}" data-prefix="i0-"/);
    expect(html).toContain('<label for="_i0-R_');
    expect(html).toContain('name="$bound" value="[{&quot;n&quot;:1}]"');
    expect(html).toContain('name="$ACTION_KEY"');
  });

  it("a loader redirect is returned as-is", async () => {
    const res = await get("/old");
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/");
  });

  it("a thrown Response renders the nearest ErrorBoundary with its status", async () => {
    const res = await get("/boom");
    expect(res.status).toBe(410);
    expect(await res.text()).toContain("<h1>Error <!-- -->410</h1>");
    const nf = await get("/missing");
    expect(nf.status).toBe(404);
  });

  it("streams Suspense for browsers, but waits for everything for the navigation script", async () => {
    const streaming = get("/slow");
    const res = await streaming;
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain("<i>wait</i>");
    slowResolve();
    reader.cancel();

    const navPromise = get("/slow", { "X-Seam-Nav": "1" });
    setTimeout(() => slowResolve(), 10);
    const nav = await (await navPromise).text();
    expect(nav).toContain("<b>done</b>");
    expect(nav).not.toContain("$RC");
  });
});

describe("createApp: POST → 303 → GET", () => {
  it("validation error survives the redirect once, then disappears", async () => {
    const body = new FormData();
    body.append("title", "");
    body.append("$return", "/");
    const post = await app(new Request("http://t/_action/save01", { method: "POST", body }));
    expect(post.status).toBe(303);
    const cookie = post.headers.get("Set-Cookie")!.split(";")[0];

    const page = await get("/", { Cookie: cookie });
    expect(page.headers.get("Cache-Control")).toBe("private, no-store");
    expect(page.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(await page.text()).toContain('<p role="alert">Title is required</p>');
  });

  it("useActionState without JS: the island starts from the action's result (formState)", async () => {
    const html = await (await get("/")).text();
    const key = /name="\$ACTION_KEY" value="([^"]+)"/.exec(html)![1];
    const body = new FormData();
    body.append("$bound", JSON.stringify([{ n: 1 }]));
    body.append("$ACTION_KEY", key);
    body.append("$return", "/");
    const post = await app(new Request("http://t/_action/bump01", { method: "POST", body }));
    const cookie = post.headers.get("Set-Cookie")!.split(";")[0];

    const after = await (await get("/", { Cookie: cookie })).text();
    expect(after).toContain("<!--F!-->"); // React: "this form state matched"
    expect(after).toContain(">2</output>");
  });
});

describe("createApp: mount", () => {
  it("passes a path prefix to another fetch handler (e.g. Hono)", async () => {
    const mounted = createApp({ routes, actions: {}, render: createRenderer({ scripts: [] }), mount: { "/api": () => Response.json({ ok: true }) } });
    expect(await (await mounted(new Request("http://t/api/x"))).json()).toEqual({ ok: true });
    expect((await mounted(new Request("http://t/apix"))).status).toBe(404);
  });
});
