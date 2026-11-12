/**
 * The Seam Vite plugin. Everything it does, in one list:
 *
 *  1. Scan app/ and write .seam/{routes,views,actions,islands,api}.gen.ts (readable output).
 *  2. 'use server' files
 *       client bundle → `export const f = createServerReference("<id>")`   (a fetch to POST /_action/<id>)
 *       server bundle → the file as written + `registerServerReference(f, "<id>")`
 *  3. 'use client' files
 *       server bundle → wrapped with createIsland(...) so they render as <seam-island>
 *       client bundle → unchanged (they are the islands)
 *  4. *.api.ts files
 *       client bundle → `export const f = createApiReference("/api/...")`   (a fetch to GET /api/...)
 *       server bundle → unchanged
 *  5. Guard: a *.server.ts file or `server-only` imported into the client bundle is a build error.
 *  6. Dev server: every request goes to `app(request)` loaded from the SSR environment.
 *  7. Build: client first (for the manifest), then the server.
 *  8. Optional `rsc: true`: adds @vitejs/plugin-rsc. Views can then also be served as RSC
 *     (GET /_v/....rsc) from the `rsc` environment. Seam's own 'use server' transform runs
 *     *before* plugin-rsc's, so actions keep Seam's protocol (POST /_action/<id>) everywhere.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { init, parse } from "es-module-lexer";
import { isRunnableDevEnvironment, transformWithOxc, type Plugin, type PluginOption, type ResolvedConfig, type ViteDevServer } from "vite";
import { toRequest, writeResponse } from "../adapters/node.ts";
import {
  API_FILE,
  actionId,
  checkApiConflicts,
  extractApiExports,
  generateApi,
  scanApiFiles,
  type ApiExport,
  generateActions,
  generateIslands,
  generateRoutes,
  readDirective,
  scanDirectives,
  scanRoutes,
  toPosix,
  type ActionExport,
  type RouteTreeNode,
} from "./scan.ts";

export interface SeamOptions {
  /** Source folder. Default "app". */
  appDir?: string;
  /**
   * Where the production build runs. Default "node".
   *   node        `seam start` (or node dist/server/server.js); also serves dist/client
   *   bun         `bun dist/server/server.js`; also serves dist/client
   *   deno        `deno run -A dist/server/server.js`; also serves dist/client; one bundled file
   *   cloudflare  a Worker (export default { fetch }); one bundled file; dist/client via Static Assets
   */
  adapter?: Adapter;
  /**
   * Your own server entry instead of the adapter's (e.g. "server.ts"). It imports `app` from "virtual:seam/app".
   */
  server?: string;
  /**
   * Shared cache for public view responses (/_v/...). Default "none".
   * "memory": in-process (one Node/Bun server). "cache-storage": Web CacheStorage (Workers, Deno).
   */
  viewCache?: "none" | "memory" | "cache-storage";
  /**
   * Serve views as React Server Components too (GET /_v/....rsc), for <RscView> in islands.
   * Needs @vitejs/plugin-rsc and react-server-dom-webpack installed. Default false.
   */
  rsc?: boolean;
}

const CLIENT_ENTRY = "seam/client/entry";
const VIRTUAL_APP = "virtual:seam/app";
const VIRTUAL_ISLANDS = "virtual:seam/islands";
const VIRTUAL_RSC_ENTRY = "virtual:seam/rsc-entry";
const VIRTUAL_SERVER = "virtual:seam/server";

export type Adapter = "node" | "bun" | "deno" | "cloudflare";

/** The default server entry for each adapter. dist/server/server.js → ../client is dist/client. */
function serverEntry(adapter: Adapter): string {
  const staticDir = `fileURLToPath(new URL("../client", import.meta.url))`;
  const head = [`// The default ${adapter} server (seam({ adapter: "${adapter}" })).`, `import { app } from "virtual:seam/app";`];
  switch (adapter) {
    case "cloudflare":
      return [...head, `import { toWorker } from "seam/adapters/cloudflare";`, `export default toWorker(app);`].join("\n");
    case "bun":
    case "deno":
      return [...head, `import { fileURLToPath } from "node:url";`, `import { serve } from "seam/adapters/${adapter}";`, `export { app };`, `serve(app, { staticDir: ${staticDir} });`].join("\n");
    default:
      return [...head, `import { fileURLToPath } from "node:url";`, `import { serve } from "seam/adapters/node";`, `export { app };`, `serve(app, { staticDir: ${staticDir} });`].join("\n");
  }
}
const IMPL = "?seam-impl";
const SERVER_ONLY = /\.server\.[cm]?[jt]sx?$/;

