import Decimal from "decimal.js";
import { z } from "zod";

export const D = Decimal.clone({
  precision: 50,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 50,
});
export const amount = z
  .string()
  .regex(
    /^(0|[1-9]\d{0,14})(\.\d{1,18})?$/,
    "Use a non-negative decimal, up to 18 decimal places",
  );
export const positive = amount.refine(
  (v) => new D(v).gt(0),
  "Must be greater than zero",
);
const percent = amount.refine((v) => new D(v).lte(100), "Must be at most 100%");
const costPercent = amount.refine((v) => new D(v).lt(20), "Must be below 20%");
export const riskAssets = ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK"] as const;
export const riskPolicySchema = z
  .object({
    riskPercent: percent,
    maxOpenRiskPercent: percent,
    maxGroupRiskPercent: percent,
    dailyLossPercent: percent,
    weeklyLossPercent: percent,
    maxDrawdownPercent: percent,
    maxAssetPercent: percent,
    maxOpenPositions: z.number().int().min(1).max(100),
    minimumRewardRisk: positive.refine((v) => new D(v).lte(20)),
  })
  .strict();
export const initialRiskPolicy = riskPolicySchema.parse({
  riskPercent: "2",
  maxOpenRiskPercent: "6",
  maxGroupRiskPercent: "4",
  dailyLossPercent: "4",
  weeklyLossPercent: "8",
  maxDrawdownPercent: "20",
  maxAssetPercent: "30",
  maxOpenPositions: 5,
  minimumRewardRisk: "2",
});
export const accountSchema = z
  .object({
    currency: z.enum(["USD", "USDT"]),
    equity: positive,
    availableCash: amount,
    peakEquity: positive,
    openRisk: amount,
    openPositions: z.number().int().min(0).max(100),
    dayStartEquity: positive,
    weekStartEquity: positive,
    dayLoss: amount,
    weekLoss: amount,
    asOf: z.iso.datetime(),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (new D(a.availableCash).gt(a.equity))
      ctx.addIssue({
        code: "custom",
        path: ["availableCash"],
        message: "Cash cannot exceed equity in this spot account model",
      });
    if (new D(a.peakEquity).lt(a.equity))
      ctx.addIssue({
        code: "custom",
        path: ["peakEquity"],
        message: "Peak equity cannot be below current equity",
      });
    if (new D(a.weekLoss).lt(a.dayLoss))
      ctx.addIssue({
        code: "custom",
        path: ["weekLoss"],
        message: "Weekly gross losses must include today's losses",
      });
    if (a.openPositions === 0 && new D(a.openRisk).gt(0))
      ctx.addIssue({
        code: "custom",
        path: ["openRisk"],
        message: "Open risk requires an open position",
      });
  });
export const riskProfileSchema = z
  .object({ account: accountSchema, policy: riskPolicySchema })
  .strict();
export type RiskProfile = z.infer<typeof riskProfileSchema>;
export type RiskPolicy = z.infer<typeof riskPolicySchema>;
export const planInputSchema = z
  .object({
    asset: z.enum(riskAssets),
    currency: z.enum(["USD", "USDT"]),
    entry: positive,
    stop: positive,
    target: positive,
    entryFeePercent: costPercent,
    exitFeePercent: costPercent,
    slippagePercent: costPercent,
    quantityStep: positive,
    priceTick: positive,
    minNotional: amount,
    existingAssetValue: amount,
    groupOpenRisk: amount,
    group: z.string().trim().min(1).max(60),
    timeframe: z.enum(["1h", "4h", "1d", "1w"]),
    rationale: z.string().trim().min(5).max(2000),
    stopMethod: z.enum(["structure", "atr", "scenario"]),
  })
  .strict();
export type PlanInput = z.infer<typeof planInputSchema>;
export type RiskProfileRecord = {
  profile: RiskProfile | null;
  revision: number;
  updatedAt: string | null;
};
export type RiskPlan = {
  id: string;
  input: PlanInput;
  result: RiskResult;
  profile: RiskProfile;
  createdAt: string;
  revision: number;
  outcome: { netPnl: string; notes: string; recordedAt: string } | null;
};
export type RiskResult = {
  eligible: boolean;
  blocks: string[];
  warnings: string[];
  budget: string;
  tradeBudget: string;
  quantity: string;
  cashRequired: string;
  plannedLoss: string;
  netProfit: string;
  rewardRisk: string;
  actualRiskPercent: string;
  stop: string;
  target: string;
  breakevenPrice: string;
  breakevenWinRate: string;
  drawdownPercent: string;
  recoveryPercent: string;
  remainingDaily: string;
  remainingWeekly: string;
  remainingHeat: string;
  remainingGroup: string;
  targetLadder: { r: number; price: string }[];
  limitingFactors: string[];
};

