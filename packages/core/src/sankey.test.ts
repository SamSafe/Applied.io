import { describe, expect, it } from "vitest";
import { analytics } from "./analytics";
import { derive } from "./derive";
import { sankey, sankeyPath } from "./sankey";
import { AppBuilder, daysAgo, NOW } from "./testing";
import { DAY_MS } from "./time";
import { DEFAULT_SETTINGS } from "./types";

/** The worked example from docs/DATA_MODEL.md, verbatim. */
const worked = {
  A: new AppBuilder("A")
    .applied(60)
    .advanced("screen", 55)
    .advanced("interview", 50)
    .advanced("interview", 45)
    .advanced("offer", 40)
    .closed("accepted", 35),
  B: new AppBuilder("B").applied(40).advanced("screen", 35).closed("rejected", 30),
  C: new AppBuilder("C").applied(30).closed("rejected", 25),
  D: new AppBuilder("D").applied(30),
  E: new AppBuilder("E").applied(40).advanced("interview", 25),
  F: new AppBuilder("F").applied(3),
  G: new AppBuilder("G").applied(10).advanced("screen", 5),
  H: new AppBuilder("H")
    .applied(30)
    .advanced("screen", 25, "h-s")
    .voided("h-s", 24)
    .closed("rejected", 20),
};
const apps = Object.values(worked).map((b) => b.build());

describe("sankeyPath (DATA_MODEL worked example)", () => {
  const path = (b: AppBuilder) => sankeyPath(derive(b.build(), NOW, DEFAULT_SETTINGS));

  it.each([
    ["A", ["applied", "screen", "interview", "offer", "accepted"]],
    ["B", ["applied", "screen", "rejected"]],
    ["C", ["applied", "rejected"]],
    ["D", ["applied", "no_response"]],
    ["E", ["applied", "interview", "ghosted"]],
    ["F", ["applied", "awaiting_reply"]],
    ["G", ["applied", "screen"]],
    ["H", ["applied", "rejected"]],
  ] as const)("%s", (key, expected) => {
    expect(path(worked[key])).toEqual(expected);
  });

  it("collapses out-of-order lower stages", () => {
    const b = new AppBuilder("x").applied(20).advanced("interview", 10).advanced("screen", 5);
    expect(path(b)).toEqual(["applied", "interview"]);
  });

  it("ends at 'withdrew' and 'declined'", () => {
    expect(path(new AppBuilder("w").applied(9).closed("withdrawn", 2))).toEqual([
      "applied",
      "withdrawn",
    ]);
    expect(path(new AppBuilder("y").applied(9).advanced("offer", 4).closed("declined", 2))).toEqual(
      ["applied", "offer", "declined"],
    );
  });
});

describe("sankey", () => {
  it("emits the documented SankeyMATIC text", () => {
    expect(sankey(apps, NOW, DEFAULT_SETTINGS).sankeymatic).toBe(
      [
        "Applied [3] Screen",
        "Applied [2] Rejected",
        "Applied [1] Interview",
        "Applied [1] No response",
        "Applied [1] Awaiting reply",
        "Screen [1] Interview",
        "Screen [1] Rejected",
        "Interview [1] Offer",
        "Interview [1] Ghosted",
        "Offer [1] Accepted",
      ].join("\n"),
    );
  });

  it("returns d3-sankey nodes and links that agree with the text", () => {
    const { nodes, links } = sankey(apps, NOW, DEFAULT_SETTINGS);
    const fromApplied = links
      .filter((l) => nodes[l.source]?.name === "Applied")
      .reduce((sum, l) => sum + l.value, 0);
    expect(fromApplied).toBe(apps.length);
    expect(new Set(nodes.map((n) => n.name)).size).toBe(nodes.length);
  });

  it("merges nodes that share a label", () => {
    const { sankeymatic } = sankey(apps, NOW, DEFAULT_SETTINGS, {
      labels: { no_response: "Ghosted" },
    });
    expect(sankeymatic).toContain("Applied [1] Ghosted");
    expect(sankeymatic).toContain("Interview [1] Ghosted");
    expect(sankeymatic).not.toContain("No response");
  });

  it("filters by applied date", () => {
    const { links, nodes } = sankey(apps, NOW, DEFAULT_SETTINGS, { since: daysAgo(35) });
    const fromApplied = links
      .filter((l) => nodes[l.source]?.name === "Applied")
      .reduce((sum, l) => sum + l.value, 0);
    expect(fromApplied).toBe(5); // C, D, F, G, H
  });

  it("is empty with no applications", () => {
    expect(sankey([], NOW, DEFAULT_SETTINGS)).toEqual({ nodes: [], links: [], sankeymatic: "" });
  });
});

describe("analytics (worked example)", () => {
  const a = analytics(apps, NOW, DEFAULT_SETTINGS);

  it("counts responses, interviews and offers", () => {
    expect(a.applications).toBe(8);
    expect(a.responded).toBe(6); // A B C E G H
    expect(a.responseRate).toBe(0.75);
    expect(a.interviewed).toBe(2); // A E
    expect(a.offers).toBe(1); // A
  });

  it("uses applications older than the threshold as the ghost denominator", () => {
    expect(a.ghosted).toBe(2); // D E
    expect(a.ghostEligible).toBe(6); // all but F G
    expect(a.ghostRate).toBeCloseTo(2 / 6);
  });

  it("builds a monotonic funnel", () => {
    expect(a.funnel).toEqual({ applied: 8, screen: 4, interview: 2, final: 1, offer: 1 });
  });

  it("reports the median time to first response", () => {
    expect(a.medianTimeToFirstResponseMs).toBe(5 * DAY_MS);
  });

  it("returns null rates with no data", () => {
    const empty = analytics([], NOW, DEFAULT_SETTINGS);
    expect(empty.responseRate).toBeNull();
    expect(empty.ghostRate).toBeNull();
    expect(empty.medianTimeToFirstResponseMs).toBeNull();
  });
});

describe("sankey node ids", () => {
  it("names the built-in nodes behind each label, merged ones included", () => {
    const { nodes } = sankey(apps, NOW, DEFAULT_SETTINGS, { labels: { no_response: "Ghosted" } });
    expect(nodes.find((n) => n.name === "Applied")?.ids).toEqual(["applied"]);
    expect(nodes.find((n) => n.name === "Ghosted")?.ids).toEqual(["no_response", "ghosted"]);
  });
});
