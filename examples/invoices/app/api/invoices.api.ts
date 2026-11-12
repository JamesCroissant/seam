// Typed GET endpoints. In the browser this file becomes two fetch() calls; on the server it is used as is.
import { data } from "seam";
import { get } from "seam/api";
import { z } from "zod";
import { db } from "../server/db.server";

export const searchInvoices = get("/api/invoices", {
  // Any Standard Schema works (Zod here). Query values arrive as strings.
  query: z.object({
    q: z.string().trim().default(""),
    status: z.enum(["draft", "sent", "paid"]).optional(),
  }),
  headers: { "Cache-Control": "private, max-age=0" },
  handler: async ({ query }) => {
    const q = query.q.toLowerCase();
    return (await db.list())
      .filter((i) => i.title.toLowerCase().includes(q) && (!query.status || i.status === query.status))
      .map(({ id, title, amount, status }) => ({ id, title, amount, status }));
  },
});

export const getInvoice = get("/api/invoices/:id", {
  handler: async ({ params }) => {
    const invoice = await db.find(params.id);
    if (!invoice) throw new Response("Not Found", { status: 404 });
    return data(invoice, { headers: { "Cache-Control": "private, max-age=0" }, etag: String(invoice.updatedAt) });
  },
});
