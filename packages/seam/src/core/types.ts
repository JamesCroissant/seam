import type { ComponentType, ReactNode } from "react";
import type { DataResult } from "./data.ts";

/** Platform-specific values handed to the app by an adapter. */
export interface Platform {
  env?: unknown;
  waitUntil?(promise: Promise<unknown>): void;
}

/** The whole framework is this function. */
export type App = (request: Request, platform?: Platform) => Promise<Response>;

// ---------- routes ----------

export interface RouteModule {
  default: ComponentType<any>;
  loader?: (args: LoaderArgs<any>) => unknown;
  ErrorBoundary?: ComponentType<{ error: unknown }>;
}

export interface RouteEntry {
  /** Source file, relative to the project root. Shown in errors and in .seam/routes.gen.ts. */
  file: string;
  load: () => Promise<RouteModule>;
}

/** One node of the build-time route trie (see .seam/routes.gen.ts). */
export interface RouteNode {
  layout?: RouteEntry;
  index?: RouteEntry;
  static?: Record<string, RouteNode>;
  param?: { name: string; node: RouteNode };
  rest?: { name: string; entry: RouteEntry };
}

export interface RouteMatch {
  entries: RouteEntry[];
  params: Record<string, string>;
}

// ---------- actions ----------

export type ActionFn = (...args: any[]) => unknown;
export type ActionMap = Record<string, () => Promise<ActionFn>>;

// ---------- loader / page typing ----------

type Seg<S extends string> = S extends `:${infer N}` ? N : S extends `*${infer N}` ? N : never;
type ParamNames<P extends string> = P extends `${infer A}/${infer B}` ? Seg<A> | ParamNames<B> : Seg<P>;
export type Params<P extends string> = string extends P ? Record<string, string> : { [K in ParamNames<P>]: string };

export interface LoaderArgs<P extends string = string> {
  request: Request;
  params: Params<P>;
  platform: Platform;
}

export type LoaderData<L> = L extends (...args: any[]) => infer R
  ? Awaited<R> extends DataResult<infer T>
    ? T
    : Awaited<R>
  : never;

export interface PageProps<L = unknown, P extends string = string> {
  data: LoaderData<L>;
  params: Params<P>;
  children?: ReactNode;
}

// ---------- rendering ----------

export interface RenderLayer {
  Component: ComponentType<any>;
  props: Record<string, unknown>;
}

/** [state, actionKey, actionId, boundArgCount] — React's own ReactFormState shape. */
export type FormState = [unknown, string, string, number];

export interface RenderArgs {
  request: Request;
  layers: RenderLayer[];
  formState: FormState | null;
  /** Rendering a view (/_v/...): no document scripts, fully resolved, ids prefixed so they never clash with the page. */
  fragment?: { idPrefix: string };
}

/** Props of a view component (app/views/*). Same shape as a page. */
export type ViewProps<L = unknown, P extends string = string> = Omit<PageProps<L, P>, "children">;

// ---------- typed API (*.api.ts) ----------

/** One GET endpoint, as listed in .seam/api.gen.ts. */
export interface ApiEntry {
  method: "GET";
  path: string;
  load: () => Promise<{ serve(request: Request, params: Record<string, string>): Promise<Response> }>;
}

// ---------- view cache ----------

/** A shared cache for view responses. Only `public` responses with a positive lifetime are stored. */
export interface ViewCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, body: string, init: { status: number; headers: Headers }, ttlSeconds: number): Promise<void>;
}

export type Renderer = (args: RenderArgs) => Promise<ReadableStream<Uint8Array>>;
