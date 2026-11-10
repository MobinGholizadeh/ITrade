"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calculator,
  Check,
  RefreshCw,
  Save,
  ShieldCheck,
  Target,
  TriangleAlert,
} from "lucide-react";
import {
  calculateRisk,
  losingStreak,
  planInputSchema,
  riskAssets,
  accountIsCurrent,
  targetForRiskMultiple,
  type PlanInput,
  type RiskPlan,
  type RiskProfileRecord,
} from "@/domain/risk";
import {
  atrStopCandidate,
  quoteIsFresh,
  type RiskMarketSnapshot,
} from "@/domain/risk-market";
import { AccountEditor } from "./account-editor";
import { MarketReference } from "./market-reference";
import { RiskGuide } from "./guide";
import { RiskJournal } from "./journal";
import { Field, SelectField, formatAmount as fmt } from "./fields";

const initialInput: PlanInput = {
  asset: "BTC",
  currency: "USD",
  entry: "",
  stop: "",
  target: "",
  entryFeePercent: "0.1",
  exitFeePercent: "0.1",
  slippagePercent: "0.1",
  quantityStep: "0.00000001",
  priceTick: "0.01",
  minNotional: "1",
  existingAssetValue: "",
  groupOpenRisk: "",
  group: "Crypto market",
  timeframe: "1h",
  rationale: "",
  stopMethod: "structure",
};

