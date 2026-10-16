import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/client";
import { message, user } from "../db/schema";
import { type AppEnv, parseBody, requireUser } from "../http";
import { listApplications } from "../repo/applications";
import { getSettings } from "../repo/settings";

/** The user's rights over their data (docs/SECURITY_PRIVACY.md → "User rights"). */
export const account = new Hono<AppEnv>().use(requireUser);

/** Everything Applied holds about the user, as JSON. Never includes raw email bodies. */
account.get("/export", async (c) => {
  const db = getDb(c.env);
  const userId = c.get("userId");
  const [apps, settings, messages] = await Promise.all([
    listApplications(db, userId),
    getSettings(db, userId),
    db
      .select({
        id: message.id,
        receivedAt: message.receivedAt,
        status: message.status,
        from: message.fromAddress,
        subject: message.subject,
        sentAt: message.sentAt,
        classification: message.classification,
        evidence: message.evidence,
        applicationId: message.applicationId,
      })
      .from(message)
      .where(eq(message.userId, userId)),
  ]);
  const body = {
    exportedAt: new Date().toISOString(),
    user: c.get("user"),
    settings,
    applications: apps,
    emails: messages,
  };
  const day = body.exportedAt.slice(0, 10);
  return c.body(JSON.stringify(body, null, 2), 200, {
    "content-type": "application/json; charset=utf-8",
    "content-disposition": `attachment; filename="applied-export-${day}.json"`,
  });
});

const Confirm = z.object({ confirm: z.literal("delete my account") });

/**
 * Deletes the account: raw mail in storage first, then the user row, which cascades to every
 * table (sessions, sources, messages, applications, events, settings).
 */
account.delete("/", async (c) => {
  const body = await parseBody(c, Confirm);
  if (!body.ok) return body.response;
  const userId = c.get("userId");
  let cursor: string | undefined;
  do {
    const page = await c.env.RAW_MAIL.list({ prefix: `${userId}/`, cursor });
    if (page.objects.length > 0) await c.env.RAW_MAIL.delete(page.objects.map((o) => o.key));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  await getDb(c.env).delete(user).where(eq(user.id, userId));
  return c.body(null, 204);
});
