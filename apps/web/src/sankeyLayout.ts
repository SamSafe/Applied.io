import { type SankeyLink, type SankeyNode, sankey, sankeyLinkHorizontal } from "d3-sankey";

/** The API's Sankey (core's shape): nodes by name, links by node index. */
export interface SankeyData {
  nodes: { name: string }[];
  links: { source: number; target: number; value: number }[];
  sankeymatic: string;
}

type Node = { name: string };
type Link = { value: number };
export type LaidNode = SankeyNode<Node, Link> & { color: string; column: number };
export type LaidLink = SankeyLink<Node, Link> & { color: string; path: string };

/** Funnel stages get their own columns, in order; every outcome shares the last one. */
const STAGE_COLUMN: Record<string, number> = {
  Applied: 0,
  Screen: 1,
  Interview: 2,
  Final: 3,
  Offer: 4,
};

/** Outcome order within the last column: the hopeful ones first, then closures, then silence. */
const OUTCOME_ORDER = [
  "Accepted",
  "Declined",
  "Rejected",
  "Withdrew",
  "Ghosted",
  "No response",
  "Awaiting reply",
];

/** Node colour tokens (the fixed stage set, docs: DESIGN.md → The Fixed Stage Colour Rule). */
const NODE_TOKEN: Record<string, string> = {
  Applied: "--stage-applied",
  Screen: "--stage-screen",
  Interview: "--stage-interview",
  Final: "--stage-final",
  Offer: "--stage-offer",
  Accepted: "--stage-offer",
  Rejected: "--stage-rejected",
  Withdrew: "--stage-withdrawn",
  Declined: "--stage-withdrawn",
  Ghosted: "--stage-ghosted",
  "No response": "--stage-ghosted",
  "Awaiting reply": "--stage-applied",
};

/** Concrete colours from the CSS tokens, so the canvas export matches the screen exactly. */
export function nodeColor(name: string): string {
  const token = NODE_TOKEN[name] ?? "--stage-applied";
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || "#66717d";
}

export interface LayoutOptions {
  width: number;
  height: number;
  /** Room on the right for the outcome column's labels. */
  labelSpace?: number;
  nodeWidth?: number;
  top?: number;
  left?: number;
}

export function layoutSankey(data: SankeyData, opts: LayoutOptions) {
  const { width, height, labelSpace = 140, nodeWidth = 12, top = 6, left = 2 } = opts;
  const present = [
    ...new Set(data.nodes.map((n) => STAGE_COLUMN[n.name]).filter((c) => c !== undefined)),
  ].sort();
  const compact = new Map(present.map((c, i) => [c, i]));
  const lastColumn = present.length;
  const columnOf = (name: string) => {
    const stage = STAGE_COLUMN[name];
    return stage === undefined ? lastColumn : (compact.get(stage) as number);
  };
  const order = (name: string) => {
    const stage = STAGE_COLUMN[name];
    return stage !== undefined ? stage : 10 + Math.max(0, OUTCOME_ORDER.indexOf(name));
  };

  const generator = sankey<Node, Link>()
    .nodeWidth(nodeWidth)
    .nodePadding(14)
    .nodeAlign((node) => columnOf(node.name))
    .nodeSort((a, b) => order(a.name) - order(b.name))
    .extent([
      [left, top],
      [Math.max(width - labelSpace, left + 200), height - top],
    ]);

  const graph = generator({
    nodes: data.nodes.map((n) => ({ ...n })),
    links: data.links.map((l) => ({ ...l })),
  });

  // d3-sankey caps its columns at the longest path, so an open offer would land in the
  // outcomes column. Place every node in its own stage column instead; only x changes, so the
  // vertical layout and link widths stay valid.
  const innerRight = Math.max(width - labelSpace, left + 200);
  const step = lastColumn > 0 ? (innerRight - left - nodeWidth) / lastColumn : 0;
  const nodes = graph.nodes.map((n) => {
    const column = columnOf(n.name);
    const x0 = left + column * step;
    return Object.assign(n, { color: nodeColor(n.name), column, x0, x1: x0 + nodeWidth });
  }) as LaidNode[];
  const path = sankeyLinkHorizontal<Node, Link>();
  const links = graph.links.map((l) =>
    Object.assign(l, {
      color: (l.source as LaidNode).color,
      path: path(l) ?? "",
    }),
  ) as LaidLink[];
  return { nodes, links };
}
