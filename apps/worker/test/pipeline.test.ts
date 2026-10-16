import { env } from "cloudflare:workers";
import Anthropic from "@anthropic-ai/sdk";
import { ClassificationError, type ClassifyResult } from "@apptracker/mail";
import { desc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import lever from "../../../packages/mail/fixtures/public/lever-received.eml?raw";
import alert from "../../../packages/mail/fixtures/public/linkedin-job-alert.eml?raw";
import outlook from "../../../packages/mail/fixtures/public/outlook-manual-forward.eml?raw";
import { getDb } from "../src/db/client";
import { mailSource, message } from "../src/db/schema";
import { ingest } from "../src/ingest";
import { type Classify, processMessage } from "../src/queue";
import { call, signIn } from "./helpers";

const confirmation = [
  "From: Gmail Team <forwarding-noreply@google.com>",
  "To: u_test000001@in.example.test",
  "Subject: (#912345678) Gmail Forwarding Confirmation - Receive Mail from jane.seeker@gmail.com",
  "Message-ID: <confirm-1@google.com>",
  "Content-Type: text/plain",
  "",
  "jane.seeker@gmail.com has requested to automatically forward mail to your email address.",
  "",
].join("\r\n");

const db = () => getDb(env);
let cookie: string;
let sourceId: string;
let userId: string;

const deliver = async (raw: string) => {
  await ingest(env, db(), {
    userId,
    sourceId,
    raw: new TextEncoder().encode(raw).buffer as ArrayBuffer,
    headerMessageId: null,
    fromAddress: null,
    fromDomain: null,
    subject: null,
    sentAt: null,
  });
  // ULIDs sort by creation time, so the newest row is the one just delivered.
  const [row] = await db().select().from(message).orderBy(desc(message.id)).limit(1);
  return row as typeof message.$inferSelect;
};
const reload = async (id: string) =>
  (await db().select().from(message).where(eq(message.id, id)))[0];

const fakeResult = (over: Partial<ClassifyResult["classification"]> = {}): ClassifyResult => ({
  classification: {
    jobRelated: true,
    category: "application_received",
    interviewKind: null,
    company: "Northwind Payments",
    position: "Senior Software Engineer, Payments",
    reqNumber: null,
    location: null,
    certainty: "high",
    evidence: "We received your application",
    ...over,
  },
  model: "claude-haiku-5-5",
  version: "test-version",
  usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0 },
});

beforeEach(async () => {
  vi.spyOn(env.MAIL_QUEUE, "send").mockResolvedValue({} as QueueSendResponse);
  cookie = await signIn("jane@example.test");
  const created = await call("/api/mail-sources/forwarding", {
    method: "POST",
    headers: { cookie },
  });
  sourceId = ((await created.json()) as { source: { id: string } }).source.id;
  const [src] = await db().select().from(mailSource).where(eq(mailSource.id, sourceId));
  userId = src?.userId as string;
});

afterEach(() => vi.restoreAllMocks());

