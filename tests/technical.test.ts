import { it, expect } from "vitest";
import {
  rsi,
  atr,
  macd,
  swings,
  technical,
  relativeStrength,
} from "../src/domain/technical";
import type { Candle } from "../src/domain/market";
const cs = Array.from({ length: 220 }, (_, i): Candle => ({
  time: i * 60,
  open: 10 + i,
  close: 10 + i,
  low: 9 + i,
  high: 11 + i,
  volume: 100,
}));
it("RSI Wilder reference example", () => {
  const values = [
    44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89,
    46.03, 45.61, 46.28, 46.28,
  ];
  expect(rsi(values)).toBeCloseTo(70.4641, 3);
});
it("constant true range ATR and linear MACD", () => {
  expect(atr(cs)).toBe(2);
  expect(macd(cs.map((c) => c.close)).value).toBeCloseTo(7, 8);
});
it("warmup and flat RSI remain explicit", () => {
  expect(rsi([1, 2])).toBeNull();
  expect(rsi(Array(20).fill(1))).toBe(50);
  expect(technical(cs.slice(0, 50), "1m").ready).toBe(false);
});
it("rejects stale and gapped series", () => {
  expect(technical(cs, "1m").ready).toBe(false);
  expect(
    technical(
      cs.filter((_, i) => i !== 100),
      "1m",
      220 * 60000,
    ).ready,
  ).toBe(false);
});
it("pivots require closed candles on both sides", () => {
  const spike = cs
    .slice(0, 4)
    .map((c) => ({ ...c, high: 12, low: 9, open: 10, close: 10 }));
  spike[3].high = 20;
  expect(swings(spike).highs).toEqual([]);
});
it("relative strength matches identical histories", () =>
  expect(relativeStrength(cs, cs)).toBeCloseTo(0));
it("support is not an automatic entry", () =>
  expect(technical(cs, "1m", 220 * 60000)).toMatchObject({
    ready: true,
    state: "no_opportunity",
  }));
