import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type Detail, type FactsInput, type StatusFilter, type StepInput } from "./api";

export const keys = {
  me: ["me"] as const,
  config: ["config"] as const,
  apps: ["apps"] as const,
  list: (status: StatusFilter, q: string) => ["apps", "list", status, q] as const,
  app: (id: string) => ["apps", "detail", id] as const,
  settings: ["settings"] as const,
  sources: ["sources"] as const,
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
