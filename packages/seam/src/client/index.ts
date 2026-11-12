import { useContext, useSyncExternalStore } from "react";
import { ServerUrlContext } from "../react/contexts.ts";
import { getNavState, subscribeNav, type NavState } from "./nav-store.ts";

export type { NavState };
export { ApiError } from "../runtime/api-shared.ts";
export type { HydrateWhen } from "../runtime/island.tsx";

const serverSnapshots = new Map<string, NavState>();

/**
 * The current URL and whether a navigation / form submit is in progress.
 * Works in islands, including islands kept across navigations with `export const persist = true`.
 */
export function useNav(): NavState {
  const serverUrl = useContext(ServerUrlContext);
  return useSyncExternalStore(subscribeNav, getNavState, () => {
    if (typeof window !== "undefined") return getNavState();
    const href = serverUrl ?? "http://localhost/";
    let snap = serverSnapshots.get(href);
    if (!snap) {
      snap = { url: new URL(href), pending: false };
      if (serverSnapshots.size > 100) serverSnapshots.clear();
      serverSnapshots.set(href, snap);
    }
    return snap;
  });
}

/** A value shared by every island on the page (islands are separate React roots). */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  const subscribe = (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };
  return {
    get: () => value,
    set(next: T | ((prev: T) => T)) {
      value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
      for (const l of listeners) l();
    },
    use<S = T>(select: (v: T) => S = (v) => v as unknown as S): S {
      return useSyncExternalStore(
        subscribe,
        () => select(value),
        () => select(initial),
      );
    },
  };
}
