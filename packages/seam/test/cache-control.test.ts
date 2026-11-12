import { describe, expect, it } from "vitest";
import { mergeCacheControl } from "../src/core/cache-control.ts";

describe("mergeCacheControl (strictest wins)", () => {
  it("defaults to private, no-cache", () => {
    expect(mergeCacheControl([])).toBe("private, no-cache");
    expect(mergeCacheControl([null])).toBe("private, no-cache");
  });

  it("stays public only if every loader is public", () => {
    expect(mergeCacheControl(["public, max-age=60, s-maxage=600", "public, max-age=30, s-maxage=300"])).toBe(
      "public, max-age=30, s-maxage=300",
    );
    expect(mergeCacheControl(["public, max-age=60", "private, max-age=10"])).toBe("private, max-age=10");
  });

  it("a loader without a header makes the page private", () => {
    expect(mergeCacheControl(["public, max-age=60", null])).toBe("private, no-cache");
  });

  it("no-store beats everything", () => {
    expect(mergeCacheControl(["public, max-age=60", "no-store"])).toBe("no-store");
  });

  it("keeps stale-while-revalidate when all public loaders give it", () => {
    expect(mergeCacheControl(["public, max-age=0, s-maxage=60, stale-while-revalidate=30"])).toBe(
      "public, max-age=0, s-maxage=60, stale-while-revalidate=30",
    );
  });
});
