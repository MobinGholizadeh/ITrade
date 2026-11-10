"use client";
import { useState, useEffect } from "react";
import type { Analysis } from "@/domain/ai";
import { AnalysisView } from "./asset-research";
import { useHealth } from "./health-provider";
import Link from "next/link";
type Article = {
  id: string;
  canonical_url: string;
  title: string;
  source: string;
  published_at: string | null;
  cluster_id: string;
  analysis: Analysis | null;
  coverage: {
    id: string;
    title: string;
    url: string;
    source: string;
    relationship: string;
    primarySource: boolean;
    independence: string;
  }[];
  classification: {
    assets: string[];
    category: string;
    priority: string;
    verification: string;
    sentiment: string;
    reason: string;
    score: number;
  };
};
export function NewsDesk() {
  const { report, connected } = useHealth();
  const feed = report?.checks.find((check) => check.id === "news");
  const feedOnline = connected && feed?.state === "online";
  const [explanations, setExplanations] = useState<Record<string, Analysis>>(
      {},
    ),
    [pending, setPending] = useState(""),
    [analysisError, setAnalysisError] = useState("");
  async function explain(newsId: string) {
    setPending(newsId);
    setAnalysisError("");
    try {
      const r = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsId }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setExplanations((v) => ({ ...v, [newsId]: d.analysis }));
    } catch (e) {
      setAnalysisError(
        e instanceof Error ? e.message : "Explanation unavailable",
      );
    } finally {
      setPending("");
    }
  }
  const [items, setItems] = useState<Article[]>([]),
    [filter, setFilter] = useState("all"),
    [sentiment, setSentiment] = useState("all"),
    [error, setError] = useState("");
  useEffect(() => {
    const ctrl = new AbortController();
    const read = () =>
      fetch("/api/news", { signal: ctrl.signal })
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then((d) => {
          setItems(d.articles);
          setError("");
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setError("News unavailable");
        });
    void read();
    const timer = setInterval(read, 60000);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, []);
  const seen = new Set<string>();
  const rows = items.filter((a) => {
    if (
      sentiment !== "all" &&
      (explanations[a.id] ?? a.analysis)?.newsImpact?.sentiment !== sentiment &&
      !(
        sentiment === "unrated" &&
        !(explanations[a.id] ?? a.analysis)?.newsImpact
      )
    )
      return false;
    if (seen.has(a.cluster_id)) return false;
    seen.add(a.cluster_id);
    return (
      filter === "all" ||
      [
        a.classification.priority,
        a.classification.category,
        ...a.classification.assets,
      ].includes(filter)
    );
  });
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SOURCE-LINKED INTELLIGENCE</div>
          <h1>
            News center<span className="accent">.</span>
          </h1>
          <p>
            Headlines from publisher feeds. Classification is a research aid;
            sentiment stays unrated until reviewed.
          </p>
        </div>
      </div>
      <div
        className={`feed-status ${feedOnline ? "" : "feed-status-warning"}`}
        role="status"
      >
        <span className={`status-dot ${feedOnline ? "online" : "stale"}`} />
        <div>
          <strong>
            {feedOnline
              ? "News feeds responding"
              : "Live news updates are not confirmed"}
          </strong>
          <p>
            {feedOnline
              ? feed?.detail
              : "Retained headlines remain available. Check their publication dates; new stories may be delayed."}
          </p>
          {feed?.lastSuccessAt && (
            <small>
              Last successful ingestion:{" "}
              {new Date(feed.lastSuccessAt).toLocaleString()}
            </small>
          )}
        </div>
        <Link href="/settings#connections">Connection details</Link>
      </div>
      <div className="chip-bar" role="group" aria-label="Filter news">
        {[
          "all",
          "critical",
          "high",
          "BTC",
          "ETH",
          "SOL",
          "macro",
          "regulatory",
          "security",
          "etf",
          "exchange",
          "blockchain",
          "partnerships",
          "tokenomics",
          "ecosystem",
          "sentiment",
          "medium",
          "low",
        ].map((value) => (
          <button
            key={value}
            className="chip"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {value === "etf"
              ? "ETF"
              : value.charAt(0).toUpperCase() + value.slice(1)}
          </button>
        ))}
      </div>
      <div className="desk-toolbar">
        <label>
          Headline sentiment{" "}
          <select
            aria-label="Headline sentiment"
            value={sentiment}
            onChange={(e) => setSentiment(e.target.value)}
          >
            {["all", "bullish", "bearish", "neutral", "mixed", "unrated"].map(
              (v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ),
            )}
          </select>
        </label>
        <small>
          Gemini interpretation when available; unreviewed headlines remain
          unrated.
        </small>
      </div>
      {error && <p role="alert">{error}</p>}
      {analysisError && <p role="status">{analysisError}</p>}
      <section className="news-grid" aria-label="Source headlines">
        {rows.map((a) => (
          <article className="desk-article" key={a.id}>
            <div className="desk-badges">
              <span title="Heuristic priority score based on impact category, source, asset relevance, recency and uncertainty. Not a probability.">
                {a.classification.priority} · {a.classification.score}/100
              </span>
              <span>{a.classification.category}</span>
              <span>{a.classification.verification.replaceAll("_", " ")}</span>
              {a.classification.assets.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            <h2>
              <a
                href={a.canonical_url}
                title={a.title}
                target="_blank"
                rel="noreferrer"
              >
                {a.title} ↗
              </a>
            </h2>
            <small>
              {a.source} ·{" "}
              {a.published_at
                ? new Date(a.published_at).toLocaleString()
                : "Publication time unavailable"}
            </small>
            <p className="desk-note">{a.classification.reason}</p>
            {a.coverage.map((other) => (
              <p key={other.id} className="desk-note">
                {other.relationship === "potential_conflict"
                  ? "Potential conflicting report"
                  : "Related coverage"}
                :{" "}
                <a href={other.url} target="_blank" rel="noreferrer">
                  {other.title} · {other.source}
                  {other.primarySource ? " (primary publisher)" : ""} ↗
                </a>{" "}
                · Independent confirmation has not been established.
              </p>
            ))}
            {(explanations[a.id] ?? a.analysis) ? (
              <AnalysisView analysis={(explanations[a.id] ?? a.analysis)!} />
            ) : (
              <button
                className="button secondary"
                disabled={!!pending}
                onClick={() => void explain(a.id)}
              >
                {pending === a.id
                  ? "Analyzing headline…"
                  : "Explain possible impacts"}
              </button>
            )}
          </article>
        ))}
        {!rows.length && (
          <p className="desk-empty">
            No matching stories. Feed availability appears in Settings.
          </p>
        )}
      </section>
    </>
  );
}
