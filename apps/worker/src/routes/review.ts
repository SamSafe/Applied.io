import { derive } from "@apptracker/core";
import type { Classification, Review } from "@apptracker/mail";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { resolveReview } from "../apply";
import { getDb } from "../db/client";
import { message } from "../db/schema";
import { type AppEnv, notFound, parseBody, requireUser } from "../http";
import { listApplications, markSeen } from "../repo/applications";
import { listRecentMessages } from "../repo/messages";
import { getSettings } from "../repo/settings";

/** Emails the pipeline wasn't sure about (docs/EMAIL_PIPELINE.md → "Review queue"). */
export const review = new Hono<AppEnv>().use(requireUser);

review.get("/", async (c) => {
  const db = getDb(c.env);
  const userId = c.get("userId");
  const [rows, apps, settings] = await Promise.all([
    listRecentMessages(db, userId, { status: "needs_review", limit: 100 }),
    listApplications(db, userId),
    getSettings(db, userId),
  ]);
  const now = new Date();
  const byId = new Map(apps.map((a) => [a.id, a]));
  const summarize = (id: string, score: number | null) => {
    const app = byId.get(id);
    if (!app) return null;
    const d = derive(app, now, settings);
    return {
      applicationId: id,
      company: app.company,
      position: app.position,
      maxStage: d.maxStage,
      status: d.status,
      score,
    };
  };

  return c.json({
    items: rows.map((m) => {
      const cl = m.classification as Classification | null;
      const r = m.review as Review | null;
      const s = r?.suggestion;
      const candidates =
        s?.kind === "pick"
          ? s.candidates.map((x) => summarize(x.applicationId, x.score)).filter(Boolean)
          : s?.kind === "append"
            ? [summarize(s.applicationId, null)].filter(Boolean)
            : [];
      return {
        id: m.id,
        receivedAt: m.receivedAt,
        sentAt: m.sentAt,
        subject: m.subject,
        from: m.fromAddress,
        senderVerified: m.senderVerified,
        category: cl?.category ?? null,
        interviewKind: cl?.interviewKind ?? null,
        company: cl?.company ?? null,
        position: cl?.position ?? null,
        certainty: cl?.certainty ?? null,
        evidence: m.evidence,
        failure: m.failure,
        reasons: r?.reasons ?? (m.failure ? [m.failure] : []),
        proposal: r?.proposal ?? null,
        suggestion: s ? { kind: s.kind } : null,
        candidates,
      };
    }),
  });
});

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }),
  z.object({ action: z.literal("assign"), applicationId: z.string().min(1) }),
  z.object({
    action: z.literal("create"),
    company: z.string().trim().max(200).optional(),
    position: z.string().trim().max(200).optional(),
  }),
  z.object({ action: z.literal("ignore") }),
]);

review.post("/:id", async (c) => {
  const body = await parseBody(c, Action);
  if (!body.ok) return body.response;
  const db = getDb(c.env);
  const userId = c.get("userId");
  const [row] = await db
    .select()
    .from(message)
    .where(and(eq(message.id, c.req.param("id")), eq(message.userId, userId)))
    .limit(1);
  if (!row) return notFound(c);
  if (row.status !== "needs_review") return c.json({ error: "already_resolved" }, 409);

  const now = new Date();
  const result = await resolveReview(db, row, body.data, now);
  if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status);
  // The user just made this decision, so it isn't news to them.
  if (result.applicationId) await markSeen(db, userId, result.applicationId, now);
  return c.json({ applicationId: result.applicationId });
});
