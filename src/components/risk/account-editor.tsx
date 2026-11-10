"use client";
import { useEffect, useState } from "react";
import { Check, Save, ShieldCheck } from "lucide-react";
import {
  initialRiskPolicy,
  riskProfileSchema,
  type RiskProfileRecord,
} from "@/domain/risk";
import { Field, SelectField } from "./fields";

const accountFields = [
  [
    "equity",
    "Current account equity",
    "Cash + marked-to-market holdings, in the chosen quote currency.",
  ],
  [
    "availableCash",
    "Available cash",
    "Exclude committed orders and cash reserved elsewhere.",
  ],
  [
    "peakEquity",
    "Peak account equity",
    "Adjust the reference for deposits/withdrawals; not a profit target.",
  ],
  [
    "openRisk",
    "Total open stop-risk",
    "Sum planned losses across all existing positions; enter 0 only if none.",
  ],
  ["dayStartEquity", "Start-of-day equity", "Reference balance at 00:00 UTC."],
  [
    "weekStartEquity",
    "Start-of-week equity",
    "Reference balance at Monday 00:00 UTC.",
  ],
  [
    "dayLoss",
    "Today's gross realized losses",
    "Positive loss total. Do not offset it with winning trades.",
  ],
  [
    "weekLoss",
    "This week's gross realized losses",
    "Include today's losses. Winning trades do not replenish this budget.",
  ],
] as const;
const policyFields = [
  ["riskPercent", "Risk per trade (%)"],
  ["maxOpenRiskPercent", "Total open risk cap (%)"],
  ["maxGroupRiskPercent", "Related-group risk cap (%)"],
  ["dailyLossPercent", "Daily loss budget (%)"],
  ["weeklyLossPercent", "Weekly loss budget (%)"],
  ["maxDrawdownPercent", "Pause at drawdown (%)"],
  ["maxAssetPercent", "Maximum asset allocation (%)"],
  ["minimumRewardRisk", "Minimum net reward/risk"],
] as const;

export function AccountEditor({
  record,
  onSave,
  busy,
}: {
  record: RiskProfileRecord;
  onSave: (body: unknown) => Promise<boolean>;
  busy: boolean;
}) {
  const [account, setAccount] = useState<Record<string, string>>({
    currency: "USD",
    equity: "",
    availableCash: "",
    peakEquity: "",
    openRisk: "",
    dayStartEquity: "",
    weekStartEquity: "",
    dayLoss: "",
    weekLoss: "",
    openPositions: "",
  });
  const [policy, setPolicy] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(initialRiskPolicy).map(([k, v]) => [k, String(v)]),
    ),
  );
  const [reconciled, setReconciled] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (record.profile) {
      setAccount(
        Object.fromEntries(
          Object.entries(record.profile.account)
            .filter(([k]) => k !== "asOf")
            .map(([k, v]) => [k, String(v)]),
        ),
      );
      setPolicy(
        Object.fromEntries(
          Object.entries(record.profile.policy).map(([k, v]) => [k, String(v)]),
        ),
      );
    }
    setReconciled(false);
  }, [record]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!reconciled) {
      setError("Confirm that these manual account figures are current.");
      return;
    }
    const parsed = riskProfileSchema.safeParse({
      account: {
        ...account,
        openPositions:
          account.openPositions === "" ? NaN : Number(account.openPositions),
        asOf: new Date().toISOString(),
      },
      policy: { ...policy, maxOpenPositions: Number(policy.maxOpenPositions) },
    });
    if (!parsed.success) {
      setError(
        parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      );
      return;
    }
    await onSave({
      action: "profile",
      profile: parsed.data,
      revision: record.revision,
      reconciled: true,
    });
  }
  return (
    <details className="panel risk-account" open={!record.profile || undefined}>
      <summary>
        <span>
          <ShieldCheck size={19} />
          <strong>Account snapshot & risk policy</strong>
        </span>
        <span className="quiet-tag">
          {record.profile
            ? `Revision ${record.revision} · Manual`
            : "SET UP FIRST"}
        </span>
      </summary>
      <form onSubmit={submit} className="risk-account-body">
        <p className="risk-help">
          Balances and exposure are manually reconciled. This section does not
          read an exchange account. Saved plans and journal results do not
          update these figures automatically.
        </p>
        <fieldset disabled={busy} className="settings-fieldset">
          <div className="risk-fields">
            <SelectField
              label="Account quote currency"
              value={account.currency}
              onChange={(v) => {
                setAccount((a) => ({ ...a, currency: v }));
                setReconciled(false);
              }}
            >
              <option>USD</option>
              <option>USDT</option>
            </SelectField>
            <Field
              label="Existing open positions"
              value={account.openPositions}
              onChange={(v) => {
                setAccount((a) => ({ ...a, openPositions: v }));
                setReconciled(false);
              }}
              hint="Whole number. Include positions outside this planner."
            />
            {accountFields.map(([key, label, hint]) => (
              <Field
                key={key}
                label={label}
                value={account[key]}
                hint={hint}
                suffix={account.currency}
                onChange={(v) => {
                  setAccount((a) => ({ ...a, [key]: v }));
                  setReconciled(false);
                }}
              />
            ))}
          </div>
          <div className="risk-subheading">
            <h3>Your policy</h3>
            <span>
              Editable starting values, not universal professional rules.
            </span>
          </div>
          <div className="risk-fields">
            {policyFields.map(([key, label]) => (
              <Field
                key={key}
                label={label}
                value={policy[key]}
                onChange={(v) => setPolicy((p) => ({ ...p, [key]: v }))}
              />
            ))}
            <Field
              label="Maximum open positions"
              value={policy.maxOpenPositions}
              onChange={(v) =>
                setPolicy((p) => ({ ...p, maxOpenPositions: v }))
              }
            />
          </div>
          <label className="risk-confirm">
            <input
              type="checkbox"
              checked={reconciled}
              onChange={(e) => setReconciled(e.target.checked)}
            />
            <span>
              I have reconciled these balances, open risks, and losses as of
              now. Day/week boundaries use UTC.
            </span>
          </label>
          {error && (
            <p role="alert" className="risk-error">
              {error}
            </p>
          )}
          <div className="risk-save-row">
            <span>
              {record.profile
                ? `Last reconciliation: ${new Date(record.profile.account.asOf).toLocaleString()}`
                : "No account balance has been saved."}
            </span>
            <button
              type="submit"
              className="button primary"
              disabled={!reconciled || busy}
            >
              {reconciled ? <Check size={15} /> : <Save size={15} />}Save
              reconciled snapshot
            </button>
          </div>
        </fieldset>
      </form>
    </details>
  );
}
