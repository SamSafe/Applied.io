/**
 * System-path queries: inbound email and queue processing, where no session exists yet.
 * These are the only repository functions that don't take a `userId` argument. Each one
 * resolves the owning user from an unguessable key (address token, internal message id),
 * and callers scope everything after that to the returned `userId`.
 */
import { and, eq } from "drizzle-orm";
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
  return row ?? null;
}
