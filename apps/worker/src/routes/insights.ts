import { analytics, SANKEY_NODES, sankey } from "@apptracker/core";
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

/** Optional renamed node labels, e.g. {"no_response":"Ghosted"}, as JSON in `labels`. */
const Labels = z.partialRecord(z.enum(SANKEY_NODES), z.string().trim().min(1).max(30));

insights.get("/sankey", async (c) => {
  const { labels: rawLabels, ...rest } = c.req.query();
  const range = RangeQuery.safeParse(rest);
  if (!range.success) return c.json({ error: "invalid_query", issues: range.error.issues }, 400);
  let labels: z.infer<typeof Labels> | undefined;
  if (rawLabels) {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawLabels);
    } catch {
      return c.json({ error: "invalid_labels" }, 400);
    }
    const parsed = Labels.safeParse(parsedJson);
    if (!parsed.success)
      return c.json({ error: "invalid_labels", issues: parsed.error.issues }, 400);
    labels = parsed.data;
  }
  const { apps, settings } = await load(c.env, c.get("userId"));
  return c.json({ sankey: sankey(apps, new Date(), settings, { ...range.data, labels }) });
});

async function load(env: Env, userId: string) {
  const db = getDb(env);
  const [apps, settings] = await Promise.all([
    listApplications(db, userId),
    getSettings(db, userId),
  ]);
  return { apps, settings };
}
