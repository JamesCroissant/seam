/**
 * The small navigation script. NOT a SPA router: there is no client-side React tree for the page.
 * It replaces <main> (or a `data-target`) with the same element from the next page's HTML.
 *
 * - Built on the Navigation API. Without it, nothing is intercepted: plain page loads, still correct.
 * - Links, back/forward:   `navigate` event → fetch the page → swap.
 * - <form method="post">:  `submit` event  → fetch POST (fetch follows the 303) → navigation.navigate(finalUrl, {info: {html}}) → swap.
 * - Islands marked `persist` are moved into the new HTML instead of being re-created.
 * - Scroll: push → top/#hash, back/forward → restored, POST back to the same page → kept.
 * - Focus: [aria-invalid] → the submit button (same id) → [autofocus] → <h1>. Title is announced (aria-live).
 * - Loading: aria-busy on <html> after 150ms and on the submitting form. useNav().pending in islands.
 * - Views: <Include client> placeholders in new HTML are loaded; after a form POST, client views
 *   outside the replaced part are re-fetched (the action may have changed their data).
 */
import { islandsIfLoaded, loadIslands } from "./islands-loader.ts";
import { setNavState } from "./nav-store.ts";
import { loadViews, refreshViews } from "./views.ts";

interface NavInfo {
  html?: string;
  keepScroll?: boolean;
  focusId?: string;
  target?: string;
  fromSubmit?: boolean;
}

const NAV_HEADER = { "X-Seam-Nav": "1" };
const hardNavigations = new Set<string>();
let silentReplace: string | null = null;
let submitController: AbortController | null = null;

export function startNav(): void {
  const navigation = (globalThis as any).navigation;
  if (!navigation) return;

  navigation.addEventListener("navigate", (e: any) => onNavigate(e));
  navigation.addEventListener("currententrychange", () => setNavState({ url: new URL(location.href) }));
  document.addEventListener("submit", (e) => onSubmit(e as SubmitEvent, navigation));
}

function onNavigate(e: any): void {
  const url = new URL(e.destination.url);
  if (silentReplace === url.href) {
    silentReplace = null;
    return;
  }
  if (hardNavigations.delete(url.href)) return;
  if (!e.canIntercept || e.hashChange || e.downloadRequest != null || e.formData) return;
  if (e.navigationType === "reload" || url.origin !== location.origin || url.pathname.startsWith("/_action/")) return;
  if (e.sourceElement?.closest?.("[data-seam-reload]")) return;

  const info = (e.info ?? {}) as NavInfo;
  if (!info.fromSubmit) submitController?.abort();

  e.intercept({
    scroll: "manual",
    focusReset: "manual",
    async handler() {
      beginBusy();
      try {
        let html = info.html;
        if (html === undefined) {
          const res = await fetch(url, { headers: NAV_HEADER, signal: e.signal });
          if (!isHtml(res)) return hardNavigate(url.href);
          html = await res.text();
          const finalUrl = new URL(res.url);
          if (finalUrl.origin !== location.origin) return hardNavigate(res.url);
          if (finalUrl.href !== url.href) {
            // The page redirected: fix the address bar without another fetch.
            setTimeout(() => {
              silentReplace = finalUrl.href;
              history.replaceState(history.state, "", finalUrl.href);
            });
          }
        }
        await swap(html, info.target);
        if (!info.keepScroll) {
          try {
            e.scroll();
          } catch {}
        }
        moveFocus(info);
      } finally {
        endBusy();
      }
    },
  });
}

async function onSubmit(e: SubmitEvent, navigation: any): Promise<void> {
  if (e.defaultPrevented) return; // React (an island) already handles this form.
  const form = e.target as HTMLFormElement;
  const submitter = e.submitter as HTMLButtonElement | HTMLInputElement | null;
  const method = (submitter?.getAttribute("formmethod") ?? form.getAttribute("method") ?? "get").toLowerCase();
  if (method !== "post") return; // GET forms become a normal `navigate` event.
  if (form.hasAttribute("data-seam-reload") || (form.target && form.target !== "_self")) return;
  const action = new URL(submitter?.getAttribute("formaction") ? submitter.formAction : form.action);
  if (action.origin !== location.origin) return;

  e.preventDefault();
  if (form.getAttribute("aria-busy") === "true") return; // double submit

  submitController?.abort();
  const controller = (submitController = new AbortController());
  const body = new FormData(form, submitter);
  beginBusy(form);
  try {
    // fetch follows the 303, so `res` is the GET of the page to show next.
    const res = await fetch(action, { method: "POST", body, headers: NAV_HEADER, signal: controller.signal });
    if (res.headers.get("X-Seam-Reload")) return location.reload();
    const finalUrl = new URL(res.url);
    if (!isHtml(res) || finalUrl.origin !== location.origin) return hardNavigate(res.url);
    const html = await res.text();
    const samePage = finalUrl.pathname === location.pathname && finalUrl.search === location.search;
    const info: NavInfo = {
      html,
      fromSubmit: true,
      keepScroll: samePage,
      focusId: samePage ? submitter?.id || undefined : undefined,
      target: form.dataset.target,
    };
    await navigation.navigate(finalUrl.href, { history: samePage ? "replace" : "push", info }).finished;
    void refreshViews(document.querySelector(info.target ?? "main"));
  } catch (err) {
    if ((err as Error).name !== "AbortError") console.error("[seam] form submit failed:", err);
  } finally {
    endBusy(form);
    if (submitController === controller) submitController = null;
  }
}

