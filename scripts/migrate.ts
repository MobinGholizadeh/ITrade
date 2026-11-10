import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { getDb, closeDb } from "../src/server/db";

export async function migrate() {
  const client = await getDb().connect();
  try {
    await client.query("SELECT pg_advisory_lock(731009)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const dir = new URL("../db/migrations/", import.meta.url);
    for (const name of (await readdir(dir))
      .filter((name) => /^\d+_.+\.sql$/.test(name))
      .sort()) {
      const sql = await readFile(new URL(name, dir), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query(
        "SELECT checksum FROM schema_migrations WHERE name = $1",
        [name],
      );
      if (existing.rows.length) {
        if (existing.rows[0].checksum !== checksum)
          throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
          [name, checksum],
        );
        await client.query("COMMIT");
        console.log(JSON.stringify({ event: "migration_applied", name }));
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(731009)");
    client.release();
  }
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  migrate()
    .catch(() => {
      console.error(
        "Migration failed. Check PostgreSQL connectivity and migration integrity.",
      );
      process.exitCode = 1;
    })
    .finally(closeDb);
}
