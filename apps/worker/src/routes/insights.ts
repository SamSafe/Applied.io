import { analytics, sankey } from "@apptracker/core";
import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/client";
import { type AppEnv, requireUser } from "../http";
import { listApplications } from "../repo/applications";
import { getSettings } from "../repo/settings";

const RangeQuery = z.object({
  since: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
  until: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
});

/** Stats and the Sankey, both computed by core from the full event log. */
export const insights = new Hono<AppEnv>().use(requireUser);

insights.get("/stats", async (c) => {
  const range = RangeQuery.safeParse(c.req.query());
  if (!range.success) return c.json({ error: "invalid_query", issues: range.error.issues }, 400);
  const { apps, settings } = await load(c.env, c.get("userId"));
  return c.json({ stats: analytics(apps, new Date(), settings, range.data) });
});

insights.get("/sankey", async (c) => {
  const range = RangeQuery.safeParse(c.req.query());
  if (!range.success) return c.json({ error: "invalid_query", issues: range.error.issues }, 400);
  const { apps, settings } = await load(c.env, c.get("userId"));
  return c.json({ sankey: sankey(apps, new Date(), settings, range.data) });
});

async function load(env: Env, userId: string) {
  const db = getDb(env);
  const [apps, settings] = await Promise.all([
    listApplications(db, userId),
    getSettings(db, userId),
  ]);
  return { apps, settings };
}
