import { headerReport, parseEmail } from "@apptracker/mail";
import { getDb } from "./db/client";
import { getMessageForProcessing } from "./repo/system";

export interface MailQueueMessage {
  messageId: string;
}

export async function handleQueue(batch: MessageBatch<MailQueueMessage>, env: Env): Promise<void> {
  for (const item of batch.messages) {
    try {
      await processMessage(env, item.body.messageId);
      item.ack();
    } catch (err) {
      console.error(`mail queue: message ${item.body.messageId} failed`, err);
      item.retry({ delaySeconds: Math.min(30 * item.attempts, 600) });
    }
  }
}

/**
 * Steps 2–8 of the pipeline. For M0 this only parses the message and, on staging, logs the
 * header report for spike S1. Unwrapping, verification, classification and matching land in M3–M4.
 */
async function processMessage(env: Env, messageId: string): Promise<void> {
  const row = await getMessageForProcessing(getDb(env), messageId);
  if (!row?.rawKey) return; // deleted or purged since it was queued

  const object = await env.RAW_MAIL.get(row.rawKey);
  if (!object) return;
  const parsed = await parseEmail(await object.arrayBuffer());

  if (env.SPIKE_LOG_HEADERS === "true") {
    console.log(JSON.stringify({ spike: "S1", rowId: messageId, ...headerReport(parsed) }));
  }
}
