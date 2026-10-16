import { describe, expect, it } from "vitest";
import { AppBuilder, daysAgo } from "./testing";
import type { ProposedEvent } from "./types";
import { validate } from "./validate";

const at = daysAgo(0);
const propose = (body: object) => ({ occurredAt: at, origin: "manual", ...body }) as ProposedEvent;
const codeOf = (events: AppBuilder, body: object) => {
  const r = validate(events.build().events, propose(body));
  return r.ok ? "ok" : r.code;
};

describe("validate", () => {
  it("allows applied only as the first event", () => {
    expect(codeOf(new AppBuilder("a"), { type: "applied" })).toBe("ok");
    expect(codeOf(new AppBuilder("a").applied(5), { type: "applied" })).toBe("applied_not_first");
  });

  it("rejects events on an application with no applied event", () => {
    expect(codeOf(new AppBuilder("a"), { type: "noted" })).toBe("missing_applied");
  });

  it("allows advancing an open application, including repeat rounds and lower stages", () => {
    const open = new AppBuilder("a").applied(10).advanced("interview", 5);
    expect(codeOf(open, { type: "advanced", stage: "interview" })).toBe("ok");
    expect(codeOf(open, { type: "advanced", stage: "screen" })).toBe("ok");
  });

  it("blocks advancing or closing a closed application", () => {
    const closed = new AppBuilder("a").applied(10).closed("rejected", 5);
    expect(codeOf(closed, { type: "advanced", stage: "screen" })).toBe("application_closed");
    expect(codeOf(closed, { type: "closed", outcome: "withdrawn" })).toBe("application_closed");
  });

  it("allows actions again after the closing event is voided", () => {
    const reopened = new AppBuilder("a").applied(10).closed("rejected", 5, "r").voided("r", 4);
    expect(codeOf(reopened, { type: "advanced", stage: "screen" })).toBe("ok");
  });

  it("allows notes on closed applications", () => {
    expect(codeOf(new AppBuilder("a").applied(10).closed("rejected", 5), { type: "noted" })).toBe(
      "ok",
    );
  });

  it("allows accept/decline only after an offer", () => {
    const interviewing = new AppBuilder("a").applied(10).advanced("interview", 5);
    expect(codeOf(interviewing, { type: "closed", outcome: "accepted" })).toBe("offer_not_reached");
    expect(codeOf(interviewing, { type: "closed", outcome: "declined" })).toBe("offer_not_reached");
    expect(codeOf(interviewing, { type: "closed", outcome: "rejected" })).toBe("ok");
    const offered = interviewing.advanced("offer", 2);
    expect(codeOf(offered, { type: "closed", outcome: "accepted" })).toBe("ok");
  });

  it("does not count a voided offer", () => {
    const b = new AppBuilder("a").applied(10).advanced("offer", 5, "o").voided("o", 4);
    expect(codeOf(b, { type: "closed", outcome: "accepted" })).toBe("offer_not_reached");
  });

  describe("voiding", () => {
    const base = () => new AppBuilder("a").applied(10, "ap").advanced("screen", 5, "s");

    it("voids an existing event", () => {
      expect(codeOf(base(), { type: "voided", voidsEventId: "s" })).toBe("ok");
    });

    it("rejects unknown targets", () => {
      expect(codeOf(base(), { type: "voided", voidsEventId: "nope" })).toBe("void_target_missing");
    });

    it("never voids the applied event", () => {
      expect(codeOf(base(), { type: "voided", voidsEventId: "ap" })).toBe("void_target_applied");
    });

    it("rejects voiding twice", () => {
      const b = base().voided("s", 4, "v");
      expect(codeOf(b, { type: "voided", voidsEventId: "s" })).toBe("void_target_already_voided");
    });

    it("rejects voiding a void", () => {
      const b = base().voided("s", 4, "v");
      expect(codeOf(b, { type: "voided", voidsEventId: "v" })).toBe("void_target_is_void");
    });
  });
});
