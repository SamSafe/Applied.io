import type { Db } from "./db/client";
import { newId } from "./ids";
import type { MailQueueMessage } from "./queue";
import { insertReceivedMessage } from "./repo/messages";
import { getSettings } from "./repo/settings";

/** We cap well below Email Routing's 25 MiB; job emails are small and big ones are noise. */
export const MAX_RAW_BYTES = 5 * 1024 * 1024;

const DAY_MS = 86_400_000;

export interface IngestInput {
  userId: string;
  sourceId: string;
  raw: ArrayBuffer;
  headerMessageId: string | null;
  fromAddress: string | null;
  fromDomain: string | null;
  subject: string | null;
  sentAt: string | null;
}

/**
 * Step 1 of the pipeline, shared by inbound email and uploads: store the raw MIME, record the
 * message, enqueue it. A second copy of the same Message-ID is dropped.
 */
export async function ingest(
  env: Env,
  db: Db,
  input: IngestInput,
): Promise<"queued" | "duplicate"> {
  const id = newId();
  const now = new Date();
  const rawKey = `${input.userId}/${id}.eml`;
  await env.RAW_MAIL.put(rawKey, input.raw, { httpMetadata: { contentType: "message/rfc822" } });

  const { rawRetentionDays } = await getSettings(db, input.userId);
  const isNew = await insertReceivedMessage(db, {
    id,
    userId: input.userId,
    sourceId: input.sourceId,
    receivedAt: now.toISOString(),
    rawKey,
    headerMessageId: input.headerMessageId,
    fromAddress: input.fromAddress,
    fromDomain: input.fromDomain,
    subject: input.subject,
    sentAt: input.sentAt,
    status: "received",
    purgeAfter: new Date(now.getTime() + rawRetentionDays * DAY_MS).toISOString(),
  });

  if (!isNew) {
    await env.RAW_MAIL.delete(rawKey);
    return "duplicate";
  }
  await env.MAIL_QUEUE.send({ messageId: id } satisfies MailQueueMessage);
  return "queued";
}
