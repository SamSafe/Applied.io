import {
  type Application,
  type Extracted,
  findRepeatedEvent,
  match,
  type ProposedEvent,
  validate,
} from "@apptracker/core";
import { type Proposal, propose } from "./propose";
import type { Classification } from "./schema";

/** A review card's suggested action; the user confirms it, picks another, or ignores it. */
export type Suggestion =
  | { kind: "create" }
  | { kind: "append"; applicationId: string }
  | { kind: "pick"; candidates: { applicationId: string; score: number }[] }
  /** No application found: create one from this email, then record the step on it. */
  | { kind: "create_and_append" };

export interface Review {
  /** Why it wasn't applied automatically, in plain words. */
  reasons: string[];
  proposal: Proposal;
  suggestion: Suggestion;
}

export interface NewApplicationFacts {
  company: string;
  position: string;
  reqNumber: string | null;
  location: string | null;
  companyDomain: string | null;
  ats: string | null;
}

/** What the tracker should do with one classified email (docs/EMAIL_PIPELINE.md, steps 6–7). */
export type Plan =
  | { kind: "ignore"; reason: string }
  /** Evidence only: link the email to an application (and an existing step, if it repeats one). */
  | { kind: "attach"; applicationId: string; eventId: string | null }
  | { kind: "create"; facts: NewApplicationFacts; appliedAt: string }
  | { kind: "append"; applicationId: string; event: ProposedEvent }
  | { kind: "review"; review: Review };

export interface PlanInput {
  classification: Classification;
  apps: readonly Application[];
  /** When the original email was sent; becomes the event's occurredAt. */
  occurredAt: string;
  senderVerified: boolean;
  autoApply: boolean;
  messageId: string;
  fromDomain: string | null;
  ats: string | null;
}

export function plan(input: PlanInput): Plan {
  const c = input.classification;
  const proposal = propose(c);
  if (proposal.kind === "none") {
    return {
      kind: "ignore",
      reason:
        c.category === "recruiter_outreach"
          ? "Recruiter outreach, not an application"
          : "Not about an application",
    };
  }

  const extracted: Extracted = {
    company: c.company,
    position: c.position,
    reqNumber: c.reqNumber,
    companyDomain: companyDomainFrom(input.fromDomain, input.ats),
  };

  // Why we can't act on our own, if we can't.
  const doubts = [
    ...(input.autoApply ? [] : ["Automatic updates are turned off"]),
    ...(input.senderVerified
      ? []
      : ["The sender couldn't be verified as coming through your mailbox"]),
    ...(c.certainty === "high"
      ? []
      : [`The classifier was only ${c.certainty === "medium" ? "fairly" : "slightly"} sure`]),
  ];
  const review = (reasons: string[], suggestion: Suggestion): Plan => ({
    kind: "review",
    review: { reasons, proposal, suggestion },
  });

  if (proposal.kind === "evidence") {
    const decision = match(input.apps, extracted, { kind: "status", occurredAt: input.occurredAt });
    return decision.kind === "match"
      ? { kind: "attach", applicationId: decision.applicationId, eventId: null }
      : { kind: "ignore", reason: "Interview details for an application we couldn't find" };
  }

  if (proposal.kind === "create") {
    const decision = match(input.apps, extracted, {
      kind: "application_received",
      occurredAt: input.occurredAt,
    });
    if (decision.kind === "duplicate") {
      return { kind: "attach", applicationId: decision.applicationId, eventId: null };
    }
    if (decision.kind === "ambiguous") {
      return review(["This could be a second application or a repeat confirmation"], {
        kind: "pick",
        candidates: decision.candidates,
      });
    }
    if (!c.company || !c.position) {
      return review([`The email doesn't say which ${c.company ? "role" : "company"} it's for`], {
        kind: "create",
      });
    }
    if (doubts.length > 0) return review(doubts, { kind: "create" });
    return {
      kind: "create",
      appliedAt: input.occurredAt,
      facts: {
        company: c.company,
        position: c.position,
        reqNumber: c.reqNumber,
        location: c.location,
        companyDomain: extracted.companyDomain ?? null,
        ats: input.ats,
      },
    };
  }

  // A step on an existing application: advance or close.
  const event: ProposedEvent =
    proposal.kind === "advance"
      ? { type: "advanced", stage: proposal.stage, ...eventBase(input) }
      : { type: "closed", outcome: proposal.outcome, ...eventBase(input) };
  const decision = match(input.apps, extracted, { kind: "status", occurredAt: input.occurredAt });

  switch (decision.kind) {
    case "match": {
      const app = input.apps.find((a) => a.id === decision.applicationId) as Application;
      const repeat = findRepeatedEvent(app.events, event);
      if (repeat) return { kind: "attach", applicationId: app.id, eventId: repeat.id };
      const check = validate(app.events, event);
      if (!check.ok) {
        return review([check.message], { kind: "append", applicationId: app.id });
      }
      if (doubts.length > 0) return review(doubts, { kind: "append", applicationId: app.id });
      return { kind: "append", applicationId: app.id, event };
    }
    case "closed": {
      // A second rejection (or withdrawal) of an already-closed application changes nothing.
      const closedApp = input.apps.find((a) => a.id === decision.applicationId);
      const repeat = closedApp ? findRepeatedEvent(closedApp.events, event) : null;
      if (closedApp && repeat)
        return { kind: "attach", applicationId: closedApp.id, eventId: repeat.id };
      return review(["The matching application is already closed"], {
        kind: "pick",
        candidates: [{ applicationId: decision.applicationId, score: 1 }],
      });
    }
    case "ambiguous":
      return review(["Several of your applications could match"], {
        kind: "pick",
        candidates: decision.candidates,
      });
    default:
      return review(
        [
          c.company
            ? `No application to ${c.company} found`
            : "The email doesn't say which company it's from",
        ],
        { kind: "create_and_append" },
      );
  }
}

/** The event a proposal becomes, for review actions that apply it later. */
export function eventFor(
  proposal: Proposal,
  input: Pick<PlanInput, "occurredAt" | "messageId" | "classification">,
): ProposedEvent | null {
  if (proposal.kind === "advance")
    return { type: "advanced", stage: proposal.stage, ...eventBase(input) };
  if (proposal.kind === "close")
    return { type: "closed", outcome: proposal.outcome, ...eventBase(input) };
  return null;
}

function eventBase(input: Pick<PlanInput, "occurredAt" | "messageId" | "classification">) {
  return {
    occurredAt: input.occurredAt,
    origin: "email" as const,
    messageId: input.messageId,
    certainty: input.classification.certainty,
  };
}

/** Mailbox and notification providers whose domain says nothing about the employer. */
const NOT_EMPLOYERS = new Set([
  "gmail.com",
  "googlemail.com",
  "google.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "aol.com",
  "calendly.com",
  "zoom.us",
  "linkedin.com",
  "indeed.com",
]);

/** The employer's own domain when the email came straight from it (not via an ATS). */
export function companyDomainFrom(fromDomain: string | null, ats: string | null): string | null {
  if (!fromDomain || ats) return null;
  const labels = fromDomain.toLowerCase().split(".");
  // Registrable domain, roughly: keep three labels for "example.co.uk"-style suffixes.
  const keep = labels.length > 2 && /^(co|com|org|net|ac|gov)$/.test(labels.at(-2) ?? "") ? 3 : 2;
  const domain = labels.slice(-keep).join(".");
  return NOT_EMPLOYERS.has(domain) ? null : domain;
}
