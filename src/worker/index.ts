import { startBackground } from "./background";
import { randomUUID } from "node:crypto";
import { Redis } from "ioredis";
import { Queue, Worker } from "bullmq";
import { getEnv } from "../server/env";
import { getDb, closeDb } from "../server/db";
import { heartbeatKey } from "../server/health";
import { healthQueueName, jobOptions } from "./queue";

const env = getEnv();
const instanceId = randomUUID();
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  connectTimeout: 2000,
  retryStrategy: (n) => Math.min(250 * 2 ** Math.min(n, 5), 10000),
});
const log = (
  level: string,
  event: string,
  metadata: Record<string, unknown> = {},
) =>
  console.log(
    JSON.stringify({
      level,
      event,
      timestamp: new Date().toISOString(),
      ...metadata,
    }),
  );
connection.on("error", () => log("warn", "worker_redis_unavailable"));
const queue = new Queue(healthQueueName, {
  connection,
  defaultJobOptions: jobOptions,
});
const worker = new Worker(
  healthQueueName,
  async (job) => {
    if (job.name !== "infrastructure-check") throw new Error("Unsupported job");
    const result = await getDb().query(
      "SELECT id FROM user_settings WHERE id = 1",
    );
    if (result.rowCount !== 1) throw new Error("Database schema not ready");
    const heartbeat = { timestamp: new Date().toISOString(), instanceId };
    await connection.set(
      heartbeatKey,
      JSON.stringify(heartbeat),
      "PX",
      env.WORKER_STALE_AFTER_MS * 2,
    );
    return { checkedAt: heartbeat.timestamp };
  },
  { connection, concurrency: 1 },
);
queue.on("error", () => log("warn", "queue_unavailable"));
worker.on("error", () => log("warn", "worker_dependency_error"));
worker.on("failed", (job) =>
  log("error", "job_failed", {
    jobId: job?.id,
    attemptsMade: job?.attemptsMade,
    exhausted: (job?.attemptsMade ?? 0) >= jobOptions.attempts,
  }),
);

let shuttingDown = false;
const stopBackground =
  process.env.DISABLE_EXTERNAL_WORKERS === "1"
    ? async () => {}
    : await startBackground();
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log("info", "worker_stopping");
  const timeout = setTimeout(() => process.exit(1), 10000);
  timeout.unref();
  try {
    await stopBackground();
    await worker.close();
    await queue.close();
    // Do not erase a newer heartbeat from another worker instance.
    await connection.eval(
      "local value = redis.call('GET', KEYS[1]); if value and cjson.decode(value).instanceId == ARGV[1] then return redis.call('DEL', KEYS[1]) end; return 0",
      1,
      heartbeatKey,
      instanceId,
    );
  } finally {
    connection.disconnect();
    await closeDb();
    clearTimeout(timeout);
  }
}
process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
try {
  await queue.upsertJobScheduler(
    "foundation-health-v1",
    { every: env.HEALTH_INTERVAL_MS },
    { name: "infrastructure-check", data: {}, opts: jobOptions },
  );
  log("info", "worker_started", {
    instanceId,
    intervalMs: env.HEALTH_INTERVAL_MS,
  });
} catch {
  log("error", "worker_start_failed");
  await shutdown();
  process.exitCode = 1;
}
