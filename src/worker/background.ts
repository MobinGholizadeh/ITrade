import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import { getEnv } from "../server/env";
import { refreshMarket, serviceStatus } from "../server/market-service";
import { ingestNews } from "../server/news-service";
import { scanMarkets } from "../server/technical-service";
import { syncPortfolios } from "../server/portfolio-service";
import { processAlerts } from "../server/alert-service";
import { syncIntelligence } from "../server/intelligence-service";
import { readSettings } from "../server/settings-repository";
import { startMarketStream } from "./market-stream";
import { jobOptions } from "./queue";
import { syncMarketContext } from "../server/market-context";
export async function startBackground() {
  const connection = new Redis(getEnv().REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  connection.on("error", () => {});
  const tasks = {
    market: async () => {
      await refreshMarket();
    },
    scanner: scanMarkets,
    news: ingestNews,
    portfolio: syncPortfolios,
    alerts: processAlerts,
    intelligence: syncIntelligence,
    context: syncMarketContext,
  };
  const queues: Queue[] = [],
    workers: Worker[] = [];
  const { settings } = await readSettings();
  for (const [name, fn] of Object.entries(tasks)) {
    const queue = new Queue(`itrade-${name}`, {
      connection,
      defaultJobOptions: jobOptions,
    });
    await queue.setGlobalConcurrency(1);
    queues.push(queue);
    const worker = new Worker(
      `itrade-${name}`,
      async () => {
        try {
          await fn();
          if (name === "news") {
            const current = await readSettings();
            await queue.upsertJobScheduler(
              "news-v1",
              { every: current.settings.newsPollIntervalSeconds * 1000 },
              { name: "news", data: {}, opts: jobOptions },
            );
          }
        } catch {
          await serviceStatus(
            name,
            "offline",
            "Background job failed; retry scheduled. Retained evidence may be stale.",
          ).catch(() => {});
          throw Error(`${name} synchronization failed`);
        }
      },
      { connection, concurrency: 1 },
    );
    worker.on("error", () => {});
    worker.on("failed", (job) =>
      console.log(
        JSON.stringify({
          event: "background_job_failed",
          service: name,
          attempts: job?.attemptsMade,
        }),
      ),
    );
    workers.push(worker);
    const every = {
      market: 60000,
      scanner: 15000,
      news: settings.newsPollIntervalSeconds * 1000,
      portfolio: 300000,
      alerts: 30000,
      intelligence: 3600000,
      context: 3600000,
    }[name]!;
    await queue.upsertJobScheduler(
      `${name}-v1`,
      { every },
      { name, data: {}, opts: jobOptions },
    );
  }
  const stopStream = startMarketStream(() => {
    void queues[0]
      .add(
        "market-recovery",
        {},
        { ...jobOptions, jobId: `recovery-${Math.floor(Date.now() / 60000)}` },
      )
      .catch(() => {});
  });
  return async () => {
    stopStream();
    await Promise.allSettled(workers.map((w) => w.close()));
    await Promise.allSettled(queues.map((q) => q.close()));
    connection.disconnect();
  };
}
