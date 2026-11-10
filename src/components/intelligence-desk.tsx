"use client";
import { useState, useEffect } from "react";
import type { intelligenceSummary } from "@/server/intelligence-service";
export function IntelligenceDesk() {
  const [error, setError] = useState("");
  const [data, setData] = useState<Awaited<
    ReturnType<typeof intelligenceSummary>
  > | null>(null);
  useEffect(() => {
    fetch("/api/intelligence")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then(setData)
      .catch(() =>
        setError(
          "Intelligence data unavailable. Check service health in Settings.",
        ),
      );
  }, []);
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <div className="page-heading">
        <div>
          <div className="eyebrow">INSTITUTIONAL & CROSS-ASSET RESEARCH</div>
          <h1>
            Market intelligence<span className="accent">.</span>
          </h1>
          <p>
            Aligned daily returns, relative strength and source-dated
            institutional data.
          </p>
        </div>
      </div>
      <div className="desk-grid">
        <section className="panel desk-card">
          <h2>Bitcoin sentiment · daily index</h2>
          <div className="value">
            {data?.sentiment?.history[0]?.value ?? "—"} / 100
          </div>
          <p>
            {data?.sentiment?.history[0]?.value_classification ?? "Unavailable"}{" "}
            ·{" "}
            {data?.sentiment?.stale
              ? "Historical / stale"
              : data?.sentiment
                ? "Latest daily observation"
                : "Waiting for provider"}
          </p>
          {data?.sentiment && (
            <p>
              {new Date(
                data.sentiment.history[0].timestamp * 1000,
              ).toLocaleString()}
            </p>
          )}
          <p>
            Source:{" "}
            <a
              href="https://alternative.me/crypto/fear-and-greed-index/"
              target="_blank"
              rel="noreferrer"
            >
              Alternative.me Fear &amp; Greed Index ↗
            </a>
            . Bitcoin-focused composite sentiment, not a buy/sell signal or a
            probability.
          </p>
          {data?.sentiment && (
            <details>
              <summary>Daily history</summary>
              {data.sentiment.history.map((h) => (
                <p key={h.timestamp}>
                  {new Date(h.timestamp * 1000).toLocaleDateString()} ·{" "}
                  {h.value} · {h.value_classification}
                </p>
              ))}
            </details>
          )}
        </section>
        <section className="panel desk-card">
          <h2>Technical breadth</h2>
          <p>{data?.breadth?.label}</p>
          <div className="value">
            {data?.breadth?.bullish ?? "—"} bullish /{" "}
            {data?.breadth?.bearish ?? "—"} bearish
          </div>
          <p>
            {data?.breadth?.coverage ?? 0} assets with sufficient daily history.
            This is a small tracked universe.
          </p>
        </section>
        <section className="panel desk-card">
          <h2>Data coverage</h2>
          {data?.status?.map((s) => (
            <p key={s.name}>
              {s.name} · {s.state}
              <br />
              {s.detail}
            </p>
          ))}
          <p>
            Correlation describes co-movement; it does not establish causation
            or predict returns.
          </p>
        </section>
      </div>
      <section className="panel table-scroll">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th>20-day relative return vs BTC</th>
              <th>Daily return correlation vs BTC</th>
              <th>Aligned observations</th>
            </tr>
          </thead>
          <tbody>
            {data?.ranking?.map((r) => (
              <tr key={r.asset}>
                <td>{r.asset}</td>
                <td>{r.relativeStrength?.toFixed(2) ?? "Unknown"}%</td>
                <td>
                  {r.correlation.coefficient?.toFixed(3) ??
                    "Insufficient variation/history"}
                </td>
                <td>{r.correlation.observations}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="desk-grid">
        <section className="panel desk-card">
          <h2>ETF daily flows · USD</h2>
          {!!data?.flows?.length && (
            <div aria-label="Historical daily reported fund flows">
              <p>
                Each bar is one fund's dated report. Missing reports are not
                plotted as zero; these are not complete market totals.
              </p>
              {data.flows
                .slice()
                .reverse()
                .map((f) => {
                  const value =
                    f.net_flow_usd === null ? null : Number(f.net_flow_usd);
                  const max = Math.max(
                    1,
                    ...data.flows.map((row) =>
                      Math.abs(Number(row.net_flow_usd ?? 0)),
                    ),
                  );
                  return (
                    <div key={`bar-${f.provider}-${f.fund}-${f.report_date}`}>
                      <small>
                        {String(f.report_date).slice(0, 10)} · {f.fund} ·{" "}
                        {value === null
                          ? "Not reported"
                          : value.toLocaleString(undefined, {
                              style: "currency",
                              currency: "USD",
                              maximumFractionDigits: 0,
                            })}
                      </small>
                      {value !== null && (
                        <svg
                          viewBox="0 0 300 18"
                          role="img"
                          aria-label={`${f.fund}: ${value} USD net flow`}
                          style={{ width: "100%", height: 18 }}
                        >
                          <line
                            x1="150"
                            y1="0"
                            x2="150"
                            y2="18"
                            stroke="#606060"
                          />
                          <rect
                            x={
                              value < 0
                                ? 150 - (Math.abs(value) / max) * 145
                                : 150
                            }
                            y="2"
                            width={Math.max(
                              value === 0 ? 0 : 1,
                              (Math.abs(value) / max) * 145,
                            )}
                            height="14"
                            fill={value < 0 ? "#e53935" : "#2ba640"}
                          />
                        </svg>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
          {!data?.flows?.length && (
            <p>
              Unavailable. Configure a licensed flow feed; missing reports are
              never treated as zero flows.
            </p>
          )}
          {data?.flows?.map((f) => (
            <p key={`${f.provider}-${f.fund}-${f.report_date}`}>
              <a href={f.source_url} target="_blank" rel="noreferrer">
                {f.fund} · {f.asset}
              </a>{" "}
              {f.net_flow_usd ?? "Not reported"}
              <br />
              Report {String(f.report_date).slice(0, 10)} · published{" "}
              {new Date(f.published_at).toLocaleString()}
            </p>
          ))}
        </section>
        <section className="panel desk-card">
          <h2>Macro calendar</h2>
          {!data?.macro?.length && (
            <p>No calendar data. Configure an FMP key with calendar access.</p>
          )}
          {data?.macro?.map((e) => (
            <p key={e.id}>
              {e.event} · {e.country}
              <br />
              {new Date(e.event_at).toLocaleString()} · {e.impact}
              <br />
              Actual {e.actual ?? "Pending"} / estimate{" "}
              {e.estimate ?? "Unavailable"}
            </p>
          ))}
        </section>
      </div>
      <section className="panel desk-card">
        <h2>Fund flows and same-day price returns</h2>
        <p>
          Retrospective Pearson correlation per provider and fund, aligned to
          UTC daily close-to-close returns. At least 20 matched reports and
          nonzero variation are required. Reporting dates can differ from
          exchange sessions; publications may arrive later. This measures
          association, not causation or a trading forecast.
        </p>
        {!data?.flowCorrelations.length && (
          <p>No licensed flow history is available yet.</p>
        )}
        {data?.flowCorrelations.map((f) => (
          <p key={f.key}>
            {f.fund} · {f.asset} · {f.provider}:{" "}
            {f.coefficient?.toFixed(3) ??
              "Insufficient paired observations or variation"}{" "}
            · {f.observations} matched dates
          </p>
        ))}
      </section>
      <section className="panel desk-card">
        <h2>Historical watch observations</h2>
        <p>
          24h forward price returns from recorded alerts, not a backtest or
          validated strategy win rate. Includes invalidated signals to reduce
          survivorship bias.
        </p>
        {!data?.evaluations?.length && (
          <p>Insufficient matured alert history.</p>
        )}
        {data?.evaluations?.map((e) => (
          <p key={e.alert_id}>
            {e.asset} · {e.type} · {Number(e.return_percent).toFixed(2)}% ·{" "}
            {new Date(e.observed_at).toLocaleString()}
          </p>
        ))}
      </section>
    </>
  );
}
