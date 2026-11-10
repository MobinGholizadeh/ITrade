import { z } from "zod";
import { D, positive } from "../domain/risk";
import {
  calculateClosedAtr,
  marketRequestSchema,
  quoteIsFresh,
  snapshotSchema,
  type RiskMarketSnapshot,
} from "../domain/risk-market";

const tickerSchema = z.object({
  price: positive,
  bid: positive,
  ask: positive,
  time: z.iso.datetime(),
});
const productSchema = z.object({
  id: z.string(),
  base_currency: z.string(),
  quote_currency: z.literal("USD"),
  base_increment: positive,
  quote_increment: positive,
  min_market_funds: positive,
  status: z.literal("online"),
  trading_disabled: z.boolean().optional(),
  cancel_only: z.boolean().optional(),
});
type CacheEntry = {
  at: number;
  data?: RiskMarketSnapshot;
  pending?: Promise<RiskMarketSnapshot>;
  failure?: string;
};
const globalCache = globalThis as unknown as {
  riskSnapshots?: Map<string, CacheEntry>;
  riskRequestTimes?: number[];
};
const cache = (globalCache.riskSnapshots ??= new Map());

async function providerJson(path: string) {
  const now = Date.now();
  const times = (globalCache.riskRequestTimes ?? []).filter(
    (t) => now - t < 1000,
  );
  if (times.length >= 6)
    throw new Error("Snapshot request limit reached. Retry in a few seconds.");
  globalCache.riskRequestTimes = [...times, now];
  const response = await fetch(`https://api.exchange.coinbase.com${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    redirect: "error",
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Coinbase rate limit reached; wait before retrying."
        : "Coinbase is unavailable for this request. Use manual planning or try again later.",
    );
  const text = await response.text();
  if (text.length > 200000) throw new Error("Provider response too large");
  return JSON.parse(text);
}
export async function getRiskSnapshot(
  input: z.infer<typeof marketRequestSchema>,
): Promise<RiskMarketSnapshot> {
  const { asset, timeframe } = marketRequestSchema.parse(input);
  const key = `${asset}:${timeframe}`,
    previous = cache.get(key);
  if (previous?.pending) return previous.pending;
  if (previous && Date.now() - previous.at < 15000) {
    if (previous.data && quoteIsFresh(previous.data)) return previous.data;
    if (previous.failure) throw new Error(previous.failure);
  }
  const pending = (async () => {
    try {
      const pair = `${asset}-USD`;
      const [rawTicker, rawProduct] = await Promise.all([
        providerJson(`/products/${pair}/ticker`),
        providerJson(`/products/${pair}`),
      ]);
      const ticker = tickerSchema.parse(rawTicker),
        product = productSchema.parse(rawProduct);
      if (
        product.id !== pair ||
        product.base_currency !== asset ||
        product.trading_disabled ||
        product.cancel_only
      )
        throw new Error("Pair is not available for spot planning");
      if (new D(ticker.bid).gt(ticker.ask))
        throw new Error("Invalid crossed quote from provider");
      let atr: RiskMarketSnapshot["atr"] = null,
        atrUnavailableReason: string | null = null;
      const now = Date.now(),
        seconds = timeframe === "1h" ? 3600 : 86400;
      const query = new URLSearchParams({
        granularity: String(seconds),
        start: new Date(now - 120 * seconds * 1000).toISOString(),
        end: new Date(now).toISOString(),
      });
      try {
        atr = calculateClosedAtr(
          await providerJson(`/products/${pair}/candles?${query}`),
          seconds,
          Date.now(),
        );
      } catch {
        atrUnavailableReason =
          "ATR unavailable: candles failed validation, have gaps, or could not be retrieved.";
      }
      const snapshot = snapshotSchema.parse({
        provider: "Coinbase Exchange",
        asset,
        currency: "USD",
        price: ticker.price,
        bid: ticker.bid,
        ask: ticker.ask,
        eventTime: ticker.time,
        fetchedAt: new Date().toISOString(),
        quantityStep: product.base_increment,
        priceTick: product.quote_increment,
        minNotional: product.min_market_funds,
        atr,
        atrUnavailableReason,
      });
      if (!quoteIsFresh(snapshot))
        throw new Error(
          "Provider trade timestamp is stale or in the future. No fresh reference is available.",
        );
      cache.set(key, { at: Date.now(), data: snapshot });
      return snapshot;
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? "Provider data failed validation."
          : error instanceof Error &&
              error.name !== "TimeoutError" &&
              error.message !== "fetch failed"
            ? error.message
            : "Coinbase could not be reached. Manual planning is still available.";
      cache.set(key, { at: Date.now(), failure: message });
      throw new Error(message);
    }
  })();
  cache.set(key, { at: Date.now(), pending });
  return pending;
}
