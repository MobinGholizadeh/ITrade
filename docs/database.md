# Implemented database

Updated 2026-11-03. PostgreSQL is authoritative; Redis supplies ephemeral state, locks, queues and rate limits. This describes the deployed migrations, not a proposed future schema.

Migrations 001–014 are transactional, serialized by a PostgreSQL advisory lock and checksum-protected in `schema_migrations`. Never edit an applied migration. Settings revisions use optimistic concurrency and atomic audit records. No demo balances or prices are seeded.

| Migration            | Tables and changes                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 001 foundation       | `user_settings` singleton validated document/revision, `provider_configurations` non-secret metadata, `audit_events`      |
| 002 money management | `risk_profiles` versioned account/policy document; `risk_plans` immutable planning evidence with optional journal outcome |
| 003 market           | `market_pairs`, `market_quotes`, `candles`, `service_status`                                                              |
| 004 news             | `news_articles` canonical URL uniqueness, provider title/date/first receipt, cluster and classification                   |
| 005 AI               | `ai_usage` reservations/status/token accounting, `ai_analyses` unique request hash and context/result evidence            |
| 006 signals          | `technical_snapshots`, `alert_rules`, `alerts`, `alert_events`                                                            |
| 007 portfolio        | `portfolio_connections`, `holdings`, `portfolio_snapshots`; encrypted connection credentials and chain/address identity   |
| 008 notifications    | `push_subscriptions` encrypted payload; `notification_deliveries` unique alert/subscription outbox with claims/retries    |
| 009 chat             | `conversations`, `conversation_messages` ordered user/assistant content                                                   |
| 010 intelligence     | `institutional_flows`, `macro_events`, `signal_evaluations`                                                               |
| 011 refinements      | Unique manual connection; rule provider/currency; alert explanation attempts; `asset_notification_preferences`            |
| 012 context          | `market_context` validated daily sentiment and market-cap metadata with update time                                       |
| 013 EVM networks     | Connection kinds expanded to Ethereum, Base, Arbitrum and Optimism, alongside Solana/manual/Kraken                        |

## Identity and precision

Candle primary keys are provider/asset/timeframe/UTC open seconds; validated JSON stores OHLCV. Market quotes retain quote currency, provider event time and receipt time. Quote persistence is throttled rather than writing every WebSocket tick. Technical snapshots are keyed by venue/asset/timeframe. Existing supported-asset registry defines exchange symbols and native identities; arbitrary token balances use chain+contract or mint, never an ambiguous symbol alone.

Monetary holdings, cost bases, rule prices and flow values use PostgreSQL NUMERIC. Financial JSON contracts serialize decimal amounts as strings; decimal.js performs portfolio/risk arithmetic. On-chain integers are scaled with BigInt before serialization. Ordinary indicator/chart calculations use finite numbers and validate input candles.

The database does not equate unknown values with zero. Empty/unconnected portfolio, stale account balances and unpriced assets have explicit coverage/incomplete states. Null flows, macro actuals and missing cost bases stay null.

## Concurrency and records

Settings/audit writes are one transaction. AI daily reservations use a database advisory lock; identical inputs also use a Redis request lock. Alert deduplication uses a transaction/advisory lock and retained evidence. Push workers claim rows with SKIP LOCKED and retry bounded attempts. A unique alert/subscription pair prevents a second outbox row, while network delivery remains at-least-once.

Flow primary key is provider/fund/report date; newer publication revisions replace older values. News stores title/link metadata only. Source records can be pruned, while analyses and alerts retain their embedded context. No independent news-corroboration table or transaction ledger exists.

## Retention and recovery

`npm run retention` removes 1m/5m/15m candles older than 90 days, news older than 180 days, portfolio snapshots older than 365 days and delivered notifications older than 90 days. It preserves risk plans/journal, audit, analyses, alert history and higher-timeframe candles. It is an explicit operator command, not an installed schedule.

`npm run backup:verify` encrypts a custom-format pg_dump with AES-GCM and restores to an isolated scratch database before removing that scratch database. The configured master backup key is outside the archive. Named Docker volumes survive normal service restarts. An off-machine copy and automatic backup schedule remain deployment responsibilities.

This is a single-user application. Authentication protects one personal workspace; there is no multi-tenant row authorization. See [operations](operations.md) before exposing it beyond loopback.

Migration 014 indexes persisted news review lookup by context.newsId and creation time. New portfolio snapshots preserve observed asset quantities and connection identities; older snapshots remain readable. These are balance observations, not transaction records.
