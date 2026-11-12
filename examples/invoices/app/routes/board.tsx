import { data, type PageProps } from "seam";
import { Board } from "../islands/Board";
import { db } from "../server/db.server";

export async function loader() {
  const invoices = (await db.list()).map(({ id, title }) => ({ id, title }));
  return data({ invoices }, { headers: { "Cache-Control": "private, max-age=0" } });
}

export default function BoardPage({ data }: PageProps<typeof loader>) {
  return (
    <>
      <title>Board · Seam</title>
      <h1>Board</h1>
      <p>The card is a Server Component fetched as RSC data; its button is plugged in by the island through a slot.</p>
      <Board invoices={data.invoices} />
    </>
  );
}
