import { describe, expect, it } from "vitest";
import {
  calculateClosedAtr,
  atrStopCandidate,
  quoteIsFresh,
  marketRequestSchema,
  type RiskMarketSnapshot,
} from "../src/domain/risk-market";
const start = Date.parse("2026-11-01T00:00:00Z") / 1000;
const now = (start + 20 * 3600) * 1000;
// Fixed reference series: every closed candle spans [9,11], closes at 10; each true range is exactly 2.
function candles() {
  return Array.from({ length: 20 }, (_, i) => [
    start + i * 3600,
    9,
    11,
    10,
    10,
    100,
  ]);
}
describe("validated ATR reference", () => {
  it("matches a known constant-range dataset and accepts reverse provider order", () => {
    const r = calculateClosedAtr(candles().reverse(), 3600, now);
    expect(r.value).toBe("2.000000000000000000");
    expect(r.candlesUsed).toBe(20);
  });
  it("accounts for price gaps and Wilder smoothing", () => {
    const data = candles().slice(0, 16);
    data[15] = [start + 15 * 3600, 13, 15, 14, 14, 100];
    const r = calculateClosedAtr(data, 3600, (start + 16 * 3600) * 1000);
    expect(Number(r.value)).toBeCloseTo((2 * 13 + 5) / 14, 12);
  });
  it("excludes an unfinished candle", () => {
    const data = candles();
    data.push([start + 20 * 3600, 1, 100, 10, 10, 100]);
    expect(calculateClosedAtr(data, 3600, now + 1000).value).toBe(
      "2.000000000000000000",
    );
  });
  it("rejects gaps and duplicates instead of silently smoothing over them", () => {
    const gap = candles();
    gap.splice(8, 1);
    expect(() => calculateClosedAtr(gap, 3600, now)).toThrow(/Missing/);
    expect(() =>
      calculateClosedAtr([...candles(), candles()[0]], 3600, now),
    ).toThrow(/duplicate/);
  });
  it("rejects insufficient history and old candles", () => {
    expect(() =>
      calculateClosedAtr(candles().slice(0, 10), 3600, now),
    ).toThrow();
    expect(() => calculateClosedAtr(candles(), 3600, now + 7200000)).toThrow(
      /stale/,
    );
  });
  it("rejects impossible OHLC and boundary times", () => {
    const data = candles();
    data[0][3] = 20;
    expect(() => calculateClosedAtr(data, 3600, now)).toThrow();
    data[0] = [start + 1, 9, 11, 10, 10, 100];
    expect(() => calculateClosedAtr(data, 3600, now)).toThrow();
  });
  it("rounds the ATR stop conservatively", () =>
    expect(atrStopCandidate("100", "2.13", "2", "0.1")).toBe("95.7"));
  it("does not propose a nonpositive stop", () =>
    expect(() => atrStopCandidate("1", "2", "2", "0.01")).toThrow());
  it("rejects unsupported query inputs", () => {
    expect(
      marketRequestSchema.safeParse({ asset: "BTC", timeframe: "4h" }).success,
    ).toBe(false);
    expect(
      marketRequestSchema.safeParse({ asset: "../accounts", timeframe: "1h" })
        .success,
    ).toBe(false);
  });
  it("uses both provider and receipt timestamps for freshness", () => {
    const s = {
      eventTime: new Date(now).toISOString(),
      fetchedAt: new Date(now).toISOString(),
    } as RiskMarketSnapshot;
    expect(quoteIsFresh(s, now)).toBe(true);
    expect(quoteIsFresh(s, now + 60001)).toBe(false);
    expect(
      quoteIsFresh(
        { ...s, eventTime: new Date(now + 60000).toISOString() },
        now,
      ),
    ).toBe(false);
  });
});
