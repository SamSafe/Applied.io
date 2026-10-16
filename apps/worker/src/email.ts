import { decodeHeader, domainOf, parseAddress, toIso } from "@apptracker/mail";
import { getDb } from "./db/client";
import { newId } from "./ids";
import type { MailQueueMessage } from "./queue";
import { insertReceivedMessage } from "./repo/messages";
import { getSettings } from "./repo/settings";
import { findActiveForwardingSource } from "./repo/system";

/** We cap well below Email Routing's 25 MiB; job emails are small and big ones are noise. */
export const MAX_RAW_BYTES = 5 * 1024 * 1024;

const DAY_MS = 86_400_000;

/**
 * Step 1 of the pipeline (docs/EMAIL_PIPELINE.md): store, record, enqueue. Keep this cheap;
 * parsing and classification happen in the queue consumer.
 */
export async function handleEmail(msg: ForwardableEmailMessage, env: Env): Promise<void> {
  const db = getDb(env);
  const token = (msg.to.split("@")[0] ?? "").toLowerCase();
  const source = await findActiveForwardingSource(db, token);
  if (!source) return msg.setReject("Unknown recipient");
  if (msg.rawSize > MAX_RAW_BYTES) return msg.setReject("Message too large");

  const id = newId();
  const now = new Date();
  const rawKey = `${source.userId}/${id}.eml`;
  await env.RAW_MAIL.put(rawKey, await new Response(msg.raw).arrayBuffer(), {
    httpMetadata: { contentType: "message/rfc822" },
  });

  const from = parseAddress(msg.headers.get("from"));
  const { rawRetentionDays: retentionDays } = await getSettings(db, source.userId);
  const isNew = await insertReceivedMessage(db, {
    id,
    userId: source.userId,
    sourceId: source.id,
    receivedAt: now.toISOString(),
    rawKey,
    headerMessageId: msg.headers.get("message-id"),
    fromAddress: from?.address ?? null,
    fromDomain: from ? domainOf(from.address) : null,
    subject: decodeHeader(msg.headers.get("subject")),
    sentAt: toIso(msg.headers.get("date")),
    status: "received",
    purgeAfter: new Date(now.getTime() + retentionDays * DAY_MS).toISOString(),
  });

  if (!isNew) {
    // Same Message-ID seen before (e.g. a provider re-forward). Drop the duplicate copy.
    await env.RAW_MAIL.delete(rawKey);
    return;
  }
  await env.MAIL_QUEUE.send({ messageId: id } satisfies MailQueueMessage);
}
