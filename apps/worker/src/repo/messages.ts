import { and, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { mailSource, message } from "../db/schema";

export type Message = typeof message.$inferSelect;
export type NewMessage = typeof message.$inferInsert;

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

export async function listRecentMessages(db: Db, userId: string, limit = 50): Promise<Message[]> {
  return db
    .select()
    .from(message)
    .where(eq(message.userId, userId))
    .orderBy(desc(message.receivedAt))
    .limit(limit);
}
