// "/" — read with the loader (GET), write with 'use server' actions (POST → 303 → GET).
import { data, getActionResult, type PageProps } from "seam";
import { addTodo, removeTodo } from "../actions/todos";
import { DoneToggle } from "../islands/DoneToggle";
import { db } from "../server/db.server";

export async function loader() {
  return data(
    {
      todos: await db.list(),
      // What addTodo returned, when the form was posted without JS.
      result: getActionResult<{ error?: string }>(addTodo),
    },
    { headers: { "Cache-Control": "private, max-age=0" } },
  );
}

export default function Todos({ data }: PageProps<typeof loader>) {
  const { todos, result } = data;
  return (
    <>
      <title>Todos</title>
      <h1>Todos</h1>

      <ul className="todos">
        {todos.map((todo) => (
          <li key={todo.id}>
            <DoneToggle id={todo.id} done={todo.done} />
            <span className={todo.done ? "text done" : "text"}>{todo.text}</span>
            <form action={removeTodo} className="inline">
              <input type="hidden" name="id" value={todo.id} />
              <button aria-label={`Remove ${todo.text}`}>×</button>
            </form>
          </li>
        ))}
      </ul>

      <form action={addTodo}>
        {result?.error && (
          <p className="error" role="alert">
            {result.error}
          </p>
        )}
        <input name="text" placeholder="What needs to be done?" aria-invalid={Boolean(result?.error) || undefined} />
        <button>Add</button>
      </form>
    </>
  );
}
