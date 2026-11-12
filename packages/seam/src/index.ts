// Server-side public API.
// Side-effect import (kept in the .d.ts too): lets form actions return values in React's types.
import "./react-augment.ts";
export { createApp, type AppOptions } from "./core/app.ts";
export { data, redirect, type DataInit } from "./core/data.ts";
export { getContext, getActionResult } from "./core/context.ts";
export { mergeCacheControl } from "./core/cache-control.ts";
export { memoryViewCache, cacheStorageViewCache } from "./core/view-cache.ts";
export { Include, type IncludeProps } from "./react/include.tsx";
export { formProps } from "./runtime/server.ts";
export type {
  App,
  Platform,
  LoaderArgs,
  LoaderData,
  PageProps,
  ViewProps,
  ViewCache,
  Params,
  RouteNode,
  RouteEntry,
  RouteModule,
  ActionMap,
  ApiEntry,
} from "./core/types.ts";
