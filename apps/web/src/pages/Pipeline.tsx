import { Inbox, Plus } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Link, useLocation, useRoute, useSearch } from "wouter";
import type { Counts, StatusFilter, Summary } from "../api";
import { CopyButton, ErrorBanner, StageChip } from "../components/bits";
import { Axis, sharedScale, TrackBar } from "../components/TrackBar";
import { isGreyed, statusChip, statusPhrase } from "../format";
import {
  useApplications,
  useCreateForwarding,
  useMailSources,
  useMarkSeen,
  useTimeZone,
} from "../hooks";
import { DetailPanel } from "./Detail";
import { NewApplicationPanel } from "./NewApplication";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "updates", label: "Updates" },
  { id: "ghosted", label: "Ghosted" },
  { id: "closed", label: "Closed" },
];

const isFilter = (v: string | null): v is StatusFilter => FILTERS.some((f) => f.id === v);

export function Pipeline() {
  const [, detail] = useRoute("/a/:id");
  const [isNew] = useRoute("/new");
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const statusParam = params.get("status");
  const status: StatusFilter = isFilter(statusParam) ? statusParam : "all";
  const q = params.get("q") ?? "";
  const keep = search ? `?${search}` : "";

  const list = useApplications(status, q);
  const selectedId = detail?.id ?? null;
  const hasPanel = selectedId !== null || isNew;

  useEffect(() => {
    if (!hasPanel) return;
    const onKey = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" &&
        !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)
      ) {
        navigate(`/${keep}`);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasPanel, keep, navigate]);

  return (
    <div className={`pipeline${hasPanel ? " has-panel" : ""}`}>
      <section className="pipeline-list" aria-labelledby="pipeline-title">
        <PageHead counts={list.data?.counts} />
        {list.data && list.data.counts.updates > 0 && (
          <UpdatesStrip count={list.data.counts.updates} />
        )}
        <Tabs status={status} counts={list.data?.counts} search={params} />
        {list.error ? (
          <div style={{ marginTop: "1rem" }}>
            <ErrorBanner error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : !list.data ? (
          <Board>
            <SkeletonRows />
          </Board>
        ) : list.data.counts.all === 0 ? (
          <Board>
            <Onboarding />
          </Board>
        ) : list.data.applications.length === 0 ? (
          <Board>
            <FilteredEmpty status={status} q={q} />
          </Board>
        ) : (
          <Rows apps={list.data.applications} selectedId={selectedId} keep={keep} />
        )}
      </section>
      {selectedId && <DetailPanel key={selectedId} id={selectedId} closeHref={`/${keep}`} />}
      {isNew && <NewApplicationPanel closeHref={`/${keep}`} />}
    </div>
  );
}

function PageHead({ counts }: { counts?: Counts }) {
  return (
    <div className="page-head">
      <div>
        <h1 id="pipeline-title" className="page-title">
          Pipeline
        </h1>
        <p className="page-sub num">
          {counts
            ? `${counts.all} ${counts.all === 1 ? "application" : "applications"} · ${counts.open} open · ${counts.ghosted} ghosted`
            : " "}
        </p>
      </div>
    </div>
  );
}

function UpdatesStrip({ count }: { count: number }) {
  const markSeen = useMarkSeen();
  return (
    <div className="updates-strip" role="status">
      <p>
        <span className="scan-dot" aria-hidden="true" />
        {count} {count === 1 ? "application has" : "applications have"} news since your last visit
      </p>
      <Link href="/?status=updates" className="btn btn-small">
        Show {count === 1 ? "it" : "them"}
      </Link>
      <button
        type="button"
        className="btn btn-small"
        disabled={markSeen.isPending}
        onClick={() => markSeen.mutate(null)}
      >
        Mark all seen
      </button>
    </div>
  );
}

