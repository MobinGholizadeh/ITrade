import { Redis } from "ioredis";
import { getEnv } from "./env";

const globalRedis = globalThis as unknown as { itradeRedis?: Redis };
export function getRedis(): Redis {
  if (!globalRedis.itradeRedis) {
    globalRedis.itradeRedis = new Redis(getEnv().REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 1500,
      commandTimeout: 2000,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 250, 5000),
    });
    globalRedis.itradeRedis.on("error", () => {
      /* Health reports failure without exposing connection credentials. */
    });
  }
  return globalRedis.itradeRedis;
}
export function closeRedis() {
  globalRedis.itradeRedis?.disconnect();
  delete globalRedis.itradeRedis;
}
export async function readyRedis() {
  const redis = getRedis();
  if (redis.status === "ready") return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Redis unavailable"));
    }, 2500);
    const done = () => {
      cleanup();
      resolve();
    };
    const cleanup = () => {
      clearTimeout(timer);
      redis.off("ready", done);
    };
    redis.once("ready", done);
  });
}
