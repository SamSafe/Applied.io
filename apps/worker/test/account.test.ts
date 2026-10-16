import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { application, message, user } from "../src/db/schema";
import { call, signIn } from "./helpers";

const send = (cookie: string, method: string, path: string, body?: unknown) =>
  call(path, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("account", () => {
  it("exports the user's data as a JSON download", async () => {
    const cookie = await signIn("jane@example.test");
    await send(cookie, "POST", "/api/applications", { company: "Acme", position: "Engineer" });
    const res = await send(cookie, "GET", "/api/account/export");
    expect(res.headers.get("content-disposition")).toMatch(/attachment; filename="applied-export-/);
    const body = (await res.json()) as {
      user: { email: string };
      applications: { company: string }[];
    };
    expect(body.user.email).toBe("jane@example.test");
    expect(body.applications.map((a) => a.company)).toEqual(["Acme"]);
  });

  it("deletes everything, including stored mail, and only with confirmation", async () => {
    const cookie = await signIn("jane@example.test");
    const keep = await signIn("other@example.test");
    await send(cookie, "POST", "/api/applications", { company: "Acme", position: "Engineer" });
    await send(keep, "POST", "/api/applications", { company: "Globex", position: "Analyst" });
    const me = (await (await send(cookie, "GET", "/api/me")).json()) as { user: { id: string } };
    await env.RAW_MAIL.put(`${me.user.id}/m1.eml`, "raw");

    expect((await send(cookie, "DELETE", "/api/account", {})).status).toBe(400);
    expect(
      (await send(cookie, "DELETE", "/api/account", { confirm: "delete my account" })).status,
    ).toBe(204);

    expect(await env.RAW_MAIL.get(`${me.user.id}/m1.eml`)).toBeNull();
    const db = getDb(env);
    expect((await db.select().from(user)).map((u) => u.email)).toEqual(["other@example.test"]);
    expect((await db.select().from(application)).map((a) => a.company)).toEqual(["Globex"]);
    expect(await db.select().from(message)).toEqual([]);
    expect((await send(cookie, "GET", "/api/me")).status).toBe(401);
  });
});
