import type { Outcome, Stage } from "@apptracker/core";
import type { Status, Summary } from "./api";

export const DAY_MS = 86_400_000;

export const STAGE_LABEL: Record<Stage, string> = {
  applied: "Applied",
  screen: "Screen",
  interview: "Interview",
  final: "Final round",
  offer: "Offer",
};

export const OUTCOME_LABEL: Record<Outcome, string> = {
  rejected: "Rejected",
  withdrawn: "Withdrew",
  accepted: "Accepted",
  declined: "Declined",
};

/** The fixed stage colour set (CSS custom properties), shared by bars, chips and history. */
export const STAGE_COLOR: Record<Stage, string> = {
  applied: "var(--stage-applied)",
  screen: "var(--stage-screen)",
  interview: "var(--stage-interview)",
  final: "var(--stage-final)",
  offer: "var(--stage-offer)",
};

export const OUTCOME_COLOR: Record<Outcome, string> = {
  rejected: "var(--stage-rejected)",
  withdrawn: "var(--stage-withdrawn)",
  accepted: "var(--stage-offer)",
  declined: "var(--stage-withdrawn)",
};

/** Closed applications go grey but keep their place, except a job you accepted. */
export function isGreyed(status: Status): boolean {
  return status.state === "closed" && status.outcome !== "accepted";
}

export interface ChipSpec {
  label: string;
  color: string;
}

export function statusChip(app: Pick<Summary, "status" | "maxStage" | "isStale">): ChipSpec {
  if (app.status.state === "closed") {
    return { label: OUTCOME_LABEL[app.status.outcome], color: OUTCOME_COLOR[app.status.outcome] };
  }
  if (app.isStale) return { label: "Ghosted", color: "var(--stage-ghosted)" };
  return { label: STAGE_LABEL[app.maxStage], color: STAGE_COLOR[app.maxStage] };
}

export function daysBetween(fromIso: string, to: number): number {
  return Math.floor((to - Date.parse(fromIso)) / DAY_MS);
}

export function ago(iso: string, now = Date.now()): string {
  const days = daysBetween(iso, now);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  return `${Math.round(days / 30)} months ago`;
}

/** The short phrase under a row's status chip. */
export function statusPhrase(app: Summary, timeZone: string, now = Date.now()): string {
  if (app.status.state === "closed") return formatDate(app.status.closedAt, timeZone);
  if (app.isStale) return `No news for ${daysBetween(app.lastActivityAt, now)} days`;
  if (app.track.length <= 1) return `Applied ${ago(app.appliedAt, now)}`;
  return `Last news ${ago(app.lastActivityAt, now)}`;
}

const dateFormats = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let f = dateFormats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, ...options });
    dateFormats.set(key, f);
  }
  return f;
}

export function formatDate(iso: string, timeZone: string, now = Date.now()): string {
  const sameYear =
    formatter(timeZone, { year: "numeric" }).format(new Date(iso)) ===
    formatter(timeZone, { year: "numeric" }).format(new Date(now));
  return formatter(timeZone, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone: string): string {
  return formatter(timeZone, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** A date as YYYY-MM-DD in `timeZone`, for date inputs (defaults to today). */
export function dateInputValue(timeZone: string, date = new Date()): string {
  const parts = Object.fromEntries(
    formatter(timeZone, { year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** A short, human-friendly reference for an application (the tail of its id, grouped). */
export function reference(id: string): string {
  const tail = id.slice(-8).toUpperCase();
  return `${tail.slice(0, 4)}-${tail.slice(4)}`;
}
