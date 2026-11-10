import "dotenv/config";
import { spawn } from "node:child_process";
import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
async function command(args: string[], input?: Buffer) {
  if (args[0] === "compose" && process.env.BACKUP_COMPOSE_FILE) {
    args = [
      "compose",
      "-f",
      process.env.BACKUP_COMPOSE_FILE,
      ...(process.env.BACKUP_ENV_FILE
        ? ["--env-file", process.env.BACKUP_ENV_FILE]
        : []),
      ...args.slice(1),
    ];
  }
  return new Promise<Buffer>((resolve, reject) => {
    const p = spawn("docker", args, {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    p.stdout.on("data", (b: Buffer) => {
      bytes += b.length;
      if (bytes > 500 * 1024 * 1024) {
        p.kill();
        reject(Error("Backup exceeded 500MB limit"));
      } else chunks.push(b);
    });
    p.stderr.resume();
    p.on("error", () => reject(Error("Docker unavailable")));
    p.on("close", (code) =>
      code === 0
        ? resolve(Buffer.concat(chunks))
        : reject(Error("Database backup operation failed")),
    );
    p.stdin.end(input);
  });
}
async function main() {
  const key = process.env.BACKUP_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key))
    throw Error("BACKUP_ENCRYPTION_KEY must be configured");
  const dump = await command([
    "compose",
    "exec",
    "-T",
    "postgres",
    "pg_dump",
    "-U",
    "itrade",
    "-d",
    "itrade",
    "--no-owner",
    "--no-acl",
  ]);
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(dump), cipher.final()]);
  const blob = Buffer.concat([
    Buffer.from("ITRADE01"),
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]);
  await mkdir("backups", { recursive: true });
  const path = resolve(
    "backups",
    `itrade-${new Date().toISOString().replace(/[:.]/g, "-")}.enc`,
  );
  await writeFile(path, blob);
  console.log(
    JSON.stringify({
      event: "encrypted_backup_written",
      bytes: blob.length,
      path,
    }),
  );
  if (process.argv.includes("--verify")) {
    const saved = await readFile(path);
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(key, "hex"),
      saved.subarray(8, 20),
    );
    decipher.setAuthTag(saved.subarray(20, 36));
    const plain = Buffer.concat([
      decipher.update(saved.subarray(36)),
      decipher.final(),
    ]);
    const db = `itrade_restore_${Date.now()}`;
    if (!/^itrade_restore_\d+$/.test(db))
      throw Error("Unsafe restore database");
    await command([
      "compose",
      "exec",
      "-T",
      "postgres",
      "createdb",
      "-U",
      "itrade",
      db,
    ]);
    try {
      await command(
        [
          "compose",
          "exec",
          "-T",
          "postgres",
          "psql",
          "-U",
          "itrade",
          "-d",
          db,
          "-v",
          "ON_ERROR_STOP=1",
        ],
        plain,
      );
      const result = await command([
        "compose",
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "itrade",
        "-d",
        db,
        "-Atc",
        "SELECT count(*) FROM schema_migrations",
      ]);
      console.log(
        JSON.stringify({
          event: "isolated_restore_verified",
          migrations: Number(result.toString().trim()),
        }),
      );
    } finally {
      await command([
        "compose",
        "exec",
        "-T",
        "postgres",
        "dropdb",
        "-U",
        "itrade",
        db,
      ]);
    }
  }
}
main().catch(() => {
  console.error(
    "Backup or isolated restore failed; check service availability and encryption configuration.",
  );
  process.exitCode = 1;
});
