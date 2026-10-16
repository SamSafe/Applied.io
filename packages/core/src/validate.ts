import { liveEvents } from "./derive";
import type { AppEvent, ProposedEvent } from "./types";

export type ViolationCode =
  | "applied_not_first"
  | "missing_applied"
  | "application_closed"
  | "offer_not_reached"
  | "void_target_missing"
  | "void_target_applied"
  | "void_target_already_voided"
  | "void_target_is_void";

export type Validation = { ok: true } | { ok: false; code: ViolationCode; message: string };

const ok: Validation = { ok: true };
const fail = (code: ViolationCode, message: string): Validation => ({ ok: false, code, message });

/**
 * Checks whether `proposed` may be appended to an application with `events`.
 * Rules: docs/DATA_MODEL.md → "Transition rules".
 */
export function validate(events: readonly AppEvent[], proposed: ProposedEvent): Validation {
  if (proposed.type === "applied") {
    return events.length === 0
      ? ok
      : fail(
          "applied_not_first",
          "An application has exactly one applied event, and it comes first",
        );
  }

  if (!events.some((e) => e.type === "applied")) {
    return fail("missing_applied", "The application has no applied event");
  }

  if (proposed.type === "voided") return validateVoid(events, proposed.voidsEventId);
  if (proposed.type === "noted") return ok;

  const live = liveEvents(events);
  if (live.some((e) => e.type === "closed")) {
    return fail("application_closed", "The application is closed; undo the closing event first");
  }

  if (
    proposed.type === "closed" &&
    (proposed.outcome === "accepted" || proposed.outcome === "declined") &&
    !live.some((e) => e.type === "advanced" && e.stage === "offer")
  ) {
    return fail(
      "offer_not_reached",
      "Only an application that reached the offer stage can be accepted or declined",
    );
  }

  return ok;
}

function validateVoid(events: readonly AppEvent[], targetId: string): Validation {
  const target = events.find((e) => e.id === targetId);
  if (!target) return fail("void_target_missing", `No event ${targetId} on this application`);
  if (target.type === "applied") {
    return fail(
      "void_target_applied",
      "The applied event can't be undone; delete the application instead",
    );
  }
  if (target.type === "voided")
    return fail("void_target_is_void", "An undo can't itself be undone");
  if (events.some((e) => e.type === "voided" && e.voidsEventId === targetId)) {
    return fail("void_target_already_voided", "This event was already undone");
  }
  return ok;
}
