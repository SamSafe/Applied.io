import Anthropic from "@anthropic-ai/sdk";
import {
  type Classification,
  ClassificationError,
  type ClassifierInput,
  type ClassifyResult,
  classifyEmail,
  cleanBody,
  detectGmailConfirmation,
  detectProvider,
  domainOf,
  headerReport,
  parseEmail,
  plan,
  prefilter,
  unwrap,
  verifySender,
} from "@apptracker/mail";
import { and, eq, isNull } from "drizzle-orm";
import { executePlan } from "./apply";
import { type Db, getDb } from "./db/client";
import { mailSource } from "./db/schema";
import { listApplications } from "./repo/applications";
import { countClassifiedSince, type MessagePatch, updateMessage } from "./repo/messages";
import { getSettings } from "./repo/settings";
import { getMessageForProcessing } from "./repo/system";

export interface MailQueueMessage {
  messageId: string;
}

/** Matches max_retries on the queue consumer in wrangler.jsonc. */
const MAX_ATTEMPTS = 5;

/** Per-user ceiling on classifier calls per UTC day (docs/SECURITY_PRIVACY.md, cost abuse). */
export const DAILY_CLASSIFICATION_CAP = 300;

export async function handleQueue(batch: MessageBatch<MailQueueMessage>, env: Env): Promise<void> {
  for (const item of batch.messages) {
    try {
      await processMessage(env, item.body.messageId);
      item.ack();
    } catch (err) {
      console.error(`mail queue: message ${item.body.messageId} failed`, err);
      if (item.attempts >= MAX_ATTEMPTS) {
        await markFailed(env, item.body.messageId, String(err));
        item.ack();
      } else {
        item.retry({ delaySeconds: Math.min(30 * item.attempts, 600) });
      }
    }
  }
}

/**
 * The pipeline (docs/EMAIL_PIPELINE.md): parse and unwrap, verify the sender, prefilter,
 * classify, then match and act. Only `received` messages are processed, so retries are
 * idempotent.
 */
export type Classify = (input: ClassifierInput) => Promise<ClassifyResult>;

/** The real classifier, when this environment has an API key. */
function defaultClassifier(env: Env): Classify | null {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return (input) => classifyEmail(new Anthropic({ apiKey }), input);
}

