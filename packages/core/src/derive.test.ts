import { describe, expect, it } from "vitest";
import { derive, liveEvents, unseenEvents } from "./derive";
import { AppBuilder, daysAgo, NOW } from "./testing";
import { DAY_MS } from "./time";
import { DEFAULT_SETTINGS } from "./types";

const d = (b: AppBuilder) => derive(b.build(), NOW, DEFAULT_SETTINGS);

describe("liveEvents", () => {
  it("drops voided targets and the voided markers, and sorts by time", () => {
    const app = new AppBuilder("a")
      .applied(10)
      .advanced("interview", 2, "late")
      .advanced("screen", 5, "s")
      .voided("s", 4)
      .build();
    expect(liveEvents(app.events).map((e) => e.id)).toEqual(["a-1", "late"]);
  });

  it("breaks occurredAt ties by recordedAt", () => {
    const app = new AppBuilder("a").applied(10).noted(3, "n1").noted(3, "n2").build();
    expect(liveEvents(app.events).map((e) => e.id)).toEqual(["a-1", "n1", "n2"]);
  });
});

describe("unseenEvents", () => {
  const withEmail = () => {
    const app = new AppBuilder("a").applied(10).advanced("screen", 5, "s").noted(4, "n").build();
    // Mark the screen step and the note as email-originated, recorded at NOW + seq ms.
    return app.events.map((e) =>
      e.id === "s" || e.id === "n" ? { ...e, origin: "email" as const } : e,
    );
  };

  it("counts email events recorded after the last visit", () => {
    expect(unseenEvents(withEmail(), null).map((e) => e.id)).toEqual(["s", "n"]);
    expect(unseenEvents(withEmail(), daysAgo(1)).map((e) => e.id)).toEqual(["s", "n"]);
  });

  it("ignores everything recorded before the last visit", () => {
    const later = new Date(NOW.getTime() + 60_000).toISOString();
    expect(unseenEvents(withEmail(), later)).toEqual([]);
  });

  it("never counts manual events or voided ones", () => {
    const events = withEmail();
    expect(
      unseenEvents(
        events.filter((e) => e.origin === "manual"),
        null,
      ),
    ).toEqual([]);
    const voided = [
      ...events,
      {
        ...events[0],
        id: "v",
        type: "voided" as const,
        voidsEventId: "s",
        origin: "manual" as const,
      },
    ];
    expect(unseenEvents(voided as typeof events, null).map((e) => e.id)).toEqual(["n"]);
  });
});

describe("derive", () => {
  it("requires an applied event", () => {
    expect(() => d(new AppBuilder("x").noted(1))).toThrow(/no applied event/);
  });

  it("takes appliedAt from the applied event", () => {
    expect(d(new AppBuilder("a").applied(12)).appliedAt).toBe(daysAgo(12));
  });

  it("keeps the highest stage regardless of rounds or order", () => {
    const r = d(
      new AppBuilder("a")
        .applied(30)
        .advanced("interview", 20)
        .advanced("interview", 15)
        .advanced("screen", 10),
    );
    expect(r.maxStage).toBe("interview");
  });

  it("is closed with the last closing outcome, and reopens when it is voided", () => {
    const closed = new AppBuilder("a").applied(30).closed("rejected", 5, "rej");
    expect(d(closed).status).toEqual({
      state: "closed",
      outcome: "rejected",
      closedAt: daysAgo(5),
      eventId: "rej",
    });
    expect(d(closed.voided("rej", 4)).status).toEqual({ state: "open" });
  });

  it("ignores notes for last activity", () => {
    const r = d(new AppBuilder("a").applied(30).advanced("screen", 25).noted(1));
    expect(r.lastActivityAt).toBe(daysAgo(25));
  });

  describe("staleness (ghosting)", () => {
    it("is not stale at exactly the threshold", () => {
      expect(d(new AppBuilder("a").applied(21)).isStale).toBe(false);
    });

    it("is stale just past the threshold", () => {
      const app = new AppBuilder("a").applied(21).build();
      const later = new Date(NOW.getTime() + 60_000);
      expect(derive(app, later, DEFAULT_SETTINGS).isStale).toBe(true);
    });

    it("never marks closed applications stale", () => {
      expect(d(new AppBuilder("a").applied(90).closed("rejected", 80)).isStale).toBe(false);
    });

    it("un-ghosts when a new event arrives", () => {
      expect(d(new AppBuilder("a").applied(40)).isStale).toBe(true);
      expect(d(new AppBuilder("a").applied(40).advanced("screen", 1)).isStale).toBe(false);
    });

    it("respects the threshold setting", () => {
      const app = new AppBuilder("a").applied(10).build();
      expect(derive(app, NOW, { ghostThresholdDays: 7 }).isStale).toBe(true);
    });
  });

  describe("first response", () => {
    it("is the first advance or rejection", () => {
      const r = d(new AppBuilder("a").applied(20).advanced("screen", 14).closed("rejected", 3));
      expect(r.firstResponseAt).toBe(daysAgo(14));
      expect(r.timeToFirstResponseMs).toBe(6 * DAY_MS);
    });

    it("counts a direct rejection", () => {
      expect(d(new AppBuilder("a").applied(20).closed("rejected", 18)).timeToFirstResponseMs).toBe(
        2 * DAY_MS,
      );
    });

    it("does not count a withdrawal", () => {
      const r = d(new AppBuilder("a").applied(20).closed("withdrawn", 18));
      expect(r.firstResponseAt).toBeNull();
      expect(r.timeToFirstResponseMs).toBeNull();
    });

    it("ignores voided responses", () => {
      const r = d(new AppBuilder("a").applied(20).advanced("screen", 15, "s").voided("s", 14));
      expect(r.firstResponseAt).toBeNull();
    });
  });
});
