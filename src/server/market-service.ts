import { z } from "zod";
import { getDb } from "./db";
import { providerJson } from "./provider-http";
import { readSettings } from "./settings-repository";
import {
  aggregateCandles,
  closedCandles,
  intervals,
  quoteFresh,
  type Candle,
  type Quote,
  type Timeframe,
} from "../domain/market";
const base = "https://api.exchange.coinbase.com";
const number = z.coerce.number().finite().positive();
const ticker = z.object({
  price: number,
  bid: number,
  ask: number,
  volume: z.coerce.number().nonnegative(),
  time: z.iso.datetime({ offset: true }),
});
export async function serviceStatus(
  name: string,
  state: string,
  detail: string,
) {
  await getDb().query(
    "INSERT INTO service_status(name,state,detail,success_at) VALUES($1,$2,$3,CASE WHEN $2='online' THEN now() END) ON CONFLICT(name) DO UPDATE SET state=$2,detail=$3,checked_at=now(),success_at=COALESCE(EXCLUDED.success_at,service_status.success_at)",
    [name, state, detail],
  );
}
export async function saveQuote(q: Quote) {
  if (!quoteFresh(q) || Number(q.bid) > Number(q.ask)) return;
  await getDb().query(
    "INSERT INTO market_quotes(provider,asset,data,observed_at) VALUES($1,$2,$3,$4) ON CONFLICT(provider,asset) DO UPDATE SET data=$3,observed_at=$4 WHERE market_quotes.observed_at < EXCLUDED.observed_at",
    [q.provider, q.asset, JSON.stringify(q), q.timestamp],
  );
}
export async function backfill(asset: string, tf: Timeframe) {
  const seconds = intervals[tf],
    granularity = tf === "4h" ? 3600 : tf === "1w" ? 86400 : seconds;
  const wanted = (250 * seconds) / granularity + 8;
  const end = Math.floor(Date.now() / 1000 / granularity) * granularity;
  const all: Candle[] = [];
  for (let n = 0; n < wanted; n += 280) {
    const stop = end - n * granularity,
      start = stop - Math.min(280, wanted - n) * granularity;
    const raw = z
      .array(
        z.tuple([
          z.number(),
          z.number(),
          z.number(),
          z.number(),
          z.number(),
          z.number(),
        ]),
      )
      .parse(
        await providerJson(
          `${base}/products/${asset}-USD/candles?granularity=${granularity}&start=${new Date(start * 1000).toISOString()}&end=${new Date(stop * 1000).toISOString()}`,
        ),
      );
    all.push(
      ...closedCandles(
        raw.map(([time, low, high, open, close, volume]) => ({
          time,
          low,
          high,
          open,
          close,
          volume,
        })),
        granularity,
      ),
    );
    await new Promise((r) => setTimeout(r, 180));
  }
  const unique = closedCandles(all, granularity);
  const cs = (
    seconds === granularity
      ? unique
      : aggregateCandles(unique, granularity, seconds)
  ).slice(-250);
  if (!cs.length) throw new Error("No closed candles");
  await getDb().query(
    "INSERT INTO candles(provider,asset,timeframe,time,data) SELECT 'coinbase',$1,$2,(v->>'time')::bigint,v FROM jsonb_array_elements($3::jsonb) v ON CONFLICT(provider,asset,timeframe,time) DO UPDATE SET data=EXCLUDED.data",
    [asset, tf, JSON.stringify(cs)],
  );
}
export async function refreshMarket() {
  const { settings } = await readSettings();
  if (settings.marketProvider !== "coinbase") {
    const { alternateMarket } = await import("./alternate-markets");
    await alternateMarket(settings.marketProvider, settings.trackedAssets);
    return;
  }
  for (const asset of settings.trackedAssets) {
    const t = ticker.parse(
      await providerJson(`${base}/products/${asset}-USD/ticker`),
    );
    const stats = z
      .object({
        open: number,
        high: number,
        low: number,
        volume: z.coerce.number().nonnegative(),
      })
      .parse(await providerJson(`${base}/products/${asset}-USD/stats`));
    await saveQuote({
      asset,
      provider: "coinbase",
      currency: "USD",
      price: String(t.price),
      bid: String(t.bid),
      ask: String(t.ask),
      volume: String(stats.volume),
      change: (t.price / stats.open - 1) * 100,
      high: String(stats.high),
      low: String(stats.low),
      timestamp: t.time,
      receivedAt: new Date().toISOString(),
      marketCap: null,
    });
    const product = await providerJson(`${base}/products/${asset}-USD`);
    await getDb().query(
      "INSERT INTO market_pairs(provider,asset,currency,metadata) VALUES('coinbase',$1,'USD',$2) ON CONFLICT(provider,asset) DO UPDATE SET metadata=$2",
      [asset, JSON.stringify(product)],
    );
    for (const tf of Object.keys(intervals) as Timeframe[]) {
      const recent = await getDb().query(
        "SELECT max(time)::float8 AS t,count(*)::int n,(max(time)-min(time))::float8 span FROM (SELECT time FROM candles WHERE provider='coinbase' AND asset=$1 AND timeframe=$2 ORDER BY time DESC LIMIT 250) c",
        [asset, tf],
      );
      if (
        !recent.rows[0].t ||
        recent.rows[0].n < 200 ||
        recent.rows[0].span !== (recent.rows[0].n - 1) * intervals[tf] ||
        Date.now() / 1000 - recent.rows[0].t > intervals[tf] + 60
      )
        await backfill(asset, tf);
    }
  }
  await serviceStatus("market", "online", "Coinbase spot REST synchronized");
}
export async function marketOverview() {
  const { settings } = await readSettings();
  const { readMarketContext, coinIds } = await import("./market-context");
  const caps = (await readMarketContext()).capitalization ?? [];
  const rows = await getDb().query(
    "SELECT data FROM market_quotes WHERE provider=$1 AND asset=ANY($2)",
    [settings.marketProvider, settings.trackedAssets],
  );
  return rows.rows.map((r) => ({
    ...r.data,
    marketCap:
      caps.find(
        (c) =>
          c.id === coinIds[r.data.asset] &&
          Date.now() - Date.parse(c.last_updated) < 7200000 &&
          Date.parse(c.last_updated) <= Date.now() + 300000,
      )?.market_cap ?? null,
    marketCapTimestamp:
      caps.find((c) => c.id === coinIds[r.data.asset])?.last_updated ?? null,
    freshnessLimitMs: settings.marketStaleAfterSeconds * 1000,
    fresh: quoteFresh(
      r.data,
      Date.now(),
      settings.marketStaleAfterSeconds * 1000,
    ),
  }));
}
export async function marketHistory(
  asset: string,
  tf: Timeframe,
): Promise<Candle[]> {
  const { settings } = await readSettings();
  const r = await getDb().query(
    "SELECT data FROM candles WHERE provider=$1 AND asset=$2 AND timeframe=$3 ORDER BY time DESC LIMIT 250",
    [settings.marketProvider, asset, tf],
  );
  return r.rows.map((r) => r.data).reverse();
}