export async function processMessage(
  env: Env,
  messageId: string,
  classify: Classify | null = defaultClassifier(env),
): Promise<void> {
  const db = getDb(env);
  const found = await getMessageForProcessing(db, messageId);
  if (found?.message.status !== "received" || !found.message.rawKey) return;
  const { message, source } = found;

  const object = await env.RAW_MAIL.get(message.rawKey as string);
  if (!object) return;
  const parsed = await parseEmail(await object.arrayBuffer());
  if (env.SPIKE_LOG_HEADERS === "true") {
    console.log(JSON.stringify({ spike: "S1", rowId: messageId, ...headerReport(parsed) }));
  }

  const confirmation = detectGmailConfirmation(parsed);
  if (confirmation) {
    await db
      .update(mailSource)
      .set({ verifiedMailbox: confirmation.mailbox, providerHint: "gmail" })
      .where(and(eq(mailSource.id, message.sourceId), eq(mailSource.userId, message.userId)));
    await updateMessage(db, message.userId, message.id, {
      status: "ignored",
      classification: { type: "gmail_forwarding_confirmation", ...confirmation },
    });
    return;
  }

  const provider = detectProvider(parsed);
  if (provider && !source.providerHint)
    await setProviderHint(db, message.userId, message.sourceId, provider);

  const original = await unwrap(parsed);
  const body = cleanBody(original.body);
  // Uploads come from the signed-in user directly, so their provenance is the session.
  const sender =
    source.kind === "upload"
      ? { verified: true, reason: "uploaded by the signed-in user" }
      : verifySender(parsed, original, source.verifiedMailbox);
  const filter = prefilter({ ...original, body });

  const facts: MessagePatch = {
    fromAddress: original.from?.address ?? message.fromAddress,
    fromDomain: original.from ? domainOf(original.from.address) : message.fromDomain,
    subject: original.subject ?? message.subject,
    sentAt: original.sentAt ?? message.sentAt,
    senderVerified: sender.verified,
    diagnostics: {
      wrapper: original.wrapper,
      provider,
      prefilter: { relevant: filter.relevant, reason: filter.reason, ats: filter.ats },
      sender,
    },
  };

  if (!filter.relevant) {
    // Never keep the body of mail we didn't need (docs/SECURITY_PRIVACY.md).
    await env.RAW_MAIL.delete(message.rawKey as string);
    await updateMessage(db, message.userId, message.id, {
      ...facts,
      status: "filtered_out",
      rawKey: null,
    });
    return;
  }

  if (!classify) {
    // Classification isn't configured here; keep the facts and leave it waiting.
    await updateMessage(db, message.userId, message.id, facts);
    return;
  }

  // A retry after a failed write reuses the stored classification instead of paying twice.
  let classification = message.classifierVersion
    ? (message.classification as Classification | null)
    : null;
  if (!classification) {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    if ((await countClassifiedSince(db, message.userId, startOfDay)) >= DAILY_CLASSIFICATION_CAP) {
      // Over the cost cap: let the user file it by hand rather than drop it.
      await updateMessage(db, message.userId, message.id, {
        ...facts,
        status: "needs_review",
        failure: "Daily classification limit reached",
        review: {
          reasons: ["Applied reached today's limit for reading emails automatically"],
          proposal: { kind: "none" },
          suggestion: { kind: "create" },
        },
      });
      return;
    }
    try {
      const result = await classify({
        from: original.from,
        subject: original.subject,
        sentAt: original.sentAt,
        body,
        forwardedBy: original.forwardedBy,
      });
      classification = result.classification;
      await updateMessage(db, message.userId, message.id, {
        ...facts,
        classification,
        classifierVersion: result.version,
        model: result.model,
        evidence: classification.evidence,
      });
    } catch (err) {
      // Rate limits, overloads and outages are worth retrying; anything else won't fix itself.
      const retryable =
        err instanceof Anthropic.RateLimitError ||
        err instanceof Anthropic.InternalServerError ||
        err instanceof Anthropic.APIConnectionError;
      if (retryable) throw err;
      const reason =
        err instanceof ClassificationError || err instanceof Anthropic.APIError
          ? err.message
          : String(err);
      await updateMessage(db, message.userId, message.id, {
        ...facts,
        status: "failed",
        failure: `Classification failed: ${reason}`,
      });
      return;
    }
  }

  // Steps 6–8: match, decide, act.
  const [apps, settings] = await Promise.all([
    listApplications(db, message.userId),
    getSettings(db, message.userId),
  ]);
  const occurredAt = facts.sentAt ?? message.receivedAt;
  const decided = plan({
    classification,
    apps,
    occurredAt,
    senderVerified: sender.verified,
    autoApply: settings.autoApply,
    messageId: message.id,
    fromDomain: facts.fromDomain ?? null,
    ats: filter.ats,
  });
  const fresh = await getMessageForProcessing(db, message.id);
  if (fresh) await executePlan(db, fresh.message, decided, new Date());
}

async function setProviderHint(db: Db, userId: string, sourceId: string, provider: string) {
  await db
    .update(mailSource)
    .set({ providerHint: provider })
    .where(
      and(
        eq(mailSource.id, sourceId),
        eq(mailSource.userId, userId),
        isNull(mailSource.providerHint),
      ),
    );
}

async function markFailed(env: Env, messageId: string, reason: string): Promise<void> {
  const db = getDb(env);
  const found = await getMessageForProcessing(db, messageId);
  if (!found) return;
  await updateMessage(db, found.message.userId, messageId, {
    status: "failed",
    failure: `Gave up after ${MAX_ATTEMPTS} attempts: ${reason.slice(0, 500)}`,
  });
}
