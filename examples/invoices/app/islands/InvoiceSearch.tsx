"use client";
import { useEffect, useRef, useState } from "react";
import { searchInvoices } from "../api/invoices.api";

// The return type comes straight from the handler in invoices.api.ts.
type Results = Awaited<ReturnType<typeof searchInvoices>>;

export function InvoiceSearch({ initial }: { initial: Results }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | "draft" | "sent" | "paid">("");
  const [results, setResults] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchInvoices({ query: { q, status: status || undefined } }, { signal: controller.signal })
        .then((r) => {
          setResults(r);
          setError(null);
        })
        .catch((e) => e.name !== "AbortError" && setError(String(e)));
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, status]);

  return (
    <div>
      <label>
        Title <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="search" />
      </label>
      <label>
        Status{" "}
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} data-testid="status-filter">
          <option value="">any</option>
          <option value="draft">draft</option>
          <option value="sent">sent</option>
          <option value="paid">paid</option>
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <ul data-testid="results">
        {results.map((r) => (
          <li key={r.id}>
            <a href={`/invoices/${r.id}`}>{r.title}</a> — ${r.amount} <span className={`badge ${r.status}`}>{r.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