export function RiskDesk() {
  const [record, setRecord] = useState<RiskProfileRecord>({
      profile: null,
      revision: 0,
      updatedAt: null,
    }),
    [plans, setPlans] = useState<RiskPlan[]>([]);
  const [loading, setLoading] = useState(true),
    [storageReady, setStorageReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [input, setInput] = useState(initialInput),
    [snapshot, setSnapshot] = useState<RiskMarketSnapshot | null>(null),
    [multiple, setMultiple] = useState("2"),
    [quoteNote, setQuoteNote] = useState("");
  const [tab, setTab] = useState<"planner" | "journal" | "guide">("planner"),
    [now, setNow] = useState(Date.now());
  const load = useCallback(async () => {
    const response = await fetch("/api/risk");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Risk storage unavailable");
    setRecord(data.profile);
    setPlans(data.plans);
    setStorageReady(true);
  }, []);
  useEffect(() => {
    load()
      .catch((e) => {
        setError(e.message);
        setStorageReady(false);
      })
      .finally(() => setLoading(false));
  }, [load]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const mutate = useCallback(
    async (body: unknown) => {
      setBusy(true);
      setError("");
      setMessage("");
      try {
        const response = await fetch("/api/risk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Save failed");
        await load();
        setMessage(
          "Saved to your local database. No trade or transaction was sent.",
        );
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );
  function change<K extends keyof PlanInput>(key: K, value: PlanInput[K]) {
    setInput((t) => ({ ...t, [key]: value }));
    setMessage("");
    if (key === "entry") setQuoteNote("");
  }
  const calculation = useMemo(() => {
    if (!record.profile)
      return {
        result: null,
        error: "Save your account snapshot to calculate position size.",
      };
    if (!input.entry || !input.stop || !input.target)
      return {
        result: null,
        error:
          "Enter a reference entry, invalidation stop, and target to build a plan.",
      };
    if (!input.existingAssetValue || !input.groupOpenRisk)
      return {
        result: null,
        error:
          "Enter existing asset exposure and related-group stop-risk (0 only if there is none).",
      };
    try {
      return {
        result: calculateRisk(
          record.profile,
          { ...input, rationale: input.rationale || "Draft thesis pending" },
          now,
        ),
        error: null,
      };
    } catch (e) {
      return {
        result: null,
        error: e instanceof Error ? e.message : "Invalid plan inputs",
      };
    }
  }, [record.profile, input, Math.floor(now / 10000)]);
  const result = calculation.result,
    account = record.profile?.account,
    currency = input.currency;
  const streak = record.profile
    ? losingStreak(
        record.profile.account.equity,
        record.profile.policy.riskPercent,
      )
    : [];
  const canSave =
    result?.eligible &&
    planInputSchema.safeParse(input).success &&
    storageReady;
  function copyQuote(s: RiskMarketSnapshot) {
    if (!quoteIsFresh(s) || input.currency !== s.currency) return;
    setInput((t) => ({
      ...t,
      entry: s.ask,
      stop: "",
      target: "",
      quantityStep: s.quantityStep,
      priceTick: s.priceTick,
      minNotional: s.minNotional,
    }));
    setQuoteNote(
      `Entry copied from Coinbase ask at ${new Date(s.fetchedAt).toLocaleTimeString()}. Frozen planning price, not an execution quote.`,
    );
  }
  function applyAtr() {
    if (
      !snapshot?.atr ||
      !quoteIsFresh(snapshot, now) ||
      snapshot.asset !== input.asset ||
      snapshot.currency !== input.currency ||
      !input.entry
    )
      return;
    try {
      const stop = atrStopCandidate(
        input.entry,
        snapshot.atr.value,
        multiple,
        input.priceTick,
      );
      setInput((t) => ({
        ...t,
        stop,
        stopMethod: "atr",
        timeframe: snapshot.atr!.timeframe,
      }));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid ATR candidate");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CAPITAL PRESERVATION · SPOT ONLY</div>
          <h1>
            Money management<span className="accent">.</span>
          </h1>
          <p>
            Define your risk. Size the position. Know what would invalidate the
            trade.
          </p>
        </div>
        <span className="tag">
          <ShieldCheck size={12} /> &nbsp; ADVISORY · NO EXECUTION
        </span>
      </div>
      <section className="risk-intro">
        <div>
          <Calculator size={22} />
          <strong>
            Risk is the amount you plan to lose—not the amount you invest.
          </strong>
        </div>
        <p>
          On $100 of equity, 2% is a $2 loss budget. The entry-to-stop distance
          determines how much to buy. A 2R target aims for $4 before unmodeled
          costs, not automatically $2.
        </p>
        <a
          href="https://www.cmegroup.com/education/courses/trade-and-risk-management/the-2-percent-rule"
          target="_blank"
          rel="noreferrer"
        >
          Why 2% is a configurable reference, not a universal rule ↗
        </a>
      </section>
      <div
        className="risk-tabs"
        role="tablist"
        aria-label="Money management views"
      >
        {(
          [
            ["planner", "Risk planner"],
            ["journal", "Plans & journal"],
            ["guide", "Research & playbook"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            id={`risk-tab-${id}`}
            aria-controls={`risk-panel-${id}`}
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "journal" && plans.length > 0 && (
              <span>{plans.length}</span>
            )}
          </button>
        ))}
      </div>
      {error && (
        <div className="error-message" role="alert">
          {error}
          <button
            className="text-link"
            onClick={() => {
              setError("");
              load().catch((e) => setError(e.message));
            }}
          >
            <RefreshCw size={14} />
            Reload saved data
          </button>
        </div>
      )}
      {message && (
        <div className="success-message" role="status">
          <Check size={16} />
          {message}
        </div>
      )}
      {loading && <p className="risk-help">Loading your risk workspace…</p>}
      {tab === "planner" && (
        <div
          role="tabpanel"
          id="risk-panel-planner"
          aria-labelledby="risk-tab-planner"
        >
          {storageReady && (
            <AccountEditor record={record} onSave={mutate} busy={busy} />
          )}
          <div className="risk-summary-strip">
            <div>
              <small>Reported equity</small>
              <strong>
                {account
                  ? `${fmt(account.equity)} ${account.currency}`
                  : "Not configured"}
              </strong>
            </div>
            <div>
              <small>Per-trade ceiling</small>
              <strong>
                {record.profile
                  ? `${record.profile.policy.riskPercent}% of equity`
                  : "—"}
              </strong>
            </div>
            <div>
              <small>Reported open risk</small>
              <strong>
                {account
                  ? `${fmt(account.openRisk)} ${account.currency}`
                  : "Unknown"}
              </strong>
            </div>
            <div>
              <small>Account snapshot</small>
              <strong
                className={
                  account && accountIsCurrent(account.asOf, now)
                    ? "risk-good"
                    : "risk-warn"
                }
              >
                {account
                  ? accountIsCurrent(account.asOf, now)
                    ? "Manually reconciled"
                    : "Reconciliation required"
                  : "Set up above"}
              </strong>
            </div>
          </div>
          <div className="risk-layout">
            <div className="risk-main-column">
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    <Target size={17} />
                    Build a spot-long plan
                  </h2>
                  <span className="eyebrow">STEP 1 · PRICES & CONTEXT</span>
                </div>
                <div className="risk-card-body">
                  <div className="risk-fields">
                    <SelectField
                      label="Asset"
                      value={input.asset}
                      onChange={(v) => {
                        setInput((t) => ({
                          ...t,
                          asset: v as PlanInput["asset"],
                          entry: "",
                          stop: "",
                          target: "",
                          existingAssetValue: "",
                          quantityStep: initialInput.quantityStep,
                          priceTick: initialInput.priceTick,
                          minNotional: initialInput.minNotional,
                        }));
                        setQuoteNote("");
                        setSnapshot(null);
                      }}
                    >
                      {riskAssets.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </SelectField>
                    <SelectField
                      label="Pair quote currency"
                      value={input.currency}
                      onChange={(v) => {
                        setInput((t) => ({
                          ...t,
                          currency: v as PlanInput["currency"],
                          entry: "",
                          stop: "",
                          target: "",
                        }));
                        setQuoteNote("");
                      }}
                    >
                      <option>USD</option>
                      <option>USDT</option>
                    </SelectField>
                    <Field
                      label="Planned entry price"
                      value={input.entry}
                      onChange={(v) => change("entry", v)}
                      suffix={currency}
                    />
                    <Field
                      label="Invalidation / stop price"
                      value={input.stop}
                      onChange={(v) => change("stop", v)}
                      suffix={currency}
                    />
                    <Field
                      label="Target price"
                      value={input.target}
                      onChange={(v) => change("target", v)}
                      suffix={currency}
                    />
                    <SelectField
                      label="Analysis timeframe"
                      value={input.timeframe}
                      onChange={(v) =>
                        change("timeframe", v as PlanInput["timeframe"])
                      }
                    >
                      <option>1h</option>
                      <option>4h</option>
                      <option>1d</option>
                      <option>1w</option>
                    </SelectField>
                  </div>
                  <button
                    className="button secondary"
                    disabled={!input.entry || !input.stop}
                    onClick={() => {
                      try {
                        change("target", targetForRiskMultiple(input, 2));
                        setError("");
                      } catch (e) {
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Invalid price inputs",
                        );
                      }
                    }}
                  >
                    Calculate a cost-adjusted 2R target
                  </button>
                  {quoteNote && <p className="risk-info">{quoteNote}</p>}
                  <div className="risk-fields">
                    <SelectField
                      label="Stop rationale"
                      value={input.stopMethod}
                      onChange={(v) =>
                        change("stopMethod", v as PlanInput["stopMethod"])
                      }
                    >
                      <option value="structure">
                        My structural invalidation level
                      </option>
                      <option value="atr">ATR volatility candidate</option>
                      <option value="scenario">
                        Hypothetical price scenario
                      </option>
                    </SelectField>
                    <Field
                      label="ATR distance multiplier"
                      value={multiple}
                      onChange={setMultiple}
                      hint="A configurable scenario; not a universal optimal stop."
                    />
                  </div>
                  <button
                    className="button secondary"
                    onClick={applyAtr}
                    disabled={
                      !snapshot?.atr ||
                      !quoteIsFresh(snapshot, now) ||
                      !input.entry ||
                      snapshot.currency !== currency
                    }
                  >
                    Use entry − {multiple || "…"} × ATR as stop candidate
                  </button>
                  <p className="risk-help">
                    A 2% account-risk rule cannot determine a stop price on its
                    own. Choose an invalidation level or review an ATR
                    candidate, then let position sizing enforce the budget.
                  </p>
                  <label className="risk-field">
                    <span>Thesis, confirmation & invalidation notes</span>
                    <textarea
                      maxLength={2000}
                      value={input.rationale}
                      onChange={(e) => change("rationale", e.target.value)}
                      placeholder="Why this entry? What confirms the setup, and what would prove it wrong?"
                    />
                  </label>
                  <details className="risk-advanced" open>
                    <summary>
                      Costs, exchange increments & existing exposure
                    </summary>
                    <p className="risk-help">
                      Fees and slippage start as editable assumptions, not your
                      exchange's fee schedule. All amounts use the pair's quote
                      currency. Zero exposure must be verified, not assumed.
                    </p>
                    <div className="risk-fields">
                      <Field
                        label="Entry fee (%)"
                        value={input.entryFeePercent}
                        onChange={(v) => change("entryFeePercent", v)}
                      />
                      <Field
                        label="Exit fee (%)"
                        value={input.exitFeePercent}
                        onChange={(v) => change("exitFeePercent", v)}
                      />
                      <Field
                        label="Adverse slippage per side (%)"
                        value={input.slippagePercent}
                        onChange={(v) => change("slippagePercent", v)}
                        hint="Allow for spread and slippage; gap losses can be much larger."
                      />
                      <Field
                        label="Quantity increment"
                        value={input.quantityStep}
                        onChange={(v) => change("quantityStep", v)}
                      />
                      <Field
                        label="Price tick"
                        value={input.priceTick}
                        onChange={(v) => change("priceTick", v)}
                      />
                      <Field
                        label="Minimum order notional"
                        value={input.minNotional}
                        onChange={(v) => change("minNotional", v)}
                        suffix={currency}
                      />
                      <Field
                        label={`Existing ${input.asset} exposure`}
                        value={input.existingAssetValue}
                        onChange={(v) => change("existingAssetValue", v)}
                        suffix={currency}
                      />
                      <Field
                        label="Existing related-group stop-risk"
                        value={input.groupOpenRisk}
                        onChange={(v) => change("groupOpenRisk", v)}
                        suffix={currency}
                      />
                      <label className="risk-field">
                        <span>Related asset group</span>
                        <input
                          value={input.group}
                          onChange={(e) => change("group", e.target.value)}
                          maxLength={60}
                        />
                        <small>
                          A manual grouping—not measured statistical
                          correlation.
                        </small>
                      </label>
                    </div>
                  </details>
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>What a losing streak does</h2>
                  <span className="eyebrow">SCENARIO · NOT A FORECAST</span>
                </div>
                <div className="risk-card-body">
                  <p className="risk-help">
                    Assumes each successive loss equals the full risk percentage
                    of remaining equity. No recovery trades, deposits or wins.
                    Policy pauses may stop trading before these scenarios occur.
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Consecutive losses</th>
                          <th>Equity remaining</th>
                          <th>Drawdown</th>
                          <th>Gain needed to recover</th>
                        </tr>
                      </thead>
                      <tbody>
                        {streak.map((row) => (
                          <tr key={row.losses}>
                            <td>{row.losses}</td>
                            <td>
                              {fmt(row.equity)} {account?.currency}
                            </td>
                            <td>{fmt(row.drawdownPercent)}%</td>
                            <td>
                              {row.recoveryPercent
                                ? `${fmt(row.recoveryPercent)}%`
                                : "Not recoverable from zero"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!streak.length && (
                    <p className="risk-help">
                      Save an account snapshot to see your scenarios.
                    </p>
                  )}
                </div>
              </section>
            </div>
            <aside className="risk-side-column">
              <MarketReference
                asset={input.asset}
                currency={currency}
                onCopy={copyQuote}
                onSnapshot={setSnapshot}
              />
              <section className="panel risk-result">
                <div className="panel-heading">
                  <h2>
                    <Calculator size={17} />
                    Position size & risk
                  </h2>
                  {result && (
                    <span
                      className={`risk-state ${result.eligible ? "good" : "bad"}`}
                    >
                      {result.eligible
                        ? "Within entered limits"
                        : "Review required"}
                    </span>
                  )}
                </div>
                <div className="risk-card-body" aria-live="polite">
                  {!result && (
                    <div className="risk-result-empty">
                      <ShieldCheck size={32} />
                      <h3>Start with the risk—not the trade size.</h3>
                      <p>{calculation.error}</p>
                    </div>
                  )}
                  {result && (
                    <>
                      <div className="risk-big-number">
                        <small>Calculated quantity · {input.asset}</small>
                        <strong>{result.quantity}</strong>
                        <span>
                          {fmt(result.cashRequired)} {currency} estimated entry
                          cost
                        </span>
                      </div>
                      <div className="risk-payoff">
                        <div>
                          <small>Loss at modeled stop fill</small>
                          <strong className="risk-loss">
                            −{fmt(result.plannedLoss)} {currency}
                          </strong>
                          <span>
                            {fmt(result.actualRiskPercent)}% of reported equity
                          </span>
                        </div>
                        <div>
                          <small>Net profit at modeled target</small>
                          <strong
                            className={
                              Number(result.netProfit) >= 0
                                ? "risk-good"
                                : "risk-loss"
                            }
                          >
                            {Number(result.netProfit) > 0 ? "+" : ""}
                            {fmt(result.netProfit)} {currency}
                          </strong>
                          <span>
                            {fmt(result.rewardRisk)}R after modeled costs
                          </span>
                        </div>
                      </div>
                      <div className="risk-budget-grid">
                        <span>
                          Per-trade ceiling
                          <strong>{fmt(result.tradeBudget)}</strong>
                        </span>
                        <span>
                          Available risk budget
                          <strong>{fmt(result.budget)}</strong>
                        </span>
                        <span>
                          Daily room (reserves open risk)
                          <strong>{fmt(result.remainingDaily)}</strong>
                        </span>
                        <span>
                          Weekly room (reserves open risk)
                          <strong>{fmt(result.remainingWeekly)}</strong>
                        </span>
                        <span>
                          Portfolio risk room
                          <strong>{fmt(result.remainingHeat)}</strong>
                        </span>
                        <span>
                          Group risk room
                          <strong>{fmt(result.remainingGroup)}</strong>
                        </span>
                      </div>
                      <p className="risk-help">
                        Binding limits: {result.limitingFactors.join(" · ")}.
                        Quantity rounds down; cash and allocation may reduce
                        risk below your ceiling.
                      </p>
                      <div className="risk-targets">
                        <h3>Cost-adjusted target ladder</h3>
                        <p className="risk-help">
                          Mathematical levels, not forecasts. Click to compare a
                          target.
                        </p>
                        <div>
                          {result.targetLadder.map((t) => (
                            <button
                              key={t.r}
                              onClick={() => change("target", t.price)}
                            >
                              <span>{t.r}R</span>
                              <strong>{fmt(t.price, 8)}</strong>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="risk-budget-grid">
                        <span>
                          Break-even exit reference
                          <strong>{fmt(result.breakevenPrice, 8)}</strong>
                        </span>
                        <span>
                          Modeled break-even win rate
                          <strong>{fmt(result.breakevenWinRate)}%</strong>
                        </span>
                        <span>
                          Current drawdown
                          <strong>{fmt(result.drawdownPercent)}%</strong>
                        </span>
                        <span>
                          Gain needed to recover
                          <strong>{fmt(result.recoveryPercent)}%</strong>
                        </span>
                      </div>
                      {result.blocks.length > 0 && (
                        <ul className="risk-blocks">
                          {result.blocks.map((b) => (
                            <li key={b}>
                              <TriangleAlert size={14} />
                              {b}
                            </li>
                          ))}
                        </ul>
                      )}
                      <button
                        className="button primary risk-save-plan"
                        disabled={!canSave || busy}
                        onClick={() =>
                          void mutate({
                            action: "plan",
                            id: crypto.randomUUID(),
                            input,
                            profileRevision: record.revision,
                          })
                        }
                      >
                        <Save size={16} />
                        Save research plan
                      </button>
                      {!input.rationale.trim() && (
                        <p className="risk-help">
                          Add a thesis and invalidation notes before saving.
                        </p>
                      )}
                      <p className="risk-help">
                        Passing these checks means the arithmetic fits your
                        entered policy. It does not validate the investment or
                        place a protective stop.
                      </p>
                      <details className="risk-advanced">
                        <summary>Assumptions & risk limitations</summary>
                        <ul>
                          {result.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </details>
                    </>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}
      {tab === "journal" && (
        <div
          role="tabpanel"
          id="risk-panel-journal"
          aria-labelledby="risk-tab-journal"
        >
          <RiskJournal plans={plans} onSave={mutate} busy={busy} />
        </div>
      )}
      {tab === "guide" && (
        <div
          role="tabpanel"
          id="risk-panel-guide"
          aria-labelledby="risk-tab-guide"
        >
          <RiskGuide />
        </div>
      )}
    </>
  );
}
