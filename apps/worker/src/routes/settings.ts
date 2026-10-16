import { Hono } from "hono";
import { z } from "zod";
import { getDb } from "../db/client";
import { type AppEnv, parseBody, requireUser } from "../http";
import { getSettings, updateSettings } from "../repo/settings";

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const SettingsPatch = z
  .object({
    ghostThresholdDays: z.int().min(1).max(365),
    timezone: z.string().refine(isTimeZone, "Unknown time zone").nullable(),
    // Capped at 30: the privacy policy promises raw mail is gone within 30 days.
    rawRetentionDays: z.int().min(1).max(30),
    autoApply: z.boolean(),
    digest: z.enum(["off", "weekly"]),
  })
  .partial()
  .strict();

export const settingsRoutes = new Hono<AppEnv>().use(requireUser);

settingsRoutes.get("/", async (c) =>
  c.json({ settings: await getSettings(getDb(c.env), c.get("userId")) }),
);

settingsRoutes.patch("/", async (c) => {
  const body = await parseBody(c, SettingsPatch);
  if (!body.ok) return body.response;
  return c.json({ settings: await updateSettings(getDb(c.env), c.get("userId"), body.data) });
});
