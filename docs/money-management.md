# Money Management — research and implementation

Added at the user's request after M01, before the full M02 market-data milestone. This is a spot-long risk-planning workspace, not an execution system. There is no single professional standard or universally suitable risk percentage.

## Research findings (reviewed 2026-11-02)

- **Fixed fractional risk:** risk a chosen fraction of equity, not that fraction of capital invested. CME describes 2% as a popular but arbitrary threshold. It is configurable, not a promise or a recommended universal setting. [CME: 2% rule](https://www.cmegroup.com/education/courses/trade-and-risk-management/the-2-percent-rule)
- **Stop first, size second:** identify an invalidation level that makes sense for the strategy, then calculate the affordable quantity. A tighter stop increases calculated size but may sit inside normal price noise. [CME: proper position size](https://www.cmegroup.com/education/courses/trade-and-risk-management/proper-position-size)
- **Account limits:** define per-trade loss, daily loss, simultaneous positions and total exposure before trading. This app additionally supports a weekly budget and drawdown pause as configurable policy choices. [CME: risk management plan](https://www.cmegroup.com/education/courses/building-a-trade-plan/risk-management-and-your-trade-plan)
- **Volatility context:** ATR measures volatility, not direction. An ATR multiple can generate a candidate stop distance; it cannot establish a profitable strategy or replace structural invalidation. [Fidelity: ATR](https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr)
- **Execution uncertainty:** a stop-market trigger does not guarantee the fill price. A stop-limit controls price but may not fill. Allow for fees, spread, slippage, gaps and liquidity. Exchange-specific triggers and order availability must be checked separately. [Investor.gov: order types](https://www.investor.gov/introduction-investing/investing-basics/how-stock-markets-work/types-orders)
- **Concentration:** holdings that move together can behave like a single larger position. Cap asset exposure and risk in a manually identified related group; this is not a measured correlation model. [FINRA: concentration risk](https://www.finra.org/investors/insights/concentration-risk)
- **Exit planning:** define exits in advance and review whether the investment still fits the plan. Trailing exits, partial exits and time-based exits are strategy choices, not guarantees. [Fidelity: exit strategies](https://www.fidelity.com/learning-center/trading-investing/trading/exit-strategies)

## Scope

Implemented: persisted risk policy and manual account snapshot, deterministic decimal sizing, fee/slippage assumptions, cash and position-allocation limits, portfolio/group stop-risk limits, daily/weekly loss budgets, drawdown and position-count gates, R-based target ladder, custom target evaluation, losing-streak/recovery scenarios, saved plans, manual net-result journal and descriptive outcome statistics. No Kelly optimization, martingale, doubling after losses, leverage or automated trade execution.

The live reference uses Coinbase public REST ticker, product increments/minimum notional and historical candles. It is an on-demand planning snapshot, separate from the continuous M02 feed. Users explicitly copy a fresh ask into their plan; saved entry/stop prices never drift as new quotes arrive. Supports USD pairs for BTC/ETH/SOL/ADA/AVAX/LINK, hourly/daily ATR14 from closed contiguous candles. Manual USD/USDT planning remains available when Coinbase cannot be reached. There is no automatic provider fallback or currency conversion.

Account snapshots remain explicitly reconciled even with portfolio integration: current equity, available cash, peak equity, total open stop-risk, open position count, daily/weekly opening equity and gross realized losses. Winning trades do not replenish the loss budget. Risk budgets reserve existing open stop-risk. A snapshot must be from the current UTC day and at most 24 hours old. No default fabricated account balance is saved. Plans do not reserve capital or imply actual positions. Journal results do not automatically change the manual account snapshot; reconciling balances and exposures before another plan is required.

## Calculation contract

All amounts use decimal arithmetic. Let E be equity, p the risk fraction, P entry, S stop, s slippage fraction per side, fe/fx entry/exit fee fractions:

```
entry cost per unit = P × (1+s) × (1+fe)
stop proceeds per unit = S × (1−s) × (1−fx)
loss per unit = entry cost − stop proceeds
budget = min(E×p, portfolio risk room, group risk room,
             daily loss room − open risk, weekly loss room − open risk)
quantity = floor_to_step(min(budget/loss_per_unit,
                            free_cash/entry_cost,
                            remaining_asset_allocation/entry_cost))
planned loss = quantity × loss_per_unit
target price for kR = (entry_cost + k×loss_per_unit) / ((1−s)×(1−fx))
```

Stop candidates round down to a price tick, increasing the modeled distance conservatively; targets round up. Quantity always rounds down. Minimum notional uses the reference entry price. For manual plans, exchange steps/minimums are user assumptions and require verification. Fees paid in base assets or a third token require reconciliation; this model assumes quote-currency-equivalent fees.

No-cost example: equity 100, risk 2%, entry 10, stop 9.50, enough cash/allocation room → risk budget 2, quantity 4, position 40. A 1R target at 10.50 yields +2; a 2R target at 11 yields +4. A stop fill at 9.50 yields −2. These are hypothetical arithmetic outcomes, not live prices or guaranteed balances. At the next trade, 2% of 98 is 1.96.

Loss-streak equity is E×(1−p)^n; recovery required is drawdown/(1−drawdown). Target breakeven win rate is 1/(1+net reward/risk), assuming only the modeled full-win/full-loss outcomes. Actual journal win rate, profit factor, average result and planned-risk multiples are descriptive, not predictive. Small samples and selection bias matter. Advanced expectancy/Kelly sizing, Monte Carlo risk-of-ruin, covariance, walk-forward strategy evaluation and live mark-to-market reconciliation require reliable historical/execution data and are deferred.

## Persistence and boundaries

Migration 002 adds risk_profiles and risk_plans with optimistic revisions, immutable calculation/profile evidence, optional manually entered result and audit records. The server recalculates every saved plan using the stored profile; client totals are never trusted. Account edits require explicit reconciliation acknowledgement. Same-origin/JSON/body limits apply to mutations. Plan IDs and revisions protect against duplicate/amended writes. External data is schema checked; stale/future tick times and incomplete candles cannot be used as fresh evidence.

Saved plan prices are user-supplied planning inputs even if copied from a public quote. The transient quote/ATR panel preserves provider timestamps while open, but its raw market response is not persisted as a historical market-data record in MM01. Include the source/candle context in the plan notes when relevant; durable market snapshot linkage belongs to M02. Account/asset/group exposure must be explicitly entered rather than treating unknown holdings as zero.

API sources: [Coinbase ticker](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker), [product metadata](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-single-product), [candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles), [rate limits](https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits). Cache successful snapshots briefly, coalesce concurrent requests and back off on provider failures. No account authentication is needed for these public endpoints. Data is displayed locally with attribution; redistribution rights are not inferred.

Portfolio monitoring now exists, but balances alone cannot establish open stop-risk, committed cash or gross daily losses. The planner therefore retains explicit account reconciliation. CME's 2% guidance and the arbitrary/configurable nature of that threshold were rechecked against the original source on 2026-11-03.
