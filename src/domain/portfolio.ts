import Decimal from "decimal.js";
import { z } from "zod";
const D = Decimal.clone({ precision: 50 });
export const amount = z.string().regex(/^(0|[1-9]\d{0,20})(\.\d{1,24})?$/);
export const manualHolding = z
  .object({
    asset: z.enum([
      "BTC",
      "ETH",
      "SOL",
      "ADA",
      "AVAX",
      "LINK",
      "USD",
      "USDT",
      "USDC",
    ]),
    quantity: amount,
    costBasis: amount.nullable(),
    acquiredAt: z.iso.date().nullable(),
    notes: z.string().max(500).default(""),
  })
  .strict();
export function assertReadOnly(permissions: unknown) {
  const p = z.array(z.string()).nonempty().parse(permissions);
  const allowed = new Set([
    "query-funds",
    "query-open-trades",
    "query-closed-trades",
    "query-ledger",
    "query-ledgers",
    "export-data",
  ]);
  if (!p.includes("query-funds") || p.some((s) => !allowed.has(s)))
    throw Error("Only verified read-only query permissions are allowed");
}
export type Holding = {
  id: string;
  asset: string;
  quantity: string;
  cost_basis: string | null;
  connection_id: string;
  label: string;
  kind: string;
  updated_at: string;
};
export function valueHoldings(rows: Holding[], prices: Record<string, string>) {
  let known = new D(0),
    complete = true;
  const holdings = rows.map((h) => {
    const price = h.asset === "USD" ? "1" : prices[h.asset];
    const value = new D(h.quantity).isZero()
      ? new D(0)
      : price
        ? new D(h.quantity).mul(price)
        : null;
    if (value) known = known.add(value);
    else complete = false;
    return {
      ...h,
      price: price ?? null,
      value: value?.toFixed() ?? null,
      pnl:
        value && h.cost_basis !== null
          ? value.sub(new D(h.quantity).mul(h.cost_basis)).toFixed()
          : null,
    };
  });
  return {
    knownValue: known.toFixed(),
    totalValue: complete ? known.toFixed() : null,
    complete,
    holdings: holdings.map((h) => ({
      ...h,
      allocation:
        complete && known.gt(0) && h.value
          ? new D(h.value).div(known).mul(100).toFixed(2)
          : null,
    })),
  };
}

// Revalues today's quantities at the quote's 24-hour reference price. This is
// attribution for the current basket, never account performance or cash-flow P/L.
export function basketChange(
  holdings: ReturnType<typeof valueHoldings>["holdings"],
  changes: Record<string, number | null>,
  complete: boolean,
) {
  let prior = new D(0),
    current = new D(0);
  if (!complete || !holdings.length) return null;
  for (const h of holdings) {
    if (new D(h.quantity).isZero()) continue;
    const change = h.asset === "USD" ? 0 : changes[h.asset];
    if (
      h.value === null ||
      change === null ||
      change === undefined ||
      !Number.isFinite(change) ||
      change <= -100
    )
      return null;
    current = current.add(h.value);
    prior = prior.add(new D(h.value).div(new D(1).add(new D(change).div(100))));
  }
  return prior.gt(0)
    ? {
        amount: current.sub(prior).toFixed(2),
        percent: current.div(prior).sub(1).mul(100).toFixed(2),
      }
    : null;
}

export function allocationBreakdown(
  holdings: ReturnType<typeof valueHoldings>["holdings"],
  complete: boolean,
) {
  if (!complete) return [];
  const sums = new Map<string, Decimal>();
  for (const h of holdings)
    if (h.value !== null)
      sums.set(h.asset, (sums.get(h.asset) ?? new D(0)).add(h.value));
  const total = [...sums.values()].reduce(
    (sum, value) => sum.add(value),
    new D(0),
  );
  return [...sums]
    .filter(([, value]) => value.gt(0))
    .map(([asset, value]) => ({
      asset,
      value: value.toFixed(),
      percent: value.div(total).mul(100).toFixed(2),
      category:
        asset === "USD"
          ? "cash"
          : ["USDT", "USDC"].includes(asset)
            ? "stablecoin"
            : "crypto",
    }))
    .sort((a, b) => new D(b.value).comparedTo(a.value));
}
