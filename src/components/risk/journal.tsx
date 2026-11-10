"use client";
import { useState } from "react";
import { D, journalStats, type RiskPlan } from "@/domain/risk";
import { Field, formatAmount } from "./fields";

function PlanRow({
  plan,
  onSave,
  busy,
}: {
  plan: RiskPlan;
  onSave: (body: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [pnl, setPnl] = useState(plan.outcome?.netPnl ?? ""),
    [notes, setNotes] = useState(plan.outcome?.notes ?? "");
  return (
    <details className="risk-plan-row">
      <summary>
        <span>
          <strong>
            {plan.input.asset}/{plan.input.currency}
          </strong>
          <small>
            {new Date(plan.createdAt).toLocaleString()} · {plan.input.timeframe}
          </small>
        </span>
        <span className="quiet-tag">
          {plan.outcome ? "Result recorded" : "Saved plan"}
        </span>
        <span>
          {plan.outcome
            ? `${formatAmount(plan.outcome.netPnl)} ${plan.input.currency}`
            : `${formatAmount(plan.result.plannedLoss)} ${plan.input.currency} risk`}
        </span>
      </summary>
      <div className="risk-plan-details">
        <div className="risk-quote-grid">
          <span>
            Entry<strong>{formatAmount(plan.input.entry, 8)}</strong>
          </span>
          <span>
            Stop<strong>{formatAmount(plan.result.stop, 8)}</strong>
          </span>
          <span>
            Target<strong>{formatAmount(plan.result.target, 8)}</strong>
          </span>
          <span>
            Units<strong>{plan.result.quantity}</strong>
          </span>
          <span>
            Planned risk
            <strong>
              {formatAmount(plan.result.plannedLoss)} {plan.input.currency}
            </strong>
          </span>
          <span>
            Net reward/risk
            <strong>{formatAmount(plan.result.rewardRisk)}R</strong>
          </span>
        </div>
        <p className="risk-help">{plan.input.rationale}</p>
        <details className="risk-evidence">
          <summary>Inspect saved assumptions and policy</summary>
          <pre>
            {JSON.stringify(
              {
                accountSnapshot: plan.profile.account,
                policy: plan.profile.policy,
                inputs: plan.input,
                limits: plan.result.limitingFactors,
              },
              null,
              2,
            )}
          </pre>
        </details>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onSave({
              action: "outcome",
              id: plan.id,
              revision: plan.revision,
              netPnl: pnl,
              notes,
            });
          }}
        >
          <p className="risk-help">
            After a real trade, enter its net realized P/L after all fees. This
            is a manual journal record, not a sale or an account balance update.
          </p>
          <Field
            label={`Actual net P/L (${plan.input.currency})`}
            value={pnl}
            onChange={setPnl}
            hint="Use a minus sign for a loss. Include all entry/exit fees."
          />
          <label className="risk-field">
            <span>Review notes</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              required
              placeholder="Actual fills, rule adherence, and what you learned"
            />
          </label>
          <button
            className="button secondary"
            type="submit"
            disabled={busy || !pnl || !notes.trim()}
          >
            Save journal result
          </button>
          {plan.outcome && (
            <p className="risk-help">
              Recorded result / original planned risk:{" "}
              {formatAmount(
                new D(plan.outcome.netPnl)
                  .div(plan.result.plannedLoss)
                  .toString(),
              )}
              R. Differences in actual fills or size are not reconciled
              automatically.
            </p>
          )}
        </form>
      </div>
    </details>
  );
}
export function RiskJournal({
  plans,
  onSave,
  busy,
}: {
  plans: RiskPlan[];
  onSave: (body: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [currency, setCurrency] = useState("USD");
  const selected = plans.filter((p) => p.input.currency === currency),
    stats = journalStats(selected);
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Saved plans & review journal</h2>
        <select
          aria-label="Journal currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="risk-inline-select"
        >
          <option>USD</option>
          <option>USDT</option>
        </select>
      </div>
      <div className="risk-card-body">
        <p className="risk-help">
          Latest 200 plans. Saved plans do not reserve cash or represent open
          positions. Reconcile your account snapshot after trading. Currency
          groups are never combined.
        </p>
        <div className="risk-journal-stats">
          <span>
            Results<strong>{stats.count}</strong>
          </span>
          <span>
            Net P/L
            <strong>{stats.count ? formatAmount(stats.net) : "—"}</strong>
          </span>
          <span>
            Win rate
            <strong>
              {stats.winRate ? `${formatAmount(stats.winRate)}%` : "—"}
            </strong>
          </span>
          <span>
            Profit factor<strong>{formatAmount(stats.profitFactor)}</strong>
          </span>
          <span>
            Average net result<strong>{formatAmount(stats.averagePnl)}</strong>
          </span>
          <span>
            Average planned R
            <strong>
              {stats.averagePlannedR
                ? `${formatAmount(stats.averagePlannedR)}R`
                : "—"}
            </strong>
          </span>
        </div>
        <p className="risk-help">
          Descriptive sample statistics, not forecasts. Profit factor is
          undefined without recorded losses. Break-even trades count in win-rate
          denominator.
        </p>
      </div>
      {selected.length ? (
        selected.map((p) => (
          <PlanRow
            key={`${p.id}:${p.revision}`}
            plan={p}
            onSave={onSave}
            busy={busy}
          />
        ))
      ) : (
        <div className="risk-journal-empty">
          No saved {currency} plans yet. Start with a reconciled account
          snapshot.
        </div>
      )}
    </section>
  );
}
