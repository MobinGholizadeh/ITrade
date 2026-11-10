import { z } from "zod";
import { providerJson } from "./provider-http";
import {
  closedCandles,
  intervals,
  type Timeframe,
  type Quote,
} from "../domain/market";
import { getDb } from "./db";
import { saveQuote, serviceStatus } from "./market-service";
const n = z.coerce.number().finite().positive(),
  v = z.coerce.number().finite().nonnegative();
export async function alternateMarket(
  provider: "binance" | "kraken",
  assets: string[],
) {
  for (const asset of assets) {
    const pair =
      provider === "binance"
        ? `${asset}USDT`
        : `${asset === "BTC" ? "XBT" : asset}USD`;
    let q: Quote;
    let metadata: unknown;
    if (provider === "binance") {
      const t = z
        .object({
          lastPrice: n,
          bidPrice: n,
          askPrice: n,
          volume: v,
          priceChangePercent: z.coerce.number().finite(),
          highPrice: n,
          lowPrice: n,
          closeTime: z.number().int(),
        })
        .parse(
          await providerJson(
            `https://api.binance.com/api/v3/ticker/24hr?symbol=${pair}`,
          ),
        );
      q = {
        asset,
        provider,
        currency: "USDT",
        price: String(t.lastPrice),
        bid: String(t.bidPrice),
        ask: String(t.askPrice),
        volume: String(t.volume),
        change: t.priceChangePercent,
        high: String(t.highPrice),
        low: String(t.lowPrice),
        timestamp: new Date(t.closeTime).toISOString(),
        receivedAt: new Date().toISOString(),
        marketCap: null,
      };
      metadata = await providerJson(
        `https://api.binance.com/api/v3/exchangeInfo?symbol=${pair}`,
      );
    } else {
      const r = z
        .object({
          error: z.array(z.string()),
          result: z.record(
            z.string(),
            z.object({
              a: z.array(z.string()),
              b: z.array(z.string()),
              c: z.array(z.string()),
              v: z.array(z.string()),
              h: z.array(z.string()),
              l: z.array(z.string()),
              o: z.string(),
            }),
          ),
        })
        .parse(
          await providerJson(
            `https://api.kraken.com/0/public/Ticker?pair=${pair}`,
          ),
        );
      if (r.error.length) throw Error("Kraken unavailable");
      const t = Object.values(r.result)[0];
      if (!t) throw Error("Missing quote");
      q = {
        asset,
        provider,
        currency: "USD",
        price: String(n.parse(t.c[0])),
        bid: String(n.parse(t.b[0])),
        ask: String(n.parse(t.a[0])),
        volume: String(v.parse(t.v[1])),
        change: null,
        high: String(n.parse(t.h[1])),
        low: String(n.parse(t.l[1])),
        timestamp: new Date().toISOString(),
        receivedAt: new Date().toISOString(),
        marketCap: null,
      };
      metadata = await providerJson(
        `https://api.kraken.com/0/public/AssetPairs?pair=${pair}`,
      );
    }
    await saveQuote(q);
    await getDb().query(
      "INSERT INTO market_pairs(provider,asset,currency,metadata) VALUES($1,$2,$3,$4) ON CONFLICT(provider,asset) DO UPDATE SET currency=$3,metadata=$4",
      [provider, asset, q.currency, JSON.stringify(metadata)],
    );
    for (const tf of Object.keys(intervals) as Timeframe[]) {
      const recent = await getDb().query(
        "SELECT max(time)::float8 t,min(time)::float8 first,count(*)::int count FROM (SELECT time FROM candles WHERE provider=$1 AND asset=$2 AND timeframe=$3 ORDER BY time DESC LIMIT 250) recent",
        [provider, asset, tf],
      );
      if (
        recent.rows[0].t &&
        recent.rows[0].count === 250 &&
        recent.rows[0].t - recent.rows[0].first === 249 * intervals[tf] &&
        Date.now() / 1000 - recent.rows[0].t < intervals[tf] + 60
      )
        continue;
      let raw: unknown[];
      if (provider === "binance") {
        const rows = z
          .array(z.array(z.union([z.number(), z.string()])))
          .parse(
            await providerJson(
              `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=${tf}&limit=251`,
            ),
          );
        raw = rows.map((r) => ({
          time: Number(r[0]) / 1000,
          open: Number(r[1]),
          high: Number(r[2]),
          low: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[5]),
        }));
      } else {
        const res = z
          .object({
            error: z.array(z.string()),
            result: z.record(z.string(), z.unknown()),
          })
          .parse(
            await providerJson(
              `https://api.kraken.com/0/public/OHLC?pair=${pair}&interval=${intervals[tf] / 60}`,
            ),
          );
        if (res.error.length) throw Error("Kraken candles unavailable");
        const rows = z
          .array(z.array(z.union([z.string(), z.number()])))
          .parse(Object.entries(res.result).find(([k]) => k !== "last")?.[1]);
        raw = rows.map((r) => ({
          time: Number(r[0]),
          open: Number(r[1]),
          high: Number(r[2]),
          low: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[6]),
        }));
      }
      // Venue weekly candles are Monday-anchored, already aggregated by the venue.
      const cs = closedCandles(
        raw,
        intervals[tf],
        Date.now(),
        tf === "1w" ? 345600 : 0,
      ).slice(-250);
      await getDb().query(
        "INSERT INTO candles(provider,asset,timeframe,time,data) SELECT $1,$2,$3,(v->>'time')::bigint,v FROM jsonb_array_elements($4::jsonb) v ON CONFLICT(provider,asset,timeframe,time) DO UPDATE SET data=EXCLUDED.data",
        [provider, asset, tf, JSON.stringify(cs)],
      );
      await new Promise((r) => setTimeout(r, 400));
    }
  }
  await serviceStatus(
    "market",
    "online",
    `${provider} spot synchronized. Kraken REST timestamps indicate receipt time; 24h change unavailable.`,
  );
}
