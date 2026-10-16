import { liveEvents } from "./derive";
import { normalizeCompany, normalizeReqNumber, titleSimilarity } from "./normalize";
import { DAY_MS, toMs } from "./time";
import type { AppEvent, Application, ProposedEvent } from "./types";

/** What the classifier pulled out of an email. */
export interface Extracted {
  company?: string | null;
  /** The company's own domain, never an ATS sending domain like greenhouse-mail.io. */
  companyDomain?: string | null;
  position?: string | null;
  reqNumber?: string | null;
  atsJobRef?: string | null;
}

export type EmailIntent =
  /** "Thanks for applying": creates an application unless it duplicates one. */
  | { kind: "application_received"; occurredAt: string }
  /** Anything that moves an existing application (interview, rejection, offer…). */
  | { kind: "status"; occurredAt: string };

export interface ScoredCandidate {
  applicationId: string;
  score: number;
  open: boolean;
}

export type MatchDecision =
  | { kind: "create" }
  | { kind: "duplicate"; applicationId: string }
  | { kind: "match"; applicationId: string }
  | { kind: "ambiguous"; candidates: ScoredCandidate[] }
  | { kind: "closed"; applicationId: string }
  | { kind: "none" };

export const MATCH_RULES = {
  /** application_received: title similarity at or above this, within the window, is a duplicate. */
  duplicateTitle: 0.8,
  duplicateWindowDays: 30,
  /** status: with several open candidates, the best must reach this score… */
  matchTitle: 0.6,
  /** …and lead the runner-up by this much. */
  matchMargin: 0.2,
  /** status: a lone open candidate whose title scores below this is a different job. */
  mismatchTitle: 0.25,
  /** The same stage within this many days is one step (invite, confirmation, reminder). */
  repeatWindowDays: 14,
} as const;

interface Candidate {
  app: Application;
  open: boolean;
  appliedAt: string;
  strong: boolean;
  titleScore: number | null;
  score: number;
}

/** Decides which application an email is about. Rules: docs/EMAIL_PIPELINE.md → "Matching". */
export function match(
  apps: readonly Application[],
  extracted: Extracted,
  intent: EmailIntent,
): MatchDecision {
  const candidates = apps
    .filter((app) => sameCompany(app, extracted))
    .map((app) => toCandidate(app, extracted));
  return intent.kind === "application_received"
    ? matchApplicationReceived(candidates, extracted, intent.occurredAt)
    : matchStatus(candidates, extracted);
}

function matchApplicationReceived(
  candidates: Candidate[],
  extracted: Extracted,
  occurredAt: string,
): MatchDecision {
  const recentOpen = candidates.filter(
    (c) =>
      c.open &&
      Math.abs(toMs(occurredAt) - toMs(c.appliedAt)) <= MATCH_RULES.duplicateWindowDays * DAY_MS,
  );

  const strong = candidates.filter((c) => c.open && c.strong);
  if (strong.length === 1)
    return { kind: "duplicate", applicationId: (strong[0] as Candidate).app.id };

  if (!extracted.position) {
    // Can't tell a repeat confirmation from a second application at the same company.
    return recentOpen.length > 0 ? ambiguous(recentOpen) : { kind: "create" };
  }

  const dupes = recentOpen
    .filter((c) => (c.titleScore ?? 0) >= MATCH_RULES.duplicateTitle)
    .sort(byScore);
  return dupes.length > 0
    ? { kind: "duplicate", applicationId: (dupes[0] as Candidate).app.id }
    : { kind: "create" };
}

