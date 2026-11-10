import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRiskSnapshot } from "../src/server/risk-market";

const fetchMock = vi.fn();
const globals = globalThis as unknown as {
  riskSnapshots?: Map<string, unknown>;
  riskRequestTimes?: number[];
};
function fixture(path: string) {
  if (path.endsWith("/ticker"))
    return {
      price: "100",
      bid: "99.99",
      ask: "100.01",
      time: new Date().toISOString(),
    };
  if (path.includes("/candles?")) {
    const current = Math.floor(Date.now() / 3600000) * 3600;
    return Array.from({ length: 20 }, (_, i) => [
      current - (20 - i) * 3600,
      99,
      101,
      100,
      100,
      10,
    ]);
  }
  return {
    id: "BTC-USD",
    base_currency: "BTC",
    quote_currency: "USD",
    base_increment: "0.00000001",
    quote_increment: "0.01",
    min_market_funds: "1",
    status: "online",
  };
}
beforeEach(() => {
  globals.riskSnapshots?.clear();
  globals.riskRequestTimes = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) =>
    Response.json(fixture(url)),
  );
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
describe("public risk reference adapter", () => {
  it("validates and coalesces a successful snapshot", async () => {
    const [a, b] = await Promise.all([
      getRiskSnapshot({ asset: "BTC", timeframe: "1h" }),
      getRiskSnapshot({ asset: "BTC", timeframe: "1h" }),
    ]);
    expect(a).toEqual(b);
    expect(a.atr?.value).toBe("2.000000000000000000");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    await getRiskSnapshot({ asset: "BTC", timeframe: "1h" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
  it("refuses a stale or future quote", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      Response.json(
        url.endsWith("/ticker")
          ? {
              ...fixture(url),
              time: new Date(Date.now() - 120000).toISOString(),
            }
          : fixture(url),
      ),
    );
    await expect(
      getRiskSnapshot({ asset: "BTC", timeframe: "1h" }),
    ).rejects.toThrow(/stale/);
  });
  it("rejects invalid currencies and crossed spreads", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      Response.json(
        url.endsWith("/ticker")
          ? { ...fixture(url), bid: "101", ask: "100" }
          : fixture(url),
      ),
    );
    await expect(
      getRiskSnapshot({ asset: "BTC", timeframe: "1h" }),
    ).rejects.toThrow(/crossed/);
  });
  it("keeps the validated quote but does not invent missing ATR", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      Response.json(url.includes("/candles?") ? [] : fixture(url)),
    );
    const result = await getRiskSnapshot({ asset: "BTC", timeframe: "1h" });
    expect(result.atr).toBeNull();
    expect(result.atrUnavailableReason).toContain("unavailable");
  });
  it("backs off after provider rate limiting without fabricating data", async () => {
    fetchMock.mockResolvedValue(new Response("limited", { status: 429 }));
    await expect(
      getRiskSnapshot({ asset: "BTC", timeframe: "1h" }),
    ).rejects.toThrow(/rate limit/);
    const count = fetchMock.mock.calls.length;
    await expect(
      getRiskSnapshot({ asset: "BTC", timeframe: "1h" }),
    ).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(count);
  });
  it("never permits an arbitrary endpoint or pair", async () => {
    await expect(
      getRiskSnapshot({ asset: "../accounts", timeframe: "1h" } as never),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
