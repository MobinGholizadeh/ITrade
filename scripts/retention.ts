import { getDb, closeDb } from "../src/server/db";
import "dotenv/config";
import { retentionSchema } from "../src/domain/retention";
const policy = retentionSchema.parse(process.env);
const dry = process.argv.includes("--dry-run");
const tables = [
  [
    "candles",
    "timeframe IN('1m','5m','15m') AND time<extract(epoch FROM now()-($1::int*interval '1 day'))",
    policy.RETENTION_FINE_CANDLE_DAYS,
  ],
  [
    "news_articles",
    "received_at<now()-($1::int*interval '1 day')",
    policy.RETENTION_NEWS_DAYS,
  ],
  [
    "portfolio_snapshots",
    "created_at<now()-($1::int*interval '1 day')",
    policy.RETENTION_SNAPSHOT_DAYS,
  ],
  [
    "notification_deliveries",
    "delivered_at<now()-($1::int*interval '1 day')",
    policy.RETENTION_DELIVERY_DAYS,
  ],
] as const;
try {
  const c = await getDb().connect();
  try {
    await c.query("BEGIN");
    for (const [table, where, days] of tables) {
      const result = await c.query(
        `${dry ? "SELECT count(*)::int count FROM" : "DELETE FROM"} ${table} WHERE ${where}`,
        [days],
      );
      console.log(
        JSON.stringify({
          table,
          days,
          dryRun: dry,
          rows: dry ? result.rows[0].count : result.rowCount,
        }),
      );
    }
    await c.query("COMMIT");
    console.log(
      dry
        ? "Retention preview only; no records removed."
        : "Retention applied; risk journal, alerts, analyses and audit history preserved.",
    );
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
} finally {
  await closeDb();
}
