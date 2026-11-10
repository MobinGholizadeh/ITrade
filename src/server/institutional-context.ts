import { getDb } from "./db";
export async function institutionalContext() {
  const rows = (
    await getDb().query(
      "SELECT * FROM institutional_flows ORDER BY report_date DESC LIMIT 20",
    )
  ).rows;
  return {
    status: rows.length ? "historical_daily_reports" : "not_configured",
    data: rows,
  };
}
