import "dotenv/config";
// Only booleans and field names are printed. Never serialize environment values.
const has = (key: string) => Boolean(process.env[key]);
let remoteHttps = false;
try {
  const url = new URL(process.env.APP_ORIGIN ?? "");
  remoteHttps =
    url.protocol === "https:" &&
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
} catch {}
const hexKey = (key: string) => /^[a-f0-9]{64}$/i.test(process.env[key] ?? "");
const checks = [
  { name: "Hosted HTTPS origin", ready: remoteHttps, scope: "deployment" },
  {
    name: "Operator login",
    ready: has("LOGIN_PASSWORD_HASH") && has("SESSION_SECRET"),
    scope: "deployment",
  },
  {
    name: "Credential encryption",
    ready: hexKey("CREDENTIAL_ENCRYPTION_KEY"),
    scope: "core",
  },
  {
    name: "Encrypted backups",
    ready: hexKey("BACKUP_ENCRYPTION_KEY"),
    scope: "core",
  },
  { name: "Gemini", ready: has("GEMINI_API_KEY"), scope: "provider" },
  {
    name: "Web Push server configuration",
    ready: ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"].every(
      has,
    ),
    scope: "device",
  },
  {
    name: "EVM RPC",
    ready: has("ALCHEMY_API_KEY"),
    scope: "optional-provider",
  },
  {
    name: "Solana RPC",
    ready: has("HELIUS_API_KEY"),
    scope: "optional-provider",
  },
  {
    name: "Licensed ETF data",
    ready:
      has("ETF_FLOW_FEED_URL") &&
      process.env.ETF_FLOW_LICENSE_CONFIRMED === "true",
    scope: "optional-provider",
  },
  {
    name: "Economic calendar",
    ready: has("FMP_API_KEY"),
    scope: "optional-provider",
  },
];
console.log(
  JSON.stringify(
    {
      checks,
      note: "Configuration presence only. Successful live connections, account permissions, device delivery and hosted TLS must be verified separately.",
    },
    null,
    2,
  ),
);
if (
  process.argv.includes("--production") &&
  checks.some((c) => ["deployment", "core"].includes(c.scope) && !c.ready)
)
  process.exitCode = 1;
