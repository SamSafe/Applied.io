import { getDb } from "./db/client";
import { deleteFilteredBefore, purgeCandidates, removeRawKeys } from "./repo/system";

/** How long filtered-out mail keeps its headers (for "why didn't X show up?"). */
export const FILTERED_RETENTION_DAYS = 7;

const DAY_MS = 86_400_000;
const BATCH = 500;

/**
 * Daily retention job (docs/SECURITY_PRIVACY.md → "What we store"): deletes raw MIME past each
 * message's purge date, and drops filtered-out messages entirely after a week. Extracted facts,
 * events and evidence quotes stay until the user deletes them.
 */
export async function purgeExpired(
  env: Env,
  now: Date,
): Promise<{ raw: number; filtered: number }> {
  const db = getDb(env);
  let raw = 0;
  for (;;) {
    const due = await purgeCandidates(db, now, BATCH);
    if (due.length === 0) break;
    await env.RAW_MAIL.delete(due.map((m) => m.rawKey));
    await removeRawKeys(
      db,
      due.map((m) => m.id),
    );
    raw += due.length;
    if (due.length < BATCH) break;
  }
  const filtered = await deleteFilteredBefore(
    db,
    new Date(now.getTime() - FILTERED_RETENTION_DAYS * DAY_MS),
  );
  return { raw, filtered };
}
