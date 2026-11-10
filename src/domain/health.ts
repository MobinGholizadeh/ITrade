export type HealthState =
  "online" | "offline" | "stale" | "not_configured" | "not_implemented";
export type HealthCheck = {
  id: string;
  name: string;
  state: HealthState;
  detail: string;
  checkedAt: string;
  lastSuccessAt: string | null;
};
export type HealthReport = {
  status: "healthy" | "degraded";
  checkedAt: string;
  checks: HealthCheck[];
  milestone: "M10 implementation";
};

export function isFresh(
  timestamp: string | null,
  now: number,
  maxAgeMs: number,
): boolean {
  if (!timestamp || maxAgeMs <= 0) return false;
  const eventTime = Date.parse(timestamp);
  return (
    Number.isFinite(eventTime) &&
    eventTime <= now + 5000 &&
    now - eventTime <= maxAgeMs
  );
}
