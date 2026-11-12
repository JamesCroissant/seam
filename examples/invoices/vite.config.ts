import { defineConfig } from "vite";
import seam from "seam/vite";

export default defineConfig({
  plugins: [seam({ server: "server.node.ts", viewCache: "memory", rsc: true })],
});
