"use client";
import { useEffect, useState } from "react";
import type { Analysis } from "@/domain/ai";
import type { technical } from "@/domain/technical";
import type { Timeframe } from "@/domain/market";
type Technical = ReturnType<typeof technical>;
export function AnalysisView({ analysis: a }: { analysis: Analysis }) {
  return (
    <div className="analysis-view">
      <p className="desk-message">{a.summary}</p>
      {a.newsImpact && (
        <div className="desk-grid">
          <div>
            <h3>Possible impact</h3>
            <p>
              {a.newsImpact.affectedAssets.join(", ") ||
                "No specific asset established"}{" "}
              · {a.newsImpact.sectors.join(", ") || "Sector unspecified"}
            </p>
            <p>
              Headline interpretation: {a.newsImpact.sentiment}. Already priced
              in: unknown.
            </p>
            <p>{a.newsImpact.whyItMatters}</p>
          </div>
          <div>
            <h3>Time horizons</h3>
            <p>Short term: {a.newsImpact.shortTerm}</p>
            <p>Long term: {a.newsImpact.longTerm}</p>
          </div>
          <div>
            <h3>Verification and uncertainty</h3>
            <p>{a.newsImpact.verificationLimits}</p>
            <ul>
              {a.newsImpact.unconfirmedClaims.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <div className="desk-grid">
        {(
          [
            "supportingFactors",
            "negativeFactors",
            "confirmationConditions",
            "invalidationConditions",
            "riskConsiderations",
          ] as const
        )
          .filter((key) => a[key].length > 0)
          .map((key) => (
            <div key={key}>
              <h3>
                {
                  {
                    supportingFactors: "Supporting factors",
                    negativeFactors: "Negative factors",
                    confirmationConditions: "Confirmation conditions",
                    invalidationConditions: "Invalidation conditions",
                    riskConsiderations: "Risk considerations",
                  }[key]
                }
              </h3>
              <ul>
                {a[key].map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          ))}
      </div>
      <small>
        {a.analysisType.replaceAll("_", " ")} · qualitative confidence:{" "}
        {a.confidence} · evidence {new Date(a.dataTimestamp).toLocaleString()} ·
        historical interpretation, recheck live conditions
      </small>
    </div>
  );
}
export function AssetResearch({
  asset,
  timeframe = "4h",
}: {
  asset: string;
  timeframe?: Timeframe;
}) {
  const [data, setData] = useState<Technical | null>(null),
    [analysis, setAnalysis] = useState<Analysis | null>(null),
    [status, setStatus] = useState("");
  useEffect(() => {
    setAnalysis(null);
    fetch(`/api/technical?asset=${asset}&timeframe=${timeframe}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, [asset, timeframe]);
  async function analyze() {
    setStatus("Analyzing current evidence…");
    try {
      const r = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset, timeframe }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setAnalysis(d.analysis);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Analysis unavailable");
    }
  }
  return (
    <section className="panel desk-card">
      <h2>Technical context · {timeframe} closed candles</h2>
      {data?.ready ? (
        <>
          <div className="desk-grid">
            <div>
              Structure<strong className="value"> {data.structure}</strong>
              <p>{data.state.replaceAll("_", " ")}</p>
            </div>
            <div>
              RSI 14<strong className="value"> {data.rsi?.toFixed(2)}</strong>
              <p>ATR 14: {data.atr.toFixed(4)}</p>
            </div>
            <div>
              MACD histogram
              <strong className="value">
                {" "}
                {data.macd.histogram?.toFixed(3)}
              </strong>
              <p>
                Relative volume: {data.relativeVolume?.toFixed(2) ?? "Unknown"}×
              </p>
            </div>
            <div>
              Support / resistance
              <p>
                {data.support ?? "Unconfirmed"} /{" "}
                {data.resistance ?? "Unconfirmed"}
              </p>
            </div>
          </div>
          <p>
            {data.confirmation}. {data.invalidation}. {data.risk}.
          </p>
        </>
      ) : (
        <p>
          {data && !data.ready
            ? data.reason
            : "Loading validated technical evidence…"}
        </p>
      )}
      <div className="desk-actions">
        <button
          className="button"
          disabled={status.startsWith("Analyzing")}
          onClick={analyze}
        >
          Ask Gemini to explain
        </button>
      </div>
      <p role="status">{status}</p>
      {analysis && <AnalysisView analysis={analysis} />}
    </section>
  );
}
