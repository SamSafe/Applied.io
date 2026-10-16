/** Funnel stages, in order. An application starts at `applied`. */
export const STAGES = ["applied", "screen", "interview", "final", "offer"] as const;
export type Stage = (typeof STAGES)[number];
export type AdvanceStage = Exclude<Stage, "applied">;

export const OUTCOMES = ["rejected", "withdrawn", "accepted", "declined"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export type EventOrigin = "manual" | "email";
export type Certainty = "high" | "medium" | "low";

interface EventBase {
  id: string;
  /** When it happened (ISO-8601). For email events, the original email's sent date. */
  occurredAt: string;
  /** When we stored it (ISO-8601). Breaks ties between events with the same `occurredAt`. */
  recordedAt: string;
  origin: EventOrigin;
  /** The email that produced this event, if any. */
  messageId?: string | null;
  certainty?: Certainty | null;
  note?: string | null;
}

/** One immutable fact about an application. Never edited; corrected by appending `voided`. */
export type AppEvent = EventBase &
  (
    | { type: "applied" }
    | { type: "advanced"; stage: AdvanceStage }
    | { type: "closed"; outcome: Outcome }
    | { type: "noted" }
    | { type: "voided"; voidsEventId: string }
  );

export type AppEventType = AppEvent["type"];

/** An event before it has been stored (no id / recordedAt yet). */
export type ProposedEvent = DistributiveOmit<AppEvent, "id" | "recordedAt">;

export interface Application {
  id: string;
  company: string;
  position: string;
  /** Normalized company name used for matching (see `normalizeCompany`). */
  companyKey?: string | null;
  companyDomain?: string | null;
  reqNumber?: string | null;
  /** ATS job id or slug parsed from links. A strong match key. */
  atsJobRef?: string | null;
  events: AppEvent[];
}

export interface Settings {
  /** Days of silence after which an open application counts as ghosted. */
  ghostThresholdDays: number;
}

export const DEFAULT_SETTINGS: Settings = { ghostThresholdDays: 21 };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
