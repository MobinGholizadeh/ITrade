import { describe, expect, it } from "vitest";
import {
  D,
  calculateRisk,
  initialRiskPolicy,
  losingStreak,
  journalStats,
  accountIsCurrent,
  targetForRiskMultiple,
  riskProfileSchema,
  type RiskProfile,
  type PlanInput,
  type RiskPlan,
} from "../src/domain/risk";

const now = Date.parse("2026-11-02T12:00:00Z");
export function profile(): RiskProfile {
  return {
    account: {
      currency: "USD",
      equity: "100",
      availableCash: "100",
      peakEquity: "100",
      openRisk: "0",
      openPositions: 0,
      dayStartEquity: "100",
      weekStartEquity: "100",
      dayLoss: "0",
      weekLoss: "0",
      asOf: new Date(now).toISOString(),
    },
    policy: { ...initialRiskPolicy, maxAssetPercent: "100" },
  };
}
export function trade(): PlanInput {
  return {
    asset: "BTC",
    currency: "USD",
    entry: "10",
    stop: "9.5",
    target: "11",
    entryFeePercent: "0",
    exitFeePercent: "0",
    slippagePercent: "0",
    quantityStep: "0.00000001",
    priceTick: "0.01",
    minNotional: "1",
    existingAssetValue: "0",
    groupOpenRisk: "0",
    group: "Crypto",
    timeframe: "1h",
    rationale: "Hypothetical test scenario",
    stopMethod: "scenario",
  };
}
const calc = (p = profile(), t = trade()) => calculateRisk(p, t, now);
describe("spot money management", () => {
  it("sizes the $100 / 2% example as 4 units, not $2 invested", () => {
    const r = calc();
    expect(r.eligible).toBe(true);
    expect(r.budget).toBe("2");
    expect(r.quantity).toBe("4");
    expect(r.cashRequired).toBe("40");
    expect(r.plannedLoss).toBe("2");
    expect(r.netProfit).toBe("4");
    expect(r.rewardRisk).toBe("2");
    expect(r.targetLadder).toEqual([
      { r: 1, price: "10.5" },
      { r: 2, price: "11" },
      { r: 3, price: "11.5" },
    ]);
  });
  it("recalculates fractional risk from reduced equity", () => {
    const p = profile();
    p.account.equity = "98";
    p.account.availableCash = "98";
    expect(calc(p).tradeBudget).toBe("1.96");
  });
  it("includes both fees and adverse slippage in risk and rounds size down", () => {
    const t = {
      ...trade(),
      entryFeePercent: "0.1",
      exitFeePercent: "0.1",
      slippagePercent: "0.1",
    };
    t.target = targetForRiskMultiple(t, 2);
    const r = calc(profile(), t);
    expect(r.eligible).toBe(true);
    expect(r.quantity).toBe("3.71057169");
    expect(new D(r.plannedLoss).lte(2)).toBe(true);
    expect(new D(r.cashRequired).gt(new D(r.quantity).mul(10))).toBe(true);
    expect(new D(r.rewardRisk).gte(2)).toBe(true);
  });
  it("caps size by cash without leverage", () => {
    const p = profile();
    p.account.availableCash = "10";
    const r = calc(p);
    expect(r.quantity).toBe("1");
    expect(r.plannedLoss).toBe("0.5");
    expect(r.limitingFactors).toContain("Available cash");
  });
  it("accounts for existing asset exposure", () => {
    const p = profile();
    p.policy.maxAssetPercent = "30";
    const r = calc(p, { ...trade(), existingAssetValue: "20" });
    expect(r.quantity).toBe("1");
    expect(r.limitingFactors).toContain("Asset allocation cap");
  });
  it("reserves outstanding stop-risk in daily and weekly budgets", () => {
    const p = profile();
    p.account.openPositions = 1;
    p.account.openRisk = "2";
    p.account.dayLoss = "1";
    p.account.weekLoss = "1";
    const r = calc(p);
    expect(r.remainingDaily).toBe("1");
    expect(r.budget).toBe("1");
    expect(r.quantity).toBe("2");
  });
  it("limits a correlated group independently of portfolio heat", () => {
    const p = profile();
    p.account.openPositions = 1;
    p.account.openRisk = "1.5";
    p.policy.maxGroupRiskPercent = "2";
    const r = calc(p, { ...trade(), groupOpenRisk: "1.5" });
    expect(r.budget).toBe("0.5");
    expect(r.quantity).toBe("1");
  });
  it("blocks at exhausted daily budget", () => {
    const p = profile();
    p.account.dayLoss = "4";
    p.account.weekLoss = "4";
    expect(calc(p).eligible).toBe(false);
    expect(calc(p).quantity).toBe("0");
  });
  it("blocks at exhausted weekly budget", () => {
    const p = profile();
    p.account.weekLoss = "8";
    expect(calc(p).eligible).toBe(false);
  });
  it("blocks at drawdown or position count thresholds", () => {
    const p = profile();
    p.account.peakEquity = "125";
    expect(calc(p).blocks.some((b) => b.includes("Drawdown"))).toBe(true);
    p.account.peakEquity = "100";
    p.account.openPositions = 5;
    expect(calc(p).blocks.some((b) => b.includes("simultaneous"))).toBe(true);
  });
  it("never converts USD and USDT implicitly", () =>
    expect(calc(profile(), { ...trade(), currency: "USDT" }).eligible).toBe(
      false,
    ));
  it("blocks stale account snapshots and future timestamps", () => {
    const p = profile();
    for (const asOf of ["2026-11-01T23:59:59Z", "2026-11-02T13:00:00Z"]) {
      p.account.asOf = asOf;
      expect(calc(p).eligible).toBe(false);
    }
  });
  it("requires reconciliation across the UTC day boundary", () =>
    expect(
      accountIsCurrent(
        "2026-11-01T23:59:59Z",
        Date.parse("2026-11-02T00:00:01Z"),
      ),
    ).toBe(false));
  it("rejects an unprotected or reversed long stop", () => {
    for (const stop of ["10", "11", "0"])
      expect(() => calc(profile(), { ...trade(), stop })).toThrow();
  });
  it("rejects infeasible quantities and minimum notional", () => {
    expect(calc(profile(), { ...trade(), quantityStep: "5" }).eligible).toBe(
      false,
    );
    expect(calc(profile(), { ...trade(), minNotional: "50" }).eligible).toBe(
      false,
    );
  });
  it("rounds stops down, targets up, and size down", () => {
    const r = calc(profile(), {
      ...trade(),
      stop: "9.509",
      target: "11.001",
      quantityStep: "0.3",
    });
    expect(r.stop).toBe("9.5");
    expect(r.target).toBe("11.01");
    expect(r.quantity).toBe("3.9");
  });
  it("rejects a target below the net policy minimum", () =>
    expect(calc(profile(), { ...trade(), target: "10.5" }).eligible).toBe(
      false,
    ));
  it("does not let a nominal reward hide transaction costs", () => {
    const r = calc(profile(), {
      ...trade(),
      entry: "10",
      stop: "9.99",
      target: "10.02",
      entryFeePercent: "1",
      exitFeePercent: "1",
    });
    expect(new D(r.netProfit).lt(0)).toBe(true);
    expect(r.eligible).toBe(false);
  });
  it("rejects impossible account snapshots and group inputs", () => {
    const p = profile();
    p.account.availableCash = "101";
    expect(riskProfileSchema.safeParse(p).success).toBe(false);
    expect(() => calc(profile(), { ...trade(), groupOpenRisk: "1" })).toThrow();
  });
  it("rejects NaN, infinity, negative values and unsupported precision", () => {
    for (const value of [
      "NaN",
      "Infinity",
      "-1",
      "1e3",
      "0.0000000000000000001",
    ])
      expect(() => calc(profile(), { ...trade(), entry: value })).toThrow();
  });
  it("maintains loss, cash and allocation invariants across different stops and costs", () => {
    for (const stop of ["1", "5", "8", "9.999"]) {
      for (const fee of ["0", "0.1", "1"]) {
        const t = {
          ...trade(),
          stop,
          entryFeePercent: fee,
          exitFeePercent: fee,
          slippagePercent: "0.2",
        };
        t.target = targetForRiskMultiple(t, 3);
        const p = profile();
        p.policy.maxAssetPercent = "60";
        const r = calc(p, t);
        expect(new D(r.plannedLoss).lte(r.budget)).toBe(true);
        expect(new D(r.cashRequired).lte(p.account.availableCash)).toBe(true);
        expect(new D(r.cashRequired).lte(60)).toBe(true);
        expect(new D(r.quantity).mod(t.quantityStep).eq(0)).toBe(true);
      }
    }
  });
});
describe("scenario and journal math", () => {
  it("compounds losses and calculates the asymmetric recovery", () => {
    const r = losingStreak("100", "2");
    expect(r[0].equity).toBe("98");
    expect(r[1].equity).toBe("90.39207968");
    expect(new D(r[2].recoveryPercent!).gt(r[2].drawdownPercent)).toBe(true);
  });
  it("does not divide by zero after total loss", () =>
    expect(losingStreak("100", "100")[0].recoveryPercent).toBeNull());
  it("reports unknown statistics for an empty journal", () => {
    const s = journalStats([]);
    expect(s.count).toBe(0);
    expect(s.winRate).toBeNull();
    expect(s.profitFactor).toBeNull();
  });
  it("calculates net performance without treating it as a probability", () => {
    const plans = ["4", "-2", "0"].map((netPnl, i) => ({
      id: String(i),
      profile: profile(),
      input: trade(),
      result: calc(),
      revision: 0,
      createdAt: new Date(now).toISOString(),
      outcome: {
        netPnl,
        notes: "Test",
        recordedAt: new Date(now).toISOString(),
      },
    })) as RiskPlan[];
    const s = journalStats(plans);
    expect(s.net).toBe("2");
    expect(s.profitFactor).toBe("2");
    expect(Number(s.winRate)).toBeCloseTo(100 / 3);
    expect(Number(s.averagePlannedR)).toBeCloseTo(1 / 3);
  });
});
