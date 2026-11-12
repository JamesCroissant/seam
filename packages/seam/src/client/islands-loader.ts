/** Loads the island runtime (and React) only when it is first needed. */
type IslandsModule = typeof import("./islands.ts");

let loaded: IslandsModule | null = null;
let loading: Promise<IslandsModule> | null = null;

export function loadIslands(): Promise<IslandsModule> {
  loading ??= import("./islands.ts").then((m) => (loaded = m));
  return loading;
}

/** The island runtime if it is already loaded (no download). */
export function islandsIfLoaded(): IslandsModule | null {
  return loaded;
}
