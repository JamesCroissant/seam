// GET /_v/invoices/summary — the same for every user, so it is public and cacheable.
// The page links to it with ?v=<version>: new data → new URL → the old cache entry is simply not used.
import { data, type ViewProps } from "seam";
import { db } from "../../server/db.server";

export async function loader() {
  const list = await db.list();
  const total = list.reduce((sum, i) => sum + i.amount, 0);
  const paid = list.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amount, 0);
  return data(
    { count: list.length, total, paid, renderedAt: new Date().toISOString() },
    { headers: { "Cache-Control": "public, max-age=0, s-maxage=300" } },
  );
}

export default function Summary({ data }: ViewProps<typeof loader>) {
  return (
    <p className="summary" data-testid="summary">
      {data.count} invoices · total ${data.total} · paid ${data.paid}
    </p>
  );
}
