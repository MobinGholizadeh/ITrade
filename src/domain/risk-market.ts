import { z } from "zod";
import { D, positive, riskAssets } from "./risk";
import { isFresh } from "./health";

export const marketRequestSchema = z
  .object({ asset: z.enum(riskAssets), timeframe: z.enum(["1h", "1d"]) })
  .strict();
export const snapshotSchema = z.object({
  provider: z.literal("Coinbase Exchange"),
  asset: z.enum(riskAssets),
  currency: z.literal("USD"),
  price: positive,
  bid: positive,
  ask: positive,
  eventTime: z.iso.datetime(),
  fetchedAt: z.iso.datetime(),
  quantityStep: positive,
  priceTick: positive,
  minNotional: positive,
  atr: z
    .object({
      value: positive,
      period: z.literal(14),
      timeframe: z.enum(["1h", "1d"]),
      candleCloseAt: z.iso.datetime(),
      candlesUsed: z.number().int().min(15),
    })
    .nullable(),
  atrUnavailableReason: z.string().nullable(),
});
export type RiskMarketSnapshot = z.infer<typeof snapshotSchema>;
const priceNumber = z.number().finite().positive();
const candleSchema = z.tuple([
  z.number().int().nonnegative(),
  priceNumber,
  priceNumber,
  priceNumber,
  priceNumber,
  z.number().finite().nonnegative(),
]);

/** Coinbase arrays are [time, low, high, open, close, volume]. Excludes unfinished candles. */
export function calculateClosedAtr(
  raw: unknown,
  seconds: number,
  now = Date.now(),
) {
  const candles = z
    .array(candleSchema)
    .max(300)
    .parse(raw)
    .filter((c) => (c[0] + seconds) * 1000 <= now)
    .sort((a, b) => a[0] - b[0]);
  if (candles.length < 15)
    throw new Error("At least 15 closed candles are required for ATR14");
  for (let i = 0; i < candles.length; i++) {
    const [time, low, high, open, close] = candles[i];
    if (
      time % seconds !== 0 ||
      low > high ||
      open < low ||
      open > high ||
      close < low ||
      close > high
    )
      throw new Error("Invalid candle values");
    if (i > 0 && time - candles[i - 1][0] !== seconds)
      throw new Error("Missing or duplicate candles; ATR is unavailable");
  }
  const lastClose = (candles.at(-1)![0] + seconds) * 1000;
  if (now - lastClose > seconds * 1000 + 30000)
    throw new Error("Closed candles are stale");
  const ranges = candles
    .slice(1)
    .map((c, i) =>
      D.max(
        new D(c[2]).sub(c[1]),
        new D(c[2]).sub(candles[i][4]).abs(),
        new D(c[1]).sub(candles[i][4]).abs(),
      ),
    );
  let atr = ranges
    .slice(0, 14)
    .reduce((a, b) => a.add(b), new D(0))
    .div(14);
  for (const range of ranges.slice(14)) atr = atr.mul(13).add(range).div(14);
  if (atr.lte(0))
    throw new Error("No measurable volatility in the supplied candles");
  return {
    value: atr.toFixed(18),
    period: 14 as const,
    timeframe: seconds === 3600 ? ("1h" as const) : ("1d" as const),
    candleCloseAt: new Date(lastClose).toISOString(),
    candlesUsed: candles.length,
  };
}
export function quoteIsFresh(snapshot: RiskMarketSnapshot, now = Date.now()) {
  return (
    isFresh(snapshot.eventTime, now, 60000) &&
    isFresh(snapshot.fetchedAt, now, 60000)
  );
}
export function atrStopCandidate(
  entry: string,
  atr: string,
  multiple: string,
  tick: string,
) {
  for (const value of [entry, atr, multiple, tick]) positive.parse(value);
  if (new D(multiple).gt(10))
    throw new Error("ATR multiple must not exceed 10");
  const stop = new D(entry)
    .sub(new D(atr).mul(multiple))
    .div(tick)
    .floor()
    .mul(tick);
  if (stop.lte(0) || stop.gte(entry))
    throw new Error("This ATR distance does not produce a valid positive stop");
  return stop.toFixed();
}
