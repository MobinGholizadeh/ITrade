import { getDb } from "./db";
import { marketOverview } from "./market-service";
import {
  valueHoldings,
  basketChange,
  allocationBreakdown,
  type Holding,
} from "../domain/portfolio";
import { decryptSecret } from "./secrets";
import { createAlert } from "./technical-service";
import { readSettings } from "./settings-repository";
import Decimal from "decimal.js";
import {
  krakenCredentials,
  krakenBalances,
  walletBalances,
} from "./portfolio-providers";
export async function portfolioSummary() {
  const r = await getDb().query(
    "SELECT h.*,c.label,c.kind,c.status connection_status,c.synced_at FROM holdings h JOIN portfolio_connections c ON c.id=h.connection_id ORDER BY h.asset",
  );
  const quotes = await marketOverview();
  const prices = Object.fromEntries(
    quotes
      .filter((q) => q.fresh && q.currency === "USD")
      .map((q) => [q.asset, q.price]),
  );
  const summary = valueHoldings(r.rows as Holding[], prices);
  const connections = (
    await getDb().query(
      "SELECT id,kind,label,address,status,synced_at FROM portfolio_connections ORDER BY created_at",
    )
  ).rows;
  const balancesFresh = connections.every(
    (c) =>
      c.kind === "manual" ||
      (c.status === "synced" &&
        c.synced_at &&
        Date.now() - new Date(c.synced_at).getTime() < 900000),
  );
  const hasRecordedBalances =
    r.rows.length > 0 ||
    connections.some(
      (c) =>
        c.kind !== "manual" &&
        c.status === "synced" &&
        c.synced_at &&
        Date.now() - new Date(c.synced_at).getTime() < 900000,
    );
  const complete = summary.complete && balancesFresh && hasRecordedBalances;
  const freshQuotes: Record<string, import("../domain/market").Quote> =
    Object.fromEntries(
      quotes
        .filter((q) => q.fresh && q.currency === "USD")
        .map((q) => [q.asset, q]),
    );
  return {
    ...summary,
    holdings: summary.holdings.map((h) => ({
      ...h,
      allocation: balancesFresh ? h.allocation : null,
      priceTimestamp:
        h.asset === "USD" ? null : (freshQuotes[h.asset]?.timestamp ?? null),
      change24h: h.asset === "USD" ? 0 : (freshQuotes[h.asset]?.change ?? null),
    })),
    totalValue:
      balancesFresh && hasRecordedBalances ? summary.totalValue : null,
    complete,
    allocation: allocationBreakdown(summary.holdings, complete),
    basket24h: basketChange(
      summary.holdings,
      Object.fromEntries(
        Object.entries(freshQuotes).map(([a, q]) => [a, q.change]),
      ),
      complete,
    ),
    coverage: hasRecordedBalances
      ? "recorded_connections_only"
      : "no_account_data",
    balancesFresh,
    currency: "USD",
    updatedAt: new Date().toISOString(),
    connections,
    history: (
      await getDb().query(
        "SELECT data,created_at FROM (SELECT DISTINCT ON(date_trunc('hour',created_at)) data,created_at FROM portfolio_snapshots WHERE created_at>now()-interval '30 days' ORDER BY date_trunc('hour',created_at) DESC,created_at DESC) h ORDER BY created_at DESC LIMIT 720",
      )
    ).rows,
  };
}
export async function syncPortfolios() {
  const connections = await getDb().query(
    "SELECT * FROM portfolio_connections WHERE kind<>'manual'",
  );
  for (const c of connections.rows) {
    try {
      const previous = (
        await getDb().query(
          "SELECT asset,quantity FROM holdings WHERE connection_id=$1",
          [c.id],
        )
      ).rows;
      const balances =
        c.kind === "kraken"
          ? await krakenBalances(
              krakenCredentials.parse(decryptSecret(c.credentials)),
            )
          : await walletBalances(c.kind, c.address);
      const client = await getDb().connect();
      try {
        await client.query("BEGIN");
        await client.query(
          "UPDATE holdings SET quantity=0,updated_at=now() WHERE connection_id=$1",
          [c.id],
        );
        for (const h of balances)
          await client.query(
            "INSERT INTO holdings(connection_id,asset,quantity) VALUES($1,$2,$3) ON CONFLICT(connection_id,asset) DO UPDATE SET quantity=$3,updated_at=now()",
            [c.id, h.asset, h.quantity],
          );
        await client.query(
          "UPDATE portfolio_connections SET status='synced',synced_at=now() WHERE id=$1",
          [c.id],
        );
        await client.query("COMMIT");
        if (c.synced_at) {
          const observed = [
            ...balances,
            ...previous
              .filter((p) => !balances.some((h) => h.asset === p.asset))
              .map((p) => ({ asset: p.asset as string, quantity: "0" })),
          ];
          for (const h of observed) {
            const old =
              previous.find((p) => p.asset === h.asset)?.quantity ?? "0";
            if (!new Decimal(old).equals(h.quantity))
              await createAlert(
                `balance:${c.id}:${h.asset}`,
                h.asset,
                "wallet_balance_change",
                "medium",
                {
                  connectionLabel: c.label,
                  asset: h.asset,
                  previousQuantity: old,
                  currentQuantity: h.quantity,
                  observedAt: new Date().toISOString(),
                  note: "Balance change detected. Transfers, rewards and transactions need reconciliation; no cost basis or profit is inferred.",
                },
                60,
              );
          }
        }
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    } catch {
      await getDb().query(
        "UPDATE portfolio_connections SET status='sync_failed' WHERE id=$1",
        [c.id],
      );
    }
  }
  const s = await portfolioSummary();
  const { settings } = await readSettings();
  if (s.complete) {
    const byAsset = new Map<string, Decimal>();
    for (const h of s.holdings)
      if (h.value !== null)
        byAsset.set(
          h.asset,
          (byAsset.get(h.asset) ?? new Decimal(0)).add(h.value),
        );
    for (const [asset, value] of byAsset) {
      const allocation =
        s.totalValue && new Decimal(s.totalValue).gt(0)
          ? value.div(s.totalValue).mul(100)
          : null;
      if (
        allocation !== null &&
        allocation.gte(settings.concentrationWarningPercent)
      )
        await createAlert(
          `concentration:${asset}`,
          asset,
          "portfolio_concentration",
          "high",
          {
            asset,
            value: value.toFixed(),
            allocation: allocation.toFixed(2),
            threshold: settings.concentrationWarningPercent,
            note: "Concentration observation. Review total account exposure and your separate risk plan; no sale is prescribed.",
          },
          settings.alertCooldownMinutes,
        );
    }
  }
  if (s.holdings.length)
    await getDb().query("INSERT INTO portfolio_snapshots(data) VALUES($1)", [
      JSON.stringify({
        totalValue: s.totalValue,
        knownValue: s.knownValue,
        complete: s.complete,
        holdings: s.holdings.map((h) => ({
          asset: h.asset,
          quantity: h.quantity,
          connectionId: h.connection_id,
        })),
      }),
    ]);
}
