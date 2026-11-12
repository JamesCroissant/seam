import { describe, expect, it } from "vitest";
import { handleAction, safeReturnPath } from "../src/core/action.ts";
import { redirect } from "../src/core/data.ts";
import { readFlash } from "../src/core/flash.ts";
import type { ActionMap } from "../src/core/types.ts";

const calls: unknown[][] = [];
const actions: ActionMap = {
  save: async () => async (...args: unknown[]) => {
    calls.push(args);
    const form = args.at(-1) as FormData;
    if (!form.get("title")) return { error: "required" };
  },
  go: async () => async () => redirect("/done"),
  counter: async () => async (prev: { n: number }) => ({ n: prev.n + 1 }),
};

function post(id: string, fields: Record<string, string>, headers: Record<string, string> = {}) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return new Request(`http://app.test/_action/${id}`, { method: "POST", body, headers });
}

describe("handleAction", () => {
  it("plain form: 303 back to $return, and strips $-fields from the form", async () => {
    calls.length = 0;
    const res = await handleAction(post("save", { title: "x", $return: "/a?b=1", $ACTION_ID_save: "" }), "save", actions);
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/a?b=1");
    const form = calls[0][0] as FormData;
    expect([...form.keys()]).toEqual(["title"]);
  });

  it("plain form with a return value: 303 + one-time flash cookie", async () => {
    const res = await handleAction(post("save", { title: "", $return: "/a" }), "save", actions);
    expect(res.status).toBe(303);
    const cookie = res.headers.get("Set-Cookie")!.split(";")[0];
    expect(readFlash(new Request("http://app.test/", { headers: { Cookie: cookie } }))).toEqual({ id: "save", value: { error: "required" } });
  });

  it("useActionState without JS: $bound gives prevState, flash keeps the React key", async () => {
    const res = await handleAction(post("counter", { $bound: JSON.stringify([{ n: 1 }]), $ACTION_KEY: "k1", $return: "/" }), "counter", actions);
    const cookie = res.headers.get("Set-Cookie")!.split(";")[0];
    expect(readFlash(new Request("http://app.test/", { headers: { Cookie: cookie } }))).toEqual({ id: "counter", value: { n: 2 }, key: "k1", bound: 0 });
  });

  it("JSON mode ($args from createServerReference) returns the value", async () => {
    const res = await handleAction(
      post("counter", { $args: JSON.stringify([{ n: 5 }, { $fd: 1 }]), $bound: "[{\"n\":0}]" }, { "X-Seam-Action": "json" }),
      "counter",
      actions,
    );
    expect(await res.json()).toEqual({ value: { n: 6 } });
  });

  it("JSON mode turns a redirect into { redirect }", async () => {
    const res = await handleAction(post("go", { $args: "[]" }, { "X-Seam-Action": "json" }), "go", actions);
    expect(await res.json()).toEqual({ redirect: "/done" });
  });

  it("rejects cross-origin posts", async () => {
    const res = await handleAction(post("save", { title: "x" }, { Origin: "https://evil.test" }), "save", actions);
    expect(res.status).toBe(403);
    const ok = await handleAction(post("save", { title: "x" }, { Origin: "http://app.test" }), "save", actions);
    expect(ok.status).toBe(303);
    const site = await handleAction(post("save", { title: "x" }, { "Sec-Fetch-Site": "cross-site" }), "save", actions);
    expect(site.status).toBe(403);
  });

  it("unknown action asks the client to reload", async () => {
    const res = await handleAction(post("nope", {}), "nope", actions);
    expect(res.status).toBe(409);
    expect(res.headers.get("X-Seam-Reload")).toBe("1");
  });
});

describe("safeReturnPath", () => {
  const req = new Request("http://app.test/_action/x", { method: "POST" });
  it.each([
    ["/ok", "/ok"],
    ["/ok?x=1#h", "/ok?x=1#h"],
    ["//evil.test/x", "/"],
    ["/\\evil.test", "/"],
    ["https://evil.test/", "/"],
    ["relative", "/"],
    [null, "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeReturnPath(input, req)).toBe(expected);
  });
});
