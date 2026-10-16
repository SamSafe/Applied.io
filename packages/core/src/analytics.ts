import { type Derived, derive, stageRank } from "./derive";
import { DAY_MS, toMs } from "./time";
import { type Application, type Settings, STAGES, type Stage } from "./types";

export interface Range {
  /** Inclusive lower bound on `appliedAt` (ISO-8601). */
  since?: string;
  /** Exclusive upper bound on `appliedAt` (ISO-8601). */
  until?: string;
}

export interface Analytics {
  applications: number;
  responded: number;
  responseRate: number | null;
  interviewed: number;
  interviewRate: number | null;
  offers: number;
  offerRate: number | null;
  ghosted: number;
  /** Applications older than the ghost threshold: the fair denominator for `ghostRate`. */
  ghostEligible: number;
  ghostRate: number | null;
  medianTimeToFirstResponseMs: number | null;
  /** For each stage, how many applications reached it. */
  funnel: Record<Stage, number>;
}

export interface DerivedApplication {
  app: Application;
  derived: Derived;
}

/** Derives every application and keeps those whose `appliedAt` falls inside `range`. */
export function deriveInRange(
  apps: readonly Application[],
  now: Date,
  settings: Settings,
  range: Range = {},
): DerivedApplication[] {
  const since = range.since === undefined ? -Infinity : toMs(range.since);
  const until = range.until === undefined ? Infinity : toMs(range.until);
  return apps
    .map((app) => ({ app, derived: derive(app, now, settings) }))
    .filter(({ derived }) => {
      const at = toMs(derived.appliedAt);
      return at >= since && at < until;
    });
}

export function analytics(
  apps: readonly Application[],
  now: Date,
  settings: Settings,
  range: Range = {},
): Analytics {
  const rows = deriveInRange(apps, now, settings, range).map((r) => r.derived);
  const total = rows.length;
  const reached = (stage: Stage) =>
    rows.filter((d) => stageRank(d.maxStage) >= stageRank(stage)).length;

  const responded = rows.filter((d) => d.firstResponseAt !== null).length;
  const interviewed = reached("interview");
  const offers = reached("offer");
  const ghosted = rows.filter((d) => d.isStale).length;
  const thresholdMs = settings.ghostThresholdDays * DAY_MS;
  const ghostEligible = rows.filter((d) => now.getTime() - toMs(d.appliedAt) > thresholdMs).length;

  const funnel = Object.fromEntries(STAGES.map((s) => [s, reached(s)])) as Record<Stage, number>;

  return {
    applications: total,
    responded,
    responseRate: ratio(responded, total),
    interviewed,
    interviewRate: ratio(interviewed, total),
    offers,
    offerRate: ratio(offers, total),
    ghosted,
    ghostEligible,
    ghostRate: ratio(ghosted, ghostEligible),
    medianTimeToFirstResponseMs: median(
      rows.flatMap((d) => (d.timeToFirstResponseMs === null ? [] : [d.timeToFirstResponseMs])),
    ),
    funnel,
  };
}

function ratio(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
