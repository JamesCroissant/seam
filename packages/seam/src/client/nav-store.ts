/** Tiny store for the current URL and "loading" flag. No React here: the nav script imports it. */
export interface NavState {
  url: URL;
  pending: boolean;
}

let state: NavState | null = null;
const listeners = new Set<() => void>();

export function getNavState(): NavState {
  state ??= { url: new URL(location.href), pending: false };
  return state;
}

export function setNavState(patch: Partial<NavState>): void {
  const prev = getNavState();
  const next = { ...prev, ...patch };
  if (next.pending === prev.pending && next.url.href === prev.url.href) return;
  state = next;
  for (const l of listeners) l();
}

export function subscribeNav(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
