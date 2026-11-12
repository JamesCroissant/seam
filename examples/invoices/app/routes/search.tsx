import { data, type PageProps } from "seam";
import { searchInvoices } from "../api/invoices.api";
import { InvoiceSearch } from "../islands/InvoiceSearch";

export async function loader() {
  // On the server the API function runs its handler directly (no HTTP request).
  return data({ initial: await searchInvoices() }, { headers: { "Cache-Control": "private, max-age=0" } });
}

export default function SearchPage({ data }: PageProps<typeof loader>) {
  return (
    <>
      <title>Search · Seam</title>
      <h1>Search</h1>
      <p>The island calls a typed GET API (app/api/invoices.api.ts) as you type.</p>
      <InvoiceSearch initial={data.initial} />
    </>
  );
}
