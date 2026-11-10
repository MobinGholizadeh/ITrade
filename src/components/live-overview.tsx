"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { useQuotes } from "./market-desk";
import { HealthPanel } from "./health-panel";
export function LiveOverview() {
  const [error, setError] = useState("");
  const [sentiment, setSentiment] = useState<{
    history: {
      value: number;
      value_classification: string;
      timestamp: number;
    }[];
    stale: boolean;
  } | null>(null);
  const quotes = useQuotes();
  const [summary, setSummary] = useState<{
      holdings: unknown[];
      totalValue: string | null;
      knownValue: string;
    } | null>(null),
    [news, setNews] = useState<
      {
        id: string;
        title: string;
        source: string;
        canonical_url: string;
        published_at: string;
      }[]
    >([]),
    [alerts, setAlerts] = useState<
      {
        id: string;
        asset: string;
        type: string;
        priority: string;
        status: string;
      }[]
    >([]);
  useEffect(() => {
    const ctrl = new AbortController();
    async function read() {
      const results = await Promise.allSettled([
        fetch("/api/portfolio", { signal: ctrl.signal })
          .then((r) => {
            if (!r.ok) throw Error();
            return r.json();
          })
          .then(setSummary),
        fetch("/api/news", { signal: ctrl.signal })
          .then((r) => {
            if (!r.ok) throw Error();
            return r.json();
          })
          .then((d) => setNews(d.articles ?? [])),
        fetch("/api/alerts", { signal: ctrl.signal })
          .then((r) => {
            if (!r.ok) throw Error();
            return r.json();
          })
          .then((d) => setAlerts(d.alerts ?? [])),
        fetch("/api/intelligence", { signal: ctrl.signal })
          .then((r) => {
            if (!r.ok) throw Error();
            return r.json();
          })
          .then((d) => setSentiment(d.sentiment)),
      ]);
      if (!ctrl.signal.aborted)
        setError(
          results.some((r) => r.status === "rejected")
            ? "Some workspace data could not refresh. Previously displayed records may be stale; check Settings."
            : "",
        );
    }
    void read();
    const timer = setInterval(read, 30000);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, []);
  return (
    <>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR MARKET WORKSPACE</div>
          <h1>
            A clearer view of the market<span className="accent">.</span>
          </h1>
          <p>
            Continuous spot monitoring, evidence-based research, and your risk
            plan.
          </p>
        </div>
        <Link href="/money-management" className="button">
          Plan a trade’s risk
        </Link>
      </div>
      <div className="desk-grid">
        <section className="panel desk-card">
          <h2>Tracked portfolio</h2>
          <div className="value">
            {summary?.holdings?.length
              ? (summary.totalValue ?? "Incomplete valuation")
              : "No holdings yet"}
          </div>
          <p>USD · {summary?.holdings?.length ?? 0} holding records</p>
          <small>
            Daily trading P/L requires reconciled deposits, withdrawals and
            costs; it is not inferred from balance changes.
          </small>
          <Link href="/portfolio">Manage portfolio →</Link>
        </section>
        {quotes
          .slice()
          .sort((a, b) => a.asset.localeCompare(b.asset))
          .slice(0, 3)
          .map((q) => (
            <section className="panel desk-card" key={q.asset}>
              <h2>
                <Link href={`/assets/${q.asset}`}>
                  {q.asset} / {q.currency} ↗
                </Link>
              </h2>
              <div className="value">{Number(q.price).toLocaleString()}</div>
              <p className={(q.change ?? 0) >= 0 ? "positive" : "negative"}>
                {q.change?.toFixed(2)}% · 24h
              </p>
              <small>
                {q.provider} · {q.fresh ? "Live" : "Stale"}
                <br />
                {new Date(q.timestamp).toLocaleString()}
              </small>
            </section>
          ))}
      </div>
      <div className="desk-grid">
        <section className="panel desk-card">
          <h2>Bitcoin sentiment</h2>
          <div className="value">
            {sentiment?.history[0]?.value ?? "—"} / 100
          </div>
          <p>
            {sentiment?.history[0]?.value_classification ?? "Unavailable"} ·{" "}
            {!sentiment
              ? "Waiting for source"
              : sentiment.stale
                ? "Historical / stale"
                : "Daily index"}
          </p>
          {sentiment && (
            <small>
              {new Date(sentiment.history[0].timestamp * 1000).toLocaleString()}
            </small>
          )}
          <p>
            <a
              href="https://alternative.me/crypto/fear-and-greed-index/"
              target="_blank"
              rel="noreferrer"
            >
              Data by Alternative.me ↗
            </a>
          </p>
          <Link href="/intelligence">Intelligence and methodology →</Link>
        </section>
        <section className="panel desk-card">
          <h2>Highest-priority active watches</h2>
          {alerts
            .filter((a) => a.status === "active")
            .sort(
              (a, b) =>
                ["critical", "high", "medium", "low"].indexOf(a.priority) -
                ["critical", "high", "medium", "low"].indexOf(b.priority),
            )
            .slice(0, 5)
            .map((a) => (
              <p key={a.id}>
                <Link href="/alerts">
                  {a.asset} · {a.type.replaceAll("_", " ")} · {a.priority}
                </Link>
              </p>
            ))}
          {!alerts.some((a) => a.status === "active") && (
            <p>
              No active opportunities or watch events. Check connection health
              below for monitoring status.
            </p>
          )}
          <Link href="/alerts">Watch zones and history →</Link>
        </section>
        <section className="panel desk-card">
          <h2>Latest source headlines</h2>
          {news.slice(0, 5).map((n) => (
            <article key={n.id} className="desk-article">
              <a href={n.canonical_url} target="_blank" rel="noreferrer">
                {n.title} ↗
              </a>
              <p>
                {n.source} ·{" "}
                {n.published_at
                  ? new Date(n.published_at).toLocaleString()
                  : "Publication time unknown"}
              </p>
            </article>
          ))}
          <Link href="/news">News center →</Link>
        </section>
      </div>
      <HealthPanel />
    </>
  );
}
