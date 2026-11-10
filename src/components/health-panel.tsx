"use client";
import { Activity, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useHealth } from "./health-provider";

export function HealthPanel({ detailed = false }: { detailed?: boolean }) {
  const { report, connected } = useHealth();
  return (
    <section className="panel" id="connections">
      <div className="panel-heading">
        <h2>
          <Activity size={17} />
          Connection health
        </h2>
        <span className="eyebrow">SYSTEM</span>
      </div>
      {!connected && (
        <p className="inline-notice">
          {report
            ? "Health stream disconnected. Last reported states may be stale."
            : "Waiting for the local health service…"}
        </p>
      )}
      <div className="health-list">
        {report?.checks.map((check) => (
          <div className="health-row" key={check.id}>
            <span
              className={`status-dot ${connected ? check.state : "stale"}`}
            />
            <div>
              <strong>{check.name}</strong>
              {detailed && (
                <small>
                  {check.detail}
                  {check.lastSuccessAt &&
                    ` · ${new Date(check.lastSuccessAt).toLocaleString()}`}
                </small>
              )}
            </div>
            <span
              className={`health-state ${connected && check.state === "online" ? "good" : ""}`}
            >
              {!connected
                ? "Unknown"
                : {
                    online: "Online",
                    offline: "Offline",
                    stale: "Stale",
                    not_configured: "Not configured",
                    not_implemented: "Not connected",
                  }[check.state]}
            </span>
          </div>
        )) ?? <p className="muted">Checking database, queue, and worker…</p>}
      </div>
      <div className="panel-footer">
        {detailed ? (
          <span>Infrastructure health does not indicate live market data.</span>
        ) : (
          <Link href="/settings#connections">
            Manage connections
            <ArrowUpRight size={14} />
          </Link>
        )}
      </div>
    </section>
  );
}
