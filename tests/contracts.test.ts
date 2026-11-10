import { describe, expect, it } from "vitest";
import { quoteSchema, decimalSchema } from "../src/domain/providers";
import { isFresh } from "../src/domain/health";

describe("provider contract", () => {
  const quote = {
    pairId: "coinbase:BTC-USD",
    provider: "coinbase",
    quoteAsset: "USD",
    price: "100.123456789012345678",
    bid: null,
    ask: null,
    eventTime: "2026-01-01T00:00:00.000Z",
    receivedAt: "2026-01-01T00:00:01.000Z",
  };
  it("retains decimal precision and provider/quote provenance", () =>
    expect(quoteSchema.parse(quote)).toEqual(quote));
  it.each(["NaN", "Infinity", "-1", "1e5", "01", ""])(
    "rejects malformed decimal %s",
    (value) => expect(decimalSchema.safeParse(value).success).toBe(false),
  );
  it("rejects zero prices and missing quote denomination", () => {
    expect(quoteSchema.safeParse({ ...quote, price: "0.000" }).success).toBe(
      false,
    );
    expect(quoteSchema.safeParse({ ...quote, quoteAsset: "" }).success).toBe(
      false,
    );
  });
  it("rejects invalid timestamps and unknown sources", () => {
    expect(
      quoteSchema.safeParse({ ...quote, eventTime: "yesterday" }).success,
    ).toBe(false);
    expect(
      quoteSchema.safeParse({ ...quote, provider: "invented" }).success,
    ).toBe(false);
  });
});
describe("freshness gate", () => {
  const now = Date.parse("2026-01-01T00:01:00Z");
  it("accepts the configured boundary", () =>
    expect(isFresh("2026-01-01T00:00:00Z", now, 60000)).toBe(true));
  it.each([null, "invalid", "2025-12-31T23:59:59Z", "2026-01-01T00:02:00Z"])(
    "rejects unknown, stale, or future timestamps: %s",
    (value) => expect(isFresh(value, now, 60000)).toBe(false),
  );
  it("rejects invalid freshness settings", () =>
    expect(isFresh("2026-01-01T00:01:00Z", now, 0)).toBe(false));
});