function Tabs({
  status,
  counts,
  search,
}: {
  status: StatusFilter;
  counts?: Counts;
  search: URLSearchParams;
}) {
  return (
    <nav className="tabs" aria-label="Filter applications">
      {FILTERS.map((f) => {
        const next = new URLSearchParams(search);
        if (f.id === "all") next.delete("status");
        else next.set("status", f.id);
        const qs = next.toString();
        const count = counts?.[f.id];
        return (
          <Link
            key={f.id}
            href={`/${qs ? `?${qs}` : ""}`}
            className="tab"
            aria-current={status === f.id ? "page" : undefined}
          >
            {f.label}
            {count !== undefined && (
              <span className={`tab-count num${f.id === "updates" && count > 0 ? " is-news" : ""}`}>
                {count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function Board({ children }: { children: React.ReactNode }) {
  return <div className="board">{children}</div>;
}

function Rows({
  apps,
  selectedId,
  keep,
}: {
  apps: Summary[];
  selectedId: string | null;
  keep: string;
}) {
  const timeZone = useTimeZone();
  const now = Date.now();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the axis only moves when the rows do
  const scale = useMemo(() => sharedScale(apps, now), [apps]);

  return (
    <Board>
      <div className="board-axis board-grid">
        <span>Application</span>
        <Axis scale={scale} now={now} timeZone={timeZone} />
        <span>Status</span>
      </div>
      {apps.map((app) => (
        <Link
          key={app.id}
          href={`/a/${app.id}${keep}`}
          className={`row board-grid${isGreyed(app.status) ? " is-closed" : ""}`}
          aria-current={app.id === selectedId ? "true" : undefined}
        >
          <div className="row-info">
            <div className="row-company">
              <span>{app.company}</span>
              {app.updates > 0 && <span className="new-pill">New</span>}
            </div>
            <div className="row-role">{app.position}</div>
          </div>
          <TrackBar app={app} scale={scale} now={now} />
          <div className="row-status">
            <StageChip
              chip={
                isGreyed(app.status)
                  ? { ...statusChip(app), color: "var(--closed)" }
                  : statusChip(app)
              }
            />
            <span className="row-when num">{statusPhrase(app, timeZone, now)}</span>
          </div>
        </Link>
      ))}
    </Board>
  );
}

function SkeletonRows() {
  return (
    <div role="status" aria-busy="true">
      <span className="visually-hidden">Loading applications</span>
      {[62, 48, 70, 55, 40].map((w) => (
        <div key={w} className="row board-grid skeleton-row">
          <div style={{ display: "grid", gap: 8 }}>
            <span className="skeleton" style={{ width: `${w}%` }} />
            <span className="skeleton" style={{ width: `${w + 20}%`, height: 10 }} />
          </div>
          <span
            className="skeleton"
            style={{ width: `${w}%`, height: 4, marginLeft: `${100 - w - 10}%` }}
          />
          <span className="skeleton" style={{ width: "60%" }} />
        </div>
      ))}
    </div>
  );
}

function FilteredEmpty({ status, q }: { status: StatusFilter; q: string }) {
  const message = q
    ? `No applications match “${q}”.`
    : {
        all: "No applications yet.",
        open: "No open applications right now.",
        updates: "Nothing new since your last visit.",
        ghosted: "No ghosted applications right now.",
        closed: "No closed applications yet.",
      }[status];
  return (
    <div className="empty">
      <p>{message}</p>
      <Link href="/" className="btn btn-small">
        Show all applications
      </Link>
    </div>
  );
}

/** First run: teach the two ways in, forwarding first. */
function Onboarding() {
  const sources = useMailSources();
  const create = useCreateForwarding();
  const address = sources.data?.find((s) => s.kind === "forwarding" && s.address)?.address;

  return (
    <div className="empty">
      <h2>Your pipeline is empty</h2>
      <p>
        Forward job emails to your private address and Applied builds each application's history
        from them: the confirmation starts it, interviews and rejections move it along.
      </p>
      {address ? (
        <div className="address">
          <Inbox width={16} height={16} aria-hidden="true" />
          <code>{address}</code>
          <CopyButton text={address} />
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={create.isPending || sources.isLoading}
          onClick={() => create.mutate()}
        >
          <Inbox />
          Get my forwarding address
        </button>
      )}
      <Link href="/settings#forwarding" className="btn btn-small btn-quiet">
        Set up forwarding from Gmail or Outlook
      </Link>
      <p className="field-hint">Or add one by hand. Applications you add work exactly the same.</p>
      <Link href="/new" className="btn">
        <Plus />
        Add application
      </Link>
    </div>
  );
}
