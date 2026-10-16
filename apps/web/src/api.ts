import type { AdvanceStage, AppEventType, Outcome, Stage } from "@apptracker/core";

export type Provider = "magic-link" | "google" | "microsoft";
export type StatusFilter = "all" | "open" | "updates" | "ghosted" | "closed";

export interface User {
  id: string;
  email: string;
  name: string;
}

export type Status =
  | { state: "open" }
  | { state: "closed"; outcome: Outcome; closedAt: string; eventId: string };

export interface TrackStep {
  id: string;
  at: string;
  type: "applied" | "advanced" | "closed";
  stage: AdvanceStage | null;
  outcome: Outcome | null;
  unseen: boolean;
}

export interface Summary {
  id: string;
  company: string;
  position: string;
  location: string | null;
  url: string | null;
  source: string | null;
  appliedAt: string;
  maxStage: Stage;
  status: Status;
  lastActivityAt: string;
  isStale: boolean;
  updates: number;
  track: TrackStep[];
}

export interface HistoryEvent {
  id: string;
  type: AppEventType;
  stage?: AdvanceStage;
  outcome?: Outcome;
  voidsEventId?: string;
  occurredAt: string;
  recordedAt: string;
  origin: "manual" | "email";
  certainty?: "high" | "medium" | "low" | null;
  note?: string | null;
  voided: boolean;
  unseen: boolean;
}

export interface Detail extends Summary {
  reqNumber: string | null;
  companyDomain: string | null;
  notes: string | null;
  createdVia: "manual" | "email";
  createdAt: string;
  firstResponseAt: string | null;
  events: HistoryEvent[];
}

export type Counts = Record<Exclude<StatusFilter, "all">, number> & { all: number };

export interface Settings {
  ghostThresholdDays: number;
  /** IANA zone; null means "use this device's time zone". */
  timezone: string | null;
  rawRetentionDays: number;
  autoApply: boolean;
  digest: "off" | "weekly";
}

export interface MailSource {
  id: string;
  kind: "forwarding" | "gmail" | "graph";
  status: "awaiting_first_mail" | "active" | "revoked";
  address: string | null;
  providerHint: string | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export interface FactsInput {
  company?: string;
  position?: string;
  reqNumber?: string;
  location?: string;
  url?: string;
  source?: string;
  notes?: string;
}

export type StepInput =
  | { type: "advanced"; stage: AdvanceStage; occurredAt?: string; note?: string }
  | { type: "closed"; outcome: Outcome; occurredAt?: string; note?: string }
  | { type: "noted"; occurredAt?: string; note: string };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...init.headers,
    },
  });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? "error", body?.message ?? describe(res.status));
  }
  return body as T;
}

function describe(status: number): string {
  if (status === 401) return "You're signed out. Sign in again to continue.";
  if (status === 404) return "That application doesn't exist, or it was deleted.";
  if (status >= 500) return "The server had a problem. Try again in a moment.";
  return `Request failed (${status}).`;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  me: () => request<{ user: User }>("/api/me"),
  config: () => request<{ providers: Provider[] }>("/api/config"),

  list: (status: StatusFilter, q: string) => {
    const params = new URLSearchParams();
    if (status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    const qs = params.toString();
    return request<{ counts: Counts; applications: Summary[] }>(
      `/api/applications${qs ? `?${qs}` : ""}`,
    );
  },
  get: (id: string) => request<{ application: Detail }>(`/api/applications/${id}`),
  create: (body: FactsInput & { company: string; position: string; appliedAt?: string }) =>
    request<{ application: Detail }>("/api/applications", json("POST", body)),
  update: (id: string, body: FactsInput) =>
    request<{ application: Detail }>(`/api/applications/${id}`, json("PATCH", body)),
  remove: (id: string) => request<void>(`/api/applications/${id}`, json("DELETE")),
  addStep: (id: string, step: StepInput) =>
    request<{ application: Detail }>(`/api/applications/${id}/events`, json("POST", step)),
  undo: (eventId: string) =>
    request<{ application: Detail }>(`/api/events/${eventId}/void`, json("POST")),
  markSeen: (id: string) => request<void>(`/api/applications/${id}/seen`, json("POST")),
  markAllSeen: () => request<void>("/api/applications/seen", json("POST")),

  settings: () => request<{ settings: Settings }>("/api/settings"),
  updateSettings: (patch: Partial<Settings>) =>
    request<{ settings: Settings }>("/api/settings", json("PATCH", patch)),

  mailSources: () => request<{ sources: MailSource[] }>("/api/mail-sources"),
  createForwarding: () =>
    request<{ source: MailSource }>("/api/mail-sources/forwarding", json("POST")),
  rotate: (id: string) =>
    request<{ source: MailSource }>(`/api/mail-sources/${id}/rotate`, json("POST")),

  sendMagicLink: (email: string) =>
    request<{ status: boolean }>(
      "/api/auth/sign-in/magic-link",
      json("POST", { email, callbackURL: `${window.location.origin}/` }),
    ),
  socialSignIn: (provider: "google" | "microsoft") =>
    request<{ url: string }>(
      "/api/auth/sign-in/social",
      json("POST", { provider, callbackURL: `${window.location.origin}/` }),
    ),
  signOut: () => request<unknown>("/api/auth/sign-out", json("POST", {})),
};
