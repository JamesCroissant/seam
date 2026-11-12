import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { actionId, generateRoutes, readDirective, scanApiFiles, scanDirectives, scanRoutes } from "../src/vite/scan.ts";

const example = fileURLToPath(new URL("../../../examples/invoices", import.meta.url));

describe("readDirective", () => {
  it.each([
    ['"use client";\nexport {}', "use client"],
    ["'use server'\n", "use server"],
    ["// comment\n/* block */\n'use client'", "use client"],
    ["import x from 'y'\n'use client'", null],
    ["const a = 'use client'", null],
  ])("%j", (code, expected) => {
    expect(readDirective(code)).toBe(expected);
  });
});

describe("actionId", () => {
  it("is stable and depends on file + export name", () => {
    expect(actionId("app/a.ts", "save")).toBe(actionId("app/a.ts", "save"));
    expect(actionId("app/a.ts", "save")).not.toBe(actionId("app/b.ts", "save"));
    expect(actionId("app/a.ts", "save")).toMatch(/^[0-9a-f]{12}$/);
  });
});

describe("scan the example app", () => {
  it("builds the route trie from files", async () => {
    const tree = await scanRoutes(example, "app/routes");
    expect(tree.layout).toBe("app/routes/_layout.tsx");
    expect(tree.index).toBe("app/routes/index.tsx");
    expect(tree.static.about.index).toBe("app/routes/about.tsx");
    expect(tree.static.invoices.layout).toBe("app/routes/invoices/_layout.tsx");
    expect(tree.static.invoices.param?.name).toBe("id");
    expect(tree.static.invoices.param?.node.index).toBe("app/routes/invoices/[id].tsx");

    const code = generateRoutes(tree, `${example}/.seam`, example);
    expect(code).toContain('load: () => import("../app/routes/invoices/[id].tsx")');
  });

  it("finds 'use client' and 'use server' files", async () => {
    expect(await scanDirectives(example, "app")).toEqual({
      client: ["app/islands/Board.tsx", "app/islands/InvoiceSearch.tsx", "app/islands/StatusToggle.tsx", "app/islands/Stopwatch.tsx"],
      server: ["app/actions/invoice.ts"],
    });
  });

  it("finds *.api.ts files", async () => {
    expect(await scanApiFiles(example, "app")).toEqual(["app/api/invoices.api.ts"]);
  });
});
