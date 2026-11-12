import { fileURLToPath } from "node:url";
import { createBuilder } from "vite";
import { describe, expect, it } from "vitest";
import seam from "../src/vite/plugin.ts";

describe("server-only guard", () => {
  it("fails the build when an island imports a *.server.ts file", async () => {
    const root = fileURLToPath(new URL("./fixtures/leak", import.meta.url));
    const builder = await createBuilder({ root, configFile: false, logLevel: "silent", plugins: [seam()] });
    await expect(builder.buildApp()).rejects.toThrow(/app\/server\/secret\.server\.ts is server-only.*app\/islands\/Leak\.tsx/);
  }, 30_000);
});
