"use server";
// Writes. Every export becomes a plain endpoint: POST /_action/<id> (see .seam/actions.gen.ts).
// Without JS the browser posts the form and gets a 303 back to the page; with JS the same request is sent by fetch.
import { db } from "../server/db.server";

export async function addTodo(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return { error: "Please write something." };
  await db.add(text);
  // Returning nothing: back to the page, and its loader runs again.
}

export async function removeTodo(formData: FormData) {
  await db.remove(String(formData.get("id")));
}

/** Used by an island with useActionState: (previous state, form data) → next state. */
export async function toggleTodo(prev: { done: boolean }, formData: FormData) {
  const todo = await db.toggle(String(formData.get("id")));
  return { done: todo?.done ?? prev.done };
}
