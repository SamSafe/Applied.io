import { z } from "zod";

export const CATEGORIES = [
  "application_received",
  "assessment",
  "interview_invite",
  "interview_logistics",
  "rejection",
  "offer",
  "withdrawal_ack",
  "recruiter_outreach",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const INTERVIEW_KINDS = ["recruiter_screen", "interview", "final_round"] as const;
export type InterviewKind = (typeof INTERVIEW_KINDS)[number];

/**
 * What the classifier returns (docs/EMAIL_PIPELINE.md → "Classification schema").
 * No length constraints here: structured outputs can't enforce them, so `evidence` is
 * truncated in code instead.
 */
export const Classification = z.object({
  jobRelated: z.boolean(),
  category: z.enum(CATEGORIES),
  interviewKind: z.enum(INTERVIEW_KINDS).nullable(),
  company: z.string().nullable(),
  position: z.string().nullable(),
  reqNumber: z.string().nullable(),
  location: z.string().nullable(),
  certainty: z.enum(["high", "medium", "low"]),
  evidence: z.string(),
});
export type Classification = z.infer<typeof Classification>;

export const MAX_EVIDENCE_CHARS = 300;
