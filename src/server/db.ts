import { Pool } from "pg";
import { getEnv } from "./env";

const globalDb = globalThis as unknown as { itradePool?: Pool };
export function getDb(): Pool {
  if (!globalDb.itradePool) {
    globalDb.itradePool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 10000,
      statement_timeout: 3000,
    });
    globalDb.itradePool.on("error", () =>
      console.error(
        JSON.stringify({ level: "error", event: "database_pool_error" }),
      ),
    );
  }
  return globalDb.itradePool;
}
export async function closeDb() {
  if (globalDb.itradePool) {
    await globalDb.itradePool.end();
    delete globalDb.itradePool;
  }
}
