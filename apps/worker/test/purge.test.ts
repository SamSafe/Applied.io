import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/db/client";
import { mailSource, message } from "../src/db/schema";
import { purgeExpired } from "../src/purge";
import { createUser } from "./helpers";

const DAY = 86_400_000;
const now = new Date("2026-11-20T03:17:00Z");
const iso = (d: Date) => d.toISOString();
const daysBefore = (n: number) => iso(new Date(now.getTime() - n * DAY));

const row = (id: string, over: Partial<typeof message.$inferInsert>) => ({
  id,
  userId: "u1",
  sourceId: "s1",
  receivedAt: daysBefore(40),
  status: "applied" as const,
  purgeAfter: daysBefore(10),
  rawKey: `u1/${id}.eml`,
  ...over,
});

beforeEach(async () => {
  await createUser("u1", "jane@example.test");
  await getDb(env)
    .insert(mailSource)
    .values({
      id: "s1",
      userId: "u1",
      kind: "forwarding",
      status: "active",
      createdAt: daysBefore(60),
    });
});

describe("purgeExpired", () => {
  it("deletes raw mail past its purge date and keeps everything else", async () => {
    const db = getDb(env);
    await db.insert(message).values([
      row("old", { evidence: "We received your application" }),
      row("fresh", {
        purgeAfter: iso(new Date(now.getTime() + 5 * DAY)),
        receivedAt: daysBefore(25),
      }),
    ]);
    await env.RAW_MAIL.put("u1/old.eml", "raw");
    await env.RAW_MAIL.put("u1/fresh.eml", "raw");

    const result = await purgeExpired(env, now);
    expect(result.raw).toBe(1);
    expect(await env.RAW_MAIL.get("u1/old.eml")).toBeNull();
    expect(await env.RAW_MAIL.get("u1/fresh.eml")).not.toBeNull();
    const [old] = await db.select().from(message).where(eq(message.id, "old"));
    expect(old).toMatchObject({
      rawKey: null,
      evidence: "We received your application",
      status: "applied",
    });
  });

  it("drops filtered-out records after a week", async () => {
    const db = getDb(env);
    await db
      .insert(message)
      .values([
        row("noise-old", { status: "filtered_out", rawKey: null, receivedAt: daysBefore(8) }),
        row("noise-new", { status: "filtered_out", rawKey: null, receivedAt: daysBefore(2) }),
      ]);
    const result = await purgeExpired(env, now);
    expect(result.filtered).toBe(1);
    expect((await db.select().from(message)).map((m) => m.id)).toEqual(["noise-new"]);
  });
});
