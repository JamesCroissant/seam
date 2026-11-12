// In-memory "database". The .server.ts suffix makes it a build error to import this from an island.

export type Status = "draft" | "sent" | "paid";
export interface Invoice {
  id: string;
  title: string;
  amount: number;
  status: Status;
  updatedAt: number;
}

const g = globalThis as unknown as { __invoices?: Map<string, Invoice>; __seq?: number };
const invoices = (g.__invoices ??= new Map<string, Invoice>([
  ["1", { id: "1", title: "Website redesign", amount: 1200, status: "sent", updatedAt: 1 }],
  ["2", { id: "2", title: "Logo", amount: 300, status: "draft", updatedAt: 1 }],
  ["3", { id: "3", title: "Hosting (1 year)", amount: 240, status: "paid", updatedAt: 1 }],
]));
g.__seq ??= 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let clock = Date.now();
const tick = () => (clock = Math.max(clock + 1, Date.now()));

export const db = {
  async list(): Promise<Invoice[]> {
    return [...invoices.values()];
  },
  async find(id: string): Promise<Invoice | undefined> {
    return invoices.get(id);
  },
  async create(title: string, amount: number): Promise<Invoice> {
    const id = String(++g.__seq!);
    const inv: Invoice = { id, title, amount, status: "draft", updatedAt: tick() };
    invoices.set(id, inv);
    return inv;
  },
  async update(id: string, patch: Partial<Pick<Invoice, "title" | "amount" | "status">>): Promise<Invoice> {
    const inv = invoices.get(id);
    if (!inv) throw new Response("Not Found", { status: 404 });
    Object.assign(inv, patch, { updatedAt: tick() });
    return inv;
  },
  /** Changes whenever any invoice changes. Put it in a view URL to bust caches: /_v/...?v=<version> */
  async version(): Promise<number> {
    return Math.max(0, ...[...invoices.values()].map((i) => i.updatedAt), invoices.size);
  },
  /** Slow on purpose, to show streaming with <Suspense>. */
  async history(id: string): Promise<string[]> {
    await sleep(400);
    const inv = invoices.get(id);
    return inv ? [`Created as draft`, `Last change: status is "${inv.status}"`] : [];
  },
};
