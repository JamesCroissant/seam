"use client";
// Intentionally wrong: an island importing server-only code. The build must fail.
import { SECRET } from "../server/secret.server";
export function Leak() {
  return <p>{SECRET}</p>;
}
