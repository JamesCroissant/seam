"use client";
// An "app region": one island that owns its React tree and pulls server UI in as RSC data.
import { useActionState, useState } from "react";
import { RscView } from "seam/rsc";
import { toggleStatus } from "../actions/invoice";

type Status = "draft" | "sent" | "paid";

/** Plugged into the card's <Slot name="actions">. Its props come from the server. */
function CardActions({ id, status }: { id: string; status: Status }) {
  const [state, action, pending] = useActionState(toggleStatus, { status });
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button id="card-next" disabled={pending}>
        {pending ? "Saving…" : `Next status (now ${state.status})`}
      </button>
    </form>
  );
}

export function Board({ invoices }: { invoices: { id: string; title: string }[] }) {
  const [selected, setSelected] = useState(invoices[0]?.id);
  return (
    <div className="board">
      <ul>
        {invoices.map((i) => (
          <li key={i.id}>
            <button data-testid={`pick-${i.id}`} aria-pressed={i.id === selected} onClick={() => setSelected(i.id)}>
              {i.title}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <RscView src={`/_v/invoices/${selected}/card.rsc`} slots={{ actions: CardActions }} fallback={<p>Loading card…</p>} />
      )}
    </div>
  );
}
