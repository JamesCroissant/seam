import { defineConfig } from "vitest/config";

export default defineConfig({
  oxc: { jsx: { runtime: "automatic", importSource: "react" } },
  test: {
    include: ["packages/**/test/**/*.test.{ts,tsx}"],
  },
});
