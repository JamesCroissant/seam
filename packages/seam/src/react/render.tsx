import { createElement, type ReactNode } from "react";
import type { ReactFormState } from "react-dom/client";
import { renderToReadableStream } from "react-dom/server";
import type { Renderer } from "../core/types.ts";
import { IslandRenderContext } from "./contexts.ts";

export interface RendererOptions {
  /** Module scripts added to the page: the navigation script (+ Vite client in dev). */
  scripts: string[];
}

/**
 * Builds <RootLayout><Layout><Page/></Layout></RootLayout> and streams it.
 * The root layout renders <html>. Layouts receive the inner route as `children`.
 * For a view (fragment), it renders just the view component.
 */
export function createRenderer(options: RendererOptions): Renderer {
  return async ({ request, layers, formState, fragment }) => {
    let tree: ReactNode = null;
    for (let i = layers.length - 1; i >= 0; i--) {
      const { Component, props } = layers[i];
      tree = createElement(Component, props, tree);
    }
    const idPrefix = fragment?.idPrefix ?? "";
    tree = createElement(IslandRenderContext, { value: { formState, url: request.url, counter: { n: 0 }, idPrefix } }, tree);

    const stream = await renderToReadableStream(tree, {
      bootstrapModules: fragment ? undefined : options.scripts,
      identifierPrefix: fragment ? idPrefix : undefined,
      formState: (formState ?? undefined) as ReactFormState | undefined,
      signal: request.signal,
      onError(error) {
        console.error("[seam] render error:", error);
      },
    });
    // Wait until every <Suspense> is resolved when:
    // - rendering a view: it is inserted as a finished piece of HTML;
    // - the navigation script asks (X-Seam-Nav): it parses the HTML with DOMParser,
    //   where React's streaming <script>s do not run.
    if (fragment || request.headers.get("X-Seam-Nav") === "1") await stream.allReady;
    return stream;
  };
}
