import { z } from "zod";
import { isFresh, type HealthCheck, type HealthReport } from "../domain/health";
import { getDb } from "./db";
import { getRedis } from "./redis";
import { getEnv } from "./env";

export const heartbeatKey = "itrade:worker:heartbeat";
export const heartbeatSchema = z.object({
  timestamp: z.iso.datetime(),
  instanceId: z.string().min(1),
});
export async function getHealth(): Promise<HealthReport> {
  const env = getEnv();
  const now = Date.now();
  const checkedAt = new Date(now).toISOString();
  const results = await Promise.allSettled([
    getDb().query("SELECT id FROM user_settings WHERE id = 1"),
    getRedis().ping(),
    getRedis().get(heartbeatKey),
  ]);
  const databaseReady =
    results[0].status === "fulfilled" && results[0].value.rowCount === 1;
  const redisReady =
    results[1].status === "fulfilled" && results[1].value === "PONG";
  let heartbeat: z.infer<typeof heartbeatSchema> | null = null;
  if (results[2].status === "fulfilled" && results[2].value) {
    try {
      heartbeat = heartbeatSchema.parse(JSON.parse(results[2].value));
    } catch {
      /* Corrupt state is unavailable, never healthy. */
    }
  }
  const workerReady =
    redisReady &&
    isFresh(heartbeat?.timestamp ?? null, now, env.WORKER_STALE_AFTER_MS);
  const check = (
    id: string,
    name: string,
    state: HealthCheck["state"],
    detail: string,
    lastSuccessAt: string | null = null,
  ): HealthCheck => ({ id, name, state, detail, checkedAt, lastSuccessAt });
  const checks: HealthCheck[] = [
    check(
      "database",
      "PostgreSQL",
      databaseReady ? "online" : "offline",
      databaseReady
        ? "Connected · schema ready"
        : "Unavailable or migration required",
      databaseReady ? checkedAt : null,
    ),
    check(
      "redis",
      "Redis",
      redisReady ? "online" : "offline",
      redisReady
        ? "Connected · queue storage available"
        : "Cache and queue storage unavailable",
      redisReady ? checkedAt : null,
    ),
    check(
      "worker",
      "Background worker",
      workerReady ? "online" : heartbeat ? "stale" : "offline",
      workerReady
        ? "Scheduled heartbeat received"
        : "No recent worker heartbeat",
      heartbeat?.timestamp ?? null,
    ),
    check("market", "Market feeds", "offline", "Provider status unavailable"),
    check("news", "News intelligence", "offline", "Feed status unavailable"),
    check(
      "gemini",
      "Gemini analyst",
      process.env.GEMINI_API_KEY ? "offline" : "not_configured",
      process.env.GEMINI_API_KEY
        ? "Server key configured; waiting for a successful request"
        : "No server key configured",
    ),
  ];
  try {
    const statuses = await getDb().query("SELECT * FROM service_status");
    for (const id of ["market", "news", "gemini"]) {
      const row = statuses.rows.find((r) => r.name === id);
      const c = checks.find((c) => c.id === id)!;
      if (row) {
        c.state =
          row.state === "online"
            ? Date.now() - new Date(row.checked_at).getTime() >
              (id === "market" ? 180000 : id === "news" ? 900000 : 86400000)
              ? "stale"
              : "online"
            : "offline";
        c.detail = row.detail;
        c.lastSuccessAt = row.success_at?.toISOString() ?? null;
      } else {
        c.state =
          id === "gemini" && !process.env.GEMINI_API_KEY
            ? "not_configured"
            : "offline";
        c.detail = "Waiting for a successful provider check";
      }
    }
  } catch {
    /* Infrastructure status already reports storage failure. */
  }
  return {
    status: databaseReady && redisReady && workerReady ? "healthy" : "degraded",
    checkedAt,
    checks,
    milestone: "M10 implementation",
  };
}