function matchStatus(candidates: Candidate[], extracted: Extracted): MatchDecision {
  if (candidates.length === 0) return { kind: "none" };

  const open = candidates.filter((c) => c.open).sort(byScore);
  const closed = candidates.filter((c) => !c.open).sort(byScore);

  // A clearly better closed candidate means the email is about a closed application.
  const bestClosed = closed[0];
  if (bestClosed && extracted.position && bestClosed.score >= MATCH_RULES.matchTitle) {
    const bestOpenScore = open[0]?.score ?? 0;
    if (bestClosed.score - bestOpenScore >= MATCH_RULES.matchMargin) {
      return { kind: "closed", applicationId: bestClosed.app.id };
    }
  }

  if (open.length === 0) {
    const latest = [...closed].sort(
      (a, b) => toMs(b.appliedAt) - toMs(a.appliedAt),
    )[0] as Candidate;
    return { kind: "closed", applicationId: latest.app.id };
  }

  const strong = open.filter((c) => c.strong);
  if (strong.length === 1) return { kind: "match", applicationId: (strong[0] as Candidate).app.id };

  if (open.length === 1) {
    const only = open[0] as Candidate;
    if (only.titleScore !== null && only.titleScore < MATCH_RULES.mismatchTitle)
      return ambiguous(open);
    return { kind: "match", applicationId: only.app.id };
  }

  const [best, second] = open as [Candidate, Candidate];
  if (
    best.score >= MATCH_RULES.matchTitle &&
    best.score - second.score >= MATCH_RULES.matchMargin
  ) {
    return { kind: "match", applicationId: best.app.id };
  }
  return ambiguous(open);
}

/**
 * The existing live event that `proposed` merely repeats, if any: the same stage within
 * `repeatWindowDays`, or a second closing with the same outcome. Repeats attach as evidence
 * instead of becoming new events.
 */
export function findRepeatedEvent(
  events: readonly AppEvent[],
  proposed: ProposedEvent,
): AppEvent | null {
  const live = liveEvents(events);
  const at = toMs(proposed.occurredAt);
  const within = (e: AppEvent) =>
    Math.abs(toMs(e.occurredAt) - at) <= MATCH_RULES.repeatWindowDays * DAY_MS;

  if (proposed.type === "advanced") {
    return (
      live.find((e) => e.type === "advanced" && e.stage === proposed.stage && within(e)) ?? null
    );
  }
  if (proposed.type === "closed") {
    return live.find((e) => e.type === "closed" && e.outcome === proposed.outcome) ?? null;
  }
  return null;
}

function sameCompany(app: Application, ex: Extracted): boolean {
  if (ex.atsJobRef && app.atsJobRef === ex.atsJobRef) return true;
  if (
    ex.companyDomain &&
    app.companyDomain &&
    domain(ex.companyDomain) === domain(app.companyDomain)
  ) {
    return true;
  }
  if (!ex.company) return false;
  const key = normalizeCompany(ex.company);
  return key !== "" && key === (app.companyKey ?? normalizeCompany(app.company));
}

function toCandidate(app: Application, ex: Extracted): Candidate {
  const live = liveEvents(app.events);
  const strong =
    (!!ex.atsJobRef && app.atsJobRef === ex.atsJobRef) ||
    (!!ex.reqNumber &&
      !!app.reqNumber &&
      normalizeReqNumber(ex.reqNumber) === normalizeReqNumber(app.reqNumber));
  const titleScore = ex.position ? titleSimilarity(ex.position, app.position) : null;
  return {
    app,
    open: !live.some((e) => e.type === "closed"),
    appliedAt:
      live.find((e) => e.type === "applied")?.occurredAt ??
      live[0]?.occurredAt ??
      "1970-01-01T00:00:00Z",
    strong,
    titleScore,
    score: (titleScore ?? 0) + (strong ? 1 : 0),
  };
}

function ambiguous(candidates: Candidate[]): MatchDecision {
  return {
    kind: "ambiguous",
    candidates: [...candidates]
      .sort(byScore)
      .map((c) => ({ applicationId: c.app.id, score: c.score, open: c.open })),
  };
}

function byScore(a: Candidate, b: Candidate): number {
  return b.score - a.score || toMs(b.appliedAt) - toMs(a.appliedAt);
}

function domain(d: string): string {
  return d.toLowerCase().replace(/^www\./, "");
}
