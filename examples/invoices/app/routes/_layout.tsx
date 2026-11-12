import type { ReactNode } from "react";
import { Include } from "seam";

const css = `
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
  body { margin: 0 auto; max-width: 720px; padding: 0 16px 48px; }
  header { display: flex; gap: 16px; align-items: baseline; border-bottom: 1px solid #8884; padding: 12px 0; }
  header strong { margin-right: auto; }
  html[aria-busy="true"]::before { content: ""; position: fixed; inset: 0 0 auto; height: 3px; background: #3b82f6; animation: load 1s ease-in-out infinite; }
  @keyframes load { from { transform: scaleX(0); transform-origin: left; } to { transform: scaleX(1); transform-origin: left; } }
  form[aria-busy="true"] { opacity: .6; }
  .badge { padding: 2px 8px; border-radius: 99px; font-size: .85em; background: #8883; }
  .badge.paid { background: #16a34a33; } .badge.sent { background: #3b82f633; }
  .error { color: #dc2626; }
  [aria-invalid="true"] { outline: 2px solid #dc2626; }
  label { display: block; margin: 8px 0; }
  .board { display: grid; grid-template-columns: 1fr 2fr; gap: 16px; }
  .card { padding: 12px; border: 1px solid #8884; border-radius: 8px; }
  .summary { padding: 8px 12px; border-radius: 6px; background: #3b82f61a; }
  seam-view[aria-busy="true"] { opacity: .5; }
  .stopwatch { font-size: .9em; padding: 6px 10px; border-radius: 6px; background: #8881; }
`;

export default function RootLayout({ children }: { children?: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>{css}</style>
      </head>
      <body>
        <header>
          <strong>Seam · invoices</strong>
          <a href="/">Invoices</a>
          <a href="/search">Search</a>
          <a href="/board">Board</a>
          <a href="/about">About</a>
          {/* Per-user, loaded by the browser: does not make this page private. */}
          <Include src="/_v/me" client fallback={<span>You</span>} />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}

/** The root error boundary replaces the root layout, so it renders the whole document. */
export function ErrorBoundary({ error }: { error: { status?: number; message?: string } }) {
  const status = error?.status ?? 500;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{`${status} · Seam`}</title>
      </head>
      <body>
        <main>
          <h1>{status === 404 ? "Not found" : "Something went wrong"}</h1>
          <p>
            <a href="/">Back to invoices</a>
          </p>
        </main>
      </body>
    </html>
  );
}
