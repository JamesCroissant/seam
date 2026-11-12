/**
 * <RscView src="/_v/....rsc" slots={{ ... }} fallback={...} /> — use inside an island.
 *
 * RSC is data: the browser fetches it (a normal GET with Cache-Control), turns it into React
 * elements, and renders them in the island's own tree. The island owns the tree; the server
 * view is a piece of it, with holes (<Slot>) the island fills.
 *
 * - SSR: the island renderer loads the view (a sub-request, like <Include>), so the first HTML
 *   already shows it. Its Flight text travels with the island, and hydration decodes that same
 *   text: no second fetch, and the tree matches the HTML.
 * - After an action (form POST or island action), every RscView fetches again,
 *   keeping the old content on screen until the new one has arrived.
 */
import { createElement, use, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { RscSsrContext } from "../react/contexts.ts";
import { SlotContext, type Slots } from "./slot.tsx";

export { Slot, type Slots } from "./slot.tsx";

let version = 0;
const listeners = new Set<() => void>();
const cache = new Map<string, Promise<ReactNode>>();

if (typeof window !== "undefined") {
  window.addEventListener("seam:refresh", () => {
    cache.clear();
    version++;
    for (const l of listeners) l();
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Flight text that came with the island's HTML (see client/islands.ts). Used once, for hydration. */
const fromHtml = new Map<string, Promise<ReactNode>>();
function preloaded(src: string): Promise<ReactNode> | null {
  let p = fromHtml.get(src);
  if (p) return p;
  const flights = (globalThis as { __seamRscPreload?: Map<string, string> }).__seamRscPreload;
  const flight = flights?.get(src);
  if (flight === undefined) return null;
  flights!.delete(src);
  p = import("@vitejs/plugin-rsc/browser").then(({ createFromReadableStream }) => createFromReadableStream<ReactNode>(new Response(flight).body!));
  fromHtml.set(src, p);
  return p;
}

/** Fetch (once per URL until the next refresh) and decode an RSC view. */
export function loadRsc(src: string, revalidate = false): Promise<ReactNode> {
  let p = cache.get(src);
  if (!p) {
    p = import("@vitejs/plugin-rsc/browser").then(({ createFromFetch }) =>
      createFromFetch<ReactNode>(fetch(src, { headers: { Accept: "text/x-component" }, cache: revalidate ? "no-cache" : "default" })),
    );
    p.catch(() => cache.delete(src));
    cache.set(src, p);
  }
  return p;
}

export interface RscViewProps {
  /** A view URL ending in .rsc, e.g. `/_v/invoices/1/card.rsc`. */
  src: string;
  /** Components for the view's <Slot name="..."> holes. */
  slots?: Slots;
  /** Shown until the first load (and during SSR). */
  fallback?: ReactNode;
}

export function RscView({ src, slots, fallback = null }: RscViewProps) {
  if (!src.endsWith(".rsc") && !src.includes(".rsc?")) throw new Error(`[seam] <RscView src="${src}">: src must be a /_v/... URL ending in .rsc`);
  const wrap = (content: ReactNode) => createElement(SlotContext, { value: slots ?? {} }, content);

  // Server: render the view itself (the island renderer loads it). Without rsc SSR: the fallback.
  const ssr = useContext(RscSsrContext);
  if (typeof window === "undefined") return wrap(ssr ? (use(ssr(src)) as ReactNode) : fallback);

  // Browser, first render: the same tree the server rendered, from the Flight text in the HTML.
  const initial = preloaded(src);
  const initialNode = initial ? use(initial) : null;
  const shown = useRef<string | null>(initial ? src : null);

  const v = useSyncExternalStore(subscribe, () => version, () => 0);
  const [node, setNode] = useState<ReactNode>(initialNode);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (shown.current === src && v === 0) return; // already showing what the server sent
    shown.current = src;
    let cancelled = false;
    loadRsc(src, v > 0).then(
      (n) => !cancelled && (setNode(n), setError(null)),
      (e) => !cancelled && setError(e),
    );
    return () => {
      cancelled = true;
    };
  }, [src, v]);

  if (error && node === null) throw error;
  return wrap(node ?? fallback);
}
