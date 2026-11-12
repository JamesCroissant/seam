"use client";
import { useEffect, useState } from "react";
import { useNav } from "seam/client";

// Kept alive across navigations: the navigation script moves this element instead of re-creating it.
export const persist = true;

export function Stopwatch({ label }: { label: string }) {
  const [seconds, setSeconds] = useState(0);
  const { url, pending } = useNav();
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <p className="stopwatch" aria-busy={pending}>
      {label}: <strong data-testid="seconds">{seconds}s</strong> on this tab · now at <code data-testid="nav-url">{url.pathname}</code>
      {pending ? " · loading…" : ""}
    </p>
  );
}
