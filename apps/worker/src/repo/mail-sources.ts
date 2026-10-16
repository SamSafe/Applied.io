import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { mailSource } from "../db/schema";
import { newAddressToken, newId } from "../ids";

export type MailSource = typeof mailSource.$inferSelect;

export async function listMailSources(db: Db, userId: string): Promise<MailSource[]> {
  return db
    .select()
    .from(mailSource)
    .where(eq(mailSource.userId, userId))
    .orderBy(mailSource.createdAt);
}

/** Issues a new forwarding address. Users may hold several (e.g. one per mailbox). */
export async function createForwardingSource(
  db: Db,
  userId: string,
  now: Date,
): Promise<MailSource> {
  const row: MailSource = {
    id: newId(),
    userId,
    kind: "forwarding",
    addressToken: newAddressToken(),
    status: "awaiting_first_mail",
    providerHint: null,
    verifiedMailbox: null,
    credentials: null,
    lastMessageAt: null,
    createdAt: now.toISOString(),
  };
  await db.insert(mailSource).values(row);
  return row;
}

/** Replaces a forwarding address's token. Mail sent to the old address is rejected from now on. */
export async function rotateForwardingSource(
  db: Db,
  userId: string,
  sourceId: string,
): Promise<MailSource | null> {
  const [row] = await db
    .update(mailSource)
    .set({ addressToken: newAddressToken() })
    .where(
      and(
        eq(mailSource.id, sourceId),
        eq(mailSource.userId, userId),
        eq(mailSource.kind, "forwarding"),
      ),
    )
    .returning();
  return row ?? null;
}
