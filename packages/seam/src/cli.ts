#!/usr/bin/env node
/**
 * seam dev     development server (Vite)
 * seam build   production build into dist/ (client, server, and rsc when enabled)
 * seam start   run the production server (always with NODE_ENV=production)
 *
 * A vite.config.* in the project is used when present; otherwise the config is just `seam()`.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const USAGE = `Usage: seam <command> [--port <number>]

Commands:
  dev     start the development server
  build   build for production (dist/)
  start   run the production build (NODE_ENV=production)
`;

const [command, ...args] = process.argv.slice(2);
const root = process.cwd();
const portArg = args.indexOf("--port");
const port = portArg !== -1 ? Number(args[portArg + 1]) : undefined;

const CONFIG_FILES = ["vite.config.ts", "vite.config.mts", "vite.config.js", "vite.config.mjs"];

async function viteConfig() {
  if (CONFIG_FILES.some((f) => existsSync(resolve(root, f)))) return { root };
  const { default: seam } = await import("./vite/plugin.ts");
  return { root, configFile: false as const, plugins: [seam()] };
}

async function main(): Promise<void> {
  switch (command) {
    case "dev": {
      const { createServer } = await import("vite");
      const server = await createServer({ ...(await viteConfig()), server: { port } });
      await server.listen();
      server.printUrls();
      server.bindCLIShortcuts({ print: true });
      return;
    }
    case "build": {
      process.env.NODE_ENV = "production";
      const { createBuilder } = await import("vite");
      const builder = await createBuilder(await viteConfig());
      await builder.buildApp();
      return;
    }
    case "start": {
      // Must be set before React is loaded: otherwise React runs its development build.
      process.env.NODE_ENV = "production";
      if (port !== undefined) process.env.PORT = String(port);
      const entry = resolve(root, "dist/server/server.js");
      if (!existsSync(entry)) {
        console.error("[seam] dist/server/server.js not found. Run `seam build` first.");
        process.exit(1);
      }
      const meta = resolve(root, "dist/server/seam.json");
      const adapter = existsSync(meta) ? (JSON.parse(readFileSync(meta, "utf8")) as { adapter: string }).adapter : "node";
      if (adapter !== "node") {
        const how: Record<string, string> = {
          bun: "NODE_ENV=production bun dist/server/server.js",
          deno: "NODE_ENV=production deno run -A dist/server/server.js",
          cloudflare: "npx wrangler dev  (or deploy with wrangler; main = dist/server/server.js, assets = dist/client)",
        };
        console.error(`[seam] this build is for the "${adapter}" adapter. Run it with:\n  ${how[adapter] ?? adapter}`);
        process.exit(1);
      }
      await import(pathToFileURL(entry).href);
      return;
    }
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return;
    default:
      console.error(`[seam] unknown command "${command}"\n\n${USAGE}`);
      process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
