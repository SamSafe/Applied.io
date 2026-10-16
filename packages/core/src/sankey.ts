import { deriveInRange, type Range } from "./analytics";
import { type Derived, stageRank } from "./derive";
import type { Application, Settings, Stage } from "./types";

/** Every node the chart can contain, in display order (also the tie-break order). */
export const SANKEY_NODES = [
  "applied",
  "screen",
  "interview",
  "final",
  "offer",
  "rejected",
  "withdrawn",
  "accepted",
  "declined",
  "no_response",
  "ghosted",
  "awaiting_reply",
] as const;
export type SankeyNodeId = (typeof SANKEY_NODES)[number];

export const DEFAULT_SANKEY_LABELS: Record<SankeyNodeId, string> = {
  applied: "Applied",
  screen: "Screen",
  interview: "Interview",
  final: "Final",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrew",
  accepted: "Accepted",
  declined: "Declined",
  no_response: "No response",
  ghosted: "Ghosted",
  awaiting_reply: "Awaiting reply",
};

export interface SankeyNode {
  /** Unique label; nodes that share a label are merged, as SankeyMATIC does. */
  name: string;
}

export interface SankeyLink {
  /** Index into `nodes`. */
  source: number;
  target: number;
  value: number;
}

export interface Sankey {
  nodes: SankeyNode[];
  links: SankeyLink[];
  /** Paste-ready input for sankeymatic.com. */
  sankeymatic: string;
}

export interface SankeyOptions extends Range {
  labels?: Partial<Record<SankeyNodeId, string>>;
}

const OUTCOME_NODE = {
  rejected: "rejected",
  withdrawn: "withdrawn",
  accepted: "accepted",
  declined: "declined",
} as const satisfies Record<string, SankeyNodeId>;

/** The node path one application takes. Rules: docs/DATA_MODEL.md → "Sankey derivation". */
export function sankeyPath(derived: Derived): SankeyNodeId[] {
  const path: SankeyNodeId[] = ["applied"];
  let last: Stage = "applied";
  for (const e of derived.live) {
    if (e.type === "advanced" && stageRank(e.stage) > stageRank(last)) {
      path.push(e.stage);
      last = e.stage;
    }
  }

  if (derived.status.state === "closed") {
    path.push(OUTCOME_NODE[derived.status.outcome]);
  } else if (derived.isStale) {
    path.push(last === "applied" ? "no_response" : "ghosted");
  } else if (last === "applied") {
    path.push("awaiting_reply");
  }
  return path;
}

export function sankey(
  apps: readonly Application[],
  now: Date,
  settings: Settings,
  options: SankeyOptions = {},
): Sankey {
  const labels = { ...DEFAULT_SANKEY_LABELS, ...options.labels };
  const order = (id: SankeyNodeId) => SANKEY_NODES.indexOf(id);

  // Count edges by label so renamed nodes merge, remembering each label's earliest node for ordering.
  const labelRank = new Map<string, number>();
  const counts = new Map<string, { from: string; to: string; value: number }>();
  for (const { derived } of deriveInRange(apps, now, settings, options)) {
    const path = sankeyPath(derived);
    for (const id of path) {
      const name = labels[id];
      labelRank.set(name, Math.min(labelRank.get(name) ?? Infinity, order(id)));
    }
    for (let i = 1; i < path.length; i++) {
      const from = labels[path[i - 1] as SankeyNodeId];
      const to = labels[path[i] as SankeyNodeId];
      if (from === to) continue;
      const key = `${from}\u0000${to}`;
      const edge = counts.get(key) ?? { from, to, value: 0 };
      edge.value++;
      counts.set(key, edge);
    }
  }

  const rank = (name: string) => labelRank.get(name) ?? Infinity;
  const edges = [...counts.values()].sort(
    (a, b) => rank(a.from) - rank(b.from) || b.value - a.value || rank(a.to) - rank(b.to),
  );

  const names = [...labelRank.keys()].sort((a, b) => rank(a) - rank(b));
  const index = new Map(names.map((name, i) => [name, i]));

  return {
    nodes: names.map((name) => ({ name })),
    links: edges.map((e) => ({
      source: index.get(e.from) as number,
      target: index.get(e.to) as number,
      value: e.value,
    })),
    sankeymatic: edges.map((e) => `${e.from} [${e.value}] ${e.to}`).join("\n"),
  };
}