export function accountIsCurrent(asOf: string, now = Date.now()) {
  const time = Date.parse(asOf);
  return (
    Number.isFinite(time) &&
    time <= now + 5000 &&
    now - time <= 86400000 &&
    asOf.slice(0, 10) === new Date(now).toISOString().slice(0, 10)
  );
}
export function targetForRiskMultiple(
  trade: Pick<
    PlanInput,
    | "entry"
    | "stop"
    | "entryFeePercent"
    | "exitFeePercent"
    | "slippagePercent"
    | "priceTick"
  >,
  multiple: number,
) {
  for (const value of [trade.entry, trade.stop, trade.priceTick])
    positive.parse(value);
  for (const value of [
    trade.entryFeePercent,
    trade.exitFeePercent,
    trade.slippagePercent,
  ])
    costPercent.parse(value);
  if (!Number.isFinite(multiple) || multiple <= 0 || multiple > 20)
    throw new Error("Choose a target between 0 and 20R");
  const tick = new D(trade.priceTick),
    stop = new D(trade.stop).div(tick).floor().mul(tick);
  if (stop.lte(0) || stop.gte(trade.entry))
    throw new Error("Stop must be positive and below entry");
  const slip = new D(trade.slippagePercent).div(100);
  const cost = new D(trade.entry)
    .mul(new D(1).add(slip))
    .mul(new D(1).add(new D(trade.entryFeePercent).div(100)));
  const exitFactor = new D(1)
    .sub(slip)
    .mul(new D(1).sub(new D(trade.exitFeePercent).div(100)));
  return cost
    .add(cost.sub(stop.mul(exitFactor)).mul(multiple))
    .div(exitFactor)
    .div(tick)
    .ceil()
    .mul(tick)
    .toFixed();
}
const pct = (v: string) => new D(v).div(100);
const str = (v: Decimal) => v.toFixed();
const down = (v: Decimal, step: Decimal) => v.div(step).floor().mul(step);
const up = (v: Decimal, step: Decimal) => v.div(step).ceil().mul(step);

