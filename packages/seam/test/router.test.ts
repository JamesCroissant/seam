import { describe, expect, it } from "vitest";
import { matchRoute } from "../src/core/router.ts";
import type { RouteEntry, RouteNode } from "../src/core/types.ts";

const e = (file: string): RouteEntry => ({ file, load: async () => ({ default: () => null }) });
const files = (m: ReturnType<typeof matchRoute>) => m?.entries.map((x) => x.file);

const trie: RouteNode = {
  layout: e("root"),
  index: e("home"),
  static: {
    invoices: {
      layout: e("invoices/_layout"),
      index: e("invoices/index"),
      static: { new: { index: e("invoices/new") } },
      param: { name: "id", node: { index: e("invoices/[id]"), static: { edit: { index: e("invoices/[id]/edit") } } } },
    },
    docs: { rest: { name: "path", entry: e("docs/[...path]") } },
  },
};

describe("matchRoute", () => {
  it("collects layouts outermost first", () => {
    expect(files(matchRoute(trie, "/"))).toEqual(["root", "home"]);
    expect(files(matchRoute(trie, "/invoices"))).toEqual(["root", "invoices/_layout", "invoices/index"]);
  });

  it("prefers static over param", () => {
    expect(files(matchRoute(trie, "/invoices/new"))).toEqual(["root", "invoices/_layout", "invoices/new"]);
    const m = matchRoute(trie, "/invoices/42");
    expect(files(m)).toEqual(["root", "invoices/_layout", "invoices/[id]"]);
    expect(m?.params).toEqual({ id: "42" });
  });

  it("matches nested segments under a param and decodes them", () => {
    const m = matchRoute(trie, "/invoices/a%20b/edit");
    expect(files(m)?.at(-1)).toBe("invoices/[id]/edit");
    expect(m?.params).toEqual({ id: "a b" });
  });

  it("catch-all takes the rest of the path", () => {
    expect(matchRoute(trie, "/docs/a/b/c")?.params).toEqual({ path: "a/b/c" });
  });

  it("returns null when nothing matches", () => {
    expect(matchRoute(trie, "/nope")).toBeNull();
    expect(matchRoute(trie, "/invoices/1/nope")).toBeNull();
  });
});
