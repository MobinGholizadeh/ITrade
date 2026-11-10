import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const secrets = [
  "GEMINI_API_KEY",
  "ALCHEMY_API_KEY",
  "HELIUS_API_KEY",
  "CREDENTIAL_ENCRYPTION_KEY",
  "BACKUP_ENCRYPTION_KEY",
  "SESSION_SECRET",
  "VAPID_PRIVATE_KEY",
  "CRYPTOPANIC_API_KEY",
  "COINGECKO_DEMO_API_KEY",
  "ETF_FLOW_API_KEY",
  "FMP_API_KEY",
  "LOGIN_PASSWORD_HASH",
].flatMap((k) =>
  process.env[k] && process.env[k]!.length >= 12 ? [process.env[k]!] : [],
);
let scanned = 0;
const leaked: string[] = [];
async function scan(path: string) {
  let entries;
  try {
    entries = await readdir(path, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const p = join(path, entry.name);
    if (entry.isDirectory()) await scan(p);
    else {
      const data = await readFile(p);
      scanned++;
      if (secrets.some((s) => data.includes(s))) leaked.push(p);
    }
  }
}
for (const root of [
  "src",
  "public",
  "docs",
  "scripts",
  "tests",
  ".next/static",
])
  await scan(root);
console.log(JSON.stringify({ filesScanned: scanned, credentialLeaks: leaked }));
if (leaked.length) process.exitCode = 1;
