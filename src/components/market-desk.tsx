"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import {
  createChart,
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
  ColorType,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  ema,
  intervals,
  quoteFresh,
  type Candle,
  type Quote,
  type Timeframe,
} from "@/domain/market";
import { technical, rsi, macd } from "@/domain/technical";
export function useQuotes() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [clock, setClock] = useState(Date.now());
  useEffect(() => {
    const stream = new EventSource("/api/events");
    stream.addEventListener("market", (e) => {
      try {
        setQuotes(JSON.parse(e.data).quotes);
      } catch {}
    });
    fetch("/api/market")
      .then((r) => r.json())
      .then((d) => setQuotes(d.quotes ?? []))
      .catch(() => {});
    const tick = setInterval(() => setClock(Date.now()), 10000);
    return () => {
      clearInterval(tick);
      stream.close();
    };
  }, []);
  return quotes.map((q) => ({ ...q, fresh: quoteFresh(q, clock) }));
}
export function MarketDesk() {
  const [facts, setFacts] = useState<
      {
        asset: string;
        technical: ReturnType<typeof technical>;
        owned: boolean;
        relativeStrength: number | null;
        highNewsImpact: boolean;
        analysis: {
          result: { analysisType: string };
          created_at: string;
        } | null;
        latestNews: {
          title: string;
          url: string;
          publishedAt: string | null;
        } | null;
      }[]
    >([]),
    [filter, setFilter] = useState("all");
  useEffect(() => {
    const read = () =>
      fetch("/api/scanner")
        .then((r) => r.json())
        .then((d) => setFacts(d.rows ?? []))
        .catch(() => {});
    void read();
    const timer = setInterval(read, 60000);
    return () => clearInterval(timer);
  }, []);
  const quotes = useQuotes(),
    [search, setSearch] = useState(""),
    [sort, setSort] = useState("asset");
  useEffect(() => {
    setSearch(
      new URLSearchParams(window.location.search)
        .get("search")
        ?.trim()
        .slice(0, 20) ?? "",
    );
  }, []);
  const rows = quotes
    .filter((q) => q.asset.includes(search.toUpperCase()))
    .filter((q) => {
      const f = facts.find((f) => f.asset === q.asset);
      if (filter === "all") return true;
      if (filter === "owned") return f?.owned;
      if (filter === "news") return f?.highNewsImpact;
      if (!q.fresh || !f?.technical.ready) return false;
      const t = f.technical;
      return filter === "support"
        ? t.support !== null &&
            Math.abs(Number(q.price) - t.support) <= t.atr * 0.25
        : filter === "resistance"
          ? t.resistance !== null &&
            Math.abs(Number(q.price) - t.resistance) <= t.atr * 0.25
          : t.structure === filter;
    })
    .sort((a, b) =>
      sort === "gainers"
        ? (b.change ?? 0) - (a.change ?? 0)
        : sort === "losers"
          ? (a.change ?? 0) - (b.change ?? 0)
          : sort === "volume"
            ? Number(b.volume) * Number(b.price) -
              Number(a.volume) * Number(a.price)
            : a.asset.localeCompare(b.asset),
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">CONTINUOUS SPOT MONITORING</div>
          <h1>
            Market scanner<span className="accent">.</span>
          </h1>
          <p>Exchange prices, closed-candle research and explicit freshness.</p>
        </div>
        <Link className="button secondary" href="/settings">
          Tracked assets
        </Link>
      </div>
      <div className="desk-toolbar">
        <input
          aria-label="Search assets"
          placeholder="Search BTC, ETH, SOL…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Sort assets"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="asset">Asset</option>
          <option value="gainers">Biggest gainers</option>
          <option value="losers">Biggest losers</option>
          <option value="volume">Quote volume estimate</option>
        </select>
        <select
          aria-label="Opportunity filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {[
            ["all", "All monitored"],
            ["bullish", "Bullish structure"],
            ["bearish", "Bearish structure"],
            ["support", "Approaching support"],
            ["resistance", "Approaching resistance"],
            ["news", "High news impact"],
            ["owned", "Assets I own"],
          ].map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <section className="panel table-scroll">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Asset / venue</th>
              <th>Price</th>
              <th>24h change</th>
              <th>24h base volume</th>
              <th>Spread</th>
              <th>24h range / bid–ask</th>
              <th>Market cap</th>
              <th>Technical watch</th>
              <th>Relative strength vs BTC</th>
              <th>Latest AI review / news</th>
              <th>Data timestamp</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.asset}>
                <td>
                  <Link href={`/assets/${q.asset}`}>
                    <strong>
                      {q.asset} / {q.currency}
                    </strong>
                  </Link>
                  <small>{q.provider}</small>
                </td>
                <td>
                  {Number(q.price).toLocaleString(undefined, {
                    maximumFractionDigits: 6,
                  })}
                  <small className={q.fresh ? "live-label" : "warning"}>
                    {q.fresh ? "Live" : "Stale · research paused"}
                  </small>
                </td>
                <td className={(q.change ?? 0) >= 0 ? "positive" : "negative"}>
                  {q.change?.toFixed(2) ?? "—"}%
                </td>
                <td>
                  {Number(q.volume).toLocaleString()} {q.asset}
                </td>
                <td>{(Number(q.ask) - Number(q.bid)).toPrecision(3)}</td>
                <td>
                  {q.low ?? "Unknown"} – {q.high ?? "Unknown"}
                  <small>
                    Bid {q.bid} / Ask {q.ask}
                  </small>
                </td>
                <td>
                  {q.marketCap === null ? (
                    "Unavailable"
                  ) : (
                    <>
                      {q.marketCap.toLocaleString(undefined, {
                        style: "currency",
                        currency: "USD",
                        maximumFractionDigits: 0,
                      })}
                      <small>
                        CoinGecko ·{" "}
                        {q.marketCapTimestamp
                          ? new Date(q.marketCapTimestamp).toLocaleString()
                          : ""}
                      </small>
                    </>
                  )}
                </td>
                <td>
                  {(() => {
                    const f = facts.find((f) => f.asset === q.asset);
                    return f?.technical.ready ? (
                      <>
                        {f.technical.structure}
                        <small>
                          {q.fresh
                            ? f.technical.state.replaceAll("_", " ")
                            : "Stale · paused"}
                        </small>
                      </>
                    ) : (
                      "Insufficient data"
                    );
                  })()}
                </td>
                <td>
                  {facts
                    .find((f) => f.asset === q.asset)
                    ?.relativeStrength?.toFixed(2) ?? "—"}
                  %
                </td>
                <td>
                  {(() => {
                    const f = facts.find((f) => f.asset === q.asset);
                    return (
                      <>
                        {f?.analysis ? (
                          <>
                            <span>
                              {f.analysis.result.analysisType.replaceAll(
                                "_",
                                " ",
                              )}
                            </span>
                            <small>
                              Recorded{" "}
                              {new Date(f.analysis.created_at).toLocaleString()}{" "}
                              · recheck conditions
                            </small>
                          </>
                        ) : (
                          <span>Not reviewed</span>
                        )}
                        {f?.latestNews && (
                          <small>
                            <a
                              href={f.latestNews.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {f.latestNews.title}
                            </a>
                            <br />
                            {f.latestNews.publishedAt
                              ? new Date(
                                  f.latestNews.publishedAt,
                                ).toLocaleString()
                              : "Undated"}
                          </small>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td>{new Date(q.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p className="desk-empty">
            No matching market data. The worker must be running and the selected
            provider available.
          </p>
        )}
      </section>
      <p className="desk-note">
        24h volume is exchange-specific. USD market capitalization is from{" "}
        <a href="https://www.coingecko.com/" target="_blank" rel="noreferrer">
          CoinGecko
        </a>{" "}
        when configured and recently updated; it is not an exchange quote.
      </p>
    </>
  );
}
export function AssetChart({
  asset,
  onTimeframe,
}: {
  asset: string;
  onTimeframe?: (tf: Timeframe) => void;
}) {
  const [tf, setTf] = useState<Timeframe>("4h"),
    [cs, setCs] = useState<Candle[]>([]),
    [error, setError] = useState(""),
    host = useRef<HTMLDivElement>(null);
  const quote = useQuotes().find((q) => q.asset === asset);
  useEffect(() => {
    const ctrl = new AbortController();
    async function read() {
      try {
        const r = await fetch(`/api/market?asset=${asset}&timeframe=${tf}`, {
          signal: ctrl.signal,
        });
        if (!r.ok) throw Error();
        const d = await r.json();
        setCs(d.candles);
        setError(d.candles.length ? "" : "History is being synchronized.");
      } catch {
        if (!ctrl.signal.aborted) setError("Candle history unavailable.");
      }
    }
    setCs([]);
    void read();
    const timer = setInterval(read, 60000);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [asset, tf]);
  useEffect(() => {
    if (!host.current || !cs.length) return;
    const chart = createChart(host.current, {
      autoSize: true,
      height: 620,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#606060",
        fontFamily: getComputedStyle(document.body).fontFamily,
      },
      grid: {
        vertLines: { color: "#f2f2f2" },
        horzLines: { color: "#f2f2f2" },
      },
      timeScale: { timeVisible: true },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#2ba640",
      downColor: "#e53935",
      borderVisible: false,
      wickUpColor: "#2ba640",
      wickDownColor: "#e53935",
    });
    series.setData(cs.map((c) => ({ ...c, time: c.time as UTCTimestamp })));
    [20, 50, 200].forEach((p, i) => {
      const line = chart.addSeries(LineSeries, {
        color: ["#065fd4", "#b16a00", "#7b49b2"][i],
        lineWidth: 1,
        title: `EMA ${p}`,
        priceLineVisible: false,
      });
      const values = ema(
        cs.map((c) => c.close),
        p,
      );
      line.setData(
        cs.flatMap((c, j) =>
          values[j] === null
            ? []
            : [{ time: c.time as UTCTimestamp, value: values[j]! }],
        ),
      );
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volume
      .priceScale()
      .applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
    volume.setData(
      cs.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? "#b4ddbc" : "#f1b9b9",
      })),
    );
    const indicators = technical(cs, tf);
    if (indicators.ready)
      for (const [title, price] of [
        ["Support", indicators.support],
        ["Resistance", indicators.resistance],
      ] as const)
        if (price !== null)
          series.createPriceLine({
            price,
            color: title === "Support" ? "#2ba640" : "#e53935",
            lineWidth: 1,
            lineStyle: 2,
            axisLabelVisible: true,
            title,
          });
    const rsiSeries = chart.addSeries(
      LineSeries,
      {
        color: "#7b49b2",
        lineWidth: 1,
        title: "RSI 14",
        priceLineVisible: false,
      },
      1,
    );
    rsiSeries.setData(
      cs.flatMap((c, i) => {
        const value = rsi(cs.slice(0, i + 1).map((c) => c.close));
        return value === null ? [] : [{ time: c.time as UTCTimestamp, value }];
      }),
    );
    const macdSeries = chart.addSeries(
      HistogramSeries,
      { title: "MACD histogram", priceLineVisible: false },
      2,
    );
    macdSeries.setData(
      cs.flatMap((c, i) => {
        const value = macd(cs.slice(0, i + 1).map((c) => c.close)).histogram;
        return value === null
          ? []
          : [
              {
                time: c.time as UTCTimestamp,
                value,
                color: value >= 0 ? "#2ba640" : "#e53935",
              },
            ];
      }),
    );
    chart.panes()[1]?.setHeight(100);
    chart.panes()[2]?.setHeight(100);
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [cs]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ASSET RESEARCH · SPOT ONLY</div>
          <h1>
            {asset} <span className="accent">/ {quote?.currency ?? "USD"}</span>
          </h1>
          <p>
            {quote
              ? `${Number(quote.price).toLocaleString()} · ${quote.provider} · ${new Date(quote.timestamp).toLocaleString()} · ${quote.fresh ? "Live" : "Stale"}`
              : "Waiting for market feed"}
          </p>
        </div>
        <Link href="/money-management" className="button secondary">
          Plan risk
        </Link>
      </div>
      <div className="desk-toolbar">
        {(Object.keys(intervals) as Timeframe[]).map((t) => (
          <button
            className={`button ${t === tf ? "" : "secondary"}`}
            key={t}
            aria-pressed={t === tf}
            onClick={() => {
              setTf(t);
              onTimeframe?.(t);
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <section className="panel">
        <div ref={host} style={{ height: 620, minWidth: 0 }} />
        {error && <p className="desk-empty">{error}</p>}
        <p className="desk-note">
          Closed candles · EMA 20 / 50 / 200 · volume ·{" "}
          <a
            href="https://www.tradingview.com/"
            target="_blank"
            rel="noreferrer"
          >
            Charts by TradingView
          </a>
        </p>
      </section>
    </>
  );
}
