// "/" — a page with no islands: no React is downloaded here, only the small navigation script.
import { data, getActionResult, Include, type PageProps } from "seam";
import { createInvoice, type FormResult } from "../actions/invoice";
import { db } from "../server/db.server";

export async function loader() {
  const [invoices, version] = await Promise.all([db.list(), db.version()]);
  return data(
    { invoices, version, error: getActionResult<FormResult>(createInvoice) },
    { headers: { "Cache-Control": "private, max-age=0" } },
  );
}

export default function InvoicesPage({ data }: PageProps<typeof loader>) {
  const { invoices, version, error } = data;
  return (
    <>
      <title>Invoices · Seam</title>
      <h1>Invoices</h1>
      {/* Rendered on the server. Its own URL + Cache-Control; the version in the URL busts the cache. */}
      <Include src={`/_v/invoices/summary?v=${version}`} />
      <ul>
        {invoices.map((inv) => (
          <li key={inv.id}>
            <a href={`/invoices/${inv.id}`}>{inv.title}</a> — ${inv.amount} <span className={`badge ${inv.status}`}>{inv.status}</span>
          </li>
        ))}
      </ul>

      <h2>New invoice</h2>
      {/* A normal HTML form. Without JS: POST /_action/<id> → 303. With JS: the same request via fetch. */}
      <form action={createInvoice}>
        {error?.error && (
          <p className="error" role="alert">
            {error.error}
          </p>
        )}
        <label>
          Title <input name="title" aria-invalid={error?.field === "title" || undefined} />
        </label>
        <label>
          Amount <input name="amount" type="number" min="1" aria-invalid={error?.field === "amount" || undefined} />
        </label>
        <button id="create">Create</button>
      </form>
    </>
  );
}
