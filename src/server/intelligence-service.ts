import { z } from "zod";
import { createHash } from "node:crypto";
import { getDb } from "./db";
import { providerText, providerJson } from "./provider-http";
import {
  flowSchema,
  correlation,
  breadth,
  flowPriceCorrelation,
  calendarTimestamp,
} from "../domain/intelligence";
import { marketHistory, serviceStatus } from "./market-service";
import { readSettings } from "./settings-repository";
import { technical, relativeStrength } from "../domain/technical";
import { readMarketContext } from "./market-context";
import { createAlert } from "./technical-service";
export async function syncIntelligence() {
  // A licensed normalized feed is configured by the server administrator. No scraping or inferred flows.
  if (
    process.env.ETF_FLOW_FEED_URL &&
    process.env.ETF_FLOW_LICENSE_CONFIRMED === "true"
  ) {
    try {
      const url = new URL(process.env.ETF_FLOW_FEED_URL);
      if (url.protocol !== "https:" || url.username || url.password)
        throw Error("Invalid feed");
      const data = z
        .array(flowSchema)
        .max(2000)
        .parse(
          JSON.parse(
            await providerText(
              url.toString(),
              process.env.ETF_FLOW_API_KEY
                ? { Authorization: `Bearer ${process.env.ETF_FLOW_API_KEY}` }
                : {},
              1500000,
            ),
          ),
        );
      for (const f of data)
        await getDb().query(
          "INSERT INTO institutional_flows(provider,fund,asset,report_date,published_at,net_flow_usd,source_url) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(provider,fund,report_date) DO UPDATE SET published_at=$5,net_flow_usd=$6,source_url=$7,received_at=now() WHERE institutional_flows.published_at<=EXCLUDED.published_at",
          [
            f.provider,
            f.fund,
            f.asset,
            f.reportDate,
            f.publishedAt,
            f.netFlowUsd,
            f.sourceUrl,
          ],
        );
      await serviceStatus(
        "flows",
        "online",
        "Licensed daily flow feed synchronized",
      );
    } catch {
      await serviceStatus(
        "flows",
        "offline",
        "Licensed flow feed failed validation or could not be reached",
      );
    }
  } else
    await serviceStatus(
      "flows",
      "not_configured",
      "Licensed ETF flow feed is not configured",
    );
  if (process.env.FMP_API_KEY) {
    try {
      const from = new Date().toISOString().slice(0, 10),
        to = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      const rows = z
        .array(
          z.object({
            event: z.string().max(500),
            date: z.string(),
            country: z.string(),
            impact: z.string(),
            actual: z.number().nullable(),
            estimate: z.number().nullable(),
            previous: z.number().nullable(),
          }),
        )
        .max(2000)
        .parse(
          await providerJson(
            `https://financialmodelingprep.com/stable/economic-calendar?from=${from}&to=${to}&apikey=${process.env.FMP_API_KEY}`,
          ),
        );
      for (const e of rows) {
        const timestamp = calendarTimestamp(e.date);
        const id = createHash("sha256")
          .update(e.event + e.country + timestamp)
          .digest("hex");
        await getDb().query(
          "INSERT INTO macro_events(id,event,event_at,country,impact,actual,estimate,previous,source_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET actual=$6,estimate=$7,previous=$8,received_at=now()",
          [
            id,
            e.event,
            timestamp,
            e.country,
            e.impact,
            e.actual,
            e.estimate,
            e.previous,
            "https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar",
          ],
        );
        const until = Date.parse(timestamp) - Date.now();
        if (/^high$/i.test(e.impact) && until > 0 && until <= 86400000) {
          const { settings } = await readSettings();
          for (const asset of settings.trackedAssets)
            await createAlert(
              `macro:${id}:${asset}`,
              asset,
              "macro_event_upcoming",
              "high",
              {
                event: e.event,
                country: e.country,
                eventAt: timestamp,
                source: "FMP economic calendar",
                sourceUrl:
                  "https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar",
                observedAt: new Date().toISOString(),
                note: "High-impact event scheduled within 24 hours. Schedule may change; market direction is unknown. Review liquidity, exposure and risk limits.",
              },
              settings.alertCooldownMinutes,
            );
        }
      }
      await serviceStatus(
        "macro",
        "online",
        "FMP economic calendar synchronized",
      );
    } catch {
      await serviceStatus(
        "macro",
        "offline",
        "Calendar unavailable or invalid",
      );
    }
  } else
    await serviceStatus(
      "macro",
      "not_configured",
      "FMP economic calendar key not configured",
    );
  const alerts = await getDb().query(
    "SELECT a.* FROM alerts a LEFT JOIN signal_evaluations e ON e.alert_id=a.id WHERE e.alert_id IS NULL AND a.created_at<now()-interval '24 hours' AND a.type IN('breakout_watch','breakdown_watch') LIMIT 100",
  );
  for (const a of alerts.rows) {
    if (!a.evidence.quote?.provider) continue;
    const cs = (
      await getDb().query(
        "SELECT data FROM candles WHERE provider=$1 AND asset=$2 AND timeframe='1h' ORDER BY time",
        [a.evidence.quote.provider, a.asset],
      )
    ).rows.map((row) => row.data as import("../domain/market").Candle);
    const entry = Number(a.evidence.quote?.price),
      endTime = new Date(a.created_at).getTime() / 1000 + 86400;
    const end = cs.find((c) => c.time >= endTime && c.time < endTime + 3600);
    if (!end || !Number.isFinite(entry) || entry <= 0) continue;
    await getDb().query(
      "INSERT INTO signal_evaluations(alert_id,horizon_hours,entry_price,exit_price,return_percent,observed_at,description) VALUES($1,24,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING",
      [
        a.id,
        entry,
        end.open,
        (end.open / entry - 1) * 100,
        new Date(end.time * 1000),
        "Observed forward spot return, not strategy P/L; no fees, execution, stop simulation or causal attribution",
      ],
    );
  }
}
export async function intelligenceSummary() {
  const { settings } = await readSettings();
  const btc = await marketHistory("BTC", "1d");
  const ranking = [];
  const dailyCandles = new Map<string, import("../domain/market").Candle[]>();
  for (const asset of settings.trackedAssets) {
    const cs = await marketHistory(asset, "1d");
    dailyCandles.set(asset, cs);
    ranking.push({
      asset,
      relativeStrength: relativeStrength(cs, btc),
      correlation: correlation(cs, btc),
      technical: technical(cs, "1d"),
    });
  }
  const flows = (
    await getDb().query(
      "SELECT * FROM institutional_flows ORDER BY report_date DESC LIMIT 2000",
    )
  ).rows;
  const groups = new Map<string, typeof flows>();
  for (const flow of flows) {
    const key = `${flow.provider}:${flow.fund}:${flow.asset}`;
    groups.set(key, [...(groups.get(key) ?? []), flow]);
  }
  const flowCorrelations = [...groups].map(([key, rows]) => ({
    key,
    provider: rows[0].provider as string,
    fund: rows[0].fund as string,
    asset: rows[0].asset as string,
    ...flowPriceCorrelation(
      rows.map((f) => ({
        reportDate:
          f.report_date instanceof Date
            ? f.report_date.toISOString().slice(0, 10)
            : String(f.report_date).slice(0, 10),
        netFlowUsd: f.net_flow_usd,
      })),
      dailyCandles.get(rows[0].asset) ?? [],
    ),
  }));
  return {
    sentiment: (await readMarketContext()).sentiment,
    ranking: ranking.sort(
      (a, b) =>
        (b.relativeStrength ?? -Infinity) - (a.relativeStrength ?? -Infinity),
    ),
    breadth: breadth(ranking.map((r) => r.technical)),
    flows: flows.slice(0, 100),
    flowCorrelations,
    macro: (
      await getDb().query(
        "SELECT * FROM macro_events WHERE event_at>now()-interval '1 day' ORDER BY event_at LIMIT 100",
      )
    ).rows,
    evaluations: (
      await getDb().query(
        "SELECT e.*,a.asset,a.type FROM signal_evaluations e JOIN alerts a ON a.id=e.alert_id ORDER BY observed_at DESC LIMIT 100",
      )
    ).rows,
    status: (
      await getDb().query(
        "SELECT * FROM service_status WHERE name IN('flows','macro','sentiment','metadata')",
      )
    ).rows,
  };
}
