import { domainOf, parseEmail } from "@apptracker/mail";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/client";
import { type AppEnv, requireUser } from "../http";
import { ingest, MAX_RAW_BYTES } from "../ingest";
import { listRecentMessages, type Message, uploadSource } from "../repo/messages";

const MAX_FILES = 50;

const ListQuery = z.object({
  status: z
    .enum(["received", "filtered_out", "needs_review", "applied", "ignored", "failed"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** What the pipeline did with recent emails. Never includes bodies. */
export const messages = new Hono<AppEnv>().use(requireUser);

messages.get("/", async (c) => {
  const query = ListQuery.safeParse(c.req.query());
  if (!query.success) return c.json({ error: "invalid_query", issues: query.error.issues }, 400);
  const rows = await listRecentMessages(getDb(c.env), c.get("userId"), query.data);
  return c.json({ messages: rows.map(present) });
});

/** Upload .eml files (backfill, Yahoo free accounts, testing): `files` in multipart form data. */
messages.post("/upload", async (c) => {
  const form = await c.req.formData().catch(() => null);
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File);
  if (files.length === 0) return c.json({ error: "no_files" }, 400);
  if (files.length > MAX_FILES) return c.json({ error: "too_many_files", max: MAX_FILES }, 400);

  const db = getDb(c.env);
  const userId = c.get("userId");
  const sourceId = await uploadSource(db, userId, new Date());
  const results: { name: string; status: "queued" | "duplicate" | "too_large" | "invalid" }[] = [];

  for (const file of files) {
    if (file.size > MAX_RAW_BYTES) {
      results.push({ name: file.name, status: "too_large" });
      continue;
    }
    const raw = await file.arrayBuffer();
    const parsed = await parseEmail(raw).catch(() => null);
    if (!parsed || (!parsed.from && !parsed.subject)) {
      results.push({ name: file.name, status: "invalid" });
      continue;
    }
    const status = await ingest(c.env, db, {
      userId,
      sourceId,
      raw,
      headerMessageId: parsed.messageId,
      fromAddress: parsed.from?.address ?? null,
      fromDomain: parsed.from ? domainOf(parsed.from.address) : null,
      subject: parsed.subject,
      sentAt: parsed.sentAt,
    });
    results.push({ name: file.name, status });
  }
  return c.json({ results });
});

function present(m: Message) {
  const c = m.classification as {
    category?: string;
    company?: string | null;
    position?: string | null;
    certainty?: string;
  } | null;
  const d = m.diagnostics as {
    prefilter?: { reason?: string };
    sender?: { reason?: string };
  } | null;
  return {
    id: m.id,
    receivedAt: m.receivedAt,
    status: m.status,
    from: m.fromAddress,
    subject: m.subject,
    sentAt: m.sentAt,
    senderVerified: m.senderVerified,
    category: c?.category ?? null,
    company: c?.company ?? null,
    position: c?.position ?? null,
    certainty: c?.certainty ?? null,
    evidence: m.evidence,
    filterReason: d?.prefilter?.reason ?? null,
    senderReason: d?.sender?.reason ?? null,
    failure: m.failure,
  };
}
