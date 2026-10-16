import { and, count, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client";
import { mailSource, message } from "../db/schema";
import { newId } from "../ids";

export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;
export type MessagePatch = Partial<Omit<Message, "id" | "userId" | "sourceId" | "receivedAt">>;

/**
 * Records a newly received email and marks its source as active, in one batch.
 * Returns false when the same `Message-ID` was already received for this user.
 */
export async function insertReceivedMessage(
  db: Db,
  row: NewMessage & { userId: string },
): Promise<boolean> {
  const [inserted] = await db.batch([
    db.insert(message).values(row).onConflictDoNothing().returning({ id: message.id }),
    db
      .update(mailSource)
      .set({ status: "active", lastMessageAt: row.receivedAt })
      .where(and(eq(mailSource.id, row.sourceId), eq(mailSource.userId, row.userId))),
  ]);
  return inserted.length > 0;
}

export async function updateMessage(
  db: Db,
  userId: string,
  id: string,
  patch: MessagePatch,
): Promise<void> {
  await db
    .update(message)
    .set(patch)
    .where(and(eq(message.id, id), eq(message.userId, userId)));
}

export async function listRecentMessages(
  db: Db,
  userId: string,
  options: { status?: Message["status"]; limit?: number } = {},
): Promise<Message[]> {
  return db
    .select()
    .from(message)
    .where(
      options.status
        ? and(eq(message.userId, userId), eq(message.status, options.status))
        : eq(message.userId, userId),
    )
    .orderBy(desc(message.receivedAt))
    .limit(options.limit ?? 50);
}

/** How many of the user's emails were sent to the classifier since `since` (cost guard). */
export async function countClassifiedSince(db: Db, userId: string, since: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(message)
    .where(
      and(
        eq(message.userId, userId),
        isNotNull(message.classifierVersion),
        gte(message.receivedAt, since.toISOString()),
      ),
    );
  return row?.n ?? 0;
}

/** The latest Gmail forwarding confirmation received at a source, if any. */
export async function latestConfirmation(db: Db, userId: string, sourceId: string) {
  const rows = await db
    .select({ receivedAt: message.receivedAt, classification: message.classification })
    .from(message)
    .where(
      and(
        eq(message.userId, userId),
        eq(message.sourceId, sourceId),
        eq(message.status, "ignored"),
      ),
    )
    .orderBy(desc(message.receivedAt))
    .limit(20);
  for (const row of rows) {
    const c = row.classification as { type?: string; code?: string; mailbox?: string } | null;
    if (c?.type === "gmail_forwarding_confirmation" && c.code && c.mailbox) {
      return { code: c.code, mailbox: c.mailbox, receivedAt: row.receivedAt };
    }
  }
  return null;
}

/** The user's source for uploaded .eml files, created on first use. */
export async function uploadSource(db: Db, userId: string, now: Date): Promise<string> {
  const [existing] = await db
    .select({ id: mailSource.id })
    .from(mailSource)
    .where(and(eq(mailSource.userId, userId), eq(mailSource.kind, "upload")))
    .limit(1);
  if (existing) return existing.id;
  const id = newId();
  await db.insert(mailSource).values({
    id,
    userId,
    kind: "upload",
    status: "active",
    createdAt: now.toISOString(),
  });
  return id;
}
