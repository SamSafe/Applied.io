import { findRepeatedEvent, type ProposedEvent } from "@apptracker/core";
import {
  type Classification,
  companyDomainFrom,
  eventFor,
  type NewApplicationFacts,
  type Plan,
  type Proposal,
  propose,
  type Review,
} from "@apptracker/mail";
import type { Db } from "./db/client";
import { appendEvent, createApplication, getApplication } from "./repo/applications";
import { type Message, updateMessage } from "./repo/messages";

/** Steps 7–8 of the pipeline: carry out a plan and record the outcome on the message. */
export async function executePlan(db: Db, message: Message, plan: Plan, now: Date): Promise<void> {
  const { userId, id } = message;
  switch (plan.kind) {
    case "ignore":
      await updateMessage(db, userId, id, {
        status: "ignored",
        review: { reasons: [plan.reason] },
      });
      return;
    case "attach":
      await updateMessage(db, userId, id, {
        status: "applied",
        applicationId: plan.applicationId,
        eventId: plan.eventId,
        review: null,
      });
      return;
    case "create": {
      const created = await create(db, message, plan.facts, plan.appliedAt, now);
      await updateMessage(db, userId, id, {
        status: "applied",
        applicationId: created.id,
        eventId: created.eventId,
        review: null,
      });
      return;
    }
    case "append": {
      const result = await appendEvent(db, userId, plan.applicationId, plan.event, now);
      if (result.kind === "ok") {
        await updateMessage(db, userId, id, {
          status: "applied",
          applicationId: plan.applicationId,
          eventId: result.eventId,
          review: null,
        });
        return;
      }
      // The application changed since planning (or the step conflicts): ask instead.
      const reason =
        result.kind === "invalid" ? result.violation.message : "The application no longer exists";
      const review: Review = {
        reasons: [reason],
        proposal: propose(message.classification as Classification),
        suggestion: { kind: "append", applicationId: plan.applicationId },
      };
      await updateMessage(db, userId, id, { status: "needs_review", review });
      return;
    }
    case "review":
      await updateMessage(db, userId, id, { status: "needs_review", review: plan.review });
      return;
  }
}

export type ReviewAction =
  | { action: "confirm" }
  | { action: "assign"; applicationId: string }
  | { action: "create"; company?: string; position?: string }
  | { action: "ignore" };

export type ResolveResult =
  | { ok: true; applicationId: string | null }
  | { ok: false; status: 400 | 404 | 422; error: string; message: string };

/** Applies the user's decision on a review card through the same write paths as automation. */
export async function resolveReview(
  db: Db,
  message: Message,
  action: ReviewAction,
  now: Date,
): Promise<ResolveResult> {
  const classification = message.classification as Classification | null;
  const review = message.review as Review | null;
  if (!review) return fail(400, "not_reviewable", "This email has nothing to review");
  const proposal: Proposal =
    review.proposal ?? (classification ? propose(classification) : { kind: "none" });
  const occurredAt = message.sentAt ?? message.receivedAt;
  const event = classification
    ? eventFor(proposal, { occurredAt, messageId: message.id, classification })
    : null;

  if (action.action === "ignore") {
    await updateMessage(db, message.userId, message.id, { status: "ignored" });
    return { ok: true, applicationId: null };
  }

  if (action.action === "create" || (action.action === "confirm" && isCreate(review))) {
    const company =
      (action.action === "create" ? action.company : undefined)?.trim() || classification?.company;
    const position =
      (action.action === "create" ? action.position : undefined)?.trim() ||
      classification?.position;
    if (!company || !position) {
      return fail(422, "missing_facts", "Add the company and role to create the application");
    }
    const ats =
      (message.diagnostics as { prefilter?: { ats?: string | null } } | null)?.prefilter?.ats ??
      null;
    const created = await create(
      db,
      message,
      {
        company,
        position,
        reqNumber: classification?.reqNumber ?? null,
        location: classification?.location ?? null,
        companyDomain: companyDomainFrom(message.fromDomain, ats),
        ats,
      },
      occurredAt,
      now,
      event === null,
    );
    // A status email that created its application also records its step.
    const stepId = event
      ? await appendOrFail(db, message, created.id, event, now)
      : created.eventId;
    if (typeof stepId !== "string") return stepId;
    await markApplied(db, message, created.id, stepId);
    return { ok: true, applicationId: created.id };
  }

  const applicationId =
    action.action === "assign"
      ? action.applicationId
      : review.suggestion.kind === "append"
        ? review.suggestion.applicationId
        : null;
  if (!applicationId)
    return fail(400, "choose_application", "Pick which application this is about");

  if (!event) {
    // A confirmation of an application that already exists: keep it as evidence.
    await markApplied(db, message, applicationId, null);
    return { ok: true, applicationId };
  }
  // A step the application already has (invite, then reminder): attach, don't duplicate.
  const app = await getApplication(db, message.userId, applicationId);
  if (!app) return fail(404, "not_found", "That application doesn't exist");
  const repeat = findRepeatedEvent(app.events, event);
  if (repeat) {
    await markApplied(db, message, applicationId, repeat.id);
    return { ok: true, applicationId };
  }
  const stepId = await appendOrFail(db, message, applicationId, event, now);
  if (typeof stepId !== "string") return stepId;
  await markApplied(db, message, applicationId, stepId);
  return { ok: true, applicationId };
}

function isCreate(review: Review): boolean {
  return review.suggestion.kind === "create" || review.suggestion.kind === "create_and_append";
}

/**
 * Creates an application from an email. `citesEmail` is false when the email is a later step
 * (a rejection for an application we never saw): then the "applied" step is inferred, so it
 * neither cites the email nor counts as news.
 */
async function create(
  db: Db,
  message: Message,
  facts: NewApplicationFacts,
  appliedAt: string,
  now: Date,
  citesEmail = true,
) {
  const classification = message.classification as Classification | null;
  return createApplication(
    db,
    message.userId,
    {
      company: facts.company,
      position: facts.position,
      appliedAt,
      reqNumber: facts.reqNumber,
      location: facts.location,
      source: facts.ats ? sourceLabel(facts.ats) : null,
    },
    now,
    citesEmail
      ? {
          companyDomain: facts.companyDomain,
          ats: facts.ats,
          messageId: message.id,
          certainty: classification?.certainty ?? null,
        }
      : undefined,
  );
}

async function appendOrFail(
  db: Db,
  message: Message,
  applicationId: string,
  event: ProposedEvent,
  now: Date,
): Promise<string | ResolveResult> {
  const result = await appendEvent(db, message.userId, applicationId, event, now);
  if (result.kind === "not_found") return fail(404, "not_found", "That application doesn't exist");
  if (result.kind === "invalid") return fail(422, result.violation.code, result.violation.message);
  return result.eventId;
}

async function markApplied(
  db: Db,
  message: Message,
  applicationId: string,
  eventId: string | null,
) {
  await updateMessage(db, message.userId, message.id, {
    status: "applied",
    applicationId,
    eventId,
  });
}

function fail(status: 400 | 404 | 422, error: string, message: string): ResolveResult {
  return { ok: false, status, error, message };
}

const SOURCE_LABELS: Record<string, string> = { linkedin: "LinkedIn", indeed: "Indeed" };

/** Job boards are where the user found the job; ATS platforms aren't, so they set no source. */
function sourceLabel(ats: string): string | null {
  return SOURCE_LABELS[ats] ?? null;
}
