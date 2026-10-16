import type { AppEvent, Application } from "@apptracker/core";
import { describe, expect, it } from "vitest";
import { companyDomainFrom, type PlanInput, plan } from "./classify/plan";
import type { Classification } from "./classify/schema";

const DAY = 86_400_000;
const NOW = Date.parse("2026-10-15T12:00:00Z");
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

let seq = 0;
const ev = (body: Partial<AppEvent> & Pick<AppEvent, "type">, days: number): AppEvent =>
  ({
    id: `e${++seq}`,
    occurredAt: ago(days),
    recordedAt: ago(days),
    origin: "manual",
    ...body,
  }) as AppEvent;

const app = (id: string, company: string, position: string, events: AppEvent[]): Application => ({
  id,
  company,
  position,
  events,
});

const c = (over: Partial<Classification>): Classification => ({
  jobRelated: true,
  category: "other",
  interviewKind: null,
  company: "Stripe",
  position: "Software Engineer",
  reqNumber: null,
  location: null,
  certainty: "high",
  evidence: "",
  ...over,
});

const input = (
  classification: Classification,
  apps: Application[] = [],
  over: Partial<PlanInput> = {},
): PlanInput => ({
  classification,
  apps,
  occurredAt: ago(0),
  senderVerified: true,
  autoApply: true,
  messageId: "m1",
  fromDomain: "us.greenhouse-mail.io",
  ats: "greenhouse",
  ...over,
});

const stripe = () => app("a", "Stripe", "Software Engineer", [ev({ type: "applied" }, 10)]);

describe("plan: new applications", () => {
  it("creates when trusted and nothing matches", () => {
    const p = plan(input(c({ category: "application_received" })));
    expect(p).toMatchObject({
      kind: "create",
      facts: {
        company: "Stripe",
        position: "Software Engineer",
        ats: "greenhouse",
        companyDomain: null,
      },
    });
  });

  it("attaches a repeat confirmation to the existing application", () => {
    expect(plan(input(c({ category: "application_received" }), [stripe()]))).toEqual({
      kind: "attach",
      applicationId: "a",
      eventId: null,
    });
  });

  it.each([
    [{ senderVerified: false }, "couldn't be verified"],
    [{ autoApply: false }, "turned off"],
  ])("sends an untrusted email (%o) to review", (over, reason) => {
    const p = plan(input(c({ category: "application_received" }), [], over));
    expect(p.kind).toBe("review");
    if (p.kind === "review") {
      expect(p.review.suggestion).toEqual({ kind: "create" });
      expect(p.review.reasons.join(" ")).toContain(reason);
    }
  });

  it("sends an unsure classification to review", () => {
    const p = plan(input(c({ category: "application_received", certainty: "medium" })));
    expect(p.kind).toBe("review");
  });

  it("asks for the role when the email doesn't name one", () => {
    const p = plan(input(c({ category: "application_received", position: null })));
    expect(p).toMatchObject({ kind: "review", review: { suggestion: { kind: "create" } } });
  });
});

