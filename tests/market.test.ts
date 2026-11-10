import { describe, it, expect } from "vitest";
import {
  aggregateCandles,
  closedCandles,
  contiguous,
  ema,
  quoteFresh,
  type Candle,
} from "../src/domain/market";
const c = (time: number): Candle => ({
  time,
  open: 10,
  high: 12,
  low: 8,
  close: 11,
  volume: 3,
});
describe("market reliability", () => {
  it("sorts and deduplicates, excluding unclosed bars", () =>
    expect(
      closedCandles([c(120), c(0), c(0), c(60)], 60, 150000).map((c) => c.time),
    ).toEqual([0, 60]));
  it("rejects corrupt OHLC", () =>
    expect(() => closedCandles([{ ...c(0), high: 9 }], 60)).toThrow());
  it("detects gaps", () => expect(contiguous([c(0), c(120)], 60)).toBe(false));
  it("does not aggregate partial periods", () =>
    expect(aggregateCandles([c(0), c(60)], 60, 300)).toEqual([]));
  it("aggregates complete periods", () =>
    expect(
      aggregateCandles([0, 60, 120, 180, 240].map(c), 60, 300)[0].volume,
    ).toBe(15));
  it("uses SMA seeded EMA warmup", () =>
    expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]));
  it("never calls old or future quotes live", () => {
    const q = {
      timestamp: new Date(0).toISOString(),
      receivedAt: new Date(0).toISOString(),
    } as Parameters<typeof quoteFresh>[0];
    expect(quoteFresh(q, 100000)).toBe(false);
    expect(quoteFresh(q, -10000)).toBe(false);
  });
});
