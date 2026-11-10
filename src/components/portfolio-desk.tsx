"use client";
import { useEffect, useState, type FormEvent } from "react";
import type { portfolioSummary } from "@/server/portfolio-service";
import { PortfolioAnalytics } from "./portfolio-analytics";
import { AnalysisView } from "./asset-research";
import type { Analysis } from "@/domain/ai";
import { assets } from "@/domain/market";
type Summary = Awaited<ReturnType<typeof portfolioSummary>>;
export function PortfolioDesk() {
  const [data, setData] = useState<Summary | null>(null),
    [status, setStatus] = useState(""),
    [tab, setTab] = useState("manual");
  const [review, setReview] = useState<Analysis | null>(null),
    [reviewStatus, setReviewStatus] = useState("");
  async function reviewHolding(asset: string) {
    setReview(null);
    setReviewStatus("Reviewing holding…");
    try {
      const r = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdingAsset: asset }),
      });
      const body = await r.json();
      if (!r.ok) throw Error(body.error);
      setReview(body.analysis);
      setReviewStatus("");
    } catch (e) {
      setReviewStatus(e instanceof Error ? e.message : "Review unavailable");
    }
  }
  async function read() {
    try {
      const r = await fetch("/api/portfolio");
      if (!r.ok) throw Error();
      setData(await r.json());
    } catch {
      setData(null);
      setStatus("Portfolio unavailable. Check service health in Settings.");
    }
  }
  useEffect(() => {
    void read();
    const timer = setInterval(() => void read(), 30000);
    return () => clearInterval(timer);
  }, []);
  async function mutate(body: unknown) {
    setStatus("Saving…");
    try {
      const r = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setStatus("Saved. Connected accounts sync in the background.");
      await read();
      return true;
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Unavailable");
      return false;
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    const v = (key: string) => String(f.get(key) ?? "");
    const body =
      tab === "manual"
        ? {
            action: "manual",
            holding: {
              asset: v("asset"),
              quantity: v("quantity"),
              costBasis: v("cost") || null,
              acquiredAt: v("date") || null,
              notes: v("notes"),
            },
          }
        : tab === "wallet"
          ? {
              action: "wallet",
              kind: v("kind"),
              address: v("address"),
              label: v("label"),
            }
          : {
              action: "exchange",
              credentials: { apiKey: v("apiKey"), secret: v("secret") },
            };
    if (await mutate(body)) form.reset();
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR ACTUAL EXPOSURE</div>
          <h1>
            Portfolio<span className="accent">.</span>
          </h1>
          <p>
            Manual records and read-only connections. Missing prices and cost
            basis remain unknown.
          </p>
        </div>
      </div>
      <div className="desk-grid">
        <section className="panel desk-card">
          <h2>Tracked value · USD</h2>
          <div className="value">
            {data?.holdings.length
              ? (data.totalValue ?? "Incomplete valuation")
              : "No holdings yet"}
          </div>
          <p>
            Known portion: {data?.holdings.length ? data.knownValue : "—"}.
            Stablecoins require their own market price.
          </p>
        </section>
        <section className="panel desk-card">
          <h2>Coverage</h2>
          <p>
            Wallet adapters cover Ethereum, Base, Arbitrum, Optimism and Solana
            native/token balances. Tokens are identified by contract or mint;
            unsupported prices remain unknown. Staking and DeFi positions
            require separate coverage. Avoid recording the same assets both
            manually and through a connection.
          </p>
        </section>
      </div>
      {data && <PortfolioAnalytics data={data} />}
      <section className="panel table-scroll">
        <table className="desk-table">
          <thead>
            <tr>
              <th>Asset / source</th>
              <th>Quantity</th>
              <th>Current price / 24h</th>
              <th>USD value</th>
              <th>Unrealized P/L</th>
              <th>Allocation</th>
              <th>Recorded at</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data?.holdings.map((h) => (
              <tr key={h.id}>
                <td>
                  {h.asset}
                  <small>{h.label}</small>
                </td>
                <td>{h.quantity}</td>
                <td>
                  {h.price ?? "Unknown"}
                  <small>
                    {h.change24h === null
                      ? "Unknown 24h change"
                      : `${h.change24h.toFixed(2)}%`}
                  </small>
                  <small>
                    {h.priceTimestamp
                      ? new Date(h.priceTimestamp).toLocaleString()
                      : h.asset === "USD"
                        ? "USD cash"
                        : "No fresh USD quote"}
                  </small>
                </td>
                <td>{h.value ?? "Unknown"}</td>
                <td>{h.pnl ?? "Unknown cost or price"}</td>
                <td>{h.allocation ? `${h.allocation}%` : "Unknown"}</td>
                <td>{new Date(h.updated_at).toLocaleString()}</td>
                <td>
                  {assets.some((a) => a === h.asset) &&
                    Number(h.quantity) > 0 && (
                      <button
                        className="button secondary"
                        disabled={reviewStatus === "Reviewing holding…"}
                        onClick={() => void reviewHolding(h.asset)}
                      >
                        Review {h.asset}
                      </button>
                    )}
                  {h.kind === "manual" && (
                    <button
                      className="button secondary"
                      onClick={() =>
                        void mutate({ action: "remove_holding", id: h.id })
                      }
                    >
                      Remove record
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {(review || reviewStatus) && (
        <section className="panel desk-card">
          <h2>Holding-specific research</h2>
          <p role="status">{reviewStatus}</p>
          {review && <AnalysisView analysis={review} />}
        </section>
      )}
      <div className="desk-grid">
        <section className="panel desk-card">
          <h2>Add holdings or connection</h2>
          <div className="desk-toolbar">
            {["manual", "wallet", "exchange"].map((t) => (
              <button
                key={t}
                className={`button ${t === tab ? "" : "secondary"}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <form className="desk-form" key={tab} onSubmit={submit}>
            {tab === "manual" ? (
              <>
                <label>
                  Asset
                  <select name="asset">
                    {[
                      "BTC",
                      "ETH",
                      "SOL",
                      "ADA",
                      "AVAX",
                      "LINK",
                      "USD",
                      "USDT",
                      "USDC",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Total manually held quantity
                  <input name="quantity" inputMode="decimal" required />
                </label>
                <label>
                  Average acquisition price in USD · optional
                  <input name="cost" inputMode="decimal" />
                </label>
                <label>
                  Acquisition date · optional
                  <input name="date" type="date" />
                </label>
                <label>
                  Notes
                  <input name="notes" maxLength={500} />
                </label>
                <p>
                  Saving replaces the manual balance for this asset; it does not
                  record a new purchase.
                </p>
              </>
            ) : tab === "wallet" ? (
              <>
                <label>
                  Network
                  <select name="kind">
                    <option value="ethereum">
                      Ethereum mainnet · ETH + ERC-20
                    </option>
                    <option value="base">Base mainnet · ETH + ERC-20</option>
                    <option value="arbitrum">
                      Arbitrum One · ETH + ERC-20
                    </option>
                    <option value="optimism">OP Mainnet · ETH + ERC-20</option>
                    <option value="solana">Solana mainnet · SOL + SPL</option>
                  </select>
                </label>
                <label>
                  Label
                  <input name="label" required maxLength={80} />
                </label>
                <label>
                  Public wallet address
                  <input name="address" required autoComplete="off" />
                </label>
                <p>
                  Server Alchemy / Helius key required. Only public addresses;
                  no signing or wallet authorization.
                </p>
              </>
            ) : (
              <>
                <p>
                  Kraken key must expose only query permissions. Permissions are
                  checked before saving and every synchronization.
                </p>
                <label>
                  API key
                  <input
                    name="apiKey"
                    type="password"
                    autoComplete="off"
                    required
                  />
                </label>
                <label>
                  API secret
                  <input
                    name="secret"
                    type="password"
                    autoComplete="off"
                    required
                  />
                </label>
              </>
            )}
            <button className="button" disabled={status === "Saving…"}>
              Save{" "}
              {tab === "manual" ? "manual holding" : "read-only connection"}
            </button>
          </form>
          <p role="status">{status}</p>
        </section>
        <section className="panel desk-card">
          <h2>Connections</h2>
          {data?.connections.map((c) => (
            <article key={c.id} className="desk-article">
              <h3>{c.label}</h3>
              <p>
                {c.kind} · {c.status}
                <br />
                {c.synced_at
                  ? new Date(c.synced_at).toLocaleString()
                  : "Not synchronized"}
              </p>
              <button
                className="button secondary"
                onClick={() => void mutate({ action: "disconnect", id: c.id })}
              >
                Disconnect and remove imported holdings
              </button>
            </article>
          ))}
          <h2>Recorded value history</h2>
          {data?.history.slice(0, 10).map((h) => (
            <p key={h.created_at}>
              {new Date(h.created_at).toLocaleString()} ·{" "}
              {h.data.totalValue ?? "Incomplete"} USD
            </p>
          ))}
          <p>
            Value changes include balance changes; they are not a time-weighted
            investment return.
          </p>
        </section>
      </div>
    </>
  );
}
