import { getDb } from "./db";
import { readSettings } from "./settings-repository";
import { marketHistory, marketOverview } from "./market-service";
import { technical, relativeStrength } from "../domain/technical";
import type { Timeframe } from "../domain/market";
export async function scanMarkets() {
  const { settings } = await readSettings();
  const tf = settings.preferredTimeframe;
  const btc = await marketHistory("BTC", tf);
  const quotes = await marketOverview();
  for (const asset of settings.trackedAssets) {
    const cs = await marketHistory(asset, tf);
    const data = {
      ...technical(cs, tf, Date.now(), settings),
      relativeStrength: relativeStrength(cs, btc),
    };
    await getDb().query(
      "INSERT INTO technical_snapshots(provider,asset,timeframe,data) VALUES($1,$2,$3,$4) ON CONFLICT(provider,asset,timeframe) DO UPDATE SET data=$4,updated_at=now()",
      [settings.marketProvider, asset, tf, JSON.stringify(data)],
    );
    const q = quotes.find((q) => q.asset === asset);
    if (!q?.fresh) continue;
    if (data.ready) {
      for (const [active, type] of [
        [data.volumeSpike, "volume_spike"],
        [data.unusualVolatility, "unusual_volatility"],
        [data.rsiCondition !== "neutral", `rsi_${data.rsiCondition}`],
        [
          [
            "failed_breakout",
            "breakout_retest_watch",
            "resistance_retest_watch",
            "reversal_warning",
            "support_test_unconfirmed",
          ].includes(data.state),
          data.state,
        ],
      ] as const) {
        if (active)
          await createAlert(
            `${settings.marketProvider}:${asset}:${tf}:${type}`,
            asset,
            type,
            "medium",
            {
              quote: q,
              technical: data,
              note: "Research condition, not a trade recommendation.",
            },
            settings.alertCooldownMinutes,
          );
      }
    }
    if (data.ready) {
      const owned = await getDb().query(
        "SELECT h.asset FROM holdings h JOIN portfolio_connections c ON c.id=h.connection_id WHERE h.asset=$1 AND h.quantity>0 AND (c.kind='manual' OR (c.status='synced' AND c.synced_at>now()-interval '15 minutes')) LIMIT 1",
        [asset],
      );
      const resistanceRisk =
        data.resistance !== null &&
        Number(q.price) >= data.resistance - data.atr * settings.zoneAtr &&
        Number(q.price) <= data.resistance + data.atr * settings.zoneAtr &&
        data.rsi !== null &&
        data.previousRsi !== null &&
        data.rsi < data.previousRsi;
      if (
        owned.rows.length &&
        (resistanceRisk ||
          data.state === "breakdown_watch" ||
          data.state === "failed_breakout")
      )
        await createAlert(
          `${settings.marketProvider}:${asset}:${tf}:holding_risk_review`,
          asset,
          "holding_risk_review",
          "high",
          {
            quote: q,
            technical: data,
            held: true,
            note: resistanceRisk
              ? "Held asset near resistance with weakening RSI. Review exposure; a price rise alone is not a sell signal."
              : "Held asset has a closed-candle breakdown or failed breakout. Review exposure and invalidation conditions; no sale is prescribed.",
          },
          settings.alertCooldownMinutes,
        );
    }
    if (
      data.ready &&
      (data.state === "breakout_watch" || data.state === "breakdown_watch")
    )
      await createAlert(
        `${settings.marketProvider}:${asset}:${tf}:${data.state}`,
        asset,
        data.state,
        "high",
        { quote: q, technical: data },
        settings.alertCooldownMinutes,
      );
    const rules = await getDb().query(
      "SELECT * FROM alert_rules WHERE asset=$1 AND provider=$2 AND currency=$3 AND enabled=true",
      [asset, settings.marketProvider, q.currency],
    );
    for (const rule of rules.rows) {
      if (
        Number(q.price) >= Number(rule.lower_price) &&
        Number(q.price) <= Number(rule.upper_price)
      )
        await createAlert(
          `zone:${rule.id}`,
          asset,
          "zone_entered",
          "medium",
          {
            quote: q,
            rule,
            technical: data,
            note: "Watch-zone touch; not a confirmed entry.",
          },
          settings.alertCooldownMinutes,
        );
    }
  }
}
export async function createAlert(
  key: string,
  asset: string,
  type: string,
  priority: string,
  evidence: unknown,
  cooldown: number,
) {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [key]);
    const exists = await client.query(
      "SELECT id FROM alerts WHERE dedup_key=$1 AND (created_at>now()-($2::int*interval '1 minute') OR status IN('active','acknowledged'))",
      [key, cooldown],
    );
    if (exists.rows.length) {
      await client.query("COMMIT");
      return null;
    }
    const r = await client.query(
      "INSERT INTO alerts(dedup_key,asset,type,priority,evidence,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '24 hours') RETURNING id",
      [key, asset, type, priority, JSON.stringify(evidence)],
    );
    await client.query(
      "INSERT INTO alert_events(alert_id,status) VALUES($1,'active')",
      [r.rows[0].id],
    );
    await client.query("COMMIT");
    return r.rows[0].id as string;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
export async function assetTechnical(asset: string, tf: Timeframe) {
  const { settings } = await readSettings();
  return technical(await marketHistory(asset, tf), tf, Date.now(), settings);
}