describe("plan: steps on existing applications", () => {
  it("appends a trusted rejection to the only open application", () => {
    const p = plan(input(c({ category: "rejection", position: null }), [stripe()]));
    expect(p).toMatchObject({
      kind: "append",
      applicationId: "a",
      event: {
        type: "closed",
        outcome: "rejected",
        origin: "email",
        messageId: "m1",
        certainty: "high",
      },
    });
  });

  it("maps interview kinds to stages", () => {
    const p = plan(
      input(c({ category: "interview_invite", interviewKind: "final_round" }), [stripe()]),
    );
    expect(p).toMatchObject({ kind: "append", event: { type: "advanced", stage: "final" } });
  });

  it("attaches a repeat of a recent step instead of adding another", () => {
    const a = app("a", "Stripe", "Software Engineer", [
      ev({ type: "applied" }, 20),
      ev(
        { id: "i1", type: "advanced", stage: "interview" } as Partial<AppEvent> & {
          type: "advanced";
        },
        2,
      ),
    ]);
    expect(
      plan(input(c({ category: "interview_invite", interviewKind: "interview" }), [a])),
    ).toEqual({
      kind: "attach",
      applicationId: "a",
      eventId: "i1",
    });
  });

  it("reviews a step that would break the rules", () => {
    const p = plan(input(c({ category: "offer" }), [stripe()]));
    expect(p.kind).toBe("append"); // reaching offer is fine…
    const accepted = app("a", "Stripe", "Software Engineer", [ev({ type: "applied" }, 9)]);
    const closed = plan(
      input(c({ category: "withdrawal_ack" }), [
        {
          ...accepted,
          events: [...accepted.events, ev({ type: "closed", outcome: "rejected" } as never, 3)],
        },
      ]),
    );
    expect(closed).toMatchObject({
      kind: "review",
      review: { reasons: ["The matching application is already closed"] },
    });
  });

  it("asks which application when several match", () => {
    const apps = [
      app("a", "Stripe", "Software Engineer, Payments", [ev({ type: "applied" }, 10)]),
      app("b", "Stripe", "Software Engineer, Billing", [ev({ type: "applied" }, 10)]),
    ];
    const p = plan(input(c({ category: "rejection", position: "Software Engineer" }), apps));
    expect(p).toMatchObject({ kind: "review", review: { suggestion: { kind: "pick" } } });
  });

  it("offers to create the application when none matches", () => {
    const p = plan(input(c({ category: "interview_invite", interviewKind: "recruiter_screen" })));
    expect(p).toMatchObject({
      kind: "review",
      review: {
        suggestion: { kind: "create_and_append" },
        reasons: ["No application to Stripe found"],
      },
    });
  });

  it("sends an unverified status email to review with the match suggested", () => {
    const p = plan(input(c({ category: "rejection" }), [stripe()], { senderVerified: false }));
    expect(p).toMatchObject({
      kind: "review",
      review: { suggestion: { kind: "append", applicationId: "a" } },
    });
  });
});

describe("plan: everything else", () => {
  it("ignores recruiter outreach and non-job mail", () => {
    expect(plan(input(c({ category: "recruiter_outreach" })))).toEqual({
      kind: "ignore",
      reason: "Recruiter outreach, not an application",
    });
    expect(plan(input(c({ category: "other" }))).kind).toBe("ignore");
  });

  it("attaches interview logistics to the matching application, or ignores them", () => {
    expect(plan(input(c({ category: "interview_logistics" }), [stripe()]))).toEqual({
      kind: "attach",
      applicationId: "a",
      eventId: null,
    });
    expect(plan(input(c({ category: "interview_logistics" }))).kind).toBe("ignore");
  });

  it("matches on the employer's own domain when the email came straight from it", () => {
    const a = { ...stripe(), company: "Stripe, Inc.", companyDomain: "stripe.com" };
    const p = plan(
      input(c({ category: "rejection", company: null }), [a], {
        fromDomain: "talent.stripe.com",
        ats: null,
      }),
    );
    expect(p).toMatchObject({ kind: "append", applicationId: "a" });
  });
});

describe("companyDomainFrom", () => {
  it.each([
    ["talent.stripe.com", null, "stripe.com"],
    ["jobs.acme.co.uk", null, "acme.co.uk"],
    ["us.greenhouse-mail.io", "greenhouse", null],
    ["gmail.com", null, null],
    ["calendar.google.com", null, null],
    [null, null, null],
  ])("%s (ats %s) → %s", (domain, ats, expected) => {
    expect(companyDomainFrom(domain, ats)).toBe(expected);
  });
});

describe("plan: closed applications", () => {
  it("attaches a second rejection to the already-rejected application", () => {
    const a = app("a", "Stripe", "Software Engineer", [
      ev({ type: "applied" }, 20),
      ev({ id: "r1", type: "closed", outcome: "rejected" } as never, 5),
    ]);
    expect(plan(input(c({ category: "rejection" }), [a]))).toEqual({
      kind: "attach",
      applicationId: "a",
      eventId: "r1",
    });
  });
});
