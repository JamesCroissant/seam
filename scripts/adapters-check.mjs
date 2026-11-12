// Build the create-seam app for every adapter and run it on the real runtime:
//   node (node), bun (npx bun), deno (npx deno), cloudflare (Miniflare = workerd, the Workers runtime)
// Usage: pnpm test:adapters   (needs network: npm install, bun/deno binaries via npx)
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const BUN = "bun@1.4.4";
const DENO = "deno@2.9.6";
const repo = new URL("..", import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), "seam-adapters-"));
const sh = (cmd, args, cwd, env = {}) =>
  execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8", env: { ...process.env, ...env } });

console.log(`work dir: ${work}`);
sh("pnpm", ["-C", join(repo, "packages/seam"), "pack", "--pack-destination", work], repo);
sh("pnpm", ["-C", join(repo, "packages/create-seam"), "pack", "--pack-destination", work], repo);
const tgz = (prefix) => join(work, readdirSync(work).find((f) => f.startsWith(prefix) && f.endsWith(".tgz")));
sh("npm", ["exec", "--yes", `--package=${tgz("create-seam-")}`, "--", "create-seam", "app", "--seam", `file:${tgz("seam-")}`], work);
const app = join(work, "app");
sh("npm", ["install", "--no-audit", "--no-fund"], app);
sh("npm", ["install", "--no-audit", "--no-fund", "-D", "miniflare@4"], app);

writeFileSync(
  join(app, "miniflare.mjs"),
  `import { Miniflare } from "miniflare";
const mf = new Miniflare({
  modules: true,
  scriptPath: "dist/server/server.js",
  compatibilityDate: "2026-07-01",
  compatibilityFlags: ["nodejs_compat"],
  // wrangler sets has_user_worker itself: files first, everything else goes to the Worker.
  assets: { directory: "dist/client", binding: "ASSETS", routerConfig: { has_user_worker: true } },
  port: Number(process.env.PORT),
});
await mf.ready;
console.log("ready");
`,
);

const runtimes = {
  node: ["node", ["dist/server/server.js"]],
  bun: ["npx", ["--yes", BUN, "dist/server/server.js"]],
  deno: ["npx", ["--yes", DENO, "run", "-A", "dist/server/server.js"]],
  cloudflare: ["node", ["miniflare.mjs"]],
};

let failed = 0;
let port = 3310;
for (const [adapter, [cmd, args]] of Object.entries(runtimes)) {
  console.log(`\n== ${adapter}`);
  writeFileSync(join(app, "vite.config.ts"), `import { defineConfig } from "vite";\nimport seam from "seam/vite";\nexport default defineConfig({ plugins: [seam({ adapter: "${adapter}" })] });\n`);
  try {
    sh("npx", ["seam", "build"], app);
  } catch {
    failed++;
    console.log("  ✗ build failed");
    continue;
  }
  const base = `http://localhost:${++port}`;
  const server = spawn(cmd, args, { cwd: app, env: { ...process.env, PORT: String(port), NODE_ENV: "production" }, stdio: ["ignore", "ignore", "pipe"], detached: true });
  let stderr = "";
  server.stderr.on("data", (d) => (stderr += d));
  const check = (ok, msg) => {
    if (!ok) failed++;
    console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
  };
  try {
    for (let i = 0; ; i++) {
      if (await fetch(base).then((r) => r.status < 500, () => false)) break;
      if (i > 300) throw new Error(`did not start\n${stderr}`);
      await sleep(100);
    }
    const html = await (await fetch(base)).text();
    check(html.includes("<h1>Todos</h1>"), "GET / renders the page");
    const script = /src="(\/assets\/entry-[^"]+\.js)"/.exec(html)?.[1];
    const js = script ? await fetch(base + script) : null;
    check(js?.status === 200 && (js.headers.get("content-type") ?? "").includes("javascript"), `static file ${script}`);

    const action = /<form action="(\/_action\/[0-9a-f]+)"[^>]*>(?:(?!<\/form>).)*name="text"/s.exec(html)?.[1];
    const body = new FormData();
    body.append("text", `todo on ${adapter}`);
    body.append("$return", "/");
    const post = await fetch(base + action, { method: "POST", body, redirect: "manual" });
    check(post.status === 303, "POST /_action/... → 303");
    check((await (await fetch(base)).text()).includes(`todo on ${adapter}`), "the new todo is on the page");
    check((await fetch(`${base}/nope`)).status === 404, "unknown page → 404");
  } catch (e) {
    failed++;
    console.log(`  ✗ ${e.message}`);
  } finally {
    try {
      process.kill(-server.pid);
    } catch {}
  }
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
