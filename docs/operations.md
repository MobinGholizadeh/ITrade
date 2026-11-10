# Operations and deployment

## Local services

| Service            | Location              | Command          |
| ------------------ | --------------------- | ---------------- |
| UI/API             | http://127.0.0.1:3000 | npm run dev      |
| PostgreSQL         | 127.0.0.1:54329       | npm run infra:up |
| Redis              | 127.0.0.1:63799       | npm run infra:up |
| Independent worker | No public port        | npm run worker   |

The browser can close while the worker continues. Closing its terminal, sleeping the computer or stopping Docker interrupts monitoring. Local terminal processes are not installed as OS startup services. Production Compose has restart policies; the host and Docker still need to remain running.

Stop terminals with Ctrl+C. `npm run infra:down` preserves named volumes. Do not use `down -v` for ordinary maintenance. After code updates run migrations before restarting web/worker. Applied migrations are checksummed and immutable; add a new SQL file for schema changes.

## Monitoring and recovery

/api/health reports infrastructure readiness and separate provider states. A healthy infrastructure status does not guarantee fresh prices. /api/diagnostics exposes sanitized provider checks, configured booleans and UTC-day AI usage, never keys. SSE publishes market and health events independently; consumers must not assume event order.

Schedules: market REST recovery 60s; technical scan 15s; news configurable; portfolio 5m; alerts 30s; institutional/context data hourly; infrastructure heartbeat 10s. Global queue concurrency is one per service; run one worker instance for a single public stream. Stream reconnect/backoff/heartbeat and REST recovery do not depend on the dashboard.

BullMQ retries up to five times with exponential delay. Completed jobs are retained one day/max100 and failed jobs seven days/max1,000. Failed sets serve as the dead-letter store. Inspect with Queue.getFailed(), investigate cause, then retry deliberately. Provider permission/invalid-response failures are sanitized. RSS adapters preserve individually successful feeds. Never relabel stale prices as live to clear a warning.

Database offline: APIs fail visibly and mutation storage cannot succeed. Redis unavailable: mutation/AI guards fail closed; worker reconnects. Worker absent: heartbeat is stale after45s and expires after90s. Changed credentials/environment require process restart. Network restrictions may require choosing a different accessible provider in Settings.

## Credentials and access

Use .env locally; both Next and worker read it. Never prefix server secrets NEXT_PUBLIC_. Connection secrets and push subscriptions use AES-256-GCM with an independent CREDENTIAL_ENCRYPTION_KEY. Backups use BACKUP_ENCRYPTION_KEY. Keep these keys outside database dumps in your own protected secret store; losing them prevents decryption.

Loopback anonymous mode is the default. REQUIRE_AUTH=true enables login locally. Any remote APP_ORIGIN automatically requires HTTPS plus LOGIN_PASSWORD_HASH and SESSION_SECRET. Hash format is salted scrypt (src/server/auth.ts passwordHash); provision the hash using trusted operator tooling without putting a plaintext password in shell history. Session cookies expire after8h, are HttpOnly/SameSite=Strict and Secure on HTTPS. Rotating SESSION_SECRET revokes existing sessions. This is single-user authentication, not multi-tenant authorization.

Host matching and exact-Origin mutation checks are enforced. Writes are limited to60/min across this single-user app, and login has a separate Redis attempt limit. Authentication does not replace provider-specific read-only permission checks.

## Push setup and delivery

Configure a VAPID key pair and real contact subject. The project uses the web-push package; its generateVAPIDKeys() creates a pair. Store the private key server-side. In Settings enable browser notifications, select priority/assets, then use Alerts → Enable browser notifications to grant permission and subscribe. The API withholds the public key until the whole server configuration exists, avoiding an unusable permission request.

Validate one real alert with the dashboard closed on the target device. Service worker notification tags collapse repeated delivery attempts, but transport delivery is at least once and OS display is not guaranteed. Stale/revoked subscriptions are removed; retries are bounded. Old market alerts are not delivered as fresh opportunities. Browser support/OS background policy still applies.

## Encrypted backups and retention

`npm run backup` creates a timestamped AES-256-GCM encrypted SQL dump under ignored backups/. `npm run backup:verify` decrypts it in memory and restores into a new itrade_restore_<timestamp> database, verifies migration count, and removes only that scratch database. It never restores over the main database. The dump has a500MB in-memory cap.

Store encrypted backups off-machine with a separate protected copy of encryption keys. Local backup creation/restore has been tested; no off-machine destination or recurring OS schedule was configured. Restoring an actual disaster should first restore into an isolated database and validate table counts/data, then switch DATABASE_URL during a maintenance window.

`npm run retention` removes fine candles older than90d, news older than180d, snapshots older than365d and delivered notifications older than90d. It preserves account journals, audit, analyses and alert evidence. Retention is an explicit maintenance command; review its policy before scheduling. Redis AOF preserves queues, but PostgreSQL is authoritative.

## Production deployment template

Dockerfile and compose.production.yaml package a non-root Next process, independent worker, PostgreSQL, Redis and Caddy HTTPS gateway. No public deployment has been performed.

Prepare ignored .env.production with a real domain, APP_ORIGIN=https://that-domain, REQUIRE_AUTH=true, password hash, random session/encryption keys, strong POSTGRES_PASSWORD and container URLs (postgres:5432, redis:6379). URL-encode the DB password in DATABASE_URL. Caddy needs DNS to this host and ports80/443. Do not copy local development DB credentials into production.

After operator review, deployment sequence is:

```powershell
docker compose --env-file .env.production -f compose.production.yaml build
docker compose --env-file .env.production -f compose.production.yaml up -d --wait postgres redis
docker compose --env-file .env.production -f compose.production.yaml run --rm web npm run db:migrate
docker compose --env-file .env.production -f compose.production.yaml up -d
```

Web/worker await healthy dependencies. Only Caddy exposes public ports; DB/Redis have no host ports in the production file. Verify login, TLS, origin rejection, worker health, live provider access, credential redaction, device push and a restore drill before using real account data.

For production backup tooling, set BACKUP_COMPOSE_FILE=compose.production.yaml and BACKUP_ENV_FILE=.env.production in that environment, then run `node --env-file=.env.production --import tsx scripts/backup.ts --verify` from this repository. Do not output `docker compose config` with real secrets into logs.

## Completion and maintenance commands

`npm run check:readiness` prints configuration booleans only. Add `-- --production` for a failing exit status when core encryption/backup/login/HTTPS prerequisites are missing; it is not a live-provider test.

`npm run test:load` performs a bounded, read-only local API concurrency check and writes ignored artifacts/load-check.json. Run with the local web server active.

Retention windows use RETENTION_FINE_CANDLE_DAYS, RETENTION_NEWS_DAYS, RETENTION_SNAPSHOT_DAYS and RETENTION_DELIVERY_DAYS (whole days, 7–3650). Defaults remain 90/180/365/90. Preview counts with `npm run retention -- --dry-run` before scheduling. Account journals, audits, analyses and alert evidence are preserved.
