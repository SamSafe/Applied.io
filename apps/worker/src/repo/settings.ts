import { eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { settings } from "../db/schema";

export type UserSettings = Omit<typeof settings.$inferSelect, "userId">;

export const DEFAULT_USER_SETTINGS: UserSettings = {
  ghostThresholdDays: 21,
  timezone: "UTC",
  rawRetentionDays: 30,
  autoApply: true,
  digest: "off",
};

/** Settings rows are created lazily; a user without one gets the defaults. */
export async function getSettings(db: Db, userId: string): Promise<UserSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.userId, userId)).limit(1);
  if (!row) return { ...DEFAULT_USER_SETTINGS };
  const { userId: _userId, ...rest } = row;
  return rest;
}

export async function updateSettings(
  db: Db,
  userId: string,
  patch: Partial<UserSettings>,
): Promise<UserSettings> {
  const next = { ...(await getSettings(db, userId)), ...patch };
  await db
    .insert(settings)
    .values({ userId, ...next })
    .onConflictDoUpdate({ target: settings.userId, set: next });
  return next;
}
