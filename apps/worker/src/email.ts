import { decodeHeader, domainOf, parseAddress, toIso } from "@apptracker/mail";
import { getDb } from "./db/client";
import { ingest, MAX_RAW_BYTES } from "./ingest";
import { findActiveForwardingSource } from "./repo/system";

export { MAX_RAW_BYTES };

/**
 * Inbound email (Email Routing catch-all). Keep this cheap: reject what isn't ours, then hand
 * off to the queue, where parsing and classification happen.
 */
export async function handleEmail(msg: ForwardableEmailMessage, env: Env): Promise<void> {
  const db = getDb(env);
  const token = (msg.to.split("@")[0] ?? "").toLowerCase();
  const source = await findActiveForwardingSource(db, token);
  if (!source) return msg.setReject("Unknown recipient");
  if (msg.rawSize > MAX_RAW_BYTES) return msg.setReject("Message too large");

  const from = parseAddress(msg.headers.get("from"));
  await ingest(env, db, {
    userId: source.userId,
    sourceId: source.id,
    raw: await new Response(msg.raw).arrayBuffer(),
    headerMessageId: msg.headers.get("message-id"),
    fromAddress: from?.address ?? null,
    fromDomain: from ? domainOf(from.address) : null,
    subject: decodeHeader(msg.headers.get("subject")),
    sentAt: toIso(msg.headers.get("date")),
  });
}
