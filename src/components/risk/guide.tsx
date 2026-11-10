import { BookOpen, ExternalLink } from "lucide-react";
const sources = [
  [
    "CME · The 2% rule",
    "https://www.cmegroup.com/education/courses/trade-and-risk-management/the-2-percent-rule",
  ],
  [
    "CME · Position sizing",
    "https://www.cmegroup.com/education/courses/trade-and-risk-management/proper-position-size",
  ],
  [
    "CME · Account risk limits",
    "https://www.cmegroup.com/education/courses/building-a-trade-plan/risk-management-and-your-trade-plan",
  ],
  [
    "Fidelity · ATR and volatility",
    "https://www.fidelity.com/learning-center/trading-investing/technical-analysis/technical-indicator-guide/atr",
  ],
  [
    "Investor.gov · Stop-order risks",
    "https://www.investor.gov/introduction-investing/investing-basics/how-stock-markets-work/types-orders",
  ],
  [
    "FINRA · Concentration risk",
    "https://www.finra.org/investors/insights/concentration-risk",
  ],
  [
    "Fidelity · Exit strategies",
    "https://www.fidelity.com/learning-center/trading-investing/trading/exit-strategies",
  ],
];
export function RiskGuide() {
  return (
    <section className="panel risk-guide">
      <div className="panel-heading">
        <h2>
          <BookOpen size={17} />
          The playbook
        </h2>
        <span className="eyebrow">RESEARCH NOTES</span>
      </div>
      <div className="risk-card-body">
        <div className="risk-example">
          <span className="eyebrow">HYPOTHETICAL · ZERO FEES</span>
          <h3>$100 equity. $2 planned risk.</h3>
          <p>
            At an entry of $10 and a stop of $9.50, the distance is $0.50. A $2
            budget sizes 4 units, costing $40—not $2. This assumes sufficient
            cash and allocation room.
          </p>
          <div>
            <span>
              Stop fill<strong>$98 account</strong>
            </span>
            <span>
              1R win<strong>$102 account</strong>
            </span>
            <span>
              2R win<strong>$104 account</strong>
            </span>
          </div>
          <p>
            These are modeled outcomes, not guaranteed balances. Fees, slippage,
            other holdings and gaps change the result. After a loss to $98, the
            next 2% budget is $1.96.
          </p>
        </div>
        <div className="risk-principles">
          <article>
            <strong>01 · Define the invalidation</strong>
            <p>
              Choose where the trade thesis fails. A percentage or ATR stop is
              only a candidate; support, volatility and liquidity need review.
            </p>
          </article>
          <article>
            <strong>02 · Size to the loss budget</strong>
            <p>
              Calculate quantity after choosing the stop. Cap it by free cash,
              asset exposure and account risk. A wider stop means fewer units.
            </p>
          </article>
          <article>
            <strong>03 · Protect the whole account</strong>
            <p>
              Count open stop-risk across trades and related assets. Respect
              daily/weekly limits and drawdown pauses. Do not double size to
              recover losses.
            </p>
          </article>
          <article>
            <strong>04 · Plan exits and record reality</strong>
            <p>
              R targets are arithmetic milestones, not forecasts. Partial exits
              and trailing stops change the payoff. Record actual net results
              and review the strategy across a meaningful sample.
            </p>
          </article>
        </div>
        <p className="risk-help">
          No percentage is universally safe. A high reward/risk ratio alone does
          not create an edge. Break-even win rate assumes the modeled outcomes;
          historical journal statistics are not probabilities for your next
          trade.
        </p>
        <div className="risk-sources">
          {sources.map(([label, url]) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              {label}
              <ExternalLink size={12} />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
