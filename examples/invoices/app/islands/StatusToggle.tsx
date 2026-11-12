"use client";
import { useActionState } from "react";
import { toggleStatus } from "../actions/invoice";

/** An island. Works without JS too: React renders the form as POST /_action/<id>. */
export function StatusToggle({ id, status }: { id: string; status: "draft" | "sent" | "paid" }) {
  const [state, formAction, pending] = useActionState(toggleStatus, { status });
  return (
    <form action={formAction} className="toggle">
      <input type="hidden" name="id" value={id} />
      <span className={`badge ${state.status}`} data-testid="status">
        {state.status}
      </span>{" "}
      <button id="toggle-status" disabled={pending}>
        {pending ? "Saving…" : "Next status"}
      </button>
    </form>
  );
}
