"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Check,
  LoaderCircle,
  RefreshCw,
  Save,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import {
  defaultSettings,
  settingsSchema,
  timeframes,
  type Settings,
  type SettingsRecord,
} from "@/domain/settings";
import { HealthPanel } from "./health-panel";

export function SettingsForm() {
  const [form, setForm] = useState<Settings>(defaultSettings);
  const [record, setRecord] = useState<SettingsRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Settings unavailable");
      setForm(settingsSchema.parse(data.settings));
      setRecord(data);
    } catch (error) {
      setRecord(null);
      setError(error instanceof Error ? error.message : "Settings unavailable");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  function change<K extends keyof Settings>(key: K, value: Settings[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage("");
  }
  const dirty = record
    ? JSON.stringify(form) !== JSON.stringify(record.settings)
    : false;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!record) return;
    const parsed = settingsSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(". "));
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settings: parsed.data,
          revision: record.revision,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Save failed");
      setRecord(data);
      setForm(data.settings);
      setMessage(
        "Preferences saved. Background services pick up changes on their next cycle.",
      );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Settings could not be saved",
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">MAKE IT YOUR WORKSPACE</div>
          <h1>
            Settings<span className="accent">.</span>
          </h1>
          <p>
            Configure your research preferences and inspect the health of your
            services.
          </p>
        </div>
        <span className="tag">LOCAL · SINGLE USER</span>
      </div>
      <div className="settings-grid">
        <form onSubmit={save}>
          <div className="settings-note">
            <Settings2 size={18} />
            <span>
              Market, AI, risk, and notification preferences are stored in
              PostgreSQL. Use Money Management for account risk limits.
            </span>
          </div>
          {error && (
            <div className="error-message" role="alert">
              {error}
              <button
                type="button"
                onClick={() => void load()}
                className="text-link"
              >
                <RefreshCw size={14} />
                Reload settings
              </button>
            </div>
          )}
          {message && (
            <div className="success-message" role="status">
              <Check size={18} />
              {message}
            </div>
          )}
          <fieldset
            disabled={loading || saving || !record}
            className="settings-fieldset"
          >
            <section className="panel settings-panel">
              <div className="panel-heading">
                <h2>Market preferences</h2>
                <span className="eyebrow">DATA</span>
              </div>
              <div className="form-body">
                <div className="form-row">
                  <label htmlFor="provider">
                    Preferred exchange
                    <small>Selection does not activate a connection.</small>
                  </label>
                  <select
                    id="provider"
                    value={form.marketProvider}
                    onChange={(e) =>
                      change(
                        "marketProvider",
                        e.target.value as Settings["marketProvider"],
                      )
                    }
                  >
                    <option value="coinbase">Coinbase Exchange</option>
                    <option value="binance">Binance Spot</option>
                    <option value="kraken">Kraken</option>
                  </select>
                </div>
                <div className="form-row">
                  <div id="assets-label" className="field-label">
                    Tracked assets
                    <small>Choose at least one asset for your watchlist.</small>
                  </div>
                  <div
                    className="asset-options"
                    role="group"
                    aria-labelledby="assets-label"
                  >
                    {(
                      ["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK"] as const
                    ).map((asset) => (
                      <label
                        className={`asset-option ${form.trackedAssets.includes(asset) ? "checked" : ""}`}
                        key={asset}
                      >
                        <input
                          type="checkbox"
                          checked={form.trackedAssets.includes(asset)}
                          onChange={(e) =>
                            change(
                              "trackedAssets",
                              e.target.checked
                                ? [...form.trackedAssets, asset]
                                : form.trackedAssets.filter((a) => a !== asset),
                            )
                          }
                        />
                        {asset}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="form-row">
                  <label htmlFor="timeframe">
                    Preferred timeframe
                    <small>Used for asset research and watch conditions.</small>
                  </label>
                  <select
                    id="timeframe"
                    value={form.preferredTimeframe}
                    onChange={(e) =>
                      change(
                        "preferredTimeframe",
                        e.target.value as Settings["preferredTimeframe"],
                      )
                    }
                  >
                    {timeframes.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label htmlFor="stale">
                    Market freshness limit
                    <small>Seconds before a price is considered stale.</small>
                  </label>
                  <input
                    id="stale"
                    type="number"
                    min="10"
                    max="300"
                    required
                    value={form.marketStaleAfterSeconds}
                    onChange={(e) =>
                      change("marketStaleAfterSeconds", e.target.valueAsNumber)
                    }
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="newsInterval">
                    News polling interval
                    <small>Seconds; provider minimums will also apply.</small>
                  </label>
                  <input
                    id="newsInterval"
                    type="number"
                    min="60"
                    max="3600"
                    required
                    value={form.newsPollIntervalSeconds}
                    onChange={(e) =>
                      change("newsPollIntervalSeconds", e.target.valueAsNumber)
                    }
                  />
                </div>
              </div>
            </section>
            <section className="panel settings-panel">
              <div className="panel-heading">
                <h2>Analysis & risk preferences</h2>
                <span className="eyebrow">RESEARCH POLICY</span>
              </div>
              <div className="form-body">
                <div className="form-row">
                  <label htmlFor="intensity">
                    Analysis intensity
                    <small>
                      How frequently relevant events get AI context.
                    </small>
                  </label>
                  <select
                    id="intensity"
                    value={form.analysisIntensity}
                    onChange={(e) =>
                      change(
                        "analysisIntensity",
                        e.target.value as Settings["analysisIntensity"],
                      )
                    }
                  >
                    <option value="low">Low</option>
                    <option value="balanced">Balanced</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="form-row">
                  <label htmlFor="gemini-model">
                    Gemini model
                    <small>
                      Leave blank to use the server model. Requires access on
                      your Google project.
                    </small>
                  </label>
                  <input
                    id="gemini-model"
                    value={form.geminiModel}
                    onChange={(e) => change("geminiModel", e.target.value)}
                    placeholder="Server default"
                    maxLength={100}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="swing-width">
                    Swing confirmation candles
                    <small>
                      Closed candles required on each side of a pivot.
                    </small>
                  </label>
                  <input
                    id="swing-width"
                    type="number"
                    min={1}
                    max={5}
                    value={form.swingWidth}
                    onChange={(e) =>
                      change("swingWidth", e.target.valueAsNumber)
                    }
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="volume-confirmation">
                    Breakout relative volume
                    <small>
                      Volume multiple used for deterministic confirmation.
                    </small>
                  </label>
                  <input
                    id="volume-confirmation"
                    type="number"
                    min={1}
                    max={5}
                    step={0.1}
                    value={form.volumeConfirmation}
                    onChange={(e) =>
                      change("volumeConfirmation", e.target.valueAsNumber)
                    }
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="zone-atr">
                    Zone proximity · ATR multiple
                  </label>
                  <input
                    id="zone-atr"
                    type="number"
                    min={0.05}
                    max={2}
                    step={0.05}
                    value={form.zoneAtr}
                    onChange={(e) => change("zoneAtr", e.target.valueAsNumber)}
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="budget">
                    Daily AI request budget
                    <small>Set to 0 to disable AI requests.</small>
                  </label>
                  <input
                    id="budget"
                    type="number"
                    min="0"
                    max="10000"
                    required
                    value={form.dailyAiRequestBudget}
                    onChange={(e) =>
                      change("dailyAiRequestBudget", e.target.valueAsNumber)
                    }
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="concentration">
                    Concentration warning (%)
                    <small>Review holdings above this share of value.</small>
                  </label>
                  <input
                    id="concentration"
                    type="number"
                    min="5"
                    max="100"
                    required
                    value={form.concentrationWarningPercent}
                    onChange={(e) =>
                      change(
                        "concentrationWarningPercent",
                        e.target.valueAsNumber,
                      )
                    }
                  />
                </div>
              </div>
            </section>
            <section className="panel settings-panel">
              <div className="panel-heading">
                <h2>Notification preferences</h2>
                <span className="eyebrow">ALERTS</span>
              </div>
              <div className="form-body">
                <div className="form-row">
                  <label htmlFor="inapp">
                    In-app notifications
                    <small>Show qualifying alerts in your workspace.</small>
                  </label>
                  <input
                    id="inapp"
                    className="toggle-input"
                    type="checkbox"
                    checked={form.inAppNotifications}
                    onChange={(e) =>
                      change("inAppNotifications", e.target.checked)
                    }
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="browser">
                    Browser notifications
                    <small>Subscribe this device from the Alerts center.</small>
                  </label>
                  <input
                    id="browser"
                    className="toggle-input"
                    type="checkbox"
                    checked={form.browserNotifications}
                    onChange={(e) =>
                      change("browserNotifications", e.target.checked)
                    }
                  />
                </div>
                <div className="form-row">
                  <label htmlFor="priority">
                    Minimum priority
                    <small>Only notify at or above this level.</small>
                  </label>
                  <select
                    id="priority"
                    value={form.minimumNotificationPriority}
                    onChange={(e) =>
                      change(
                        "minimumNotificationPriority",
                        e.target
                          .value as Settings["minimumNotificationPriority"],
                      )
                    }
                  >
                    {["critical", "high", "medium", "low"].map((p) => (
                      <option key={p} value={p}>
                        {p[0].toUpperCase() + p.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-row">
                  <label htmlFor="cooldown">
                    Alert cooldown (minutes)
                    <small>Minimum time between matching alerts.</small>
                  </label>
                  <input
                    id="cooldown"
                    type="number"
                    min="1"
                    max="1440"
                    required
                    value={form.alertCooldownMinutes}
                    onChange={(e) =>
                      change("alertCooldownMinutes", e.target.valueAsNumber)
                    }
                  />
                </div>
              </div>
            </section>
            <div className="save-bar">
              <span>
                {loading
                  ? "Loading saved preferences…"
                  : record
                    ? dirty
                      ? "You have unsaved changes"
                      : `Saved revision ${record.revision}`
                    : "Database connection required"}
              </span>
              <button
                className="button primary"
                type="submit"
                disabled={!dirty || saving || !record}
              >
                {saving ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Save size={16} />
                )}
                {saving ? "Saving…" : "Save preferences"}
              </button>
            </div>
          </fieldset>
        </form>
        <aside className="settings-aside">
          <HealthPanel detailed />
          <section className="panel settings-info">
            <ShieldCheck size={23} />
            <h2>Credentials stay server-side</h2>
            <p>
              Configure <code>GEMINI_API_KEY</code> and{" "}
              <code>GEMINI_MODEL</code> in your local <code>.env</code> file on
              the server.
            </p>
            <p>
              Manage read-only exchange and wallet connections in Portfolio. The
              browser never receives stored secrets.
            </p>
            <span className="quiet-tag">No trading permissions · Ever</span>
          </section>
          <section className="panel settings-info">
            <h2>Worker setup</h2>
            <p>
              The worker is a separate process. Start infrastructure, apply the
              schema, then launch it in its own terminal.
            </p>
            <pre>
              npm run infra:up{"\n"}npm run db:migrate{"\n"}npm run worker
            </pre>
            <p>
              The worker monitors markets, news, portfolios and alerts
              independently of this page.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
