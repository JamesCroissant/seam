"use client";
// An island: the only part of the page that downloads React.
// It still works without JS: React renders the form as POST /_action/<id>.
import { useActionState } from "react";
import { toggleTodo } from "../actions/todos";

export function DoneToggle({ id, done }: { id: string; done: boolean }) {
  const [state, action, pending] = useActionState(toggleTodo, { done });
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button aria-pressed={state.done} disabled={pending} title="Toggle done">
        {state.done ? "✓" : "○"}
      </button>
    </form>
  );
}
