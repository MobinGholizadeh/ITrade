import { z } from "zod";

export const timeframes = ["1m", "5m", "15m", "1h", "4h", "1d", "1w"] as const;
export const settingsSchema = z
  .object({
    marketProvider: z
      .enum(["coinbase", "binance", "kraken"])
      .default("coinbase"),
    trackedAssets: z
      .array(z.enum(["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK"]))
      .min(1)
      .max(6)
      .refine(
        (items) => new Set(items).size === items.length,
        "Assets must be unique",
      )
      .default(["BTC", "ETH", "SOL"]),
    preferredTimeframe: z.enum(timeframes).default("4h"),
    marketStaleAfterSeconds: z.number().int().min(10).max(300).default(60),
    newsPollIntervalSeconds: z.number().int().min(60).max(3600).default(300),
    analysisIntensity: z.enum(["low", "balanced", "high"]).default("balanced"),
    dailyAiRequestBudget: z.number().int().min(0).max(10000).default(100),
    geminiModel: z
      .string()
      .regex(/^$|^gemini-[a-z0-9.-]+$/)
      .max(100)
      .default(""),
    swingWidth: z.number().int().min(1).max(5).default(2),
    volumeConfirmation: z.number().min(1).max(5).default(1.5),
    zoneAtr: z.number().min(0.05).max(2).default(0.25),
    concentrationWarningPercent: z.number().int().min(5).max(100).default(35),
    alertCooldownMinutes: z.number().int().min(1).max(1440).default(60),
    inAppNotifications: z.boolean().default(true),
    browserNotifications: z.boolean().default(false),
    minimumNotificationPriority: z
      .enum(["critical", "high", "medium", "low"])
      .default("high"),
  })
  .strict();

export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = settingsSchema.parse({});
export const settingsWriteSchema = z
  .object({
    settings: settingsSchema,
    revision: z.number().int().nonnegative(),
  })
  .strict();
export type SettingsRecord = {
  settings: Settings;
  revision: number;
  updatedAt: string | null;
};
