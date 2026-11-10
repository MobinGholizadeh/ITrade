import { it, expect } from "vitest";
import { streamQuote, reconnectDelay } from "../src/domain/stream";
it("validates Binance spot quote and currency", () => {
  const r = streamQuote("binance", {
    e: "24hrTicker",
    s: "BTCUSDT",
    E: 1700000000000,
    c: "100",
    b: "99",
    a: "101",
    v: "2",
    P: "1",
    h: "105",
    l: "95",
  });
  expect(r?.quote).toMatchObject({
    asset: "BTC",
    currency: "USDT",
    price: "100",
  });
});
it("rejects malformed and nonquote events", () => {
  expect(streamQuote("coinbase", { type: "heartbeat" })).toBeNull();
  expect(streamQuote("binance", { e: "24hrTicker", c: "NaN" })).toBeNull();
});
it("caps reconnection backoff", () => {
  expect(reconnectDelay(0)).toBe(1000);
  expect(reconnectDelay(2)).toBe(4000);
  expect(reconnectDelay(100)).toBe(60000);
});
