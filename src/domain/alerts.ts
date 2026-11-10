export const alertStatuses = [
  "active",
  "acknowledged",
  "resolved",
  "expired",
  "invalidated",
] as const;
export function canTransition(from: string, to: string) {
  return (
    (from === "active" &&
      ["acknowledged", "resolved", "expired", "invalidated"].includes(to)) ||
    (from === "acknowledged" &&
      ["resolved", "expired", "invalidated"].includes(to))
  );
}
export function priorityAllowed(priority: string, minimum: string) {
  const values = ["low", "medium", "high", "critical"];
  return (
    values.indexOf(priority) >= values.indexOf(minimum) &&
    values.includes(priority)
  );
}
