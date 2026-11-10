"use client";
import { useState, useEffect, type FormEvent } from "react";
import { AnalysisView } from "./asset-research";
import type { Analysis } from "@/domain/ai";
type Alert = {
  id: string;
  asset: string;
  type: string;
  priority: string;
  status: string;
  created_at: string;
  expires_at: string;
  evidence: unknown;
  explanation: Analysis | null;
};
type Rule = {
  id: string;
  asset: string;
  lower_price: string;
  upper_price: string;
  provider: string;
  currency: string;
  enabled: boolean;
};
export function AlertsDesk() {
  const [alerts, setAlerts] = useState<Alert[]>([]),
    [rules, setRules] = useState<Rule[]>([]),
    [filter, setFilter] = useState("active"),
    [status, setStatus] = useState("");
  const [currency, setCurrency] = useState("USD");
  async function read() {
    try {
      const r = await fetch("/api/alerts");
      if (!r.ok) throw Error();
      if (r.ok) {
        const d = await r.json();
        setAlerts(d.alerts);
        setRules(d.rules);
        setCurrency(d.currency ?? "USD");
      }
    } catch {
      setAlerts([]);
      setStatus("Alerts unavailable. Check service health in Settings.");
    }
  }
  useEffect(() => {
    void read();
    const t = setInterval(() => void read(), 15000);
    return () => clearInterval(t);
  }, []);
  async function mutate(body: unknown) {
    try {
      const r = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw Error();
      setStatus("Saved");
      await read();
    } catch {
      setStatus("Alert update failed");
    }
  }
  async function rule(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await mutate({
      action: "rule",
      asset: f.get("asset"),
      timeframe: "4h",
      lower: Number(f.get("lower")),
      upper: Number(f.get("upper")),
    });
  }
  async function enablePush() {
    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window))
        throw Error("Push is unavailable in this browser");
      const { publicKey } = await (await fetch("/api/push")).json();
      if (!publicKey) throw Error("Server push keys are not configured");
      if ((await Notification.requestPermission()) !== "granted")
        throw Error("Browser notification permission was not granted");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const key = Uint8Array.from(
        atob(publicKey.replace(/-/g, "+").replace(/_/g, "/")),
        (c) => c.charCodeAt(0),
      );
      const s =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        }));
      const r = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      if (!r.ok) throw Error("Subscription could not be saved");
      setStatus(
        "Device subscribed. Enable browser notifications and choose priorities in Settings.",
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Push unavailable");
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EVIDENCE BEFORE ACTION</div>
          <h1>
            Alerts center<span className="accent">.</span>
          </h1>
          <p>
            Conditional watch events, preserved evidence and explicit lifecycle.
          </p>
        </div>
        <button className="button secondary" onClick={enablePush}>
          Enable this browser for push
        </button>
      </div>
      <p role="status">{status}</p>
      <div className="desk-grid">
        <section className="panel desk-card">
          <h2>Create a price watch zone</h2>
          <form className="desk-form" onSubmit={rule}>
            <label>
              Asset
              <select name="asset">
                {["BTC", "ETH", "SOL", "ADA", "AVAX", "LINK"].map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <label>
              Lower price · {currency}
              <input
                name="lower"
                type="number"
                step="any"
                min="0.00000001"
                required
              />
            </label>
            <label>
              Upper price · {currency}
              <input
                name="upper"
                type="number"
                step="any"
                min="0.00000001"
                required
              />
            </label>
            <button className="button">Save watch zone</button>
          </form>
          <p>
            Uses the selected venue, 4h technical context, and only fresh
            quotes. A touch is an observation, not a buy recommendation.
          </p>
        </section>
        <section className="panel desk-card">
          <h2>Your watch zones</h2>
          {rules.map((r) => (
            <p key={r.id}>
              {r.asset}: {r.lower_price}–{r.upper_price} {r.currency} ·{" "}
              {r.provider} ·{" "}
              {r.enabled ? (
                <button
                  className="button secondary"
                  onClick={() =>
                    void mutate({ action: "disable_rule", id: r.id })
                  }
                >
                  Disable
                </button>
              ) : (
                "Disabled"
              )}
            </p>
          ))}
        </section>
      </div>
      <div className="desk-toolbar">
        <select
          aria-label="Filter alerts"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {[
            "all",
            "active",
            "acknowledged",
            "resolved",
            "expired",
            "invalidated",
          ].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <section className="panel">
        {alerts
          .filter((a) => filter === "all" || a.status === filter)
          .map((a) => (
            <article className="desk-article" key={a.id}>
              <div className="desk-badges">
                <span>{a.priority}</span>
                <span>{a.status}</span>
              </div>
              <h2>
                {a.asset} · {a.type.replaceAll("_", " ")}
              </h2>
              <small>
                {new Date(a.created_at).toLocaleString()} · expires{" "}
                {new Date(a.expires_at).toLocaleString()}
              </small>
              {a.explanation && <AnalysisView analysis={a.explanation} />}
              <details>
                <summary>Inspect preserved evidence</summary>
                <pre
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {JSON.stringify(a.evidence, null, 2)}
                </pre>
              </details>
              {["active", "acknowledged"].includes(a.status) && (
                <div className="desk-actions">
                  {(a.status === "active"
                    ? ["acknowledged", "resolved", "invalidated"]
                    : ["resolved", "invalidated"]
                  ).map((s) => (
                    <button
                      className="button secondary"
                      key={s}
                      onClick={() =>
                        void mutate({ action: "status", id: a.id, status: s })
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        {!alerts.length && (
          <p className="desk-empty">
            No alerts yet. Monitoring continues in the worker while this page is
            closed.
          </p>
        )}
      </section>
    </>
  );
}
