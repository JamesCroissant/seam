/**
 * Server half of a 'use client' module. In the SSR bundle the Vite plugin turns
 *
 *   'use client'
 *   export function StatusToggle(props) { ... }
 *
 * into
 *
 *   import * as m from "/app/islands/StatusToggle.tsx?seam-impl";
 *   export const StatusToggle = createIsland("app/islands/StatusToggle.tsx", "StatusToggle", m.StatusToggle, m);
 *
 * The island renders as
 *
 *   <seam-island data-island=".." data-export=".." data-props='{"..."}' data-prefix="i0-" data-hydrate="load">
 *     ...server HTML of the component...
 *   </seam-island>
 *
 * Each island is rendered by its own React render with its own identifierPrefix, the same
 * way the browser will hydrate it (one hydrateRoot per island), so useId() matches.
 */
import { createElement, use, useContext, type ComponentType } from "react";
import type { ReactFormState } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server";
import { tryGetContext } from "../core/context.ts";
import { InsideIslandContext, IslandRenderContext, RscSsrContext, ServerUrlContext } from "../react/contexts.ts";

export type HydrateWhen = "load" | "idle" | "visible";

interface IslandModule {
  hydrate?: HydrateWhen;
  persist?: boolean | string;
}

interface Rendered {
  prefix: string;
  props: string;
  html: Promise<string>;
  /** RSC views this island loaded during SSR: src → Flight text (sent along for hydration). */
  rsc: Map<string, string>;
}

// Keyed by the props object: React re-renders the same element when a suspended render resumes.
const rendered = new WeakMap<object, Rendered>();

export function createIsland(id: string, exportName: string, Component: unknown, mod: IslandModule) {
  if (typeof Component !== "function") return Component;
  const C = Component as ComponentType<any>;
  const hydrate = mod.hydrate ?? "load";
  const persist = mod.persist === true ? `${id}#${exportName}` : typeof mod.persist === "string" ? mod.persist : undefined;

  function Island(props: Record<string, unknown>) {
    const state = useContext(IslandRenderContext);
    const inside = useContext(InsideIslandContext);
    if (!state || inside) return createElement(C, props);

    let r = rendered.get(props);
    if (!r) {
      const prefix = `${state.idPrefix}i${state.counter.n++}-`;
      const json = serializeProps(props, id, exportName);
      // <RscView> inside the island: load the view now, so the HTML already shows it.
      const rsc = new Map<string, string>();
      const rscForSsr = tryGetContext()?.rscForSsr;
      const trees = new Map<string, Promise<unknown>>();
      const loadRsc = rscForSsr
        ? (src: string) => {
            let tree = trees.get(src);
            if (!tree) {
              tree = rscForSsr(src).then(({ flight, tree }) => (rsc.set(src, flight), tree));
              trees.set(src, tree);
            }
            return tree;
          }
        : null;
      const element = createElement(
        InsideIslandContext,
        { value: true },
        createElement(ServerUrlContext, { value: state.url }, createElement(RscSsrContext, { value: loadRsc }, createElement(C, props))),
      );
      // Start in a microtask: never start a React render while another one is running.
      const html = Promise.resolve().then(async () => {
        const stream = await renderToReadableStream(element, {
          identifierPrefix: prefix,
          formState: (state.formState ?? undefined) as ReactFormState | undefined,
          onError: (e) => console.error(`[seam] island ${id}#${exportName}:`, e),
        });
        await stream.allReady;
        return new Response(stream).text();
      });
      r = { prefix, props: json, html, rsc };
      rendered.set(props, r);
    }

    const html = use(r.html);
    return createElement("seam-island", {
      "data-island": id,
      "data-export": exportName,
      "data-props": r.props,
      "data-prefix": r.prefix,
      "data-hydrate": hydrate,
      "data-persist": persist,
      "data-form-state": state.formState ? JSON.stringify(state.formState) : undefined,
      "data-rsc": r.rsc.size > 0 ? JSON.stringify(Object.fromEntries(r.rsc)) : undefined,
      dangerouslySetInnerHTML: { __html: html },
    });
  }
  Island.displayName = `Island(${exportName})`;
  return Island;
}

function serializeProps(props: Record<string, unknown>, id: string, name: string): string {
  return JSON.stringify(props, (key, value) => {
    if (typeof value === "function" || typeof value === "symbol") {
      throw new Error(`[seam] Island <${name}> (${id}): prop "${key}" is a ${typeof value}. Island props must be JSON values.`);
    }
    if (value && typeof value === "object" && "$$typeof" in value) {
      throw new Error(`[seam] Island <${name}> (${id}): prop "${key}" is a React element. Islands cannot take JSX as props or children.`);
    }
    return value;
  });
}
