"use server";
// Every export becomes POST /_action/<id>. See .seam/actions.gen.ts for the ids.
import { redirect } from "seam";
import { db, type Status } from "../server/db.server";

export type FormResult = { error?: string; field?: string } | undefined;

export async function createInvoice(formData: FormData): Promise<FormResult | Response> {
  const title = String(formData.get("title") ?? "").trim();
  const amount = Number(formData.get("amount"));
  if (!title) return { error: "Title is required.", field: "title" };
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Amount must be a positive number.", field: "amount" };
  const inv = await db.create(title, amount);
  return redirect(`/invoices/${inv.id}`);
}

export async function updateInvoice(formData: FormData): Promise<FormResult> {
  const id = String(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required.", field: "title" };
  await db.update(id, { title });
  // Nothing returned → 303 back to the page → loaders run again.
}

const NEXT: Record<Status, Status> = { draft: "sent", sent: "paid", paid: "draft" };

/** Used with useActionState: (previous state, form data) → next state. */
export async function toggleStatus(prev: { status: Status }, formData: FormData): Promise<{ status: Status }> {
  const id = String(formData.get("id"));
  const inv = await db.find(id);
  if (!inv) return prev;
  const updated = await db.update(id, { status: NEXT[inv.status] });
  return { status: updated.status };
}
