import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { application, event } from "../src/db/schema";
import { call, signIn } from "./helpers";

type Detail = {
  id: string;
  company: string;
  position: string;
  appliedAt: string;
  maxStage: string;
  status: { state: string; outcome?: string };
  isStale: boolean;
  url: string | null;
  events: { id: string; type: string; stage?: string; outcome?: string; voided: boolean }[];
};

let cookie: string;

const send = async (method: string, path: string, body?: unknown, as = cookie) => {
  const res = await call(path, {
    method,
    headers: { cookie: as, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const create = async (body: Record<string, unknown>) => {
  const res = await send("POST", "/api/applications", body);
  expect(res.status).toBe(201);
  return res.body.application as Detail;
};

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

beforeEach(async () => {
  cookie = await signIn("jane@example.test");
});

describe("applications", () => {
  it("creates an application with its applied event", async () => {
    const app = await create({
      company: "Stripe, Inc.",
      position: "Staff SWE",
      appliedAt: "2026-10-01",
    });
    expect(app).toMatchObject({
      company: "Stripe, Inc.",
      position: "Staff SWE",
      appliedAt: "2026-10-01T12:00:00.000Z",
      maxStage: "applied",
      status: { state: "open" },
    });
    expect(app.events.map((e) => e.type)).toEqual(["applied"]);
  });

  it("validates the body", async () => {
    expect((await send("POST", "/api/applications", { company: "", position: "x" })).status).toBe(
      400,
    );
    expect(
      (
        await send("POST", "/api/applications", {
          company: "A",
          position: "B",
          url: "javascript:x",
        })
      ).status,
    ).toBe(400);
    const future = await send("POST", "/api/applications", {
      company: "A",
      position: "B",
      appliedAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    });
    expect(future).toMatchObject({ status: 422, body: { error: "future_date" } });
  });

  it("moves through the pipeline, enforces core's rules, and undoes", async () => {
    const app = await create({ company: "Acme", position: "Engineer" });
    const ev = (body: unknown) => send("POST", `/api/applications/${app.id}/events`, body);

    let res = await ev({ type: "advanced", stage: "interview" });
    expect(res.status).toBe(201);
    expect(res.body.application.maxStage).toBe("interview");

    res = await ev({ type: "closed", outcome: "accepted" });
    expect(res).toMatchObject({ status: 422, body: { error: "offer_not_reached" } });

    res = await ev({ type: "closed", outcome: "rejected", note: "Went with someone else" });
    expect(res.body.application.status).toEqual(
      expect.objectContaining({ state: "closed", outcome: "rejected" }),
    );

    res = await ev({ type: "advanced", stage: "final" });
    expect(res).toMatchObject({ status: 422, body: { error: "application_closed" } });

    const detail = (await send("GET", `/api/applications/${app.id}`)).body.application as Detail;
    const rejectionId = detail.events.find((e) => e.type === "closed")?.id;
    res = await send("POST", `/api/events/${rejectionId}/void`);
    expect(res.status).toBe(201);
    expect(res.body.application.status).toEqual({ state: "open" });
    const events = res.body.application.events as Detail["events"];
    expect(events.find((e) => e.id === rejectionId)?.voided).toBe(true);
    expect(events.at(-1)?.type).toBe("voided");
  });

  it("refuses to undo the applied event", async () => {
    const app = await create({ company: "Acme", position: "Engineer" });
    const applied = app.events[0]?.id;
    const res = await send("POST", `/api/events/${applied}/void`);
    expect(res).toMatchObject({ status: 422, body: { error: "void_target_applied" } });
  });

  it("requires a note on noted events", async () => {
    const app = await create({ company: "Acme", position: "Engineer" });
    const res = await send("POST", `/api/applications/${app.id}/events`, { type: "noted" });
    expect(res.status).toBe(400);
  });

  it("lists with derived state, filters and newest activity first", async () => {
    const old = await create({
      company: "Globex",
      position: "Data Analyst",
      appliedAt: daysAgo(40),
    });
    const fresh = await create({ company: "Acme", position: "Engineer", appliedAt: daysAgo(2) });
    const closed = await create({
      company: "Initech",
      position: "Engineer",
      appliedAt: daysAgo(10),
    });
    await send("POST", `/api/applications/${closed.id}/events`, {
      type: "closed",
      outcome: "withdrawn",
    });

    const list = async (qs = "") =>
      ((await send("GET", `/api/applications${qs}`)).body.applications as Detail[]).map(
        (a) => a.id,
      );

    expect(await list()).toEqual([closed.id, fresh.id, old.id]);
    expect(await list("?status=open")).toEqual([fresh.id, old.id]);
    expect(await list("?status=closed")).toEqual([closed.id]);
    expect(await list("?status=ghosted")).toEqual([old.id]);
    expect(await list("?q=engineer")).toEqual([closed.id, fresh.id]);
    expect((await send("GET", "/api/applications?status=nope")).status).toBe(400);
  });

  it("edits facts and clears optional ones", async () => {
    const app = await create({
      company: "Acme",
      position: "Engineer",
      url: "https://acme.test/jobs/1",
    });
    const res = await send("PATCH", `/api/applications/${app.id}`, {
      company: "Acme Corp",
      url: "",
    });
    expect(res.body.application).toMatchObject({
      company: "Acme Corp",
      position: "Engineer",
      url: null,
    });
  });

  it("deletes an application", async () => {
    const app = await create({ company: "Acme", position: "Engineer" });
    expect((await send("DELETE", `/api/applications/${app.id}`)).status).toBe(204);
    expect((await send("GET", `/api/applications/${app.id}`)).status).toBe(404);
  });
});

describe("isolation between users", () => {
  it("returns 404 for every route on another user's data", async () => {
    const app = await create({ company: "Acme", position: "Engineer" });
    const applied = app.events[0]?.id;
    const mallory = await signIn("mallory@example.test");

    expect((await send("GET", "/api/applications", undefined, mallory)).body.applications).toEqual(
      [],
    );
    expect((await send("GET", `/api/applications/${app.id}`, undefined, mallory)).status).toBe(404);
    expect(
      (await send("PATCH", `/api/applications/${app.id}`, { company: "X" }, mallory)).status,
    ).toBe(404);
    expect(
      (
        await send(
          "POST",
          `/api/applications/${app.id}/events`,
          { type: "advanced", stage: "screen" },
          mallory,
        )
      ).status,
    ).toBe(404);
    expect((await send("POST", `/api/events/${applied}/void`, undefined, mallory)).status).toBe(
      404,
    );
    expect((await send("DELETE", `/api/applications/${app.id}`, undefined, mallory)).status).toBe(
      404,
    );

    // Jane's application is untouched.
    const mine = (await send("GET", `/api/applications/${app.id}`)).body.application as Detail;
    expect(mine).toMatchObject({ company: "Acme", maxStage: "applied" });
  });
});

describe("settings", () => {
  it("returns defaults, updates, and validates", async () => {
    expect((await send("GET", "/api/settings")).body.settings).toEqual({
      ghostThresholdDays: 21,
      timezone: null,
      rawRetentionDays: 30,
      autoApply: true,
      digest: "off",
    });
    const res = await send("PATCH", "/api/settings", {
      ghostThresholdDays: 7,
      timezone: "America/Chicago",
    });
    expect(res.body.settings).toMatchObject({ ghostThresholdDays: 7, timezone: "America/Chicago" });
    expect((await send("PATCH", "/api/settings", { timezone: "Mars/Base" })).status).toBe(400);
    expect((await send("PATCH", "/api/settings", { rawRetentionDays: 90 })).status).toBe(400);
    expect((await send("PATCH", "/api/settings", { unknown: true })).status).toBe(400);
  });

  it("applies the ghost threshold to derived state", async () => {
    const app = await create({ company: "Acme", position: "Engineer", appliedAt: daysAgo(10) });
    expect(app.isStale).toBe(false);
    await send("PATCH", "/api/settings", { ghostThresholdDays: 7 });
    expect((await send("GET", `/api/applications/${app.id}`)).body.application.isStale).toBe(true);
  });
});

describe("insights", () => {
  it("computes stats and the Sankey from the user's applications", async () => {
    const a = await create({ company: "Acme", position: "Engineer", appliedAt: daysAgo(30) });
    await send("POST", `/api/applications/${a.id}/events`, {
      type: "advanced",
      stage: "screen",
      occurredAt: daysAgo(25),
    });
    await send("POST", `/api/applications/${a.id}/events`, {
      type: "closed",
      outcome: "rejected",
      occurredAt: daysAgo(20),
    });
    await create({ company: "Globex", position: "Analyst", appliedAt: daysAgo(3) });

    const stats = (await send("GET", "/api/stats")).body.stats;
    expect(stats).toMatchObject({ applications: 2, responded: 1, responseRate: 0.5 });

    const { sankeymatic } = (await send("GET", "/api/sankey")).body.sankey;
    expect(sankeymatic).toBe(
      ["Applied [1] Screen", "Applied [1] Awaiting reply", "Screen [1] Rejected"].join("\n"),
    );

    const ranged = (await send("GET", `/api/stats?since=${encodeURIComponent(daysAgo(7))}`)).body
      .stats;
    expect(ranged.applications).toBe(1);
  });
});

describe("updates since last visit", () => {
  /** Simulates the email pipeline (M3–M4) recording a step on an application. */
  const emailStep = async (applicationId: string, stage: "screen" | "interview") => {
    const db = getDb(env);
    const [app] = await db.select().from(application).where(eq(application.id, applicationId));
    await db.insert(event).values({
      id: `email-${stage}-${applicationId}`,
      applicationId,
      userId: app?.userId as string,
      type: "advanced",
      stage,
      occurredAt: daysAgo(1),
      recordedAt: new Date().toISOString(),
      origin: "email",
      certainty: "high",
    });
  };

  type ListBody = {
    counts: Record<string, number>;
    applications: (Detail & {
      updates: number;
      track: { type: string; stage: string | null; unseen: boolean }[];
    })[];
  };
  const list = async (qs = "") => (await send("GET", `/api/applications${qs}`)).body as ListBody;

  it("flags email steps until the application is opened", async () => {
    const a = await create({ company: "Acme", position: "Engineer", appliedAt: daysAgo(10) });
    await create({ company: "Globex", position: "Analyst", appliedAt: daysAgo(5) });
    await emailStep(a.id, "screen");

    let body = await list();
    expect(body.counts).toEqual({ all: 2, open: 2, updates: 1, ghosted: 0, closed: 0 });
    const row = body.applications.find((r) => r.id === a.id);
    expect(row?.updates).toBe(1);
    expect(row?.track.map((t) => [t.type, t.stage, t.unseen])).toEqual([
      ["applied", null, false],
      ["advanced", "screen", true],
    ]);
    expect((await list("?status=updates")).applications.map((r) => r.id)).toEqual([a.id]);

    const detail = (await send("GET", `/api/applications/${a.id}`)).body.application;
    expect(detail.events.find((e: { stage?: string }) => e.stage === "screen").unseen).toBe(true);

    expect((await send("POST", `/api/applications/${a.id}/seen`)).status).toBe(204);
    body = await list();
    expect(body.counts.updates).toBe(0);
    expect(body.applications.find((r) => r.id === a.id)?.updates).toBe(0);
  });

  it("never counts steps the user recorded by hand", async () => {
    const a = await create({ company: "Acme", position: "Engineer" });
    await send("POST", `/api/applications/${a.id}/events`, { type: "advanced", stage: "screen" });
    expect((await list()).counts.updates).toBe(0);
  });

  it("marks everything seen at once", async () => {
    const a = await create({ company: "Acme", position: "Engineer", appliedAt: daysAgo(9) });
    const b = await create({ company: "Globex", position: "Analyst", appliedAt: daysAgo(9) });
    await emailStep(a.id, "screen");
    await emailStep(b.id, "interview");
    expect((await list()).counts.updates).toBe(2);
    expect((await send("POST", "/api/applications/seen")).status).toBe(204);
    expect((await list()).counts.updates).toBe(0);
  });

  it("scopes seen to the signed-in user", async () => {
    const a = await create({ company: "Acme", position: "Engineer" });
    const mallory = await signIn("mallory@example.test");
    expect((await send("POST", `/api/applications/${a.id}/seen`, undefined, mallory)).status).toBe(
      404,
    );
  });
});
