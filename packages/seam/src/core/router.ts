import type { RouteEntry, RouteMatch, RouteNode } from "./types.ts";

/**
 * Walk the build-time trie. Priority at each level: static > [param] > [...rest].
 * Layouts on the way down are collected, outermost first.
 */
export function matchRoute(root: RouteNode, pathname: string): RouteMatch | null {
  const segments = pathname
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  return walk(root, segments, 0, [], {});
}

function walk(
  node: RouteNode,
  segs: string[],
  i: number,
  layouts: RouteEntry[],
  params: Record<string, string>,
): RouteMatch | null {
  const here = node.layout ? [...layouts, node.layout] : layouts;

  if (i === segs.length) {
    return node.index ? { entries: [...here, node.index], params } : null;
  }

  const seg = segs[i];
  const child = node.static?.[seg];
  if (child) {
    const m = walk(child, segs, i + 1, here, params);
    if (m) return m;
  }
  if (node.param) {
    const m = walk(node.param.node, segs, i + 1, here, { ...params, [node.param.name]: seg });
    if (m) return m;
  }
  if (node.rest) {
    return { entries: [...here, node.rest.entry], params: { ...params, [node.rest.name]: segs.slice(i).join("/") } };
  }
  return null;
}

/** Layouts to use for a 404 page: the root layout only. */
export function rootLayouts(root: RouteNode): RouteEntry[] {
  return root.layout ? [root.layout] : [];
}
