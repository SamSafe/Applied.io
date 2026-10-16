import {
  type AppEvent,
  type Application,
  normalizeCompany,
  normalizeTitle,
  type ProposedEvent,
  type Validation,
  validate,
} from "@apptracker/core";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { application, event } from "../db/schema";
import { newId } from "../ids";

type ApplicationRow = typeof application.$inferSelect;
type EventRow = typeof event.$inferSelect;

/** An application's stored facts plus its full event log, in core's shape. */
export type StoredApplication = Application & Omit<ApplicationRow, "userId">;

export interface NewApplication {
  company: string;
  position: string;
  appliedAt: string;
  reqNumber?: string | null;
  location?: string | null;
  url?: string | null;
  source?: string | null;
  notes?: string | null;
}

export type FactsPatch = Partial<Omit<NewApplication, "appliedAt">>;

export async function listApplications(db: Db, userId: string): Promise<StoredApplication[]> {
  const [apps, events] = await Promise.all([
    db.select().from(application).where(eq(application.userId, userId)),
    db.select().from(event).where(eq(event.userId, userId)),
  ]);
  return assemble(apps, events);
}

export async function getApplication(
  db: Db,
  userId: string,
  id: string,
): Promise<StoredApplication | null> {
  const [app] = await db
    .select()
    .from(application)
    .where(and(eq(application.id, id), eq(application.userId, userId)))
    .limit(1);
  if (!app) return null;
  const events = await db
    .select()
    .from(event)
    .where(and(eq(event.applicationId, id), eq(event.userId, userId)));
  return assemble([app], events)[0] ?? null;
}

/** Creates an application and its `applied` event atomically. */
export async function createApplication(
  db: Db,
  userId: string,
  input: NewApplication,
  now: Date,
): Promise<string> {
  const id = newId();
  await db.batch([
    db.insert(application).values({
      id,
      userId,
      company: input.company,
      companyKey: normalizeCompany(input.company),
      position: input.position,
      positionKey: normalizeTitle(input.position),
      reqNumber: input.reqNumber ?? null,
      location: input.location ?? null,
      url: input.url ?? null,
      source: input.source ?? null,
      notes: input.notes ?? null,
      createdVia: "manual",
      createdAt: now.toISOString(),
    }),
    db.insert(event).values({
      id: newId(),
      applicationId: id,
      userId,
      type: "applied",
      occurredAt: input.appliedAt,
      recordedAt: now.toISOString(),
      origin: "manual",
    }),
  ]);
  return id;
}

export async function updateFacts(
  db: Db,
  userId: string,
  id: string,
  patch: FactsPatch,
): Promise<boolean> {
  const set: Partial<ApplicationRow> = { ...patch };
  if (patch.company !== undefined) set.companyKey = normalizeCompany(patch.company);
  if (patch.position !== undefined) set.positionKey = normalizeTitle(patch.position);
  if (Object.keys(set).length === 0) return (await getApplication(db, userId, id)) !== null;
  const rows = await db
    .update(application)
    .set(set)
    .where(and(eq(application.id, id), eq(application.userId, userId)))
    .returning({ id: application.id });
  return rows.length > 0;
}

/** Marks one application, or every application when `id` is null, as seen at `now`. */
export async function markSeen(
  db: Db,
  userId: string,
  id: string | null,
  now: Date,
): Promise<boolean> {
  const where =
    id === null
      ? eq(application.userId, userId)
      : and(eq(application.id, id), eq(application.userId, userId));
  const rows = await db
    .update(application)
    .set({ seenAt: now.toISOString() })
    .where(where)
    .returning({ id: application.id });
  return id === null || rows.length > 0;
}

export async function deleteApplication(db: Db, userId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(application)
    .where(and(eq(application.id, id), eq(application.userId, userId)))
    .returning({ id: application.id });
  return rows.length > 0;
}

export type AppendResult =
  | { kind: "not_found" }
  | { kind: "invalid"; violation: Extract<Validation, { ok: false }> }
  | { kind: "ok"; eventId: string };

/** Validates `proposed` against the application's log with core's rules, then appends it. */
export async function appendEvent(
  db: Db,
  userId: string,
  applicationId: string,
  proposed: ProposedEvent,
  now: Date,
): Promise<AppendResult> {
  const app = await getApplication(db, userId, applicationId);
  if (!app) return { kind: "not_found" };
  const check = validate(app.events, proposed);
  if (!check.ok) return { kind: "invalid", violation: check };

  const eventId = newId();
  await db.insert(event).values({
    id: eventId,
    applicationId,
    userId,
    type: proposed.type,
    stage: proposed.type === "advanced" ? proposed.stage : null,
    outcome: proposed.type === "closed" ? proposed.outcome : null,
    voidsEventId: proposed.type === "voided" ? proposed.voidsEventId : null,
    occurredAt: proposed.occurredAt,
    recordedAt: now.toISOString(),
    origin: proposed.origin,
    messageId: proposed.messageId ?? null,
    certainty: proposed.certainty ?? null,
    note: proposed.note ?? null,
  });
  return { kind: "ok", eventId };
}

/** Finds which of the user's applications owns an event. */
export async function findEventApplication(
  db: Db,
  userId: string,
  eventId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ applicationId: event.applicationId })
    .from(event)
    .where(and(eq(event.id, eventId), eq(event.userId, userId)))
    .limit(1);
  return row?.applicationId ?? null;
}

function assemble(apps: ApplicationRow[], events: EventRow[]): StoredApplication[] {
  const byApp = new Map<string, AppEvent[]>();
  for (const row of events) {
    const list = byApp.get(row.applicationId) ?? [];
    list.push(toAppEvent(row));
    byApp.set(row.applicationId, list);
  }
  return apps.map(({ userId: _userId, ...facts }) => ({
    ...facts,
    events: byApp.get(facts.id) ?? [],
  }));
}

function toAppEvent(row: EventRow): AppEvent {
  const base = {
    id: row.id,
    occurredAt: row.occurredAt,
    recordedAt: row.recordedAt,
    origin: row.origin,
    messageId: row.messageId,
    certainty: row.certainty,
    note: row.note,
  };
  switch (row.type) {
    case "applied":
      return { ...base, type: "applied" };
    case "noted":
      return { ...base, type: "noted" };
    case "advanced":
      return { ...base, type: "advanced", stage: row.stage as NonNullable<EventRow["stage"]> };
    case "closed":
      return { ...base, type: "closed", outcome: row.outcome as NonNullable<EventRow["outcome"]> };
    case "voided":
      return { ...base, type: "voided", voidsEventId: row.voidsEventId as string };
  }
}
