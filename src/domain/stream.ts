import { z } from "zod";
import type { Quote } from "./market";
const price = z.coerce.number().finite().positive(),
  volume = z.coerce.number().finite().nonnegative();
export function streamQuote(
  provider: "coinbase" | "kraken" | "binance",
  value: unknown,
  now = Date.now(),
): { quote: Quote; sequence: number } | null {
  const receivedAt = new Date(now).toISOString();
  if (provider === "coinbase") {
    const parsed = z
      .object({
        type: z.literal("ticker"),
        product_id: z.string(),
        sequence: z.number().int(),
        price,
        best_bid: price,
        best_ask: price,
        volume_24h: volume,
        open_24h: price,
        high_24h: price,
        low_24h: price,
        time: z.iso.datetime({ offset: true }),
      })
      .safeParse(value);
    if (!parsed.success) return null;
    const t = parsed.data;
    return {
      sequence: t.sequence,
      quote: {
        asset: t.product_id.split("-")[0],
        provider,
        currency: "USD",
        price: String(t.price),
        bid: String(t.best_bid),
        ask: String(t.best_ask),
        volume: String(t.volume_24h),
        change: (t.price / t.open_24h - 1) * 100,
        high: String(t.high_24h),
        low: String(t.low_24h),
        timestamp: t.time,
        receivedAt,
        marketCap: null,
      },
    };
  }
  if (provider === "binance") {
    const parsed = z
      .object({
        e: z.literal("24hrTicker"),
        s: z.string(),
        E: z.number().int(),
        c: price,
        b: price,
        a: price,
        v: volume,
        P: z.coerce.number().finite(),
        h: price,
        l: price,
      })
      .safeParse(value);
    if (!parsed.success) return null;
    const t = parsed.data;
    return {
      sequence: t.E,
      quote: {
        asset: t.s.replace(/USDT$/, ""),
        provider,
        currency: "USDT",
        price: String(t.c),
        bid: String(t.b),
        ask: String(t.a),
        volume: String(t.v),
        change: t.P,
        high: String(t.h),
        low: String(t.l),
        timestamp: new Date(t.E).toISOString(),
        receivedAt,
        marketCap: null,
      },
    };
  }
  const parsed = z
    .object({
      channel: z.literal("ticker"),
      data: z
        .array(
          z.object({
            symbol: z.string(),
            timestamp: z.iso.datetime({ offset: true }),
            last: price,
            bid: price,
            ask: price,
            volume,
            change_pct: z.number().finite(),
            high: price,
            low: price,
          }),
        )
        .nonempty(),
    })
    .safeParse(value);
  if (!parsed.success) return null;
  const t = parsed.data.data[0];
  return {
    sequence: Date.parse(t.timestamp),
    quote: {
      asset: t.symbol.split("/")[0],
      provider,
      currency: "USD",
      price: String(t.last),
      bid: String(t.bid),
      ask: String(t.ask),
      volume: String(t.volume),
      change: t.change_pct,
      high: String(t.high),
      low: String(t.low),
      timestamp: t.timestamp,
      receivedAt,
      marketCap: null,
    },
  };
}
export const reconnectDelay = (failures: number) =>
  Math.min(60000, 1000 * 2 ** Math.min(failures, 6));
