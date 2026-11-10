import { z } from "zod";
import { getDb } from "./db";
import { providerText, providerJson } from "./provider-http";
import { serviceStatus } from "./market-service";
export const coinIds: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  ADA: "cardano",
  AVAX: "avalanche-2",
  LINK: "chainlink",
};
export const sentimentSchema = z.object({
  data: z
    .array(
      z.object({
        value: z.coerce.number().int().min(0).max(100),
        value_classification: z.enum([
          "Extreme Fear",
          "Fear",
          "Neutral",
          "Greed",
          "Extreme Greed",
        ]),
        timestamp: z.coerce
          .number()
          .int()
          .positive()
          .refine((t) => t * 1000 <= Date.now() + 300000),
      }),
    )
    .min(1)
    .max(31),
  metadata: z.object({ error: z.null() }),
});
export const capitalizationSchema = z
  .array(
    z.object({
      id: z.enum(Object.values(coinIds) as [string, ...string[]]),
      market_cap: z.number().finite().nonnegative().nullable(),
      last_updated: z.iso.datetime(),
    }),
  )
  .max(6);
async function save(name: string, data: unknown) {
  await getDb().query(
    "INSERT INTO market_context(name,data) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET data=$2,updated_at=now()",
    [name, JSON.stringify(data)],
  );
}
export async function syncMarketContext() {
  try {
    const result = sentimentSchema.parse(
      await providerJson("https://api.alternative.me/fng/?limit=30"),
    );
    await save(
      "sentiment",
      result.data.sort((a, b) => b.timestamp - a.timestamp),
    );
    await serviceStatus(
      "sentiment",
      "online",
      "Alternative.me daily sentiment history synchronized; not a trade signal",
    );
  } catch {
    await serviceStatus(
      "sentiment",
      "offline",
      "Sentiment provider unavailable or invalid; previous dated evidence retained",
    );
  }
  if (!process.env.COINGECKO_DEMO_API_KEY) {
    await serviceStatus(
      "metadata",
      "not_configured",
      "CoinGecko Demo API key not configured",
    );
    return;
  }
  try {
    const rows = capitalizationSchema.parse(
      JSON.parse(
        await providerText(
          `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${Object.values(coinIds).join(",")}`,
          { "x-cg-demo-api-key": process.env.COINGECKO_DEMO_API_KEY },
        ),
      ),
    );
    if (new Set(rows.map((r) => r.id)).size !== rows.length)
      throw Error("Duplicate asset");
    await save("capitalization", rows);
    await serviceStatus(
      "metadata",
      "online",
      "CoinGecko USD capitalization synchronized",
    );
  } catch {
    await serviceStatus(
      "metadata",
      "offline",
      "Market metadata unavailable or invalid",
    );
  }
}
export async function readMarketContext() {
  const rows = (
    await getDb().query("SELECT name,data,updated_at FROM market_context")
  ).rows;
  const sentiment = rows.find((r) => r.name === "sentiment");
  const caps = rows.find((r) => r.name === "capitalization");
  return {
    sentiment: sentiment
      ? {
          history: sentiment.data as z.infer<typeof sentimentSchema>["data"],
          fetchedAt: sentiment.updated_at,
          stale:
            Date.now() - (sentiment.data[0]?.timestamp ?? 0) * 1000 >
            48 * 3600000,
          sourceUrl: "https://alternative.me/crypto/fear-and-greed-index/",
        }
      : null,
    capitalization: caps?.data as
      z.infer<typeof capitalizationSchema> | undefined,
  };
}
