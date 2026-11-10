import { json } from "@/server/http";
import { readSettings } from "@/server/settings-repository";
import { marketHistory } from "@/server/market-service";
import { technical, relativeStrength } from "@/domain/technical";
import { listNews } from "@/server/news-service";
import { getDb } from "@/server/db";
export async function GET() {
  try {
    const { settings } = await readSettings(),
      tf = settings.preferredTimeframe,
      btc = await marketHistory("BTC", tf),
      news = await listNews();
    const rows = [];
    for (const asset of settings.trackedAssets) {
      const cs = await marketHistory(asset, tf),
        data = technical(cs, tf, Date.now(), settings),
        owned =
          (
            await getDb().query(
              "SELECT id FROM holdings WHERE asset=$1 AND quantity>0 LIMIT 1",
              [asset],
            )
          ).rowCount! > 0;
      const analysis =
        (
          await getDb().query(
            "SELECT result,created_at FROM ai_analyses WHERE asset=$1 ORDER BY created_at DESC LIMIT 1",
            [asset],
          )
        ).rows[0] ?? null;
      rows.push({
        asset,
        technical: data,
        owned,
        relativeStrength: relativeStrength(cs, btc),
        highNewsImpact: news.some(
          (n) =>
            n.classification.current &&
            n.classification.assets.includes(asset) &&
            ["high", "critical"].includes(n.classification.priority),
        ),
        analysis,
        latestNews:
          news
            .filter((n) => n.classification.assets.includes(asset))
            .slice(0, 1)
            .map((n) => ({
              title: n.title,
              url: n.canonical_url,
              publishedAt: n.published_at,
            }))[0] ?? null,
      });
    }
    return json({ rows, timeframe: tf });
  } catch {
    return json({ error: "Scanner evidence unavailable" }, 503);
  }
}
