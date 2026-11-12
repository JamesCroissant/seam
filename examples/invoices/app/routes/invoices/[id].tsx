import { Suspense, use } from "react";
import { data, getActionResult, type LoaderArgs, type PageProps } from "seam";
import { updateInvoice, type FormResult } from "../../actions/invoice";
import { StatusToggle } from "../../islands/StatusToggle";
import { db } from "../../server/db.server";

export async function loader({ params }: LoaderArgs<"/invoices/:id">) {
  const invoice = await db.find(params.id);
  if (!invoice) throw new Response("Invoice not found", { status: 404 });
  return data(
    {
      invoice,
      others: (await db.list()).filter((i) => i.id !== invoice.id).map((i) => ({ id: i.id, title: i.title })),
      history: db.history(params.id), // not awaited → streamed with <Suspense>
      result: getActionResult<FormResult>(updateInvoice),
    },
    { headers: { "Cache-Control": "private, max-age=0" }, etag: String(invoice.updatedAt) },
  );
}

export default function InvoicePage({ data }: PageProps<typeof loader>) {
  const { invoice, others, history, result } = data;
  return (
    <article>
      <title>{`${invoice.title} · Seam`}</title>
      <h1>{invoice.title}</h1>
      <p>Amount: ${invoice.amount}</p>

      <StatusToggle id={invoice.id} status={invoice.status} />

      <h2>Rename</h2>
      <form action={updateInvoice}>
        <input type="hidden" name="id" value={invoice.id} />
        {result?.error && (
          <p className="error" role="alert">
            {result.error}
          </p>
        )}
        <label>
          Title <input name="title" defaultValue={invoice.title} aria-invalid={result?.field === "title" || undefined} />
        </label>
        <button id="rename">Save</button>
      </form>

      <h2>History</h2>
      <Suspense fallback={<p>Loading history…</p>}>
        <History promise={history} />
      </Suspense>

      <h2>Other invoices</h2>
      <ul>
        {others.map((o) => (
          <li key={o.id}>
            <a href={`/invoices/${o.id}`}>{o.title}</a>
          </li>
        ))}
      </ul>
    </article>
  );
}

function History({ promise }: { promise: Promise<string[]> }) {
  const items = use(promise);
  return (
    <ul data-testid="history">
      {items.map((h) => (
        <li key={h}>{h}</li>
      ))}
    </ul>
  );
}
