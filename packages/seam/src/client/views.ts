/**
 * <Include client> renders <seam-view src="/_v/..." data-load="client">fallback</seam-view>.
 * Here the browser fetches those views and puts the HTML in place.
 * Each view is a normal GET, so the browser's HTTP cache (and CDNs) apply.
 */
import { islandsIfLoaded, loadIslands } from "./islands-loader.ts";

const CLIENT_VIEW = 'seam-view[data-load="client"]';

/** Load client views in `scope` that have not been loaded yet. */
export function loadViews(scope: ParentNode): Promise<void> {
  const els = [...scope.querySelectorAll<HTMLElement>(`${CLIENT_VIEW}:not([data-loaded])`)];
  return Promise.all(els.map((el) => loadView(el, false))).then(() => {});
}

/**
 * After an action the data may have changed: re-fetch client views outside `skip`
 * (the part of the page that was just replaced and therefore is already fresh).
 * `cache: "no-cache"` revalidates with the server (ETag → 304 when nothing changed).
 */
export function refreshViews(skip: Element | null): Promise<void> {
  // RSC views (<RscView>) listen for this and fetch again.
  window.dispatchEvent(new Event("seam:refresh"));
  const els = [...document.querySelectorAll<HTMLElement>(`${CLIENT_VIEW}[data-loaded]`)].filter((el) => !skip?.contains(el));
  return Promise.all(els.map((el) => loadView(el, true))).then(() => {});
}

async function loadView(el: HTMLElement, revalidate: boolean): Promise<void> {
  const src = el.getAttribute("src");
  if (!src) return;
  el.setAttribute("data-loaded", "");
  el.setAttribute("aria-busy", "true");
  try {
    const res = await fetch(src, { cache: revalidate ? "no-cache" : "default", headers: { Accept: "text/html" } });
    if (!res.ok) throw new Error(`${res.status}`);
    const html = await res.text();
    islandsIfLoaded()?.unmountIslands(el, new Set());
    el.innerHTML = html;
    if (el.querySelector("seam-island")) (await loadIslands()).hydrateIslands(el);
    await loadViews(el); // client views inside the view
  } catch (e) {
    console.error(`[seam] could not load view ${src}:`, e);
    el.removeAttribute("data-loaded");
  } finally {
    el.removeAttribute("aria-busy");
  }
}