describe("processMessage", () => {
  it("classifies a verified confirmation and creates the application", async () => {
    await db()
      .update(mailSource)
      .set({ verifiedMailbox: "jane.seeker@gmail.com" })
      .where(eq(mailSource.id, sourceId));
    const row = await deliver(lever);
    const classify = vi.fn<Classify>().mockResolvedValue(fakeResult());
    await processMessage(env, row.id, classify);

    const after = await reload(row.id);
    expect(after).toMatchObject({
      status: "applied",
      fromAddress: "no-reply@hire.lever.co",
      fromDomain: "hire.lever.co",
      subject: "Thanks for applying to Northwind Payments",
      senderVerified: true,
      classifierVersion: "test-version",
      model: "claude-haiku-5-5",
      evidence: "We received your application",
    });
    expect(after?.applicationId).toBeTruthy();
    expect(after?.diagnostics).toMatchObject({
      wrapper: "none",
      provider: "gmail",
      prefilter: { relevant: true, ats: "lever" },
      sender: { verified: true },
    });
    expect(classify.mock.calls[0]?.[0].from?.address).toBe("no-reply@hire.lever.co");

    // Idempotent: a retry doesn't classify again.
    await processMessage(env, row.id, classify);
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("leaves relevant mail waiting when no classifier is configured", async () => {
    const row = await deliver(lever);
    await processMessage(env, row.id, null);
    const after = await reload(row.id);
    expect(after?.status).toBe("received");
    expect(after?.senderVerified).toBe(false);
    expect(after?.diagnostics).toMatchObject({
      sender: { reason: "no verified forwarding mailbox yet" },
    });
  });

  it("drops irrelevant mail and deletes its body", async () => {
    const row = await deliver(alert);
    const classify = vi.fn<Classify>();
    await processMessage(env, row.id, classify);
    const after = await reload(row.id);
    expect(after?.status).toBe("filtered_out");
    expect(after?.rawKey).toBeNull();
    expect(await env.RAW_MAIL.get(row.rawKey as string)).toBeNull();
    expect(classify).not.toHaveBeenCalled();
  });

  it("records the original sender of a hand-forwarded email", async () => {
    const row = await deliver(outlook);
    await processMessage(
      env,
      row.id,
      vi.fn<Classify>().mockResolvedValue(fakeResult({ category: "rejection" })),
    );
    const after = await reload(row.id);
    expect(after?.fromAddress).toBe("talent@globex.example.test");
    expect(after?.diagnostics).toMatchObject({ wrapper: "inline" });
  });

  it("learns the forwarding mailbox from Gmail's confirmation and shows the code", async () => {
    const row = await deliver(confirmation);
    await processMessage(env, row.id, vi.fn<Classify>());
    expect((await reload(row.id))?.status).toBe("ignored");

    const res = await call("/api/mail-sources", { headers: { cookie } });
    const { sources } = (await res.json()) as {
      sources: { verifiedMailbox: string; providerHint: string; confirmation: { code: string } }[];
    };
    expect(sources[0]).toMatchObject({
      verifiedMailbox: "jane.seeker@gmail.com",
      providerHint: "gmail",
      confirmation: { code: "912345678", mailbox: "jane.seeker@gmail.com" },
    });
  });

  it("marks content failures as failed without retrying", async () => {
    const row = await deliver(lever);
    await processMessage(
      env,
      row.id,
      vi.fn<Classify>().mockRejectedValue(new ClassificationError("refusal", "declined")),
    );
    expect(await reload(row.id)).toMatchObject({
      status: "failed",
      failure: "Classification failed: declined",
    });
  });

  it("rethrows transient API errors so the queue retries", async () => {
    const row = await deliver(lever);
    const err = new Anthropic.APIConnectionError({ message: "connection reset" });
    await expect(
      processMessage(env, row.id, vi.fn<Classify>().mockRejectedValue(err)),
    ).rejects.toBe(err);
    expect((await reload(row.id))?.status).toBe("received");
  });
});

describe("messages API", () => {
  it("uploads .eml files, skipping duplicates and non-emails", async () => {
    const form = new FormData();
    form.append("files", new File([lever], "lever.eml", { type: "message/rfc822" }));
    form.append("files", new File([lever], "lever-again.eml", { type: "message/rfc822" }));
    form.append("files", new File(["just some text"], "notes.txt"));
    const res = await call("/api/messages/upload", {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { results: unknown[] }).results).toEqual([
      { name: "lever.eml", status: "queued" },
      { name: "lever-again.eml", status: "duplicate" },
      { name: "notes.txt", status: "invalid" },
    ]);

    const list = (await (await call("/api/messages", { headers: { cookie } })).json()) as {
      messages: { subject: string; status: string }[];
    };
    expect(list.messages).toEqual([
      expect.objectContaining({
        subject: "Thanks for applying to Northwind Payments",
        status: "received",
      }),
    ]);
  });

  it("treats uploads as verified, since the signed-in user sent them", async () => {
    const form = new FormData();
    form.append("files", new File([lever], "lever.eml"));
    await call("/api/messages/upload", { method: "POST", headers: { cookie }, body: form });
    const [row] = await db().select().from(message);
    await processMessage(env, row?.id as string, vi.fn<Classify>().mockResolvedValue(fakeResult()));
    expect((await reload(row?.id as string))?.senderVerified).toBe(true);
  });

  it("lets the user set the forwarding mailbox by hand", async () => {
    const res = await call(`/api/mail-sources/${sourceId}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ verifiedMailbox: "Jane@Outlook.example" }),
    });
    expect(
      ((await res.json()) as { source: { verifiedMailbox: string } }).source.verifiedMailbox,
    ).toBe("jane@outlook.example");
    const bad = await call(`/api/mail-sources/${sourceId}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ verifiedMailbox: "not-an-email" }),
    });
    expect(bad.status).toBe(400);
  });

  it("never shows one user's emails to another", async () => {
    await deliver(lever);
    const mallory = await signIn("mallory@example.test");
    const list = (await (await call("/api/messages", { headers: { cookie: mallory } })).json()) as {
      messages: unknown[];
    };
    expect(list.messages).toEqual([]);
  });
});
