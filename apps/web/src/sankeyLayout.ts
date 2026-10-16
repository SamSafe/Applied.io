import type { SankeyNodeId } from "@apptracker/core";
import { type SankeyLink, type SankeyNode, sankey, sankeyLinkHorizontal } from "d3-sankey";

/** The API's Sankey (core's shape): nodes by name, links by node index. */
export interface SankeyData {
  nodes: { name: string; ids: SankeyNodeId[] }[];
  links: { source: number; target: number; value: number }[];
  sankeymatic: string;
}

type Node = { name: string; ids: SankeyNodeId[] };
type Link = { value: number };
export type LaidNode = SankeyNode<Node, Link> & { color: string; column: number };
export type LaidLink = SankeyLink<Node, Link> & { color: string; path: string };

/**
 * Columns and colours follow the built-in node behind each label, so renamed labels keep their
 * place. Funnel stages get their own columns, in order; every outcome shares the last one.
 */
const STAGE_COLUMN: Partial<Record<SankeyNodeId, number>> = {
  applied: 0,
  screen: 1,
  interview: 2,
  final: 3,
  offer: 4,
};

/** Outcome order within the last column: the hopeful ones first, then closures, then silence. */
const OUTCOME_ORDER: SankeyNodeId[] = [
  "accepted",
  "declined",
  "rejected",
  "withdrawn",
  "ghosted",
  "no_response",
  "awaiting_reply",
];

/** Node colour tokens (the fixed stage set, DESIGN.md → The Fixed Stage Colour Rule). */
const NODE_TOKEN: Record<SankeyNodeId, string> = {
  applied: "--stage-applied",
  screen: "--stage-screen",
  interview: "--stage-interview",
  final: "--stage-final",
  offer: "--stage-offer",
  accepted: "--stage-offer",
  rejected: "--stage-rejected",
  withdrawn: "--stage-withdrawn",
  declined: "--stage-withdrawn",
  ghosted: "--stage-ghosted",
  no_response: "--stage-ghosted",
  awaiting_reply: "--stage-applied",
};

const primary = (n: Node): SankeyNodeId => n.ids[0] ?? "applied";

/** Concrete colours from the CSS tokens, so the canvas export matches the screen exactly. */
export function nodeColor(id: SankeyNodeId): string {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(NODE_TOKEN[id]).trim() || "#66717d"
  );
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
    ...new Set(data.nodes.map((n) => STAGE_COLUMN[primary(n)]).filter((c) => c !== undefined)),
  ].sort();
  const compact = new Map(present.map((c, i) => [c, i]));
  const lastColumn = present.length;
  const columnOf = (n: Node) => {
    const stage = STAGE_COLUMN[primary(n)];
    return stage === undefined ? lastColumn : (compact.get(stage) as number);
  };
  const order = (n: Node) => {
    const stage = STAGE_COLUMN[primary(n)];
    return stage !== undefined ? stage : 10 + Math.max(0, OUTCOME_ORDER.indexOf(primary(n)));
  };

  const generator = sankey<Node, Link>()
    .nodeWidth(nodeWidth)
    .nodePadding(14)
    .nodeAlign((node) => columnOf(node))
    .nodeSort((a, b) => order(a) - order(b))
    .extent([
      [left, top],
      [Math.max(width - labelSpace, left + 200), height - top],
    ]);

  const graph = generator({
    nodes: data.nodes.map((n) => ({ ...n, ids: [...n.ids] })),
    links: data.links.map((l) => ({ ...l })),
  });

  // d3-sankey caps its columns at the longest path, so an open offer would land in the
  // outcomes column. Place every node in its own stage column instead; only x changes, so the
  // vertical layout and link widths stay valid.
  const innerRight = Math.max(width - labelSpace, left + 200);
  const step = lastColumn > 0 ? (innerRight - left - nodeWidth) / lastColumn : 0;
  const nodes = graph.nodes.map((n) => {
    const column = columnOf(n);
    const x0 = left + column * step;
    return Object.assign(n, { color: nodeColor(primary(n)), column, x0, x1: x0 + nodeWidth });
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
