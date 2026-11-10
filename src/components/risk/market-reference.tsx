"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, RefreshCw, Radio } from "lucide-react";
import {
  quoteIsFresh,
  snapshotSchema,
  type RiskMarketSnapshot,
} from "@/domain/risk-market";
import { formatAmount, SelectField } from "./fields";

export function MarketReference({
  asset,
  currency,
  onCopy,
  onSnapshot,
}: {
  asset: string;
  currency: string;
  onCopy: (s: RiskMarketSnapshot) => void;
  onSnapshot: (s: RiskMarketSnapshot | null) => void;
}) {
  const [timeframe, setTimeframe] = useState("1h"),
    [snapshot, setSnapshot] = useState<RiskMarketSnapshot | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [auto, setAuto] = useState(false),
    [now, setNow] = useState(Date.now());
  const active = useRef<AbortController | null>(null);
  const callback = useRef(onSnapshot);
  callback.current = onSnapshot;
  async function refresh() {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    setSnapshot(null);
    callback.current(null);
    try {
      const response = await fetch(
        `/api/risk/market?asset=${asset}&timeframe=${timeframe}`,
        { signal: controller.signal },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Reference unavailable");
      const result = snapshotSchema.parse(data);
      if (!controller.signal.aborted) {
        setSnapshot(result);
        callback.current(result);
        setNow(Date.now());
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setError(
          error instanceof Error ? error.message : "Reference unavailable",
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  useEffect(() => {
    setSnapshot(null);
    callback.current(null);
    setError("");
    setAuto(false);
    setBusy(false);
    active.current?.abort();
    return () => active.current?.abort();
  }, [asset, timeframe]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    if (!auto) return;
    const tick = setInterval(() => void refresh(), 15000);
    return () => clearInterval(tick);
  }, [auto, asset, timeframe]); // Explicit user opt-in; snapshot use is always manual.
  const fresh = snapshot && quoteIsFresh(snapshot, now),
    compatible = currency === "USD";
  return (
    <section className="panel risk-reference">
      <div className="panel-heading">
        <h2>
          <Radio size={17} />
          Live market reference
        </h2>
        <span className="quiet-tag">COINBASE · REST</span>
      </div>
      <div className="risk-card-body">
        <p className="risk-help">
          Public {asset}/USD snapshot. Copying a price freezes the plan;
          auto-refresh never moves your entry or stop.
        </p>
        <div className="risk-reference-controls">
          <SelectField
            label="ATR candle timeframe"
            value={timeframe}
            onChange={setTimeframe}
          >
            <option value="1h">1 hour</option>
            <option value="1d">1 day</option>
          </SelectField>
          <button
            type="button"
            className="button secondary"
            onClick={() => void refresh()}
            disabled={busy}
          >
            <RefreshCw size={14} className={busy ? "spin" : ""} />
            {busy ? "Fetching…" : "Fetch reference"}
          </button>
        </div>
        <label className="risk-confirm">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          Refresh every 15 seconds while this page is open
        </label>
        {error && (
          <p className="risk-error" role="alert">
            {error}
          </p>
        )}
        {snapshot && (
          <>
            <div className="risk-quote">
              <div>
                <small>Best ask · USD</small>
                <strong>{formatAmount(snapshot.ask, 8)}</strong>
              </div>
              <span className={`risk-state ${fresh ? "good" : "bad"}`}>
                {fresh ? "Fresh snapshot" : "Stale — refresh required"}
              </span>
            </div>
            <div className="risk-quote-grid">
              <span>
                Best bid<strong>{formatAmount(snapshot.bid, 8)}</strong>
              </span>
              <span>
                ATR14 · {snapshot.atr?.timeframe ?? timeframe}
                <strong>
                  {snapshot.atr
                    ? formatAmount(snapshot.atr.value, 8)
                    : "Unavailable"}
                </strong>
              </span>
            </div>
            <p className="risk-timestamp">
              Last trade: {new Date(snapshot.eventTime).toLocaleString()}
              <br />
              Fetched: {new Date(snapshot.fetchedAt).toLocaleString()}
              {snapshot.atr && (
                <>
                  <br />
                  Last closed candle:{" "}
                  {new Date(snapshot.atr.candleCloseAt).toLocaleString()} ·{" "}
                  {snapshot.atr.candlesUsed} bars
                </>
              )}
            </p>
            {snapshot.atrUnavailableReason && (
              <p className="risk-help">{snapshot.atrUnavailableReason}</p>
            )}
            <button
              className="button secondary"
              type="button"
              onClick={() => onCopy(snapshot)}
              disabled={!fresh || !compatible}
            >
              <ArrowDownToLine size={15} />
              Use ask & exchange increments
            </button>
            {!compatible && (
              <p className="risk-error">
                This USD reference cannot populate a USDT plan.
              </p>
            )}
          </>
        )}
        {!snapshot && !busy && !error && (
          <div className="risk-reference-empty">
            No market request yet. Manual planning works without a connection.
          </div>
        )}
      </div>
    </section>
  );
}
