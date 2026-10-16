import type { AdvanceStage, EmailIntent, Outcome } from "@apptracker/core";
import type { Classification } from "./schema";

/** What a classified email asks the tracker to do (docs/EMAIL_PIPELINE.md → "Category → event"). */
export type Proposal =
  | { kind: "create" }
  | { kind: "advance"; stage: AdvanceStage }
  | { kind: "close"; outcome: Outcome }
  /** Interview logistics: evidence for the latest step at this point, never a new step. */
  | { kind: "evidence" }
  | { kind: "none" };

export function propose(c: Classification): Proposal {
  switch (c.category) {
    case "application_received":
      return { kind: "create" };
    case "assessment":
      return { kind: "advance", stage: "screen" };
    case "interview_invite":
      return {
        kind: "advance",
        stage:
          c.interviewKind === "recruiter_screen"
            ? "screen"
            : c.interviewKind === "final_round"
              ? "final"
              : "interview",
      };
    case "interview_logistics":
      return { kind: "evidence" };
    case "rejection":
      return { kind: "close", outcome: "rejected" };
    case "offer":
      return { kind: "advance", stage: "offer" };
    case "withdrawal_ack":
      return { kind: "close", outcome: "withdrawn" };
    default:
      return { kind: "none" };
  }
}

/** The matcher's intent for a proposal, or null when there's nothing to match. */
export function intentFor(proposal: Proposal, occurredAt: string): EmailIntent | null {
  if (proposal.kind === "none") return null;
  return proposal.kind === "create"
    ? { kind: "application_received", occurredAt }
    : { kind: "status", occurredAt };
}
