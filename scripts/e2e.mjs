// End-to-end check in a real Chrome, against the production build of examples/invoices.
// Usage: pnpm example:build && node scripts/e2e.mjs
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";

const PORT = 3199;
const BASE = `http://localhost:${PORT}`;
// process.execPath, not "node": with Volta, "node" is a shim and killing it would leave the server running.
const server = spawn(process.execPath, ["dist/server/server.js"], {
  cwd: new URL("../examples/invoices/", import.meta.url),
  env: { ...process.env, PORT: String(PORT), NODE_ENV: "production" },
  stdio: ["ignore", "ignore", "inherit"],
});
server.on("exit", (code) => code && console.error(`server exited with ${code}`));

// Nothing may hang forever: say where we were and stop.
let current = "starting the server";
const watchdog = setTimeout(() => {
  console.error(`\nTIMEOUT (180s) while: ${current}`);
  server.kill();
  process.exit(2);
}, 180_000);

for (let i = 0; ; i++) {
  if (i === 50) throw new Error(`server did not start on ${BASE}`);
  if (await fetch(`${BASE}/about`).then((r) => r.ok, () => false)) break;
  await sleep(100);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
let failed = 0;
async function check(name, fn) {
  current = name;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${e.message.split("\n")[0]}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

try {
  // ---------------- without JavaScript ----------------
  const noJs = await browser.newContext({ javaScriptEnabled: false });
  const p0 = await noJs.newPage();

  await check("no JS: validation error after POST → 303 → GET", async () => {
    await p0.goto(`${BASE}/`);
    await p0.fill('input[name="amount"]', "10");
    await p0.click("#create");
    await p0.waitForURL(`${BASE}/`);
    assert((await p0.textContent('[role="alert"]')) === "Title is required.", "error not shown");
  });

  await check("no JS: create redirects to the new invoice", async () => {
    await p0.fill('input[name="title"]', "No-JS invoice");
    await p0.fill('input[name="amount"]', "42");
    await p0.click("#create");
    await p0.waitForURL(/\/invoices\/\d+$/);
    assert((await p0.textContent("h1")) === "No-JS invoice", "wrong page");
  });

  await check("no JS: island form (useActionState) still works", async () => {
    const before = await p0.textContent('[data-testid="status"]');
    await p0.click("#toggle-status");
    await p0.waitForLoadState("load");
    const after = await p0.textContent('[data-testid="status"]');
    assert(before === "draft" && after === "sent", `status ${before} → ${after}`);
  });

  await check("no JS: server <Include> is in the HTML, client <Include> shows its fallback", async () => {
    await p0.goto(`${BASE}/`);
    assert(/\d+ invoices/.test(await p0.textContent('[data-testid="summary"]')), "summary missing");
    assert((await p0.textContent('seam-view[src="/_v/me"]')) === "You", "fallback missing");
  });

  await check("no JS: the RSC card is server-rendered, and the button plugged into its slot works", async () => {
    await p0.goto(`${BASE}/board`);
    const before = await p0.textContent('[data-testid="card-status"]');
    await p0.click("#card-next");
    await p0.waitForLoadState("load");
    const after = await p0.textContent('[data-testid="card-status"]');
    assert(before && after && before !== after, `status ${before} → ${after}`);
  });
  await noJs.close();

  // ---------------- with JavaScript ----------------
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  const scripts = [];
  page.on("request", (r) => r.resourceType() === "script" && scripts.push(new URL(r.url()).pathname));

  await check("page without islands downloads no React", async () => {
    await page.goto(`${BASE}/`);
    await page.waitForLoadState("networkidle");
    assert(scripts.length === 1 && scripts[0].includes("entry"), `scripts: ${scripts.join(", ")}`);
  });

  await check("client <Include> loads per-user HTML while the page itself stays public", async () => {
    const res = await page.goto(`${BASE}/about`);
    assert(res.headers()["cache-control"].startsWith("public"), `page is ${res.headers()["cache-control"]}`);
    await page.waitForFunction(() => /You · \d+ views/.test(document.querySelector('[data-testid="visits"]')?.textContent ?? ""));
    await page.goto(`${BASE}/`);
    await page.waitForLoadState("networkidle");
    scripts.length = 0;
    await page.reload();
    await page.waitForLoadState("networkidle");
  });

  await check("link click swaps <main> without a full reload, focuses <h1>, announces the title", async () => {
    await page.evaluate(() => (window.__marker = 1));
    await page.click('a[href="/invoices/1"]');
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Website redesign");
    await page.waitForSelector('seam-island[data-hydrated] [data-testid="status"]');
    assert((await page.evaluate(() => window.__marker)) === 1, "full reload happened");
    assert((await page.title()).startsWith("Website redesign"), `title: ${await page.title()}`);
    assert((await page.evaluate(() => document.activeElement?.tagName)) === "H1", "focus not on h1");
    assert((await page.textContent("#seam-live"))?.startsWith("Website redesign"), "not announced");
    assert((await page.textContent('[data-testid="history"]'))?.includes("Created"), "Suspense content missing after nav");
  });

  await check("persisted island keeps its state across navigation and sees the new URL", async () => {
    await page.waitForFunction(() => parseInt(document.querySelector('[data-testid="seconds"]').textContent) >= 2, null, { timeout: 5000 });
    await page.click('a[href="/invoices/2"]');
    // The Navigation API commits the URL at once; the new <main> arrives after the fetch.
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Logo");
    await page.waitForFunction(() => document.querySelector('[data-testid="nav-url"]')?.textContent === "/invoices/2");
    await page.waitForFunction(() => !document.documentElement.hasAttribute("aria-busy"));
    const secs = parseInt(await page.textContent('[data-testid="seconds"]'));
    assert(secs >= 2, `stopwatch reset to ${secs}`);
  });

  await check("island action via useActionState updates in place (JSON mode)", async () => {
    const before = await page.textContent('[data-testid="status"]');
    await page.click("#toggle-status");
    await page.waitForFunction((b) => document.querySelector('[data-testid="status"]').textContent !== b, before);
    assert((await page.evaluate(() => window.__marker)) === 1, "full reload happened");
  });

  await check("server form with JS: error keeps scroll, focuses the invalid field", async () => {
    await page.evaluate(() => window.scrollTo(0, 120));
    const y = await page.evaluate(() => scrollY);
    await page.fill('input[name="title"]', "");
    await page.click("#rename");
    await page.waitForSelector('[role="alert"]');
    assert((await page.evaluate(() => document.activeElement?.getAttribute("name"))) === "title", "focus not on invalid field");
    assert((await page.evaluate(() => scrollY)) === y, "scroll moved");
    assert(page.url() === `${BASE}/invoices/2`, `url ${page.url()}`);
    assert((await page.evaluate(() => window.__marker)) === 1, "full reload happened");
  });

  await check("server form with JS: success re-runs loaders (new title shown)", async () => {
    await page.fill('input[name="title"]', "Logo v2");
    await page.click("#rename");
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Logo v2");
    assert((await page.$('[role="alert"]')) === null, "error still shown");
  });

  await check("after an action, client views outside <main> are fetched again", async () => {
    const visits = () => page.evaluate(() => Number(/(\d+) views/.exec(document.querySelector('[data-testid="visits"]').textContent)[1]));
    const before = await visits();
    await page.fill('input[name="title"]', "Logo v3");
    await page.click("#rename");
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Logo v3");
    await page.waitForFunction((b) => Number(/(\d+) views/.exec(document.querySelector('[data-testid="visits"]').textContent)?.[1]) > b, before);
  });

  await check("back button restores the previous page", async () => {
    await page.evaluate(() => navigation.back());
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Website redesign");
  });

  await check("create with JS: redirect lands on the new invoice URL", async () => {
    await page.click('a[href="/"]');
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Invoices");
    await page.fill('input[name="title"]', "JS invoice");
    await page.fill('input[name="amount"]', "7");
    await page.click("#create");
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "JS invoice", null, { timeout: 5000 }).catch(async (e) => {
      throw new Error(`${e.message.split("\n")[0]} — url=${page.url()} h1=${await page.textContent("h1")}`);
    });
    assert(/\/invoices\/\d+$/.test(page.url()), `url ${page.url()}`);
    assert((await page.evaluate(() => window.__marker)) === 1, "full reload happened");
  });

  await check("server <Include> shows new data after a write (the version in its URL changed)", async () => {
    await page.click('a[href="/"]');
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Invoices");
    const listed = await page.$$eval("main li", (els) => els.length);
    const summary = await page.textContent('[data-testid="summary"]');
    assert(summary.startsWith(`${listed} invoices`), `summary "${summary}" but ${listed} listed`);
  });

  await check("typed API: the island fetches GET /api/invoices as you type", async () => {
    const apiCalls = [];
    const onReq = (r) => r.url().includes("/api/invoices") && apiCalls.push(new URL(r.url()).pathname + new URL(r.url()).search);
    page.on("request", onReq);
    await page.click('a[href="/search"]');
    await page.waitForSelector('seam-island[data-hydrated] [data-testid="search"]');
    await page.fill('[data-testid="search"]', "hosting");
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="results"] li').length === 1);
    assert((await page.textContent('[data-testid="results"]')).includes("Hosting"), "wrong result");
    await page.selectOption('[data-testid="status-filter"]', "draft");
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="results"] li').length === 0);
    page.off("request", onReq);
    assert(apiCalls.some((u) => u === "/api/invoices?q=hosting"), `calls: ${apiCalls.join(", ")}`);
    assert(apiCalls.some((u) => u === "/api/invoices?q=hosting&status=draft"), `calls: ${apiCalls.join(", ")}`);
  });

  await check("RSC: the card comes with the HTML (no fetch) and hydrates; its <Slot> holds the island's button", async () => {
    const rsc = [];
    const onReq = (r) => r.url().includes(".rsc") && rsc.push(new URL(r.url()).pathname);
    page.on("request", onReq);
    await page.click('header a[href="/board"]');
    await page.waitForSelector('seam-island[data-hydrated] [data-testid="card"] #card-next', { timeout: 10_000 });
    await sleep(300);
    assert(rsc.length === 0, `fetched on load: ${rsc.join(", ")}`);
    const status = await page.textContent('[data-testid="card-status"]');
    assert((await page.textContent("#card-next")).includes(`now ${status}`), "slot did not get the server's props");

    // The action runs through Seam's protocol; afterwards the RSC view is fetched again.
    await page.click("#card-next");
    await page.waitForFunction((s) => document.querySelector('[data-testid="card-status"]')?.textContent !== s, status);
    await page.click('[data-testid="pick-2"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="card"] h2')?.textContent?.startsWith("Logo"));
    page.off("request", onReq);
    assert(rsc.filter((u) => u === "/_v/invoices/1/card.rsc").length === 1, `rsc requests: ${rsc.join(", ")}`);
    assert(rsc.includes("/_v/invoices/2/card.rsc"), `rsc requests: ${rsc.join(", ")}`);
  });

  await check("aria-busy is set while loading and cleared after", async () => {
    await page.click('header a[href="/"]');
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Invoices");
    await page.route("**/invoices/1", async (route) => {
      await sleep(400);
      await route.continue();
    });
    // Keep the click's promise handled even if the next wait fails first.
    const click = page.click('main a[href="/invoices/1"]').catch((e) => e);
    await page.waitForFunction(() => document.documentElement.getAttribute("aria-busy") === "true");
    const clicked = await click;
    if (clicked instanceof Error) throw clicked;
    await page.waitForFunction(() => document.querySelector("h1")?.textContent === "Website redesign");
    await page.waitForFunction(() => !document.documentElement.hasAttribute("aria-busy"));
  });

  await check("no console errors (hydration mismatches etc.)", async () => {
    assert(errors.length === 0, errors.join(" | "));
  });
} finally {
  await browser.close();
  server.kill();
}

clearTimeout(watchdog);
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
