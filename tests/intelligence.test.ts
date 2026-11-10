import { it, expect } from "vitest";
import {
  correlation,
  flowSchema,
  flowPriceCorrelation,
  calendarTimestamp,
} from "../src/domain/intelligence";
import type { Candle } from "../src/domain/market";
const cs = Array.from({ length: 30 }, (_, i): Candle => ({
  time: i * 86400,
  open: 100 + i * i,
  close: 100 + i * i,
  high: 100 + i * i,
  low: 100 + i * i,
  volume: 1,
}));
it("aligns daily returns and rejects insufficient samples", () => {
  expect(correlation(cs, cs).coefficient).toBeCloseTo(1);
  expect(correlation(cs, cs.slice(20)).coefficient).toBeNull();
});
it("does not bridge missing days", () =>
  expect(
    correlation(
      cs,
      cs.filter((_, i) => i !== 15),
    ).observations,
  ).toBe(27));
it("rejects invented flow chronology", () =>
  expect(
    flowSchema.safeParse({
      provider: "test",
      fund: "x",
      asset: "BTC",
      reportDate: "2026-01-02",
      publishedAt: "2026-01-01T00:00:00.000Z",
      netFlowUsd: null,
      sourceUrl: "https://example.com",
    }).success,
  ).toBe(false));
it("aligns per-fund flows with contiguous daily returns without inventing missing reports", () => {
  const flows = cs
    .slice(1)
    .map((c, i) => ({
      reportDate: new Date(c.time * 1000).toISOString().slice(0, 10),
      netFlowUsd: String((c.close / cs[i].close - 1) * 1e6),
    }));
  expect(flowPriceCorrelation(flows, cs).coefficient).toBeCloseTo(1);
  expect(flowPriceCorrelation([...flows, flows[0]], cs).observations).toBe(29);
  expect(
    flowPriceCorrelation(
      flows.map((f, i) => ({ ...f, netFlowUsd: i < 15 ? null : f.netFlowUsd })),
      cs,
    ).coefficient,
  ).toBeNull();
  expect(
    flowPriceCorrelation(
      flows,
      cs.filter((_, i) => i !== 15),
    ).observations,
  ).toBe(27);
});
it("normalizes calendar timestamps without appending a second timezone", () => {
  expect(calendarTimestamp("2026-11-03 12:00:00")).toBe(
    "2026-11-03T12:00:00.000Z",
  );
  expect(calendarTimestamp("2026-11-03T12:00:00+02:00")).toBe(
    "2026-11-03T10:00:00.000Z",
  );
  expect(() => calendarTimestamp("not a date")).toThrow();
});
