import { env } from "cloudflare:workers";
import type { ClassifyResult } from "@apptracker/mail";
import { desc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import lever from "../../../packages/mail/fixtures/public/lever-received.eml?raw";
import rejection from "../../../packages/mail/fixtures/public/rejection-greenhouse.eml?raw";
import { getDb } from "../src/db/client";
import { application, event, mailSource, message } from "../src/db/schema";
import { ingest } from "../src/ingest";
import { type Classify, processMessage } from "../src/queue";
import { call, signIn } from "./helpers";

/** Steps 6–8 of the pipeline (M4): match, decide, act; plus the review queue. */

const db = () => getDb(env);
let cookie: string;
let userId: string;
let sourceId: string;
let n = 0;

const classification = (over: Partial<ClassifyResult["classification"]>): ClassifyResult => ({
  classification: {
    jobRelated: true,
    category: "application_received",
    interviewKind: null,
    company: "Kestrel Robotics",
    position: "Software Engineer II, Autonomy",
    reqNumber: null,
    location: null,
    certainty: "high",
    evidence: "quoted evidence",
    ...over,
  },
  model: "claude-haiku-5-5",
  version: "test",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
});

/** Delivers an email (made unique) and runs the pipeline with a fake classification. */
async function receive(raw: string, over: Partial<ClassifyResult["classification"]>) {
  n++;
  // Unique Message-ID, and dated now so tests don't depend on the fixtures' own dates.
  const unique = raw
    .replace(/^Message-ID: <([^>]+)>/m, `Message-ID: <$1-${n}>`)
    .replace(/^Date: .*$/m, `Date: ${new Date().toUTCString()}`);
  await ingest(env, db(), {
    userId,
    sourceId,
    raw: new TextEncoder().encode(unique).buffer as ArrayBuffer,
    headerMessageId: `test-${n}`,
    fromAddress: null,
    fromDomain: null,
    subject: null,
    sentAt: null,
  });
  const [row] = await db().select().from(message).orderBy(desc(message.id)).limit(1);
  await processMessage(
    env,
    row?.id as string,
    vi.fn<Classify>().mockResolvedValue(classification(over)),
  );
  return (
    await db()
      .select()
      .from(message)
      .where(eq(message.id, row?.id as string))
  )[0] as typeof message.$inferSelect;
}

const send = async (method: string, path: string, body?: unknown) => {
  const res = await call(path, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const verify = () =>
  db()
    .update(mailSource)
    .set({ verifiedMailbox: "jane.seeker@gmail.com" })
    .where(eq(mailSource.id, sourceId));

beforeEach(async () => {
  vi.spyOn(env.MAIL_QUEUE, "send").mockResolvedValue({} as QueueSendResponse);
  cookie = await signIn("jane@example.test");
  const created = await call("/api/mail-sources/forwarding", {
    method: "POST",
    headers: { cookie },
  });
  sourceId = ((await created.json()) as { source: { id: string } }).source.id;
  const [src] = await db().select().from(mailSource).where(eq(mailSource.id, sourceId));
  userId = src?.userId as string;
});

afterEach(() => vi.restoreAllMocks());

describe("automatic updates from verified, certain emails", () => {
  it("creates the application, then records the rejection on it, with evidence", async () => {
    await verify();
    const confirm = await receive(lever, {});
    expect(confirm.status).toBe("applied");
    const [app] = await db()
      .select()
      .from(application)
      .where(eq(application.id, confirm.applicationId as string));
    expect(app).toMatchObject({ company: "Kestrel Robotics", createdVia: "email", ats: "lever" });

    const rejected = await receive(rejection, { category: "rejection", position: null });
    expect(rejected).toMatchObject({ status: "applied", applicationId: app?.id });
    const [step] = await db()
      .select()
      .from(event)
      .where(eq(event.id, rejected.eventId as string));
    expect(step).toMatchObject({
      type: "closed",
      outcome: "rejected",
      origin: "email",
      messageId: rejected.id,
    });

    const detail = (await send("GET", `/api/applications/${app?.id}`)).body.application;
    expect(detail.status).toMatchObject({ state: "closed", outcome: "rejected" });
    const closing = detail.events.find((e: { type: string }) => e.type === "closed");
    expect(closing.emails).toEqual([
      expect.objectContaining({
        subject: "Update on your application to Kestrel Robotics",
        evidence: "quoted evidence",
      }),
    ]);
    // The update counts as news until the application is opened.
    expect((await send("GET", "/api/applications")).body.counts.updates).toBe(1);
  });

  it("attaches a repeat interview email to the step it repeats", async () => {
    await verify();
    const confirm = await receive(lever, {});
    const invite = await receive(lever, {
      category: "interview_invite",
      interviewKind: "interview",
    });
    const reminder = await receive(lever, {
      category: "interview_invite",
      interviewKind: "interview",
    });
    expect(reminder).toMatchObject({
      status: "applied",
      applicationId: confirm.applicationId,
      eventId: invite.eventId,
    });
    const steps = await db()
      .select()
      .from(event)
      .where(eq(event.applicationId, confirm.applicationId as string));
    expect(steps.filter((s) => s.type === "advanced")).toHaveLength(1);
  });

  it("ignores recruiter outreach", async () => {
    await verify();
    const m = await receive(lever, { category: "recruiter_outreach" });
    expect(m.status).toBe("ignored");
    expect(await db().select().from(application)).toEqual([]);
  });
});

describe("review queue", () => {
  it("holds unverified emails and creates the application on confirm", async () => {
    const m = await receive(lever, {});
    expect(m.status).toBe("needs_review");

    const list = (await send("GET", "/api/review")).body.items;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: m.id,
      category: "application_received",
      company: "Kestrel Robotics",
      suggestion: { kind: "create" },
      reasons: [expect.stringContaining("couldn't be verified")],
    });

    const res = await send("POST", `/api/review/${m.id}`, { action: "confirm" });
    expect(res.status).toBe(200);
    const [app] = await db().select().from(application);
    expect(app).toMatchObject({
      id: res.body.applicationId,
      company: "Kestrel Robotics",
      createdVia: "email",
    });
    expect((await send("GET", "/api/review")).body.items).toEqual([]);
    expect((await send("POST", `/api/review/${m.id}`, { action: "confirm" })).status).toBe(409);
  });

  it("asks which application when two match, and records the step on the chosen one", async () => {
    await verify();
    const a = await send("POST", "/api/applications", {
      company: "Kestrel Robotics",
      position: "Software Engineer, Payments",
    });
    const b = await send("POST", "/api/applications", {
      company: "Kestrel Robotics",
      position: "Software Engineer, Billing",
    });
    const m = await receive(rejection, { category: "rejection", position: "Software Engineer" });
    expect(m.status).toBe("needs_review");

    const item = (await send("GET", "/api/review")).body.items[0];
    expect(item.suggestion).toEqual({ kind: "pick" });
    expect(item.candidates.map((c: { applicationId: string }) => c.applicationId).sort()).toEqual(
      [a.body.application.id, b.body.application.id].sort(),
    );

    const res = await send("POST", `/api/review/${m.id}`, {
      action: "assign",
      applicationId: b.body.application.id,
    });
    expect(res.status).toBe(200);
    const detail = (await send("GET", `/api/applications/${b.body.application.id}`)).body
      .application;
    expect(detail.status).toMatchObject({ state: "closed", outcome: "rejected" });
    expect(
      (await send("GET", `/api/applications/${a.body.application.id}`)).body.application.status,
    ).toEqual({
      state: "open",
    });
  });

  it("creates the application with the user's details when the email lacked them", async () => {
    await verify();
    const m = await receive(lever, {
      category: "interview_invite",
      interviewKind: "recruiter_screen",
      company: null,
      position: null,
    });
    expect(m.status).toBe("needs_review");
    expect((await send("POST", `/api/review/${m.id}`, { action: "create" })).status).toBe(422);

    const res = await send("POST", `/api/review/${m.id}`, {
      action: "create",
      company: "Brightline Health",
      position: "Full-Stack Engineer",
    });
    expect(res.status).toBe(200);
    const detail = (await send("GET", `/api/applications/${res.body.applicationId}`)).body
      .application;
    expect(detail).toMatchObject({ company: "Brightline Health", maxStage: "screen" });
  });

  it("refuses to record a step on a closed application", async () => {
    await verify();
    const a = await send("POST", "/api/applications", {
      company: "Kestrel Robotics",
      position: "Software Engineer II, Autonomy",
    });
    await send("POST", `/api/applications/${a.body.application.id}/events`, {
      type: "closed",
      outcome: "withdrawn",
    });
    const m = await receive(rejection, { category: "rejection" });
    expect(m.status).toBe("needs_review");
    const res = await send("POST", `/api/review/${m.id}`, {
      action: "assign",
      applicationId: a.body.application.id,
    });
    expect(res).toMatchObject({ status: 422, body: { error: "application_closed" } });
  });

  it("ignores on request", async () => {
    const m = await receive(lever, {});
    expect((await send("POST", `/api/review/${m.id}`, { action: "ignore" })).status).toBe(200);
    expect((await db().select().from(message).where(eq(message.id, m.id)))[0]?.status).toBe(
      "ignored",
    );
  });

  it("keeps review items private to their owner", async () => {
    const m = await receive(lever, {});
    cookie = await signIn("mallory@example.test");
    expect((await send("GET", "/api/review")).body.items).toEqual([]);
    expect((await send("POST", `/api/review/${m.id}`, { action: "ignore" })).status).toBe(404);
  });
});

describe("review queue: repeats", () => {
  it("attaches a reviewed step the application already has instead of duplicating it", async () => {
    const a = await send("POST", "/api/applications", {
      company: "Kestrel Robotics",
      position: "Software Engineer II, Autonomy",
    });
    const id = a.body.application.id;
    // Unverified, so it waits in review; meanwhile the user records the interview by hand.
    const m = await receive(lever, { category: "interview_invite", interviewKind: "interview" });
    expect(m.status).toBe("needs_review");
    await send("POST", `/api/applications/${id}/events`, { type: "advanced", stage: "interview" });

    expect((await send("POST", `/api/review/${m.id}`, { action: "confirm" })).status).toBe(200);
    const steps = await db().select().from(event).where(eq(event.applicationId, id));
    expect(steps.filter((s) => s.type === "advanced")).toHaveLength(1);
    const [after] = await db().select().from(message).where(eq(message.id, m.id));
    expect(after?.eventId).toBe(steps.find((s) => s.type === "advanced")?.id);
  });
});

describe("review queue: provenance", () => {
  it("doesn't cite a rejection email on the inferred applied step, and isn't news afterwards", async () => {
    const m = await receive(rejection, { category: "rejection" }); // no application yet → review
    const res = await send("POST", `/api/review/${m.id}`, { action: "confirm" });
    expect(res.status).toBe(200);
    const steps = await db()
      .select()
      .from(event)
      .where(eq(event.applicationId, res.body.applicationId));
    expect(steps.find((s) => s.type === "applied")).toMatchObject({
      origin: "manual",
      messageId: null,
    });
    expect(steps.find((s) => s.type === "closed")).toMatchObject({
      origin: "email",
      messageId: m.id,
    });
    expect((await send("GET", "/api/applications")).body.counts.updates).toBe(0);
  });
});
