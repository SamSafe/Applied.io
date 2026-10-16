import { describe, expect, it } from "vitest";
import { type EmailIntent, findRepeatedEvent, match } from "./match";
import { AppBuilder, daysAgo } from "./testing";
import type { ProposedEvent } from "./types";

const received = (days = 0): EmailIntent => ({
  kind: "application_received",
  occurredAt: daysAgo(days),
});
const status: EmailIntent = { kind: "status", occurredAt: daysAgo(0) };

describe("match: application_received", () => {
  it("creates when nothing matches", () => {
    const apps = [new AppBuilder("a", "Globex").applied(5).build()];
    expect(match(apps, { company: "Stripe", position: "Engineer" }, received())).toEqual({
      kind: "create",
    });
  });

  it("flags a repeat confirmation for the same job as a duplicate", () => {
    const apps = [
      new AppBuilder("a", "Stripe, Inc.", "Staff Software Engineer").applied(2).build(),
    ];
    expect(match(apps, { company: "Stripe", position: "Staff SWE" }, received())).toEqual({
      kind: "duplicate",
      applicationId: "a",
    });
  });

  it("creates for a different role at the same company", () => {
    const apps = [new AppBuilder("a", "Stripe", "Data Analyst").applied(2).build()];
    expect(match(apps, { company: "Stripe", position: "Software Engineer" }, received())).toEqual({
      kind: "create",
    });
  });

  it("creates when the same title was applied to outside the window", () => {
    const apps = [new AppBuilder("a", "Stripe").applied(90).build()];
    expect(match(apps, { company: "Stripe", position: "Software Engineer" }, received())).toEqual({
      kind: "create",
    });
  });

  it("asks for review when the position is unknown and the company has a recent application", () => {
    const apps = [new AppBuilder("a", "Stripe").applied(3).build()];
    expect(match(apps, { company: "Stripe" }, received()).kind).toBe("ambiguous");
  });

  it("treats a matching ATS job ref as a duplicate", () => {
    const apps = [
      new AppBuilder("a", "Stripe", "Engineer")
        .with({ atsJobRef: "greenhouse:stripe:123" })
        .applied(60)
        .build(),
    ];
    expect(
      match(apps, { company: "Stripe", atsJobRef: "greenhouse:stripe:123" }, received()),
    ).toEqual({
      kind: "duplicate",
      applicationId: "a",
    });
  });
});

describe("match: status emails", () => {
  it("matches the only open application at the company, even without a position", () => {
    const apps = [
      new AppBuilder("a", "Stripe").applied(10).build(),
      new AppBuilder("b", "Globex").applied(10).build(),
    ];
    expect(match(apps, { company: "stripe inc" }, status)).toEqual({
      kind: "match",
      applicationId: "a",
    });
  });

  it("picks the clearly best title among several open applications", () => {
    const apps = [
      new AppBuilder("a", "Stripe", "Software Engineer, Payments").applied(10).build(),
      new AppBuilder("b", "Stripe", "Product Designer").applied(10).build(),
    ];
    expect(
      match(apps, { company: "Stripe", position: "Software Engineer Payments" }, status),
    ).toEqual({
      kind: "match",
      applicationId: "a",
    });
  });

  it("asks for review when titles are too close to call", () => {
    const apps = [
      new AppBuilder("a", "Stripe", "Software Engineer, Payments").applied(10).build(),
      new AppBuilder("b", "Stripe", "Software Engineer, Billing").applied(10).build(),
    ];
    const r = match(apps, { company: "Stripe", position: "Software Engineer" }, status);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous")
      expect(r.candidates.map((c) => c.applicationId).sort()).toEqual(["a", "b"]);
  });

  it("asks for review when several open applications exist and no position is given", () => {
    const apps = [
      new AppBuilder("a", "Stripe", "Software Engineer").applied(10).build(),
      new AppBuilder("b", "Stripe", "Data Analyst").applied(10).build(),
    ];
    expect(match(apps, { company: "Stripe" }, status).kind).toBe("ambiguous");
  });

  it("uses a requisition number to break ties", () => {
    const apps = [
      new AppBuilder("a", "Stripe", "Software Engineer")
        .with({ reqNumber: "R-1" })
        .applied(10)
        .build(),
      new AppBuilder("b", "Stripe", "Software Engineer")
        .with({ reqNumber: "R-2" })
        .applied(10)
        .build(),
    ];
    expect(match(apps, { company: "Stripe", reqNumber: "r2" }, status)).toEqual({
      kind: "match",
      applicationId: "b",
    });
  });

  it("matches by company domain", () => {
    const apps = [
      new AppBuilder("a", "Stripe").with({ companyDomain: "stripe.com" }).applied(10).build(),
    ];
    expect(match(apps, { companyDomain: "www.stripe.com" }, status)).toEqual({
      kind: "match",
      applicationId: "a",
    });
  });

  it("returns none when no application exists for the company", () => {
    expect(match([], { company: "Stripe" }, status)).toEqual({ kind: "none" });
  });

  it("reports a closed application when nothing at the company is open", () => {
    const apps = [new AppBuilder("a", "Stripe").applied(30).closed("rejected", 10).build()];
    expect(match(apps, { company: "Stripe" }, status)).toEqual({
      kind: "closed",
      applicationId: "a",
    });
  });

  it("prefers a clearly better closed application over a dissimilar open one", () => {
    const apps = [
      new AppBuilder("closed", "Stripe", "Software Engineer")
        .applied(30)
        .closed("rejected", 10)
        .build(),
      new AppBuilder("open", "Stripe", "Data Analyst").applied(5).build(),
    ];
    expect(match(apps, { company: "Stripe", position: "Software Engineer" }, status)).toEqual({
      kind: "closed",
      applicationId: "closed",
    });
  });

  it("asks for review when the lone open application is clearly a different job", () => {
    const apps = [new AppBuilder("a", "Stripe", "Data Analyst").applied(5).build()];
    expect(match(apps, { company: "Stripe", position: "Product Designer" }, status).kind).toBe(
      "ambiguous",
    );
  });
});

describe("findRepeatedEvent", () => {
  const propose = (body: object, days = 0) =>
    ({ occurredAt: daysAgo(days), origin: "email", ...body }) as ProposedEvent;

  it("finds the same stage within the window", () => {
    const events = new AppBuilder("a").applied(20).advanced("interview", 5, "i").build().events;
    expect(findRepeatedEvent(events, propose({ type: "advanced", stage: "interview" }))?.id).toBe(
      "i",
    );
  });

  it("ignores the same stage outside the window", () => {
    const events = new AppBuilder("a").applied(40).advanced("interview", 30).build().events;
    expect(findRepeatedEvent(events, propose({ type: "advanced", stage: "interview" }))).toBeNull();
  });

  it("finds a second closing with the same outcome", () => {
    const events = new AppBuilder("a").applied(40).closed("rejected", 30, "r").build().events;
    expect(findRepeatedEvent(events, propose({ type: "closed", outcome: "rejected" }))?.id).toBe(
      "r",
    );
  });

  it("ignores voided events", () => {
    const events = new AppBuilder("a")
      .applied(20)
      .advanced("interview", 5, "i")
      .voided("i", 4)
      .build().events;
    expect(findRepeatedEvent(events, propose({ type: "advanced", stage: "interview" }))).toBeNull();
  });
});
