export const DAY_MS = 86_400_000;

export function toMs(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid timestamp: ${iso}`);
  return ms;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return (toMs(toIso) - toMs(fromIso)) / DAY_MS;
}