function hasLayout(n: RouteTreeNode): boolean {
  return Boolean(n.layout) || Object.values(n.static).some(hasLayout) || (n.param ? hasLayout(n.param.node) : false);
}

/** The directive has done its job once this plugin has seen it; keep it as a comment for readers. */
function neutralize(code: string): string {
  return code.replace(/(['"])use (client|server)\1;?/, "/* use $2 (handled by Seam) */");
}

/** Value exports of a JS module (type-only exports skipped). */
function exportsOf(js: string): { name: string; local: string | undefined }[] {
  return (parse(js)[1] as unknown as { name: string; localName?: string; typeOnly?: boolean }[])
    .filter((e) => !e.typeOnly)
    .map((e) => ({ name: e.name, local: e.localName }));
}

export default function seam(options: SeamOptions = {}): PluginOption[] {
  const appDir = options.appDir ?? "app";
  const adapter: Adapter = options.adapter ?? "node";
  if (options.rsc && adapter === "cloudflare") {
    throw new Error('[seam] rsc: true is not supported with adapter: "cloudflare" yet.');
  }
  // Deno and Workers get one self-contained bundle: no node_modules lookup at runtime.
  const bundleAll = adapter === "deno" || adapter === "cloudflare";
  const conditions = adapter === "cloudflare" ? ["workerd", "worker", "module", "browser"] : adapter === "deno" ? ["deno", "module", "node"] : undefined;
  let config: ResolvedConfig;
  let root = process.cwd();
  let genDir = join(root, ".seam");
  let serverFiles = new Set<string>();
  let clientFiles = new Set<string>();
  let apiByFile = new Map<string, ApiExport[]>();
  let devServer: ViteDevServer | undefined;

  const rel = (id: string) => toPosix(relative(root, id.split("?")[0]));

  async function toJs(code: string, filename: string): Promise<string> {
    await init;
    return /\.[cm]?tsx?$|\.jsx$/.test(filename) ? (await transformWithOxc(code, filename, { lang: filename.endsWith("x") ? "tsx" : "ts" })).code : code;
  }

  async function exportNames(code: string, filename: string): Promise<string[]> {
    return exportsOf(await toJs(code, filename)).map((e) => e.name);
  }

  async function writeIfChanged(file: string, content: string) {
    const prev = existsSync(file) ? await readFile(file, "utf8") : null;
    if (prev !== content) await writeFile(file, content);
  }

  async function generate() {
    await mkdir(genDir, { recursive: true });
    const routes = await scanRoutes(root, join(appDir, "routes"));
    const views = await scanRoutes(root, join(appDir, "views"));
    if (hasLayout(views)) console.warn(`[seam] ${appDir}/views: _layout files are ignored in views (a view is one component).`);
    const directives = await scanDirectives(root, appDir);
    serverFiles = new Set(directives.server);
    clientFiles = new Set(directives.client);

    const actions: ActionExport[] = [];
    for (const file of directives.server) {
      for (const name of await exportNames(await readFile(join(root, file), "utf8"), file)) {
        if (name === "default") {
          console.warn(`[seam] ${file}: default exports of 'use server' files are ignored. Use named exports.`);
          continue;
        }
        actions.push({ id: actionId(file, name), file, name });
      }
    }

    const apiList: ApiExport[] = [];
    apiByFile = new Map();
    for (const file of await scanApiFiles(root, appDir)) {
      const js = await toJs(await readFile(join(root, file), "utf8"), file);
      const found = extractApiExports(js, file, exportsOf(js).map((e) => e.name));
      apiByFile.set(file, found);
      apiList.push(...found);
    }
    checkApiConflicts(apiList);

    await writeIfChanged(join(genDir, "routes.gen.ts"), generateRoutes(routes, genDir, root));
    await writeIfChanged(join(genDir, "api.gen.ts"), generateApi(apiList, genDir, root));
    await writeIfChanged(join(genDir, "views.gen.ts"), generateRoutes(views, genDir, root, "views"));
    await writeIfChanged(join(genDir, "actions.gen.ts"), generateActions(actions, genDir, root));
    await writeIfChanged(join(genDir, "islands.gen.ts"), generateIslands(directives.client, genDir, root));
  }

  async function clientScripts(): Promise<string[]> {
    if (devServer) {
      const resolved = await devServer.environments.client.pluginContainer.resolveId(CLIENT_ENTRY);
      return ["/@vite/client", `/@fs${resolved!.id}`];
    }
    const outDir = resolve(root, config.environments.client.build.outDir);
    const manifestFile = join(outDir, ".vite/manifest.json");
    // plugin-rsc first builds the servers once without writing (to find references), before the client exists.
    if (!existsSync(manifestFile)) return [];
    const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as Record<string, { file: string; isEntry?: boolean; name?: string }>;
    const entry = Object.values(manifest).find((c) => c.isEntry && c.name === "entry");
    if (!entry) throw new Error("[seam] client manifest has no entry. Was the client built first?");
    return [`${config.base}${entry.file}`];
  }

  /**
   * 'use server' files, before any other plugin (including plugin-rsc) sees the directive:
   *   client → createServerReference stubs;  ssr → registerServerReference appended;
   *   rsc    → the plain functions (callable from server components, not passable to the client).
   */
  const useServer: Plugin = {
    name: "seam:use-server",
    enforce: "pre",
    async transform(code, id) {
      if (id.startsWith("\0") || id.includes("/node_modules/") || !serverFiles.has(rel(id))) return null;
      if (readDirective(code) !== "use server") return null;
      const file = rel(id);
      const exported = exportsOf(await toJs(code, id.split("?")[0]));
      const env = this.environment.name;
      if (env === "client") {
        const lines = [`import { createServerReference } from "seam/runtime/client";`];
        for (const e of exported) {
          if (e.name !== "default") lines.push(`export const ${e.name} = /*#__PURE__*/ createServerReference(${JSON.stringify(actionId(file, e.name))});`);
        }
        return { code: lines.join("\n"), map: null };
      }
      if (env === "rsc") return { code: neutralize(code), map: null };
      const reg = exported
        .filter((e) => e.name !== "default" && e.local)
        .map((e) => `__seamRegister(${e.local}, ${JSON.stringify(actionId(file, e.name))});`)
        .join("\n");
      return { code: `${neutralize(code)}\nimport { registerServerReference as __seamRegister } from "seam/runtime/server";\n${reg}\n`, map: null };
    },
  };

  const main: Plugin = {
    name: "seam",
    enforce: "post",

    config(_userConfig, env) {
      return {
        appType: "custom",
        oxc: { jsx: { runtime: "automatic", importSource: "react" } },
        ssr: { noExternal: ["seam"] },
        // Seam imports modules this plugin generates (virtual:seam/...), so it must not be pre-bundled.
        optimizeDeps: { exclude: ["seam"] },
        environments: {
          client: {
            build: {
              outDir: "dist/client",
              manifest: true,
              rolldownOptions: { input: { entry: CLIENT_ENTRY } },
            },
          },
          ssr: {
            ...(bundleAll ? { resolve: { noExternal: true, conditions, externalConditions: conditions } } : {}),
            ...(bundleAll && env.command === "build" ? { define: { "process.env.NODE_ENV": JSON.stringify("production") } } : {}),
            build: {
              outDir: "dist/server",
              ...(adapter === "cloudflare" ? { target: "es2022" } : {}),
              rolldownOptions: {
                input: { server: options.server ?? VIRTUAL_SERVER },
                output: { entryFileNames: "[name].js", ...(adapter === "cloudflare" ? { codeSplitting: false } : {}) },
              },
            },
          },
          ...(options.rsc
            ? { rsc: { build: { outDir: "dist/rsc", rolldownOptions: { input: { index: VIRTUAL_RSC_ENTRY } } } } }
            : {}),
        },
        // With RSC, plugin-rsc orchestrates the build (its order also builds the client before the server).
        ...(options.rsc
          ? {}
          : {
              builder: {
                async buildApp(builder) {
                  await builder.build(builder.environments.client);
                  await builder.build(builder.environments.ssr);
                },
              },
            }),
      };
    },

    generateBundle() {
      if (this.environment.name === "ssr") {
        this.emitFile({ type: "asset", fileName: "seam.json", source: JSON.stringify({ adapter, rsc: Boolean(options.rsc) }, null, 2) + "\n" });
      }
    },

    configResolved(c) {
      config = c;
      root = c.root;
      genDir = join(root, ".seam");
    },

    async buildStart() {
      await generate();
    },

    resolveId: {
      order: "pre",
      async handler(source, importer) {
        if (source === VIRTUAL_APP) return "\0" + VIRTUAL_APP;
        if (source === VIRTUAL_RSC_ENTRY) return "\0" + VIRTUAL_RSC_ENTRY;
        if (source === VIRTUAL_SERVER) return "\0" + VIRTUAL_SERVER;
        if (source === VIRTUAL_ISLANDS) return join(genDir, "islands.gen.ts");

        // Guard: server-only code must never reach the browser bundle.
        // ('use server' and *.api.ts files are exempt: in the browser bundle their imports are replaced anyway.)
        if (this.environment.name === "client" && importer && !serverFiles.has(rel(importer)) && !API_FILE.test(importer.split("?")[0])) {
          if (source === "server-only") this.error(`[seam] "server-only" was imported into the browser bundle from ${rel(importer)}`);
          // Check the resolved path: `import "./db.server"` has no extension.
          const resolved = await this.resolve(source, importer, { skipSelf: true });
          if (resolved && SERVER_ONLY.test(resolved.id.split("?")[0])) {
            this.error(`[seam] ${rel(resolved.id)} is server-only (*.server.*) but was imported into the browser bundle from ${rel(importer)}`);
          }
          return resolved;
        }
        return null;
      },
    },

    async load(id) {
      if (id === "\0" + VIRTUAL_SERVER) return serverEntry(adapter);
      if (id === "\0" + VIRTUAL_RSC_ENTRY) {
        return [
          `import { createRscHandler } from "seam/rsc/server";`,
          `import { views } from ${JSON.stringify(join(genDir, "views.gen.ts"))};`,
          `export const handle = createRscHandler({ views });`,
          `export default handle;`,
        ].join("\n");
      }
      if (id !== "\0" + VIRTUAL_APP) return null;
      const scripts = await clientScripts();
      const buildId = devServer ? "dev" : Date.now().toString(36);
      const cache = options.viewCache ?? "none";
      const viewCache = cache === "memory" ? "memoryViewCache()" : cache === "cache-storage" ? "cacheStorageViewCache()" : "undefined";
      return [
        `import { createApp, memoryViewCache, cacheStorageViewCache } from "seam";`,
        `import { createRenderer } from "seam/react";`,
        `import { routes } from ${JSON.stringify(join(genDir, "routes.gen.ts"))};`,
        `import { views } from ${JSON.stringify(join(genDir, "views.gen.ts"))};`,
        `import { actions } from ${JSON.stringify(join(genDir, "actions.gen.ts"))};`,
        `import { api } from ${JSON.stringify(join(genDir, "api.gen.ts"))};`,
        options.rsc ? `import { handleRsc, decodeRsc } from "seam/rsc/bridge";` : ``,
        `export const app = createApp({`,
        `  routes, views, actions, api,`,
        options.rsc ? `  rsc: { handle: handleRsc, decode: decodeRsc },` : ``,
        `  viewCache: ${viewCache},`,
        `  buildId: ${JSON.stringify(buildId)},`,
        `  dev: ${Boolean(devServer)},`,
        `  render: createRenderer({ scripts: ${JSON.stringify(scripts)} }),`,
        `});`,
      ].join("\n");
    },

    async transform(code, id) {
      if (id.startsWith("\0") || id.includes("/node_modules/")) return null;

      // *.api.ts: in the browser bundle, each endpoint becomes a fetch with a known URL.
      if (API_FILE.test(id.split("?")[0])) {
        if (this.environment.name !== "client") return null;
        const found = apiByFile.get(rel(id));
        if (!found) this.error(`[seam] ${rel(id)} is not in .seam/api.gen.ts. Is it under ${appDir}/?`);
        const lines = [`import { createApiReference } from "seam/runtime/api-client";`];
        for (const a of found) lines.push(`export const ${a.name} = /*#__PURE__*/ createApiReference(${JSON.stringify(a.path)});`);
        return { code: lines.join("\n"), map: null };
      }

      // 'use client' files of the app are islands. Only the SSR environment wraps them;
      // in the browser they are the files as written, and in `rsc` plugin-rsc makes them client references.
      const file = rel(id);
      if (readDirective(code) !== "use client") return null;
      const env = this.environment.name;
      // Other 'use client' modules (e.g. seam/slot): the directive only matters in `rsc`.
      if (!clientFiles.has(file)) return env === "rsc" ? null : { code: neutralize(code), map: null };
      if (env === "client" || id.endsWith(IMPL)) return { code: neutralize(code), map: null };
      if (env !== "ssr") return null;
      await init;
      const names = exportsOf(code).map((e) => e.name);
      const impl = JSON.stringify(id.split("?")[0] + IMPL);
      const lines = [`import * as __m from ${impl};`, `import { createIsland as __island } from "seam/runtime/island";`];
      for (const n of names) {
        const value = `__island(${JSON.stringify(file)}, ${JSON.stringify(n)}, __m[${JSON.stringify(n)}], __m)`;
        lines.push(n === "default" ? `export default ${value};` : `export const ${n} = ${value};`);
      }
      return { code: lines.join("\n"), map: null };
    },

    configureServer(server) {
      devServer = server;
      const appRoot = join(root, appDir);
      const regenerate = async (file: string) => {
        if (!file.startsWith(appRoot)) return;
        await generate();
        for (const env of Object.values(server.environments)) {
          const m = env.moduleGraph.getModuleById("\0" + VIRTUAL_APP);
          if (m) env.moduleGraph.invalidateModule(m);
        }
      };
      server.watcher.on("add", regenerate);
      server.watcher.on("unlink", regenerate);
      server.watcher.on("change", async (file) => {
        if (!file.startsWith(appRoot)) return;
        const before = readDirective(await readFile(file, "utf8").catch(() => ""));
        const known = serverFiles.has(rel(file)) ? "use server" : clientFiles.has(rel(file)) ? "use client" : null;
        if (before !== known || before === "use server" || API_FILE.test(file)) await regenerate(file);
        server.ws.send({ type: "full-reload" });
      });

      return () => {
        server.middlewares.use(async (req, res, next) => {
          if (req.url?.startsWith("/@") || req.url?.startsWith("/__")) return next();
          try {
            const ssr = server.environments.ssr;
            if (!isRunnableDevEnvironment(ssr)) throw new Error("[seam] the ssr environment must be runnable in dev");
            const { app } = (await ssr.runner.import(VIRTUAL_APP)) as typeof import("virtual:seam/app");
            await writeResponse(res, await app(toRequest(req, res)));
          } catch (e) {
            if (e instanceof Error) server.ssrFixStacktrace(e);
            next(e);
          }
        });
      };
    },
  };

  if (!options.rsc) return [useServer, main];
  // Loaded only when asked for, so apps without RSC do not need @vitejs/plugin-rsc installed.
  const rsc = import("@vitejs/plugin-rsc").then(({ default: rscPlugin }) =>
    rscPlugin({ serverHandler: false, customClientEntry: true, validateImports: false }),
  );
  return [useServer, main, rsc];
}
