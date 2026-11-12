// A tiny in-memory "database". Replace it with your real one.
// The .server.ts suffix keeps it out of the browser: importing it from an island is a build error.

export interface Todo {
  id: string;
  text: string;
  done: boolean;
}

const store = globalThis as unknown as { __todos?: Todo[]; __todoSeq?: number };
store.__todos ??= [
  { id: "1", text: "Read app/routes/index.tsx", done: false },
  { id: "2", text: "Add a todo without JavaScript", done: false },
];
store.__todoSeq ??= 2;

export const db = {
  async list(): Promise<Todo[]> {
    return store.__todos!;
  },
  async add(text: string): Promise<Todo> {
    const todo = { id: String(++store.__todoSeq!), text, done: false };
    store.__todos!.push(todo);
    return todo;
  },
  async toggle(id: string): Promise<Todo | undefined> {
    const todo = store.__todos!.find((t) => t.id === id);
    if (todo) todo.done = !todo.done;
    return todo;
  },
  async remove(id: string): Promise<void> {
    store.__todos = store.__todos!.filter((t) => t.id !== id);
  },
};
