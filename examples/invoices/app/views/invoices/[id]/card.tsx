// GET /_v/invoices/:id/card      → HTML fragment
// GET /_v/invoices/:id/card.rsc  → the same view as RSC data (for <RscView> in an island)
// The server draws the card; <Slot name="actions"> is a hole the browser fills with its own component.
import { data, type LoaderArgs, type ViewProps } from "seam";
import { Slot } from "seam/slot";
import { db } from "../../../server/db.server";

export async function loader({ params }: LoaderArgs<"/invoices/:id/card">) {
  const invoice = await db.find(params.id);
  if (!invoice) throw new Response("Not Found", { status: 404 });
  return data(
    { invoice, renderedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "private, max-age=0" }, etag: String(invoice.updatedAt) },
  );
}

export default function InvoiceCard({ data }: ViewProps<typeof loader>) {
  const { invoice } = data;
  return (
    <article className="card" data-testid="card">
      <h2>{invoice.title}</h2>
      <p>
        ${invoice.amount} · <span className={`badge ${invoice.status}`} data-testid="card-status">{invoice.status}</span>
      </p>
      <Slot name="actions" props={{ id: invoice.id, status: invoice.status }}>
        <p>(no actions)</p>
      </Slot>
      <small>rendered on the server at {data.renderedAt}</small>
    </article>
  );
}
