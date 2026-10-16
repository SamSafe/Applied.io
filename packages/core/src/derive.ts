import { DAY_MS, toMs } from "./time";
import {
  type AppEvent,
  type Application,
  type Outcome,
  type Settings,
  STAGES,
  type Stage,
} from "./types";

export type Status =
  | { state: "open" }
  | { state: "closed"; outcome: Outcome; closedAt: string; eventId: string };

export interface Derived {
  /** Events minus voided targets and `voided` markers, in time order. */
  live: AppEvent[];
  appliedAt: string;
  maxStage: Stage;
  status: Status;
  /** Latest employer-facing activity. Notes don't count. */
  lastActivityAt: string;
  isStale: boolean;
  firstResponseAt: string | null;
  timeToFirstResponseMs: number | null;
}

export function stageRank(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export function compareEvents(a: AppEvent, b: AppEvent): number {
  return (
    toMs(a.occurredAt) - toMs(b.occurredAt) ||
    toMs(a.recordedAt) - toMs(b.recordedAt) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Events that still count: voided targets and the `voided` markers themselves are removed. */
export function liveEvents(events: readonly AppEvent[]): AppEvent[] {
  const voided = new Set(events.flatMap((e) => (e.type === "voided" ? [e.voidsEventId] : [])));
  return events.filter((e) => e.type !== "voided" && !voided.has(e.id)).sort(compareEvents);
}

export function derive(app: Application, now: Date, settings: Settings): Derived {
  const live = liveEvents(app.events);

  const applied = live.find((e) => e.type === "applied");
  if (!applied) throw new Error(`Application ${app.id} has no applied event`);

  let maxStage: Stage = "applied";
  let lastClosed: Extract<AppEvent, { type: "closed" }> | undefined;
  let lastActivityAt = applied.occurredAt;
  let firstResponseAt: string | null = null;

  for (const e of live) {
    if (e.type === "noted") continue;
    if (toMs(e.occurredAt) > toMs(lastActivityAt)) lastActivityAt = e.occurredAt;

    if (e.type === "advanced" && stageRank(e.stage) > stageRank(maxStage)) maxStage = e.stage;
    if (e.type === "closed") lastClosed = e;

    const isResponse = e.type === "advanced" || (e.type === "closed" && e.outcome === "rejected");
    if (isResponse && firstResponseAt === null) firstResponseAt = e.occurredAt;
  }

  const status: Status = lastClosed
    ? {
        state: "closed",
        outcome: lastClosed.outcome,
        closedAt: lastClosed.occurredAt,
        eventId: lastClosed.id,
      }
    : { state: "open" };

  const isStale =
    status.state === "open" &&
    now.getTime() - toMs(lastActivityAt) > settings.ghostThresholdDays * DAY_MS;

  const timeToFirstResponseMs =
    firstResponseAt === null ? null : Math.max(0, toMs(firstResponseAt) - toMs(applied.occurredAt));

  return {
    live,
    appliedAt: applied.occurredAt,
    maxStage,
    status,
    lastActivityAt,
    isStale,
    firstResponseAt,
    timeToFirstResponseMs,
  };
}
