import { createExecutionContext, createMessageBatch, getQueueResult } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/db/client";
import { mailSource, message } from "../src/db/schema";
import { MAX_RAW_BYTES } from "../src/email";
import worker from "../src/index";
import type { MailQueueMessage } from "../src/queue";
import { createUser } from "./helpers";

const TOKEN = "u_abcdefghij";

const RAW = [
  "From: Acme Recruiting <no-reply@us.greenhouse-mail.io>",
  "To: jane@example.test",
  "Subject: =?UTF-8?Q?Thank_you_for_applying_to_Acme?=",
  "Date: Mon, 12 Oct 2026 21:02:58 +0000",
  "Message-ID: <gh-1@us.greenhouse-mail.io>",
  "Content-Type: text/plain",
  "",
  "Thanks for applying to the Software Engineer role at Acme.",
  "",
].join("\r\n");

function inbound(raw: string, to = `${TOKEN}@in.localhost`, rawSize?: number) {
  const headers = new Headers();
  for (const line of raw.split("\r\n\r\n")[0]?.split("\r\n") ?? []) {
    const i = line.indexOf(":");
    headers.append(line.slice(0, i), line.slice(i + 1).trim());
  }
  return {
    from: "bounce@forwarder.example.test",
    to,
    headers,
    raw: new Response(raw).body as ReadableStream<Uint8Array>,
    rawSize: rawSize ?? raw.length,
    setReject: vi.fn(),
    forward: vi.fn(),
    reply: vi.fn(),
  } as unknown as ForwardableEmailMessage & { setReject: ReturnType<typeof vi.fn> };
}

const db = () => getDb(env);
const receive = (msg: ForwardableEmailMessage) => worker.email(msg, env);
let enqueued: MailQueueMessage[] = [];

beforeEach(async () => {
  enqueued = [];
  // Capture instead of delivering, so the local queue doesn't run the consumer after teardown.
  vi.spyOn(env.MAIL_QUEUE, "send").mockImplementation(async (body) => {
    enqueued.push(body as MailQueueMessage);
    return {} as QueueSendResponse;
  });
  await createUser("user-1", "jane@example.test");
  await db().insert(mailSource).values({
    id: "src-1",
    userId: "user-1",
    kind: "forwarding",
    addressToken: TOKEN,
    status: "awaiting_first_mail",
    createdAt: new Date().toISOString(),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("email()", () => {
  it("stores the raw message, records it, and activates the source", async () => {
    const msg = inbound(RAW);
    await receive(msg);
    expect(msg.setReject).not.toHaveBeenCalled();

    const [row] = await db().select().from(message);
    expect(row).toMatchObject({
      userId: "user-1",
      sourceId: "src-1",
      status: "received",
      fromAddress: "no-reply@us.greenhouse-mail.io",
      fromDomain: "us.greenhouse-mail.io",
      subject: "Thank you for applying to Acme",
      sentAt: "2026-10-12T21:02:58.000Z",
      headerMessageId: "<gh-1@us.greenhouse-mail.io>",
    });
    const stored = await env.RAW_MAIL.get(row?.rawKey as string);
    expect(await stored?.text()).toBe(RAW);
    expect(Date.parse(row?.purgeAfter as string) - Date.parse(row?.receivedAt as string)).toBe(
      30 * 86_400_000,
    );

    const [source] = await db().select().from(mailSource).where(eq(mailSource.id, "src-1"));
    expect(source?.status).toBe("active");
    expect(source?.lastMessageAt).toBe(row?.receivedAt);
    expect(enqueued).toEqual([{ messageId: row?.id }]);
  });

  it("rejects unknown recipients without storing anything", async () => {
    const msg = inbound(RAW, "u_nobody0000@in.localhost");
    await receive(msg);
    expect(msg.setReject).toHaveBeenCalledWith("Unknown recipient");
    expect(await db().select().from(message)).toEqual([]);
    expect(enqueued).toEqual([]);
  });

  it("rejects revoked addresses", async () => {
    await db().update(mailSource).set({ status: "revoked" }).where(eq(mailSource.id, "src-1"));
    const msg = inbound(RAW);
    await receive(msg);
    expect(msg.setReject).toHaveBeenCalledWith("Unknown recipient");
  });

  it("rejects oversized messages", async () => {
    const msg = inbound(RAW, undefined, MAX_RAW_BYTES + 1);
    await receive(msg);
    expect(msg.setReject).toHaveBeenCalledWith("Message too large");
    expect(await db().select().from(message)).toEqual([]);
  });

  it("drops a second copy with the same Message-ID", async () => {
    await receive(inbound(RAW));
    await receive(inbound(RAW));
    const rows = await db().select().from(message);
    expect(rows).toHaveLength(1);
    const objects = await env.RAW_MAIL.list({ prefix: "user-1/" });
    expect(objects.objects).toHaveLength(1);
    expect(enqueued).toHaveLength(1);
  });
});

describe("queue()", () => {
  it("acks a received message after parsing it", async () => {
    await receive(inbound(RAW));
    const [row] = await db().select().from(message);
    const batch = createMessageBatch<MailQueueMessage>("apptracker-mail", [
      { id: "q1", timestamp: new Date(), attempts: 1, body: { messageId: row?.id as string } },
    ]);
    const ctx = createExecutionContext();
    await worker.queue(batch, env);
    const result = await getQueueResult(batch, ctx);
    expect(result.explicitAcks).toEqual(["q1"]);
    expect(result.retryMessages).toEqual([]);
  });

  it("acks messages that no longer exist", async () => {
    const batch = createMessageBatch<MailQueueMessage>("apptracker-mail", [
      { id: "q2", timestamp: new Date(), attempts: 1, body: { messageId: "gone" } },
    ]);
    const ctx = createExecutionContext();
    await worker.queue(batch, env);
    expect((await getQueueResult(batch, ctx)).explicitAcks).toEqual(["q2"]);
  });
});
