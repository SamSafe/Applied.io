import { DAY_MS } from "./time";
import type { AdvanceStage, AppEvent, Application, Outcome } from "./types";

/** Fixed clock for tests. */
export const NOW = new Date("2026-10-15T12:00:00.000Z");

export function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY_MS).toISOString();
}

/** Builds an application with events placed `n` days before `NOW`. Test-only. */
export class AppBuilder {
  private events: AppEvent[] = [];
  private seq = 0;
  private facts: Partial<Application> = {};

  constructor(
    private readonly id: string,
    private readonly company = "Acme",
    private readonly position = "Software Engineer",
  ) {}

  with(facts: Partial<Omit<Application, "id" | "events">>): this {
    Object.assign(this.facts, facts);
    return this;
  }

  applied(days: number, id?: string): this {
    return this.push({ type: "applied" }, days, id);
  }

  advanced(stage: AdvanceStage, days: number, id?: string): this {
    return this.push({ type: "advanced", stage }, days, id);
  }

  closed(outcome: Outcome, days: number, id?: string): this {
    return this.push({ type: "closed", outcome }, days, id);
  }

  noted(days: number, id?: string): this {
    return this.push({ type: "noted" }, days, id);
  }

  voided(voidsEventId: string, days: number, id?: string): this {
    return this.push({ type: "voided", voidsEventId }, days, id);
  }

  build(): Application {
    return {
      id: this.id,
      company: this.company,
      position: this.position,
      ...this.facts,
      events: [...this.events],
    };
  }

  private push(body: DistributivePick<AppEvent>, days: number, id?: string): this {
    this.seq++;
    this.events.push({
      ...body,
      id: id ?? `${this.id}-${this.seq}`,
      occurredAt: daysAgo(days),
      recordedAt: new Date(NOW.getTime() + this.seq).toISOString(),
      origin: "manual",
    } as AppEvent);
    return this;
  }
}

type DistributivePick<T> = T extends unknown
  ? Omit<T, "id" | "occurredAt" | "recordedAt" | "origin">
  : never;
