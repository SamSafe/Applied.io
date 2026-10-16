import { STAGES, type Stage } from "@apptracker/core";
import { Check, Minus, X } from "lucide-react";
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import type { Summary, TrackStep } from "../api";
import { DAY_MS, isGreyed, OUTCOME_COLOR, STAGE_COLOR } from "../format";

/** A time window shared by every bar drawn against it. */
export interface Scale {
  start: number;
  end: number;
}

const MIN_SPAN = 21 * DAY_MS;
const MAX_SPAN = 180 * DAY_MS;

/**
 * One axis for the whole list, so bars compare: today sits at the right edge, and the left
 * edge reaches back to the oldest application shown (between three weeks and six months).
 */
export function sharedScale(apps: readonly Summary[], now: number): Scale {
  const oldest = Math.min(now - MIN_SPAN, ...apps.map((a) => Date.parse(a.appliedAt)));
  const start = Math.max(oldest, now - MAX_SPAN);
  const span = now - start;
  return { start: start - span * 0.03, end: now + span * 0.015 };
}

/** One application's own window, from applying to today (or to when it closed). */
export function ownScale(app: Summary, now: number): Scale {
  const start = Date.parse(app.appliedAt);
  const end = app.status.state === "closed" ? Date.parse(app.status.closedAt) : now;
  const span = Math.max(end - start, 2 * DAY_MS);
  return { start: start - span * 0.04, end: start + span * 1.04 };
}

const pct = (scale: Scale, ms: number) =>
  Math.min(100, Math.max(0, ((ms - scale.start) / (scale.end - scale.start)) * 100));

const rank = (s: Stage) => STAGES.indexOf(s);

interface Props {
  app: Summary;
  scale: Scale;
  now: number;
  large?: boolean;
}

/**
 * The signature: an application's steps on a time axis. Solid segments carry the stage
 * reached; the dashed tail is silence since the last news, drawn to its true length.
 */
export function TrackBar({ app, scale, now, large = false }: Props) {
  const greyed = isGreyed(app.status);
  const steps = app.track;
  const segments: ReactNode[] = [];
  const nodes: ReactNode[] = [];
  let reached: Stage = "applied";

  steps.forEach((step, i) => {
    if (step.type === "advanced" && step.stage && rank(step.stage) > rank(reached)) {
      reached = step.stage;
    }
    const at = Date.parse(step.at);
    const next = steps[i + 1];
    if (next) {
      const from = pct(scale, at);
      const to = pct(scale, Date.parse(next.at));
      segments.push(
        <span
          key={`seg-${step.id}`}
          className={`track-seg${at < scale.start ? " is-continued" : ""}`}
          style={
            {
              left: `${from}%`,
              width: `${Math.max(to - from, 0)}%`,
              "--seg-color": greyed ? "var(--closed)" : STAGE_COLOR[reached],
            } as CSSProperties
          }
        />,
      );
    }
    nodes.push(<Node key={step.id} step={step} left={pct(scale, at)} greyed={greyed} />);
  });

  const last = steps.at(-1);
  if (app.status.state === "open" && last) {
    const from = pct(scale, Date.parse(last.at));
    const to = pct(scale, now);
    if (to > from) {
      segments.push(
        <span
          key="silence"
          className="track-silence"
          style={{ left: `${from}%`, width: `${to - from}%` }}
        />,
      );
    }
  }

  return (
    <div className={`track${large ? " track-large" : ""}`} aria-hidden="true">
      <span className="track-rail" />
      {segments}
      {nodes}
    </div>
  );
}

function Node({ step, left, greyed }: { step: TrackStep; left: number; greyed: boolean }) {
  const style = (color: string) => ({ left: `${left}%`, "--node-color": color }) as CSSProperties;

  if (step.unseen) return <span className="track-node is-unseen" style={{ left: `${left}%` }} />;

  if (step.type === "applied") {
    return (
      <span
        className="track-node is-applied"
        style={style(greyed ? "var(--closed)" : STAGE_COLOR.applied)}
      />
    );
  }
  if (step.type === "advanced" && step.stage) {
    return (
      <span
        className="track-node"
        style={style(greyed ? "var(--closed)" : STAGE_COLOR[step.stage])}
      />
    );
  }
  if (step.type === "closed" && step.outcome) {
    const Icon = step.outcome === "rejected" ? X : step.outcome === "accepted" ? Check : Minus;
    return (
      <span
        className="track-node is-terminal"
        style={style(greyed ? "var(--closed)" : OUTCOME_COLOR[step.outcome])}
      >
        <Icon />
      </span>
    );
  }
  return null;
}

interface Tick {
  left: number;
  label: string;
  today?: boolean;
}

/** Date labels for the shared axis: weekly for short windows, monthly for long ones. */
export function axisTicks(scale: Scale, now: number, timeZone: string, minGap = 8): Tick[] {
  const span = scale.end - scale.start;
  const weekly = span <= 75 * DAY_MS;
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
    ...(weekly ? { day: "numeric" } : {}),
  });

  const ticks: Tick[] = [];
  const cursor = new Date(scale.start);
  cursor.setUTCHours(12, 0, 0, 0);
  if (weekly) {
    while (cursor.getUTCDay() !== 1) cursor.setUTCDate(cursor.getUTCDate() + 1);
  } else {
    cursor.setUTCDate(1);
    if (cursor.getTime() < scale.start) cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  while (cursor.getTime() < now) {
    ticks.push({ left: pct(scale, cursor.getTime()), label: fmt.format(cursor) });
    if (weekly) cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  // Keep labels at least `minGap` percent apart (and clear of "Today"), dropping the extras.
  const today = pct(scale, now);
  const spaced: Tick[] = [];
  for (const t of ticks) {
    const prev = spaced.at(-1);
    if (t.left < minGap / 2 || today - t.left < minGap * 1.1) continue;
    if (prev && t.left - prev.left < minGap) continue;
    spaced.push(t);
  }
  return [...spaced, { left: today, label: "Today", today: true }];
}

const LABEL_GAP_PX = 64;

export function Axis({ scale, now, timeZone }: { scale: Scale; now: number; timeZone: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry?.contentRect.width ?? 0));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const minGap = width > 0 ? (LABEL_GAP_PX / width) * 100 : 8;

  return (
    <div className="axis" ref={ref} aria-hidden="true">
      {axisTicks(scale, now, timeZone, minGap).map((t) => (
        <span
          key={t.label}
          className={`axis-tick${t.today ? " is-today" : ""}`}
          style={{ left: `${t.left}%` }}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}
