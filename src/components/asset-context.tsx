"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export function AssetContext({ asset }: { asset: string }) {
  const [news, setNews] = useState<
      {
        id: string;
        title: string;
        canonical_url: string;
        source: string;
        published_at: string;
      }[]
    >([]),
    [alerts, setAlerts] = useState<
      {
        id: string;
        asset: string;
        type: string;
        status: string;
        created_at: string;
      }[]
    >([]),
    [holdings, setHoldings] = useState<
      {
        id: string;
        asset: string;
        quantity: string;
        value: string | null;
        pnl: string | null;
        label: string;
      }[]
    >([]);
  useEffect(() => {
    const ctrl = new AbortController();
    void Promise.allSettled([
      fetch(`/api/news?asset=${asset}`, { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setNews(d.articles ?? [])),
      fetch("/api/alerts", { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setAlerts(d.alerts ?? [])),
      fetch("/api/portfolio", { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => setHoldings(d.holdings ?? [])),
    ]);
    return () => ctrl.abort();
  }, [asset]);
  return (
    <div className="desk-grid">
      <section className="panel desk-card">
        <h2>Related news</h2>
        {news.slice(0, 5).map((n) => (
          <p key={n.id}>
            <a href={n.canonical_url} target="_blank" rel="noreferrer">
              {n.title} ↗
            </a>
            <br />
            <small>
              {n.source} ·{" "}
              {n.published_at
                ? new Date(n.published_at).toLocaleString()
                : "Unknown publication time"}
            </small>
          </p>
        ))}
        {!news.length && <p>No matching source headlines.</p>}
      </section>
      <section className="panel desk-card">
        <h2>Your {asset} holdings</h2>
        {holdings
          .filter((h) => h.asset === asset)
          .map((h) => (
            <p key={h.id}>
              {h.quantity} {asset} · {h.label}
              <br />
              {h.value ?? "Unknown"} USD value · {h.pnl ?? "Unknown"} unrealized
              P/L
            </p>
          ))}
        {!holdings.some((h) => h.asset === asset) && (
          <p>No holding recorded for this asset.</p>
        )}
        <Link href="/portfolio">Manage holdings →</Link>
        <h2>Watch history</h2>
        {alerts
          .filter((a) => a.asset === asset)
          .slice(0, 5)
          .map((a) => (
            <p key={a.id}>
              <Link href="/alerts">
                {a.type.replaceAll("_", " ")} · {a.status}
              </Link>
              <br />
              {new Date(a.created_at).toLocaleString()}
            </p>
          ))}
      </section>
    </div>
  );
}