function hardNavigate(href: string): void {
  hardNavigations.add(new URL(href, location.href).href);
  location.assign(href);
}

function isHtml(res: Response): boolean {
  return (res.headers.get("Content-Type") ?? "").includes("text/html");
}

// ---------- swap ----------

async function swap(html: string, targetSelector?: string): Promise<void> {
  const doc = new DOMParser().parseFromString(html, "text/html");

  let selector = targetSelector ?? "main";
  if (!doc.querySelector(selector) || !document.querySelector(selector)) selector = "main";
  let next = doc.querySelector<HTMLElement>(selector);
  let cur = document.querySelector<HTMLElement>(selector);
  if (!next || !cur) {
    next = doc.body;
    cur = document.body;
  }

  document.title = doc.title;
  for (const link of doc.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')) {
    if (!document.head.querySelector(`link[rel="stylesheet"][href="${CSS.escape(link.getAttribute("href") ?? "")}"]`)) {
      document.head.append(document.importNode(link));
    }
  }

  const incoming = document.adoptNode(next);

  // Keep persisted islands: move the live element into the new HTML.
  const keep = new Set<Element>();
  for (const placeholder of incoming.querySelectorAll<HTMLElement>("seam-island[data-persist]")) {
    const key = placeholder.dataset.persist!;
    const live = cur.querySelector<HTMLElement>(`seam-island[data-persist="${CSS.escape(key)}"]`);
    if (!live || keep.has(live)) continue;
    keep.add(live);
    placeholder.replaceWith(live);
    islandsIfLoaded()?.updateIslandProps(live, placeholder.dataset.props);
  }

  islandsIfLoaded()?.unmountIslands(cur, keep);
  cur.replaceWith(incoming);
  announce(document.title);

  if (incoming.querySelector("seam-island:not([data-seam-started])")) {
    (await loadIslands()).hydrateIslands(incoming);
  }
  void loadViews(incoming);
}

// ---------- focus & announcements ----------

function moveFocus(info: NavInfo): void {
  const scope = document.querySelector<HTMLElement>(info.target ?? "main") ?? document.body;
  const invalid = scope.querySelector<HTMLElement>('[aria-invalid="true"]');
  const byId = info.focusId ? document.getElementById(info.focusId) : null;
  let el: HTMLElement | null = invalid ?? byId;
  if (!el && !info.keepScroll) el = scope.querySelector<HTMLElement>("[autofocus]") ?? scope.querySelector<HTMLElement>("h1");
  if (!el) return;
  if (el.tagName === "H1" && !el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
  el.focus({ preventScroll: true });
}

function announce(text: string): void {
  let live = document.getElementById("seam-live");
  if (!live) {
    live = document.createElement("div");
    live.id = "seam-live";
    live.setAttribute("aria-live", "polite");
    live.setAttribute("aria-atomic", "true");
    live.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
    document.body.append(live);
  }
  live.textContent = text;
}

// ---------- loading state ----------

let busy = 0;
let busyTimer: ReturnType<typeof setTimeout> | undefined;

function beginBusy(form?: HTMLFormElement): void {
  form?.setAttribute("aria-busy", "true");
  if (busy++ === 0) {
    busyTimer = setTimeout(() => document.documentElement.setAttribute("aria-busy", "true"), 150);
    setNavState({ pending: true });
  }
}

function endBusy(form?: HTMLFormElement): void {
  form?.removeAttribute("aria-busy");
  busy = Math.max(0, busy - 1);
  if (busy === 0) {
    clearTimeout(busyTimer);
    document.documentElement.removeAttribute("aria-busy");
    setNavState({ pending: false, url: new URL(location.href) });
  }
}
