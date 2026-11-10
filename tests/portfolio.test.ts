import { it, expect } from "vitest";
import {
  assertReadOnly,
  valueHoldings,
  type Holding,
  basketChange,
  allocationBreakdown,
} from "../src/domain/portfolio";
import { encryptSecret, decryptSecret } from "../src/server/secrets";
it("rejects excessive and unknown exchange permissions", () => {
  for (const permission of [
    "withdraw-funds",
    "modify-trades",
    "transfer-funds",
    "new-unknown-permission",
  ])
    expect(() => assertReadOnly(["query-funds", permission])).toThrow();
  expect(() => assertReadOnly(["query-funds"])).not.toThrow();
});
const h = {
  id: "1",
  asset: "BTC",
  quantity: "0.00000001",
  cost_basis: null,
  connection_id: "1",
  label: "Manual",
  kind: "manual",
  updated_at: new Date().toISOString(),
} satisfies Holding;
it("preserves decimal precision and unknown cost basis", () =>
  expect(valueHoldings([h], { BTC: "100000" }).holdings[0]).toMatchObject({
    value: "0.001",
    pnl: null,
  }));
it("never substitutes a missing price with zero", () =>
  expect(valueHoldings([h], {})).toMatchObject({
    totalValue: null,
    complete: false,
  }));
it("does not assume stablecoins are exactly one dollar", () =>
  expect(valueHoldings([{ ...h, asset: "USDT" }], {}).totalValue).toBeNull());
it("authenticates encrypted credentials", () => {
  process.env.CREDENTIAL_ENCRYPTION_KEY = "1".repeat(64);
  const encrypted = encryptSecret({ key: "test-only" });
  expect(decryptSecret(encrypted)).toEqual({ key: "test-only" });
  expect(encrypted).not.toContain("test-only");
  expect(() => decryptSecret(encrypted.slice(0, -4) + "aaaa")).toThrow();
});
it("attributes price change to current quantities without calling deposits profit", () => {
  const portfolio = valueHoldings(
    [
      { ...h, quantity: "2" },
      { ...h, id: "2", asset: "USD", quantity: "100" },
    ],
    { BTC: "110" },
  );
  expect(basketChange(portfolio.holdings, { BTC: 10 }, true)).toEqual({
    amount: "20.00",
    percent: "6.67",
  });
  expect(basketChange(portfolio.holdings, { BTC: null }, true)).toBeNull();
  expect(basketChange(portfolio.holdings, { BTC: 10 }, false)).toBeNull();
  expect(basketChange(portfolio.holdings, { BTC: -100 }, true)).toBeNull();
});
it("aggregates duplicate asset exposures across sources and leaves incomplete allocation unknown", () => {
  const p = valueHoldings(
    [
      { ...h, quantity: "1" },
      { ...h, id: "2", connection_id: "2", quantity: "1" },
      { ...h, id: "3", asset: "USD", quantity: "100" },
    ],
    { BTC: "50" },
  );
  expect(allocationBreakdown(p.holdings, true)).toEqual([
    { asset: "BTC", value: "100", percent: "50.00", category: "crypto" },
    { asset: "USD", value: "100", percent: "50.00", category: "cash" },
  ]);
  expect(allocationBreakdown(p.holdings, false)).toEqual([]);
});
