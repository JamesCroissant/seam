// What a new user does, end to end, outside this repo:
//   pack seam + create-seam → create-seam my-app → npm install → npm run build → npm start → requests
// Usage: pnpm test:create   (needs network for npm install)
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const repo = new URL("..", import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), "seam-create-"));
const sh = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });

console.log(`work dir: ${work}`);
sh("pnpm", ["-C", join(repo, "packages/seam"), "pack", "--pack-destination", work], repo);
sh("pnpm", ["-C", join(repo, "packages/create-seam"), "pack", "--pack-destination", work], repo);
const tgz = (prefix) => join(work, readdirSync(work).find((f) => f.startsWith(prefix) && f.endsWith(".tgz")));

sh("npm", ["exec", "--yes", `--package=${tgz("create-seam-")}`, "--", "create-seam", "my-app", "--seam", `file:${tgz("seam-")}`], work);
const app = join(work, "my-app");
sh("npm", ["install", "--no-audit", "--no-fund"], app);
sh("npm", ["run", "build"], app);
sh("npx", ["tsc", "-p", "tsconfig.json"], app);

const PORT = 3301;
const server = spawn("npm", ["start"], { cwd: app, env: { ...process.env, PORT: String(PORT) }, stdio: "ignore", detached: true });
const base = `http://localhost:${PORT}`;
let failed = 0;
const check = (ok, msg) => {
  if (!ok) failed++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${msg}`);
};
try {
  for (let i = 0; ; i++) {
    if (await fetch(base).then((r) => r.ok, () => false)) break;
    if (i > 50) throw new Error("server did not start");
    await sleep(100);
  }
  const home = await fetch(base);
  check(home.headers.get("cache-control") === "private, max-age=0", "GET / → 200 with the loader's Cache-Control");

  const form = new FormData();
  form.append("text", "hello from create-check");
  form.append("$return", "/");
  const html = await (await fetch(base)).text();
  const action = /<form action="(\/_action\/[0-9a-f]+)"[^>]*>(?:(?!<\/form>).)*name="text"/s.exec(html)?.[1];
  check(Boolean(action), `the add form posts to ${action}`);
  const post = await fetch(base + action, { method: "POST", body: form, redirect: "manual" });
  check(post.status === 303 && post.headers.get("location") === "/", "POST → 303 back to /");
  check((await (await fetch(base)).text()).includes("hello from create-check"), "the new todo is on the page");
  check((await fetch(`${base}/nope`)).status === 404, "unknown page → 404");
} catch (e) {
  failed++;
  console.log(`  ✗ ${e.message}`);
} finally {
  process.kill(-server.pid); // the whole group: npm → seam → node
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
