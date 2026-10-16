import {
  type Derived,
  derive,
  OUTCOMES,
  STAGES,
  type Stage,
  toMs,
  unseenEvents,
} from "@apptracker/core";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/client";
import { message } from "../db/schema";
import { type AppEnv, notFound, parseBody, requireUser } from "../http";
import {
  appendEvent,
  createApplication,
  deleteApplication,
  findEventApplication,
  getApplication,
  listApplications,
  markSeen,
  type StoredApplication,
  updateFacts,
} from "../repo/applications";
import { getSettings } from "../repo/settings";

const DAY_MS = 86_400_000;

/** A date-time with offset, or a plain date (stored as noon UTC so it never shifts a day). */
const When = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()])
  .transform((v) => (v.length === 10 ? `${v}T12:00:00.000Z` : new Date(v).toISOString()));

const required = (max: number) => z.string().trim().min(1).max(max);
/** Optional text: empty clears it (null); omitted leaves it unchanged (undefined). */
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v === undefined ? undefined : v || null));
const optionalUrl = optional(2000).refine(
  (v) => v == null || /^https?:\/\//i.test(v),
  "Must be an http(s) URL",
);

const Facts = z.object({
  company: required(200),
  position: required(200),
  reqNumber: optional(100),
  location: optional(200),
  url: optionalUrl,
  source: optional(100),
  notes: optional(5000),
});
const CreateBody = Facts.extend({ appliedAt: When.optional() });
const PatchBody = Facts.partial();

const EventBody = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("advanced"),
    stage: z.enum(["screen", "interview", "final", "offer"]),
    occurredAt: When.optional(),
    note: optional(2000),
  }),
  z.object({
    type: z.literal("closed"),
    outcome: z.enum(OUTCOMES),
    occurredAt: When.optional(),
    note: optional(2000),
  }),
  z.object({ type: z.literal("noted"), occurredAt: When.optional(), note: required(2000) }),
]);

const ListQuery = z.object({
  status: z.enum(["open", "updates", "ghosted", "closed"]).optional(),
  stage: z.enum(STAGES).optional(),
  q: z.string().trim().max(200).optional(),
});

/** Rejects dates more than a day ahead (clock skew allowance). */
const inFuture = (iso: string, now: Date) => toMs(iso) > now.getTime() + DAY_MS;

export const applications = new Hono<AppEnv>().use(requireUser);

applications.get("/", async (c) => {
  const query = ListQuery.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "invalid_query", issues: query.error.issues }, 400);
  const { status, stage, q } = query.data;

  const db = getDb(c.env);
  const userId = c.get("userId");
  const [apps, settings] = await Promise.all([
    listApplications(db, userId),
    getSettings(db, userId),
  ]);
  const now = new Date();
  const needle = q?.toLowerCase();

  const all = apps.map((app) => ({ app, derived: derive(app, now, settings) }));
  const hasUpdates = ({ app }: (typeof all)[number]) =>
    unseenEvents(app.events, app.seenAt).length > 0;
  const counts = {
    all: all.length,
    open: all.filter((r) => r.derived.status.state === "open").length,
    updates: all.filter(hasUpdates).length,
    ghosted: all.filter((r) => r.derived.isStale).length,
    closed: all.filter((r) => r.derived.status.state === "closed").length,
  };

  const rows = all
    .filter((row) => {
      const { app, derived } = row;
      if (status === "open" && derived.status.state !== "open") return false;
      if (status === "updates" && !hasUpdates(row)) return false;
      if (status === "ghosted" && !derived.isStale) return false;
      if (status === "closed" && derived.status.state !== "closed") return false;
      if (stage && derived.maxStage !== stage) return false;
      if (needle && !`${app.company} ${app.position}`.toLowerCase().includes(needle)) return false;
      return true;
    })
    .sort((a, b) => toMs(b.derived.lastActivityAt) - toMs(a.derived.lastActivityAt));

  return c.json({ counts, applications: rows.map(({ app, derived }) => summary(app, derived)) });
});

/** Marks every application as seen (the "Mark all seen" action). */
applications.post("/seen", async (c) => {
  await markSeen(getDb(c.env), c.get("userId"), null, new Date());
  return c.body(null, 204);
});

applications.post("/", async (c) => {
  const body = await parseBody(c, CreateBody);
  if (!body.ok) return body.response;
  const now = new Date();
  const appliedAt = body.data.appliedAt ?? now.toISOString();
  if (inFuture(appliedAt, now)) return c.json({ error: "future_date" }, 422);

  const db = getDb(c.env);
  const { id } = await createApplication(db, c.get("userId"), { ...body.data, appliedAt }, now);
  return c.json({ application: await loadDetail(c.env, c.get("userId"), id) }, 201);
});

applications.get("/:id", async (c) => {
  const detail = await loadDetail(c.env, c.get("userId"), c.req.param("id"));
  return detail ? c.json({ application: detail }) : notFound(c);
});

applications.post("/:id/seen", async (c) => {
  const found = await markSeen(getDb(c.env), c.get("userId"), c.req.param("id"), new Date());
  return found ? c.body(null, 204) : notFound(c);
});

