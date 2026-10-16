/**
 * System-path queries: inbound email, queue processing and the retention job, where no
 * session exists.
 * These are the only repository functions that don't take a `userId` argument. Each one
 * resolves the owning user from an unguessable key (address token, internal message id),
 * and callers scope everything after that to the returned `userId`.
 */
import { and, eq, inArray, isNotNull, lt } from "drizzle-orm";
import type { Db } from "../db/client";
import { mailSource, message } from "../db/schema";

export async function findActiveForwardingSource(db: Db, addressToken: string) {
  const [row] = await db
    .select({ id: mailSource.id, userId: mailSource.userId, status: mailSource.status })
    .from(mailSource)
    .where(and(eq(mailSource.addressToken, addressToken), eq(mailSource.kind, "forwarding")))
    .limit(1);
  return row && row.status !== "revoked" ? row : null;
}

export async function getMessageForProcessing(db: Db, messageId: string) {
  const [row] = await db.select().from(message).where(eq(message.id, messageId)).limit(1);
  if (!row) return null;
  const [source] = await db
    .select({
      kind: mailSource.kind,
      verifiedMailbox: mailSource.verifiedMailbox,
      providerHint: mailSource.providerHint,
    })
    .from(mailSource)
    .where(and(eq(mailSource.id, row.sourceId), eq(mailSource.userId, row.userId)))
    .limit(1);
  return source ? { message: row, source } : null;
}

/** Messages whose raw MIME is past its purge date (retention job, all users). */
export async function purgeCandidates(db: Db, now: Date, limit: number) {
  const rows = await db
    .select({ id: message.id, rawKey: message.rawKey })
    .from(message)
    .where(and(isNotNull(message.rawKey), lt(message.purgeAfter, now.toISOString())))
    .limit(limit);
  return rows as { id: string; rawKey: string }[];
}

export async function removeRawKeys(db: Db, ids: string[]): Promise<void> {
  if (ids.length > 0)
    await db.update(message).set({ rawKey: null }).where(inArray(message.id, ids));
}

/** Drops filtered-out messages (headers only by now) received before `before`. */
export async function deleteFilteredBefore(db: Db, before: Date): Promise<number> {
  const rows = await db
    .delete(message)
    .where(and(eq(message.status, "filtered_out"), lt(message.receivedAt, before.toISOString())))
    .returning({ id: message.id });
  return rows.length;
}
