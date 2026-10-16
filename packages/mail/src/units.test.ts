import { describe, expect, it, vi } from "vitest";
import { CLASSIFIER_MODEL, ClassificationError, classifyEmail } from "./classify/classify";
import { SYSTEM_PROMPT, userMessage } from "./classify/prompt";
import { intentFor, propose } from "./classify/propose";
import type { Classification } from "./classify/schema";
import { parseEmail } from "./parse";
import { cleanBody, htmlToText, MAX_BODY_CHARS } from "./text";
import { parseLooseDate } from "./unwrap";
import { detectGmailConfirmation, detectProvider, verifySender } from "./verify";

describe("htmlToText", () => {
  it("keeps block structure and decodes entities", () => {
    const html =
      "<html><head><style>p{}</style></head><body><p>Hi&nbsp;Jane,</p><p>We&#39;re <b>excited</b> &amp; ready.</p><ul><li>One</li><li>Two</li></ul></body></html>";
    expect(htmlToText(html)).toBe("Hi Jane,\nWe're excited & ready.\n\n- One\n- Two");
  });
});

describe("cleanBody", () => {
  it("drops quoted replies, signatures and footers, and shortens tracking links", () => {
    const text = [
      "Thanks for applying!",
      "Track it: https://track.example.com/c/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789abcdef",
      "Unsubscribe from these emails",
      "On Mon, Oct 12, 2026 at 9:00 AM Jane <jane@example.test> wrote:",
      "> my original message",
    ].join("\n");
    expect(cleanBody(text)).toBe("Thanks for applying!\nTrack it: [link: track.example.com]");
  });

  it("stops at a signature delimiter", () => {
    expect(cleanBody("Body\n-- \nJane\nPhone")).toBe("Body");
  });

  it("truncates very long bodies", () => {
    expect(cleanBody("a ".repeat(MAX_BODY_CHARS)).length).toBe(MAX_BODY_CHARS + 1);
  });
});

describe("parseLooseDate", () => {
  it("reads client-specific forwarded dates", () => {
    expect(parseLooseDate("Mon, 12 Oct 2026 16:30:00 -0700")).toBe("2026-10-12T23:30:00.000Z");
    expect(parseLooseDate("October 1, 2026 at 3:12:00 PM EDT")).toBe("2026-10-01T19:12:00.000Z");
    expect(parseLooseDate("not a date")).toBeNull();
    expect(parseLooseDate(undefined)).toBeNull();
  });
});

const confirmation = [
  "From: Gmail Team <forwarding-noreply@google.com>",
  "To: u_test000001@in.example.test",
  "Subject: (#912345678) Gmail Forwarding Confirmation - Receive Mail from Jane.Seeker@gmail.com",
  "Content-Type: text/plain",
  "",
  "Jane.Seeker@gmail.com has requested to automatically forward mail to your email address.",
  "Confirmation code: 912345678",
  "",
].join("\r\n");

describe("detectGmailConfirmation", () => {
  it("extracts the code and the forwarding mailbox", async () => {
    expect(detectGmailConfirmation(await parseEmail(confirmation))).toEqual({
      code: "912345678",
      mailbox: "jane.seeker@gmail.com",
    });
  });

  it("ignores everything else", async () => {
    const other = confirmation.replace("forwarding-noreply@google.com", "someone@example.test");
    expect(detectGmailConfirmation(await parseEmail(other))).toBeNull();
  });
});

describe("verifySender", () => {
  const autoForward = [
    "X-Forwarded-For: jane.seeker@gmail.com u_test000001@in.example.test",
    "DKIM-Signature: v=1; d=gmail.com; s=x; b=AAAA",
    "From: Acme <no-reply@us.greenhouse-mail.io>",
    "Subject: Thanks",
    "",
    "Body",
    "",
  ].join("\r\n");
  const manual = (auth: string) =>
    [
      `Authentication-Results: mx.example.test; ${auth}`,
      "From: Jane <jane.seeker@gmail.com>",
      "Subject: Fwd: Update",
      "",
      "---------- Forwarded message ---------",
      "From: Globex <talent@globex.example>",
      "Subject: Update",
      "",
      "Body",
      "",
    ].join("\r\n");

  it("needs a verified mailbox first", async () => {
    const email = await parseEmail(autoForward);
    expect(verifySender(email, { wrapper: "none", forwardedBy: null }, null).verified).toBe(false);
  });

  it("accepts a Gmail auto-forward from the verified mailbox", async () => {
    const email = await parseEmail(autoForward);
    expect(
      verifySender(email, { wrapper: "none", forwardedBy: null }, "Jane.Seeker@gmail.com"),
    ).toEqual({
      verified: true,
      reason: "auto-forwarded by the verified mailbox",
    });
  });

  it("rejects an auto-forward from another mailbox", async () => {
    const email = await parseEmail(autoForward);
    expect(
      verifySender(email, { wrapper: "none", forwardedBy: null }, "someone@gmail.com").verified,
    ).toBe(false);
  });

  it("accepts a hand forward only with DKIM passing for the mailbox's domain", async () => {
    const wrapped = {
      wrapper: "inline" as const,
      forwardedBy: { name: "Jane", address: "jane.seeker@gmail.com" },
    };
    const pass = await parseEmail(manual("dkim=pass header.d=gmail.com"));
    const fail = await parseEmail(manual("dkim=fail header.d=gmail.com"));
    expect(verifySender(pass, wrapped, "jane.seeker@gmail.com").verified).toBe(true);
    expect(verifySender(fail, wrapped, "jane.seeker@gmail.com").verified).toBe(false);
  });

  it("spots the provider", async () => {
    expect(detectProvider(await parseEmail(autoForward))).toBe("gmail");
  });
});

