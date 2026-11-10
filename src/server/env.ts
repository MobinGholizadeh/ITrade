import "dotenv/config";
import { z } from "zod";

const schema = z
  .object({
    DATABASE_URL: z
      .string()
      .url()
      .default("postgresql://itrade:itrade_local@127.0.0.1:54329/itrade"),
    REDIS_URL: z.string().url().default("redis://127.0.0.1:63799"),
    APP_ORIGIN: z.string().url().default("http://127.0.0.1:3000"),
    HEALTH_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(2000)
      .max(60000)
      .default(10000),
    WORKER_STALE_AFTER_MS: z.coerce
      .number()
      .int()
      .min(6000)
      .max(300000)
      .default(45000),
  })
  .refine(
    (env) => env.WORKER_STALE_AFTER_MS >= env.HEALTH_INTERVAL_MS * 3,
    "Worker freshness must allow at least three health intervals",
  );
export function getEnv() {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      "Invalid server environment configuration; check .env.example",
    );
  return result.data;
}
