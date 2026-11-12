import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { serve } from "../src/adapters/node.ts";

let base = "";
let close: () => void;

beforeAll(async () => {
  const server = serve(async (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/echo") {
      const form = await req.formData();
      const headers = new Headers({ "Content-Type": "application/json" });
      headers.append("Set-Cookie", "a=1; Path=/");
      headers.append("Set-Cookie", "b=2; Path=/");
      return new Response(JSON.stringify({ method: req.method, name: form.get("name"), host: url.host }), { headers });
    }
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode("chunk1 "));
        setTimeout(() => {
          c.enqueue(new TextEncoder().encode("chunk2"));
          c.close();
        }, 20);
      },
    });
    return new Response(stream, { status: 201 });
  }, { port: 0 });
  await new Promise<void>((r) => server.once("listening", r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
  close = () => server.close();
});
afterAll(() => close());

describe("node adapter", () => {
  it("converts request body and keeps multiple Set-Cookie headers", async () => {
    const body = new FormData();
    body.append("name", "seam");
    const res = await fetch(`${base}/echo`, { method: "POST", body });
    expect(await res.json()).toMatchObject({ method: "POST", name: "seam" });
    expect(res.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
  });

  it("streams the response body", async () => {
    const res = await fetch(`${base}/stream`);
    expect(res.status).toBe(201);
    expect(await res.text()).toBe("chunk1 chunk2");
  });
});
