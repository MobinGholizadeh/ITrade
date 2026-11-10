import { it, expect } from "vitest";
import { canTransition, priorityAllowed } from "../src/domain/alerts";
it("allows acknowledgment and terminal transitions only", () => {
  expect(canTransition("active", "acknowledged")).toBe(true);
  expect(canTransition("acknowledged", "expired")).toBe(true);
  expect(canTransition("invalidated", "active")).toBe(false);
  expect(canTransition("resolved", "active")).toBe(false);
});
it("filters priority deterministically", () => {
  expect(priorityAllowed("medium", "high")).toBe(false);
  expect(priorityAllowed("critical", "high")).toBe(true);
  expect(priorityAllowed("unknown", "low")).toBe(false);
});
