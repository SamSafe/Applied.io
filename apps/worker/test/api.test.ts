import { describe, expect, it } from "vitest";
import { call, signIn } from "./helpers";

describe("api", () => {
  it("reports health without a session", async () => {
    const res = await call("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("rejects protected routes without a session", async () => {
    expect((await call("/api/me")).status).toBe(401);
    expect((await call("/api/mail-sources")).status).toBe(401);
  });

  it("signs in with a magic link (spike S4)", async () => {
    const cookie = await signIn("jane@example.test");
    const res = await call("/api/me", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { email: string } };
    expect(body.user.email).toBe("jane@example.test");
  });
});

describe("mail sources", () => {
  type Source = { id: string; address: string; status: string };

  it("issues, lists and rotates a forwarding address", async () => {
    const cookie = await signIn("jane@example.test");
    const created = await call("/api/mail-sources/forwarding", {
      method: "POST",
      headers: { cookie },
    });
    expect(created.status).toBe(201);
    const { source } = (await created.json()) as { source: Source };
    expect(source.address).toMatch(/^u_[a-z0-9]{10}@in\.localhost$/);
    expect(source.status).toBe("awaiting_first_mail");

    const list = (await (await call("/api/mail-sources", { headers: { cookie } })).json()) as {
      sources: Source[];
    };
    expect(list.sources.map((s) => s.id)).toEqual([source.id]);

    const rotated = await call(`/api/mail-sources/${source.id}/rotate`, {
      method: "POST",
      headers: { cookie },
    });
    const after = ((await rotated.json()) as { source: Source }).source;
    expect(after.id).toBe(source.id);
    expect(after.address).not.toBe(source.address);
  });

  it("never lets one user see or rotate another user's address", async () => {
    const jane = await signIn("jane@example.test");
    const mallory = await signIn("mallory@example.test");
    const created = await call("/api/mail-sources/forwarding", {
      method: "POST",
      headers: { cookie: jane },
    });
    const { source } = (await created.json()) as { source: Source };

    const list = (await (
      await call("/api/mail-sources", { headers: { cookie: mallory } })
    ).json()) as {
      sources: Source[];
    };
    expect(list.sources).toEqual([]);
    const rotate = await call(`/api/mail-sources/${source.id}/rotate`, {
      method: "POST",
      headers: { cookie: mallory },
    });
    expect(rotate.status).toBe(404);
  });
});