applications.patch("/:id", async (c) => {
  const body = await parseBody(c, PatchBody);
  if (!body.ok) return body.response;
  const updated = await updateFacts(getDb(c.env), c.get("userId"), c.req.param("id"), body.data);
  if (!updated) return notFound(c);
  return c.json({ application: await loadDetail(c.env, c.get("userId"), c.req.param("id")) });
});

applications.delete("/:id", async (c) => {
  const deleted = await deleteApplication(getDb(c.env), c.get("userId"), c.req.param("id"));
  return deleted ? c.body(null, 204) : notFound(c);
});

applications.post("/:id/events", async (c) => {
  const body = await parseBody(c, EventBody);
  if (!body.ok) return body.response;
  const now = new Date();
  const { occurredAt = now.toISOString(), ...rest } = body.data;
  if (inFuture(occurredAt, now)) return c.json({ error: "future_date" }, 422);

  const result = await appendEvent(
    getDb(c.env),
    c.get("userId"),
    c.req.param("id"),
    { ...rest, occurredAt, origin: "manual" },
    now,
  );
  if (result.kind === "not_found") return notFound(c);
  if (result.kind === "invalid") {
    return c.json({ error: result.violation.code, message: result.violation.message }, 422);
  }
  return c.json({ application: await loadDetail(c.env, c.get("userId"), c.req.param("id")) }, 201);
});

/** Undo: `POST /events/:id/void` appends a `voided` event. */
export const events = new Hono<AppEnv>().use(requireUser);

events.post("/:id/void", async (c) => {
  const db = getDb(c.env);
  const userId = c.get("userId");
  const eventId = c.req.param("id");
  const applicationId = await findEventApplication(db, userId, eventId);
  if (!applicationId) return notFound(c);

  const now = new Date();
  const result = await appendEvent(
    db,
    userId,
    applicationId,
    { type: "voided", voidsEventId: eventId, occurredAt: now.toISOString(), origin: "manual" },
    now,
  );
  if (result.kind === "not_found") return notFound(c);
  if (result.kind === "invalid") {
    return c.json({ error: result.violation.code, message: result.violation.message }, 422);
  }
  return c.json({ application: await loadDetail(c.env, userId, applicationId) }, 201);
});

async function loadDetail(env: Env, userId: string, id: string) {
  const db = getDb(env);
  const [app, settings, emails] = await Promise.all([
    getApplication(db, userId, id),
    getSettings(db, userId),
    db
      .select({
        id: message.id,
        eventId: message.eventId,
        subject: message.subject,
        from: message.fromAddress,
        sentAt: message.sentAt,
        evidence: message.evidence,
      })
      .from(message)
      .where(and(eq(message.userId, userId), eq(message.applicationId, id))),
  ]);
  if (!app) return null;
  const derived = derive(app, new Date(), settings);
  // The email behind each step, plus any later emails attached to it as evidence.
  const emailsFor = (e: { id: string; messageId?: string | null }) =>
    emails
      .filter((m) => m.id === e.messageId || m.eventId === e.id)
      .map(({ subject, from, sentAt, evidence }) => ({ subject, from, sentAt, evidence }));
  const voided = new Set(app.events.flatMap((e) => (e.type === "voided" ? [e.voidsEventId] : [])));
  const unseen = new Set(unseenEvents(app.events, app.seenAt).map((e) => e.id));
  return {
    ...summary(app, derived),
    reqNumber: app.reqNumber,
    companyDomain: app.companyDomain,
    notes: app.notes,
    createdVia: app.createdVia,
    createdAt: app.createdAt,
    firstResponseAt: derived.firstResponseAt,
    events: [...app.events]
      .sort(
        (a, b) =>
          toMs(a.occurredAt) - toMs(b.occurredAt) || toMs(a.recordedAt) - toMs(b.recordedAt),
      )
      .map((e) => ({
        ...e,
        voided: voided.has(e.id),
        unseen: unseen.has(e.id),
        emails: emailsFor(e),
      })),
  };
}

function summary(app: StoredApplication, derived: Derived) {
  const unseen = new Set(unseenEvents(app.events, app.seenAt).map((e) => e.id));
  return {
    id: app.id,
    company: app.company,
    position: app.position,
    location: app.location,
    url: app.url,
    source: app.source,
    appliedAt: derived.appliedAt,
    maxStage: derived.maxStage satisfies Stage,
    status: derived.status,
    lastActivityAt: derived.lastActivityAt,
    isStale: derived.isStale,
    updates: unseen.size,
    /** The steps the tracking bar draws: live events except notes, in time order. */
    track: derived.live.flatMap((e) =>
      e.type === "noted"
        ? []
        : [
            {
              id: e.id,
              at: e.occurredAt,
              type: e.type,
              stage: e.type === "advanced" ? e.stage : null,
              outcome: e.type === "closed" ? e.outcome : null,
              unseen: unseen.has(e.id),
            },
          ],
    ),
  };
}
