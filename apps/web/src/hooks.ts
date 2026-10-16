import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  api,
  type Detail,
  type FactsInput,
  type ReviewAction,
  type SankeyLabels,
  type StatusFilter,
  type StepInput,
} from "./api";

export const keys = {
  me: ["me"] as const,
  config: ["config"] as const,
  apps: ["apps"] as const,
  list: (status: StatusFilter, q: string) => ["apps", "list", status, q] as const,
  app: (id: string) => ["apps", "detail", id] as const,
  settings: ["settings"] as const,
  sources: ["sources"] as const,
  messages: ["messages"] as const,
  review: ["review"] as const,
  insights: (since: string | null, labels: SankeyLabels) =>
    ["apps", "insights", since ?? "all", JSON.stringify(labels)] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: api.me, retry: false, staleTime: 60_000 });
}

export function useConfig() {
  return useQuery({ queryKey: keys.config, queryFn: api.config, staleTime: Infinity });
}

export function useApplications(status: StatusFilter, q: string) {
  return useQuery({
    queryKey: keys.list(status, q),
    queryFn: () => api.list(status, q),
    placeholderData: (previous) => previous,
  });
}

export function useApplication(id: string | null) {
  return useQuery({
    queryKey: keys.app(id ?? ""),
    queryFn: () => api.get(id as string).then((r) => r.application),
    enabled: id !== null,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: keys.settings,
    queryFn: () => api.settings().then((r) => r.settings),
    staleTime: 60_000,
  });
}

/** The time zone dates are shown in: the user's setting once loaded, else the browser's. */
export function useTimeZone(): string {
  const { data } = useSettings();
  return data?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function useMailSources() {
  return useQuery({
    queryKey: keys.sources,
    queryFn: () => api.mailSources().then((r) => r.sources),
    // While setup is underway, watch for the first email and Gmail's confirmation code.
    refetchInterval: (query) =>
      query.state.data?.some(
        (s) =>
          s.kind === "forwarding" && (s.status === "awaiting_first_mail" || !s.verifiedMailbox),
      )
        ? 8000
        : false,
  });
}

export function useSetVerifiedMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mailbox }: { id: string; mailbox: string | null }) =>
      api.setVerifiedMailbox(id, mailbox),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sources }),
  });
}

export function useMessages() {
  return useQuery({
    queryKey: keys.messages,
    queryFn: () => api.messages().then((r) => r.messages),
    // Emails move through the queue in seconds; follow along while any are still in flight.
    refetchInterval: (query) =>
      query.state.data?.some(
        (m) => m.status === "received" && Date.now() - Date.parse(m.receivedAt) < 120_000,
      )
        ? 5000
        : 30000,
  });
}

export function useUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.upload,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.messages }),
  });
}

/** After any write to an application: refresh lists, and seed the detail cache. */
function useApplicationWrite<TArgs>(fn: (args: TArgs) => Promise<{ application: Detail }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: ({ application }) => {
      qc.setQueryData(keys.app(application.id), application);
      return qc.invalidateQueries({ queryKey: [...keys.apps, "list"] });
    },
  });
}

export function useCreateApplication() {
  return useApplicationWrite(api.create);
}

export function useUpdateApplication(id: string) {
  return useApplicationWrite((facts: FactsInput) => api.update(id, facts));
}

export function useAddStep(id: string) {
  return useApplicationWrite((step: StepInput) => api.addStep(id, step));
}

export function useUndo() {
  return useApplicationWrite((eventId: string) => api.undo(eventId));
}

export function useDeleteApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.remove,
    onSuccess: (_void, id) => {
      qc.removeQueries({ queryKey: keys.app(id) });
      return qc.invalidateQueries({ queryKey: [...keys.apps, "list"] });
    },
  });
}

export function useMarkSeen() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string | null) => (id === null ? api.markAllSeen() : api.markSeen(id)),
    // Lists only: an open detail panel keeps showing which steps were new on this visit.
    onSuccess: () => qc.invalidateQueries({ queryKey: [...keys.apps, "list"] }),
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateSettings,
    onSuccess: ({ settings }) => {
      qc.setQueryData(keys.settings, settings);
      return qc.invalidateQueries({ queryKey: keys.apps });
    },
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteAccount,
    // Nothing cached belongs to anyone any more.
    onSuccess: () => qc.clear(),
  });
}

export function useCreateForwarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createForwarding,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sources }),
  });
}

export function useRotateForwarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.rotate,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.sources }),
  });
}

export function useReview() {
  return useQuery({
    queryKey: keys.review,
    queryFn: () => api.review().then((r) => r.items),
    refetchInterval: 30_000,
  });
}

export function useResolveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: ReviewAction }) =>
      api.resolveReview(id, action),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.review }),
        qc.invalidateQueries({ queryKey: keys.apps }),
        qc.invalidateQueries({ queryKey: keys.messages }),
      ]),
  });
}

/** Stats and the Sankey for one date range; both scoped by the same filter. */
export function useInsights(since: string | null, labels: SankeyLabels) {
  return useQuery({
    queryKey: keys.insights(since, labels),
    queryFn: async () => {
      const [{ stats }, { sankey }] = await Promise.all([
        api.stats(since),
        api.sankey(since, labels),
      ]);
      return { stats, sankey };
    },
    // Hold the previous render while a new range loads (no skeleton flash).
    placeholderData: (previous) => previous,
  });
}
