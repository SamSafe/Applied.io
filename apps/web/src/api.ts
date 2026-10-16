import type { AdvanceStage, AppEventType, Outcome, SankeyNodeId, Stage } from "@apptracker/core";

/** Renamed Sankey labels, by built-in node. */
export type SankeyLabels = Partial<Record<SankeyNodeId, string>>;

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
  /** The email behind this step, and any later emails attached to it as evidence. */
  emails: {
    subject: string | null;
    from: string | null;
    sentAt: string | null;
    evidence: string | null;
  }[];
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

/** core.analytics output. */
export interface Stats {
  applications: number;
  responded: number;
  responseRate: number | null;
  interviewed: number;
  interviewRate: number | null;
  offers: number;
  offerRate: number | null;
  ghosted: number;
  ghostEligible: number;
  ghostRate: number | null;
  medianTimeToFirstResponseMs: number | null;
  funnel: Record<Stage, number>;
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
  kind: "forwarding" | "upload" | "gmail" | "graph";
  status: "awaiting_first_mail" | "active" | "revoked";
  address: string | null;
  providerHint: string | null;
  verifiedMailbox: string | null;
  confirmation: { code: string; mailbox: string; receivedAt: string } | null;
  lastMessageAt: string | null;
  createdAt: string;
}

export type MessageStatus =
  | "received"
  | "filtered_out"
  | "needs_review"
  | "applied"
  | "ignored"
  | "failed";

/** What the pipeline did with one forwarded email (never its body). */
export interface InboxMessage {
  id: string;
  receivedAt: string;
  status: MessageStatus;
  from: string | null;
  subject: string | null;
  sentAt: string | null;
  senderVerified: boolean;
  category: string | null;
  company: string | null;
  position: string | null;
  certainty: string | null;
  evidence: string | null;
  filterReason: string | null;
  senderReason: string | null;
  reviewReasons: string[];
  applicationId: string | null;
  failure: string | null;
}

export type Proposal =
  | { kind: "create" }
  | { kind: "advance"; stage: AdvanceStage }
  | { kind: "close"; outcome: Outcome }
  | { kind: "evidence" }
  | { kind: "none" };

export interface ReviewCandidate {
  applicationId: string;
  company: string;
  position: string;
  maxStage: Stage;
  status: Status;
  score: number | null;
}

/** An email the pipeline wasn't sure about, waiting for the user's decision. */
export interface ReviewItem {
  id: string;
  receivedAt: string;
  sentAt: string | null;
  subject: string | null;
  from: string | null;
  senderVerified: boolean;
  category: string | null;
  interviewKind: string | null;
  company: string | null;
  position: string | null;
  certainty: "high" | "medium" | "low" | null;
  evidence: string | null;
  failure: string | null;
  reasons: string[];
  proposal: Proposal | null;
  suggestion: { kind: "create" | "append" | "pick" | "create_and_append" } | null;
  candidates: ReviewCandidate[];
}

export type ReviewAction =
  | { action: "confirm" }
  | { action: "assign"; applicationId: string }
  | { action: "create"; company?: string; position?: string }
  | { action: "ignore" };

export type UploadResult = {
  name: string;
  status: "queued" | "duplicate" | "too_large" | "invalid";
};

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
      ...(typeof init.body === "string" ? { "content-type": "application/json" } : {}),
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
  config: () => request<{ providers: Provider[]; classifier: boolean }>("/api/config"),

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
  setVerifiedMailbox: (id: string, verifiedMailbox: string | null) =>
    request<{ source: MailSource }>(`/api/mail-sources/${id}`, json("PATCH", { verifiedMailbox })),

  stats: (since: string | null) =>
    request<{ stats: Stats }>(`/api/stats${since ? `?since=${encodeURIComponent(since)}` : ""}`),
  sankey: (since: string | null, labels: SankeyLabels) => {
    const params = new URLSearchParams();
    if (since) params.set("since", since);
    if (Object.keys(labels).length > 0) params.set("labels", JSON.stringify(labels));
    const qs = params.toString();
    return request<{ sankey: import("./sankeyLayout").SankeyData }>(
      `/api/sankey${qs ? `?${qs}` : ""}`,
    );
  },
  exportUrl: "/api/account/export",
  deleteAccount: () =>
    request<void>("/api/account", json("DELETE", { confirm: "delete my account" })),
  review: () => request<{ items: ReviewItem[] }>("/api/review"),
  resolveReview: (id: string, action: ReviewAction) =>
    request<{ applicationId: string | null }>(`/api/review/${id}`, json("POST", action)),

  messages: (limit = 15) => request<{ messages: InboxMessage[] }>(`/api/messages?limit=${limit}`),
  upload: (files: File[]) => {
    const form = new FormData();
    for (const f of files) form.append("files", f);
    return request<{ results: UploadResult[] }>("/api/messages/upload", {
      method: "POST",
      body: form,
    });
  },

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
