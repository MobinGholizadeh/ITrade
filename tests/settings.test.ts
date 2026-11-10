import { describe, expect, it } from "vitest";
import {
  defaultSettings,
  settingsSchema,
  settingsWriteSchema,
} from "../src/domain/settings";

describe("settings contract", () => {
  it("uses conservative defaults without creating market data", () => {
    expect(defaultSettings.trackedAssets).toEqual(["BTC", "ETH", "SOL"]);
    expect(defaultSettings.browserNotifications).toBe(false);
    expect(defaultSettings.preferredTimeframe).toBe("4h");
  });
  it.each([
    { trackedAssets: [] },
    { trackedAssets: ["BTC", "BTC"] },
    { trackedAssets: ["FAKE"] },
    { marketProvider: "untrusted" },
    { dailyAiRequestBudget: -1 },
    { dailyAiRequestBudget: 1.2 },
    { marketStaleAfterSeconds: 1 },
    { newsPollIntervalSeconds: 1 },
    { concentrationWarningPercent: 101 },
    { alertCooldownMinutes: 0 },
    { apiKey: "never-store-secrets-here" },
    { executeOrders: true },
    { inAppNotifications: "true" },
  ])("rejects unsafe or unsupported input %j", (input) =>
    expect(settingsSchema.safeParse(input).success).toBe(false),
  );
  it("allows explicitly disabling the AI budget", () =>
    expect(
      settingsSchema.parse({ dailyAiRequestBudget: 0 }).dailyAiRequestBudget,
    ).toBe(0));
  it("requires a revision and rejects extra write fields", () => {
    expect(
      settingsWriteSchema.safeParse({ settings: defaultSettings }).success,
    ).toBe(false);
    expect(
      settingsWriteSchema.safeParse({ settings: defaultSettings, revision: -1 })
        .success,
    ).toBe(false);
    expect(
      settingsWriteSchema.safeParse({
        settings: defaultSettings,
        revision: 0,
        secret: "x",
      }).success,
    ).toBe(false);
  });
});
