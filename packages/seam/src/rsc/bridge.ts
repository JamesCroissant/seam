/**
 * Runs in the `ssr` environment (where the Seam app lives) and forwards GET /_v/....rsc
 * to the `rsc` environment. `import.meta.viteRsc.loadModule` is provided by @vitejs/plugin-rsc:
 * in dev it imports through the rsc module runner, in a build it becomes a static import.
 */
export async function handleRsc(request: Request): Promise<Response> {
  const mod = await import.meta.viteRsc.loadModule<{ handle(request: Request): Promise<Response> }>("rsc", "index");
  return mod.handle(request);
}

/** Flight text → React tree, in the SSR environment ('use client' parts become their SSR modules). */
export async function decodeRsc(flight: string): Promise<unknown> {
  const { createFromReadableStream } = await import("@vitejs/plugin-rsc/ssr");
  return createFromReadableStream(new Response(flight).body!);
}
