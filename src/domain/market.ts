import { z } from "zod";
export const assets = ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK"] as const;
export const assetSchema = z.enum(assets);
export const intervals = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
} as const;
export type Timeframe = keyof typeof intervals;
export const candleSchema = z
  .object({
    time: z.number().int().nonnegative(),
    open: z.number().positive(),
    high: z.number().positive(),
    low: z.number().positive(),
    close: z.number().positive(),
    volume: z.number().nonnegative(),
  })
  .refine(
    (c) =>
      c.high >= Math.max(c.open, c.close, c.low) &&
      c.low <= Math.min(c.open, c.close),
  );
export type Candle = z.infer<typeof candleSchema>;
export type Quote = {
  freshnessLimitMs?: number;
  asset: string;
  provider: string;
  currency: string;
  price: string;
  bid: string;
  ask: string;
  volume: string;
  change: number | null;
  high: string | null;
  low: string | null;
  timestamp: string;
  receivedAt: string;
  marketCap: number | null;
  marketCapTimestamp?: string | null;
};
export function closedCandles(
  raw: unknown[],
  seconds: number,
  now = Date.now(),
  offset = 0,
): Candle[] {
  const unique = new Map<number, Candle>();
  for (const value of raw) {
    const c = candleSchema.parse(value);
    if ((c.time - offset) % seconds !== 0) throw new Error("Misaligned candle");
    if (c.time + seconds <= Math.floor(now / 1000)) unique.set(c.time, c);
  }
  return [...unique.values()].sort((a, b) => a.time - b.time);
}
export function aggregateCandles(
  base: Candle[],
  baseSeconds: number,
  seconds: number,
): Candle[] {
  const groups = new Map<number, Candle[]>();
  // Weekly candles use Monday 00:00 UTC, rather than the Unix epoch Thursday.
  const offset = seconds === 604800 ? 345600 : 0;
  for (const c of base) {
    const t = Math.floor((c.time - offset) / seconds) * seconds + offset;
    groups.set(t, [...(groups.get(t) ?? []), c]);
  }
  return [...groups].flatMap(([time, cs]) =>
    cs.length === seconds / baseSeconds &&
    cs.every((c, i) => c.time === time + i * baseSeconds)
      ? [
          {
            time,
            open: cs[0].open,
            close: cs.at(-1)!.close,
            high: Math.max(...cs.map((c) => c.high)),
            low: Math.min(...cs.map((c) => c.low)),
            volume: cs.reduce((s, c) => s + c.volume, 0),
          },
        ]
      : [],
  );
}
export function contiguous(cs: Candle[], seconds: number) {
  return cs.every((c, i) => !i || c.time - cs[i - 1].time === seconds);
}
export function quoteFresh(
  q: Quote,
  now = Date.now(),
  age = q.freshnessLimitMs ?? 60000,
) {
  const t = Date.parse(q.timestamp);
  return (
    Number.isFinite(t) &&
    t <= now + 5000 &&
    now - t <= age &&
    now - Date.parse(q.receivedAt) <= age
  );
}
export function ema(values: number[], period: number): (number | null)[] {
  let prev = 0;
  return values.map((v, i) => {
    if (i < period - 1) return null;
    if (i === period - 1)
      prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
    else prev = (v * 2) / (period + 1) + prev * (1 - 2 / (period + 1));
    return prev;
  });
}
