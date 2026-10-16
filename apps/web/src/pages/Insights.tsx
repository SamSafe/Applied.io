import { Check, Copy, Download, Table2 } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import type { Stats } from "../api";
import { ErrorBanner } from "../components/bits";
import { exportSankeyPng } from "../exportPng";
import { DAY_MS } from "../format";
import { useInsights } from "../hooks";
import { type LaidLink, type LaidNode, layoutSankey, type SankeyData } from "../sankeyLayout";

const RANGES = [
  { id: "all", label: "All time", days: null },
  { id: "90", label: "Last 90 days", days: 90 },
  { id: "30", label: "Last 30 days", days: 30 },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

export function InsightsPage() {
  const [range, setRange] = useState<RangeId>("all");
  const since = useMemo(() => {
    const days = RANGES.find((r) => r.id === range)?.days ?? null;
    return days === null ? null : new Date(Date.now() - days * DAY_MS).toISOString();
  }, [range]);
  const insights = useInsights(since);
  const data = insights.data;
  const loading = insights.isFetching && insights.isPlaceholderData;

  return (
    <div className="insights">
      <div className="page-head">
        <div>
          <h1 className="page-title">Insights</h1>
          <p className="page-sub">How your search is going, and the chart to share.</p>
        </div>
      </div>

      {/* One filter row above everything it scopes. */}
      <div className="filter-row">
        <div className="segmented" role="tablist" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={range === r.id}
              className="segment"
              onClick={() => setRange(r.id)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <span className="field-hint">By the date you applied.</span>
      </div>

      {insights.error && <ErrorBanner error={insights.error} onRetry={() => insights.refetch()} />}
      {data && data.stats.applications === 0 ? (
        <div className="board">
          <div className="empty">
            <h2>No applications in this range</h2>
            <p>Add applications or forward job emails, and your numbers and Sankey appear here.</p>
            <Link href="/" className="btn btn-small">
              Go to the pipeline
            </Link>
          </div>
        </div>
      ) : (
        data && (
          <div className={`insights-body${loading ? " is-refreshing" : ""}`}>
            <StatRow stats={data.stats} />
            <SankeyCard
              data={data.sankey}
              stats={data.stats}
              rangeLabel={RANGES.find((r) => r.id === range)?.label ?? ""}
            />
          </div>
        )
      )}
    </div>
  );
}

const pct = (r: number | null) => (r === null ? "–" : `${Math.round(r * 100)}%`);
const days = (ms: number | null) => (ms === null ? "–" : `${Math.round(ms / DAY_MS)}`);

function StatRow({ stats }: { stats: Stats }) {
  const tiles = [
    {
      label: "Applications",
      value: String(stats.applications),
      note: `${stats.funnel.screen} reached a screen`,
    },
    {
      label: "Response rate",
      value: pct(stats.responseRate),
      note: `${stats.responded} of ${stats.applications} heard back`,
    },
    {
      label: "Interview rate",
      value: pct(stats.interviewRate),
      note: `${stats.interviewed} reached an interview`,
    },
    {
      label: "Offer rate",
      value: pct(stats.offerRate),
      note: `${stats.offers} ${stats.offers === 1 ? "offer" : "offers"}`,
    },
    {
      label: "Ghost rate",
      value: pct(stats.ghostRate),
      note: `${stats.ghosted} of ${stats.ghostEligible} old enough to tell`,
    },
    {
      label: "First response",
      value: days(stats.medianTimeToFirstResponseMs),
      unit: stats.medianTimeToFirstResponseMs === null ? "" : "days",
      note: "median wait for news",
    },
  ];
  return (
    <section className="stat-row" aria-label="Summary">
      {tiles.map((t) => (
        <div key={t.label} className="stat">
          <span className="stat-label">{t.label}</span>
          <span className="stat-value">
            {t.value}
            {"unit" in t && t.unit && <span className="stat-unit"> {t.unit}</span>}
          </span>
          <span className="stat-note">{t.note}</span>
        </div>
      ))}
    </section>
  );
}

type Hover = { x: number; y: number; title: string; value: number } | null;

function SankeyCard({
  data,
  stats,
  rangeLabel,
}: {
  data: SankeyData;
  stats: Stats;
  rangeLabel: string;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<Hover>(null);
  const [asTable, setAsTable] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);

  useLayoutEffect(() => {
    const el = frame.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Narrow screens scroll the chart sideways rather than crush six columns into a phone.
  const chartWidth = Math.max(width, 640);
  const height = Math.max(320, Math.min(520, 120 + data.nodes.length * 34));
  const layout = useMemo(
    () => (width > 0 ? layoutSankey(data, { width: chartWidth, height }) : null),
    [data, chartWidth, height, width],
  );

  const total = data.links
    .filter((l) => data.nodes[l.source]?.name === "Applied")
    .reduce((s, l) => s + l.value, 0);

  const download = async () => {
    setExporting(true);
    setExportError(null);
    try {
      const blob = await exportSankeyPng(data, {
        title: "My job search",
        subtitle: `${total} applications · ${rangeLabel.toLowerCase()}`,
        headline: [
          `${pct(stats.responseRate)} heard back`,
          `${stats.interviewed} ${stats.interviewed === 1 ? "interview" : "interviews"}`,
          `${stats.offers} ${stats.offers === 1 ? "offer" : "offers"}`,
        ].join(" · "),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "job-search-sankey.png";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err);
    } finally {
      setExporting(false);
    }
  };

  const show = (
    e: React.MouseEvent | React.FocusEvent | React.KeyboardEvent,
    title: string,
    value: number,
  ) => {
    const box = frame.current?.getBoundingClientRect();
    const target = (e.target as Element).getBoundingClientRect();
    const point =
      "clientX" in e
        ? { x: e.clientX, y: e.clientY }
        : { x: target.left + target.width / 2, y: target.top };
    setHover({ x: point.x - (box?.left ?? 0), y: point.y - (box?.top ?? 0), title, value });
  };

  return (
    <figure className="chart-card">
      <figcaption className="chart-head">
        <div>
          <h2 className="section-title">Where your applications went</h2>
          <p className="field-hint">
            {total} applications, from applying to today. Hover a flow for its count.
          </p>
        </div>
        <div className="chart-actions">
          <button
            type="button"
            className="btn btn-small"
            onClick={() => setAsTable((v) => !v)}
            aria-pressed={asTable}
          >
            <Table2 />
            {asTable ? "Show chart" : "Show as table"}
          </button>
          <button
            type="button"
            className="btn btn-small"
            onClick={async () => {
              await navigator.clipboard.writeText(data.sankeymatic);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy for SankeyMATIC"}
          </button>
          <button
            type="button"
            className="btn btn-small btn-primary"
            disabled={exporting}
            onClick={download}
          >
            <Download />
            {exporting ? "Preparing…" : "Download PNG"}
          </button>
        </div>
      </figcaption>
      {exportError !== null && <ErrorBanner error={exportError} />}

      {asTable ? (
        <FlowTable data={data} />
      ) : (
        <div className="chart-frame" ref={frame} onPointerLeave={() => setHover(null)}>
          {layout && (
            <svg
              width={chartWidth}
              height={height}
              viewBox={`0 0 ${chartWidth} ${height}`}
              role="img"
              aria-label={`Sankey diagram of ${total} applications. Use "Show as table" for the numbers.`}
            >
              <g className="sankey-links">
                {layout.links.map((l) => (
                  // biome-ignore lint/a11y/useSemanticElements: an SVG path can't be a <button>
                  <path
                    key={`${l.index}`}
                    d={l.path}
                    stroke={l.color}
                    strokeWidth={Math.max(1.5, l.width ?? 1)}
                    className="sankey-link"
                    role="button"
                    tabIndex={0}
                    aria-label={`${linkTitle(l)}: ${l.value}`}
                    onPointerMove={(e) => show(e, linkTitle(l), l.value)}
                    onFocus={(e) => show(e, linkTitle(l), l.value)}
                    // Touch screens have no hover: a tap (or Enter) shows the count too.
                    onClick={(e) => show(e, linkTitle(l), l.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        show(e, linkTitle(l), l.value);
                      }
                    }}
                    onBlur={() => setHover(null)}
                  />
                ))}
              </g>
              <g>
                {layout.nodes.map((n) => (
                  <NodeMark key={n.name} node={n} onHover={(e) => show(e, n.name, n.value ?? 0)} />
                ))}
              </g>
            </svg>
          )}
          {hover && (
            <div className="chart-tooltip" style={{ left: hover.x, top: hover.y }} role="status">
              <strong className="num">{hover.value}</strong>
              <span>{hover.title}</span>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

function linkTitle(l: LaidLink): string {
  return `${(l.source as LaidNode).name} → ${(l.target as LaidNode).name}`;
}

function NodeMark({ node, onHover }: { node: LaidNode; onHover: (e: React.PointerEvent) => void }) {
  const x0 = node.x0 ?? 0;
  const x1 = node.x1 ?? 0;
  const y0 = node.y0 ?? 0;
  const y1 = node.y1 ?? 0;
  const mid = (y0 + y1) / 2;
  return (
    <g className="sankey-node" onPointerMove={onHover}>
      <rect x={x0} y={y0} width={x1 - x0} height={Math.max(2, y1 - y0)} rx={2} fill={node.color} />
      {/* Every node is labelled, so identity never rests on colour alone. */}
      <text x={x1 + 8} y={mid - 7} className="sankey-label" dominantBaseline="middle">
        {node.name}
      </text>
      <text x={x1 + 8} y={mid + 10} className="sankey-count" dominantBaseline="middle">
        {node.value}
      </text>
    </g>
  );
}

function FlowTable({ data }: { data: SankeyData }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">From</th>
            <th scope="col">To</th>
            <th scope="col" className="num-col">
              Applications
            </th>
          </tr>
        </thead>
        <tbody>
          {data.links.map((l) => (
            <tr key={`${l.source}-${l.target}`}>
              <td>{data.nodes[l.source]?.name}</td>
              <td>{data.nodes[l.target]?.name}</td>
              <td className="num-col num">{l.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