const classification = (over: Partial<Classification>): Classification => ({
  jobRelated: true,
  category: "other",
  interviewKind: null,
  company: null,
  position: null,
  reqNumber: null,
  location: null,
  certainty: "high",
  evidence: "",
  ...over,
});

describe("propose", () => {
  it.each([
    [{ category: "application_received" }, { kind: "create" }],
    [{ category: "assessment" }, { kind: "advance", stage: "screen" }],
    [
      { category: "interview_invite", interviewKind: "recruiter_screen" },
      { kind: "advance", stage: "screen" },
    ],
    [
      { category: "interview_invite", interviewKind: "interview" },
      { kind: "advance", stage: "interview" },
    ],
    [
      { category: "interview_invite", interviewKind: "final_round" },
      { kind: "advance", stage: "final" },
    ],
    [
      { category: "interview_invite", interviewKind: null },
      { kind: "advance", stage: "interview" },
    ],
    [{ category: "interview_logistics" }, { kind: "evidence" }],
    [{ category: "rejection" }, { kind: "close", outcome: "rejected" }],
    [{ category: "offer" }, { kind: "advance", stage: "offer" }],
    [{ category: "withdrawal_ack" }, { kind: "close", outcome: "withdrawn" }],
    [{ category: "recruiter_outreach" }, { kind: "none" }],
    [{ category: "other" }, { kind: "none" }],
  ] as const)("%o → %o", (over, expected) => {
    expect(propose(classification(over as Partial<Classification>))).toEqual(expected);
  });

  it("maps proposals to matcher intents", () => {
    expect(intentFor({ kind: "create" }, "2026-10-01T00:00:00Z")?.kind).toBe(
      "application_received",
    );
    expect(intentFor({ kind: "close", outcome: "rejected" }, "2026-10-01T00:00:00Z")?.kind).toBe(
      "status",
    );
    expect(intentFor({ kind: "none" }, "2026-10-01T00:00:00Z")).toBeNull();
  });
});

describe("classifyEmail", () => {
  const input = {
    from: { name: "Acme", address: "no-reply@us.greenhouse-mail.io" },
    subject: "Thanks for applying",
    sentAt: "2026-10-12T21:02:58.000Z",
    body: "Thanks for applying to Acme.",
  };
  const response = (over: object) => ({
    model: CLASSIFIER_MODEL,
    stop_reason: "end_turn",
    usage: {
      input_tokens: 900,
      output_tokens: 120,
      cache_read_input_tokens: 800,
      cache_creation_input_tokens: 0,
    },
    parsed_output: classification({
      category: "application_received",
      company: "Acme",
      evidence: "x".repeat(400),
    }),
    ...over,
  });
  const fakeClient = (res: object) => {
    const parse = vi.fn().mockResolvedValue(res);
    return { client: { messages: { parse } } as never, parse };
  };

  it("sends a cached system prompt, the email as data, low effort and the schema", async () => {
    const { client, parse } = fakeClient(response({}));
    const result = await classifyEmail(client, input);

    const request = parse.mock.calls[0]?.[0];
    expect(request.model).toBe("claude-haiku-5-5");
    expect(request.system).toEqual([
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ]);
    expect(request.messages).toEqual([{ role: "user", content: userMessage(input) }]);
    expect(request.output_config.effort).toBe("low");
    expect(request.output_config.format).toBeDefined();

    expect(result.classification.company).toBe("Acme");
    expect(result.classification.evidence).toHaveLength(300);
    expect(result.usage).toEqual({ input: 900, output: 120, cacheRead: 800, cacheWrite: 0 });
  });

  it("wraps the email in tags so it reads as data", () => {
    const msg = userMessage({
      ...input,
      forwardedBy: { name: "Jane", address: "jane@example.test" },
    });
    expect(msg.startsWith("<email>\nFrom: Acme <no-reply@us.greenhouse-mail.io>")).toBe(true);
    expect(msg).toContain("Forwarded by the candidate from: jane@example.test");
    expect(msg.endsWith("</email>")).toBe(true);
  });

  it.each([
    [{ stop_reason: "refusal" }, "refusal"],
    [{ stop_reason: "max_tokens" }, "max_tokens"],
    [{ parsed_output: null }, "unparseable"],
  ])("turns %o into a ClassificationError", async (over, reason) => {
    const { client } = fakeClient(response(over));
    await expect(classifyEmail(client, input)).rejects.toMatchObject({ reason });
    await expect(classifyEmail(client, input)).rejects.toBeInstanceOf(ClassificationError);
  });
});
