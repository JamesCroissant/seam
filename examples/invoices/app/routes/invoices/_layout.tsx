import type { ReactNode } from "react";
import { Stopwatch } from "../../islands/Stopwatch";

// Layout for /invoices/*. The Stopwatch island is `persist`: it keeps running between invoices.
export default function InvoicesLayout({ children }: { children?: ReactNode }) {
  return (
    <>
      <Stopwatch label="Time spent on invoices" />
      {children}
    </>
  );
}