/** Long-only spot sizing; estimates loss at assumed fills, never a guaranteed maximum. */
export function calculateRisk(
  profileInput: RiskProfile,
  tradeInput: PlanInput,
  now = Date.now(),
): RiskResult {
  const { account: a, policy: p } = riskProfileSchema.parse(profileInput);
  const t = planInputSchema.parse(tradeInput);
  const E = new D(a.equity),
    entry = new D(t.entry),
    tick = new D(t.priceTick);
  const stop = down(new D(t.stop), tick),
    target = up(new D(t.target), tick);
  if (stop.lte(0) || stop.gte(entry))
    throw new Error(
      "A spot-long stop must be positive and below entry after tick rounding",
    );
  if (target.lte(entry)) throw new Error("Target must be above entry");
  if (new D(t.groupOpenRisk).gt(a.openRisk))
    throw new Error("Group risk cannot exceed total open risk");
  const slip = pct(t.slippagePercent);
  const entryUnit = entry
    .mul(new D(1).add(slip))
    .mul(new D(1).add(pct(t.entryFeePercent)));
  const exitFactor = new D(1)
    .sub(slip)
    .mul(new D(1).sub(pct(t.exitFeePercent)));
  const unitLoss = entryUnit.sub(stop.mul(exitFactor));
  const unitProfit = target.mul(exitFactor).sub(entryUnit);
  const tradeBudget = E.mul(pct(p.riskPercent));
  const remainingHeat = D.max(
    0,
    E.mul(pct(p.maxOpenRiskPercent)).sub(a.openRisk),
  );
  const remainingGroup = D.max(
    0,
    E.mul(pct(p.maxGroupRiskPercent)).sub(t.groupOpenRisk),
  );
  const remainingDaily = D.max(
    0,
    new D(a.dayStartEquity)
      .mul(pct(p.dailyLossPercent))
      .sub(a.dayLoss)
      .sub(a.openRisk),
  );
  const remainingWeekly = D.max(
    0,
    new D(a.weekStartEquity)
      .mul(pct(p.weeklyLossPercent))
      .sub(a.weekLoss)
      .sub(a.openRisk),
  );
  const budgets = [
    tradeBudget,
    remainingHeat,
    remainingGroup,
    remainingDaily,
    remainingWeekly,
  ];
  const budget = D.min(...budgets);
  const capacity = D.max(
    0,
    E.mul(pct(p.maxAssetPercent)).sub(t.existingAssetValue),
  );
  const sizes = [
    budget.div(unitLoss),
    new D(a.availableCash).div(entryUnit),
    capacity.div(entryUnit),
  ];
  const rawQuantity = D.min(...sizes);
  const quantity = down(rawQuantity, new D(t.quantityStep));
  const cashRequired = quantity.mul(entryUnit),
    loss = quantity.mul(unitLoss),
    profit = quantity.mul(unitProfit);
  const rr = unitProfit.div(unitLoss);
  const drawdown = new D(a.peakEquity).sub(E).div(a.peakEquity).mul(100);
  const recovery = new D(a.peakEquity).sub(E).div(E).mul(100);
  const blocks: string[] = [];
  if (!accountIsCurrent(a.asOf, now))
    blocks.push(
      "Reconcile the account snapshot for the current UTC day before saving a plan.",
    );
  if (a.currency !== t.currency)
    blocks.push(
      "Account and pair quote currency must match. USD and USDT are not converted.",
    );
  if (drawdown.gte(p.maxDrawdownPercent))
    blocks.push(
      "Drawdown pause threshold reached. Review the account before planning more risk.",
    );
  if (a.openPositions >= p.maxOpenPositions)
    blocks.push("Maximum simultaneous positions reached.");
  if (budget.lte(0))
    blocks.push(
      "A risk budget is exhausted. No additional planned risk is available.",
    );
  if (quantity.lte(0))
    blocks.push(
      "Cash, allocation or quantity increment leaves no feasible spot position.",
    );
  if (quantity.mul(entry).lt(t.minNotional))
    blocks.push("Position is below the configured exchange minimum notional.");
  if (rr.lt(p.minimumRewardRisk))
    blocks.push("Net reward/risk is below your policy minimum after costs.");
  const warnings = [
    "Stops do not guarantee fills or cap losses. Actual loss can exceed this estimate.",
    "Account exposure and costs are manually reported; reconcile them after every trade.",
  ];
  if (new D(p.riskPercent).gt(2))
    warnings.push(
      "Per-trade risk exceeds the illustrative 2% reference; loss streaks compound more quickly.",
    );
  if (t.stopMethod === "scenario")
    warnings.push(
      "This stop is an arithmetic scenario, not a chart-validated invalidation level.",
    );
  if (t.stopMethod === "atr")
    warnings.push(
      "ATR is a volatility measure, not a directional signal or a guarantee of a suitable stop.",
    );
  const labels = [
    "Per-trade budget",
    "Portfolio open-risk cap",
    "Related-group risk cap",
    "Daily loss room",
    "Weekly loss room",
  ];
  const limitingFactors = budgets.flatMap((b, i) =>
    b.eq(budget) ? [labels[i]] : [],
  );
  if (sizes[1].eq(rawQuantity)) limitingFactors.push("Available cash");
  if (sizes[2].eq(rawQuantity)) limitingFactors.push("Asset allocation cap");
  return {
    eligible: blocks.length === 0,
    blocks,
    warnings,
    budget: str(budget),
    tradeBudget: str(tradeBudget),
    quantity: str(quantity),
    cashRequired: str(cashRequired),
    plannedLoss: str(loss),
    netProfit: str(profit),
    rewardRisk: str(rr),
    actualRiskPercent: str(loss.div(E).mul(100)),
    stop: str(stop),
    target: str(target),
    breakevenPrice: str(up(entryUnit.div(exitFactor), tick)),
    breakevenWinRate: str(new D(1).div(new D(1).add(D.max(rr, 0))).mul(100)),
    drawdownPercent: str(drawdown),
    recoveryPercent: str(recovery),
    remainingDaily: str(remainingDaily),
    remainingWeekly: str(remainingWeekly),
    remainingHeat: str(remainingHeat),
    remainingGroup: str(remainingGroup),
    targetLadder: [1, 2, 3].map((r) => ({
      r,
      price: str(up(entryUnit.add(unitLoss.mul(r)).div(exitFactor), tick)),
    })),
    limitingFactors,
  };
}

export function losingStreak(equity: string, riskPercent: string) {
  positive.parse(equity);
  percent.parse(riskPercent);
  return [1, 5, 10, 20].map((losses) => {
    const remaining = new D(equity).mul(
      new D(1).sub(pct(riskPercent)).pow(losses),
    );
    return {
      losses,
      equity: str(remaining),
      drawdownPercent: str(new D(1).sub(remaining.div(equity)).mul(100)),
      recoveryPercent: remaining.gt(0)
        ? str(new D(equity).div(remaining).sub(1).mul(100))
        : null,
    };
  });
}

export function journalStats(plans: RiskPlan[]) {
  const records = plans.filter((p) => p.outcome);
  const pnls = records.map((p) => new D(p.outcome!.netPnl));
  const wins = pnls.filter((p) => p.gt(0)),
    losses = pnls.filter((p) => p.lt(0));
  const sum = (values: Decimal[]) =>
    values.reduce((a, b) => a.add(b), new D(0));
  const net = sum(pnls),
    grossProfit = sum(wins),
    grossLoss = sum(losses).abs();
  return {
    count: records.length,
    net: str(net),
    winRate: records.length
      ? str(new D(wins.length).div(records.length).mul(100))
      : null,
    profitFactor: grossLoss.gt(0) ? str(grossProfit.div(grossLoss)) : null,
    averagePnl: records.length ? str(net.div(records.length)) : null,
    averagePlannedR: records.length
      ? str(
          sum(
            records.map((p) =>
              new D(p.outcome!.netPnl).div(p.result.plannedLoss),
            ),
          ).div(records.length),
        )
      : null,
  };
}
