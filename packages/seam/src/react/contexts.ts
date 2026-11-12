import { createContext } from "react";
import type { FormState } from "../core/types.ts";

/** Set by the page renderer on the server. Islands read it to render themselves. */
export interface IslandRenderState {
  formState: FormState | null;
  url: string;
  counter: { n: number };
  /** "" for a page, "v<hash>-" inside a view, so island ids never clash on one page. */
  idPrefix: string;
}
export const IslandRenderContext = createContext<IslandRenderState | null>(null);

/** True inside an island's own render: nested islands just render normally. */
export const InsideIslandContext = createContext(false);

/** The request URL, for useNav() during SSR. */
export const ServerUrlContext = createContext<string | null>(null);

/** Set by the island renderer during SSR (rsc: true): load an RSC view as a React tree. */
export const RscSsrContext = createContext<((src: string) => Promise<unknown>) | null>(null);
