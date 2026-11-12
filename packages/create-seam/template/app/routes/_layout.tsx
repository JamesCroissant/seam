// The root layout renders the whole document. Pages are rendered inside <main>.
import type { ReactNode } from "react";

const css = `
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.5; }
  body { margin: 0 auto; max-width: 640px; padding: 0 16px 48px; }
  header { display: flex; gap: 16px; align-items: baseline; padding: 12px 0; border-bottom: 1px solid #8884; }
  header strong { margin-right: auto; }
  ul.todos { list-style: none; padding: 0; }
  ul.todos li { display: flex; gap: 8px; align-items: center; padding: 4px 0; }
  ul.todos li .text { flex: 1; }
  form.inline { display: inline; }
  .done { text-decoration: line-through; opacity: .6; }
  .error { color: #dc2626; }
  html[aria-busy="true"] { cursor: progress; }
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
          <strong>My Seam app</strong>
          <a href="/">Todos</a>
          <a href="/about">About</a>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}

export function ErrorBoundary({ error }: { error: { status?: number } }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Error</title>
      </head>
      <body>
        <main>
          <h1>{error?.status === 404 ? "Not found" : "Something went wrong"}</h1>
          <a href="/">Back home</a>
        </main>
      </body>
    </html>
  );
}
