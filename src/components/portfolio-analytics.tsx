"use client";
import type { portfolioSummary } from "@/server/portfolio-service";
type Summary = Awaited<ReturnType<typeof portfolioSummary>>;
const money = (value: string) =>
  Number(value).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
export function PortfolioAnalytics({ data }: { data: Summary }) {
  const cash = data.allocation.filter((a) => a.category !== "crypto");
  const history = [...data.history].reverse() as {
    created_at: string;
    data: { totalValue: string | null; complete: boolean };
  }[];
  const values = history
    .flatMap((h) =>
      h.data.complete && h.data.totalValue !== null
        ? [Number(h.data.totalValue)]
        : [],
    )
    .filter(Number.isFinite);
  const min = Math.min(...values),
    max = Math.max(...values),
    range = max - min || Math.max(max * 0.01, 1);
  const first = history[0] ? Date.parse(history[0].created_at) : 0;
  const duration = history.length
    ? Date.parse(history.at(-1)!.created_at) - first
    : 0;
  const segments: string[] = [];
  let current: string[] = [];
  for (const h of history) {
    if (
      !h.data.complete ||
      h.data.totalValue === null ||
      !Number.isFinite(Number(h.data.totalValue))
    ) {
      if (current.length) segments.push(current.join(" "));
      current = [];
      continue;
    }
    current.push(
      `${20 + ((Date.parse(h.created_at) - first) / (duration || 1)) * 600},${160 - ((Number(h.data.totalValue) - min) / range) * 130}`,
    );
  }
  if (current.length) segments.push(current.join(" "));
  return (
    <div className="desk-grid">
      <section className="panel desk-card">
        <h2>Asset allocation</h2>
        {data.allocation.length ? (
          data.allocation.map((a) => (
            <div className="allocation-row" key={a.asset}>
              <div>
                <strong>{a.asset}</strong>
                <span>
                  {a.percent}% · {money(a.value)}
                </span>
              </div>
              <progress
                value={Number(a.percent)}
                max="100"
                aria-label={`${a.asset} allocation`}
              />
            </div>
          ))
        ) : (
          <p>A complete, fresh valuation is needed to calculate allocation.</p>
        )}
        <p>
          Cash and stablecoins:{" "}
          {data.complete
            ? cash.map((a) => `${a.asset} ${a.percent}%`).join(" · ") || "0%"
            : "Unknown"}
          . Stablecoin exposure retains depeg and issuer risk.
        </p>
      </section>
      <section className="panel desk-card">
        <h2>24h price attribution</h2>
        <div
          className={`value ${Number(data.basket24h?.amount ?? 0) < 0 ? "negative" : ""}`}
        >
          {data.basket24h
            ? `${money(data.basket24h.amount)} (${data.basket24h.percent}%)`
            : "Insufficient price coverage"}
        </div>
        <p>
          Hypothetical change for today’s quantities using each venue’s 24h
          price reference. This is not your account return: purchases,
          transfers, fees and changing quantities are excluded.
        </p>
        <h3>Recorded portfolio value · 30 days</h3>
        {values.length > 1 ? (
          <>
            <svg
              viewBox="0 0 640 190"
              className="portfolio-history"
              role="img"
              aria-label={`Portfolio recorded values range from ${money(String(min))} to ${money(String(max))}; value changes include transfers and balance changes.`}
            >
              <line x1="20" y1="165" x2="620" y2="165" stroke="var(--line)" />
              {segments.map((points, i) => (
                <polyline
                  key={i}
                  points={points}
                  stroke="var(--text)"
                  fill="none"
                  strokeWidth="2"
                />
              ))}
            </svg>
            <small>
              {new Date(first).toLocaleDateString()} —{" "}
              {new Date(history.at(-1)!.created_at).toLocaleDateString()} ·{" "}
              {money(String(min))} to {money(String(max))}
            </small>
          </>
        ) : (
          <p>
            At least two complete snapshots are needed. The background worker
            records snapshots; unavailable valuations leave gaps.
          </p>
        )}
        <p>
          Recorded value includes balance changes. It is not a time-weighted
          investment return.
        </p>
      </section>
    </div>
  );
}
