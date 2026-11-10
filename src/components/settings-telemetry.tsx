"use client";
import { useState, useEffect } from "react";
type Data = {
  services: {
    name: string;
    state: string;
    detail: string;
    checked_at: string;
  }[];
  aiUsage: {
    status: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
  }[];
  model: string;
  configured: Record<string, boolean>;
};
export function SettingsTelemetry() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    fetch("/api/diagnostics")
      .then((r) => r.json())
      .then((d) => {
        if (d.services) setData(d);
      })
      .catch(() => {});
  }, []);
  return (
    <section className="panel desk-card">
      <h2>Provider diagnostics & AI usage</h2>
      <p>
        Server model: {data?.model ?? "Unavailable"}. API keys and encrypted
        credentials are never returned to this page.
      </p>
      <div className="desk-grid">
        <div>
          {data?.aiUsage.map((u) => (
            <p key={u.status}>
              {u.status}: {u.requests} requests today (UTC), {u.input_tokens}{" "}
              input / {u.output_tokens} output tokens
            </p>
          ))}
        </div>
        <div>
          {Object.entries(data?.configured ?? {}).map(([name, ready]) => (
            <p key={name}>
              {name}: {ready ? "Configured" : "Not configured"}
            </p>
          ))}
        </div>
      </div>
      {data?.services.map((s) => (
        <article key={s.name} className="desk-article">
          <strong>
            {s.name} · {s.state}
          </strong>
          <p>{s.detail}</p>
          <small>{new Date(s.checked_at).toLocaleString()}</small>
        </article>
      ))}
    </section>
  );
}
