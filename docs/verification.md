# Verification record

Updated 2026-11-03. Local Windows / Node 24.16.0 / npm 11.17.0, PostgreSQL 17 and Redis 7 in Docker. Dependency versions are pinned in package-lock.json.

## Automated checks

| Check                          | Result                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                     | 160 unit tests, 25 files passed                                                                                                                           |
| `npm run test:integration`     | 21 tests passed with actual disposable PostgreSQL and Redis                                                                                               |
| `npm run typecheck`            | Passed                                                                                                                                                    |
| `npm run build`                | Production compilation, TypeScript and page generation passed, including bundled Roboto/Roboto Mono                                                       |
| `npm run test:routes`          | Ten pages, eight read APIs, host/origin protections and asset validation passed                                                                           |
| `node tests/api-live.mjs`      | Rejected foreign/missing origin, malformed/oversized/invalid settings writes, SSE health delivery/disconnect and route handling passed                    |
| `node tests/risk-api-live.mjs` | Cross-origin writes, missing reconciliation, client-result injection, malformed/oversized payloads and invalid provider queries rejected without mutation |
| `node tests/auth-live.mjs`     | Isolated production login, unauthorized API, signed session cookie, authenticated read, CSRF and logout passed                                            |
| `npm run check:secrets`        | No configured credential values found in scanned project source/documentation                                                                             |
| `npm run backup:verify`        | Encrypted backup restored in isolated scratch DB; all 14 migration records verified                                                                       |
| Docker image                   | `itrade-local-verify:latest` builds successfully using non-root Node 24 image                                                                             |

Integration tests create and remove a uniquely named scratch database and reserve Redis DB15; they do not insert test holdings into the main workspace. Coverage includes migrations, setting revisions/audit transactions, worker heartbeat/retry/failure, risk persistence, manual portfolio valuation, empty-account unknown coverage, alerts, notification deduplication and bounded chat/context behavior. Unit fixtures cover risk math, precision, freshness, market recovery, technical calculations, source parsing/clustering, AI validation/budget retries, account permission checks, encryption, correlations and flow chronology.

On this continuation Docker was initially stopped, causing an initial integration connection refusal. PostgreSQL needed recovery after a previous unclean shutdown; it completed recovery normally without volume deletion or restore over the main data. Migrations then succeeded, the worker restarted, and all 19 integration tests passed.

The new verified backup is `backups/itrade-2026-11-03T04-34-34-574Z.enc`. It is local and ignored by git. Off-machine replication and recurring backup scheduling are not configured.

## Red Broadcast browser acceptance

Desktop and 390×844 mobile viewport inspected with the in-app browser:

- Shared white theme, actual Roboto font, black pill actions, red brand/live marks, gray navigation, blue links and light charts rendered.
- Desktop sidebar collapses to a 72px rail and expands; mobile drawer opens and Escape closes it. Hidden mobile navigation leaves the accessibility tree.
- Header search for ETH navigates to /markets?search=ETH and shows the matching live ETH/USD row.
- News ETH chip selects correctly and filters headline cards. Source links/dates remain visible.
- Money Management renders account/policy, planner, journal and research navigation. A real Coinbase BTC reference returned bid/ask, exchange increments, a fresh timestamp and closed-candle ATR. No fake account snapshot was saved.
- BTC chart renders candles, three EMAs, support/resistance, volume, RSI and MACD on a white canvas at desktop/mobile sizes.
- Settings and the main overview, markets, news, portfolio, alerts, analyst, intelligence, money-management and asset pages showed no document-width overflow at mobile width (375px content width including native scrollbar).
- Existing stored Gemini conversation history was reviewed without incurring another AI request.
- Temporary viewport override was reset after inspection.

API checks establish response contracts; responsive emulation does not replace real-device push/accessibility acceptance.

## Successful live sources

Coinbase public stream/quotes/candles succeeded on 2026-11-02 and again on 2026-11-03 around 04:37 UTC with fresh BTC/ETH/SOL timestamps. An earlier provider outage and recovery were observed. Feed freshness is independent of infrastructure health.

Fed, SEC, CoinDesk, Ethereum Foundation and Kraken Blog returned RSS/Atom headline metadata. The news page contains real dated publisher records; no article bodies are scraped. Alternative.me returned a current daily Bitcoin sentiment observation (26 on November 3); attribution/date are visible. Historical observations are retained.

Real Gemini structured market analysis and a multi-asset chat comparison succeeded in the earlier continuation, with follow-up context preserved. Transient upstream 503 failures also occurred and remain visible in QA history. The gateway now allows one separately budgeted 503 retry; no automatic retries for auth/quota/schema failures. A stale-data guard was observed before a provider call. Empty unconnected portfolio data is explicitly null/unknown, covered by the integration regression test.

## Outstanding acceptance and limits

- Binance public access timed out and Kraken public access returned 403 in earlier probes; their adapters are tested with fixtures, not certified live from this environment.
- Alchemy/Helius wallet reads and Kraken account sync require the user's actual public addresses/keys. No personal live account connection has been claimed.
- CryptoPanic/CoinGecko/FMP keys and licensed institutional flow access have not been supplied. ETF bars and macro data have schema/fixture tests, not an actual licensed-feed connection.
- Browser-closed push delivery needs a legitimate VAPID contact, browser/OS subscription and a real-device delivery test.
- Public hosting/TLS, off-machine backups, startup service installation and prolonged load/soak are not verified.
- Headline grouping is not independent confirmation, forward watch returns are not execution-aware backtests, and manual portfolio/risk records are not transaction accounting.

No real trades, transfers, wallet signatures, commits or pushes were performed. See [roadmap](roadmap.md) for explicit implementation gaps and [operations](operations.md) for deployment prerequisites.

## Follow-up recovery check · November 3, 14:29 UTC

An intervening network outage left all five news feeds and sentiment marked offline while retained records stayed available. Fresh bounded HTTP probes returned 200 for all five feeds and Alternative.me. Refreshes through the normal worker queues restored news to 5/5 and sentiment to online. The news page now displays live monitoring state and the last successful ingestion; when health is unavailable/stale it explicitly labels the headlines as retained and warns that new stories may be delayed.

## Completion verification · November 3, 20:24–20:30 UTC

- Added priority scoring/uncertainty caps, dated clustering, possible-conflict coverage, structured persisted Gemini news reviews, sentiment filters and bounded AI context.
- Added portfolio prices, 24h current-basket attribution, allocation bars, value-history chart and holding review; missing prices/costs remain unknown.
- Added scanner AI/news/range/bid/ask details, zone-exit events, high-impact calendar reminders and per-fund flow/price correlation requiring 20 matched observations.
- 160 unit tests and 21 actual-service integration tests passed. New integration cases cover zone exit deduplication and persisted news review/conflict context. Typecheck, production build, route/API/risk-write/auth checks and credential scan passed.
- Concurrent read-only check: 120 requests across six APIs, concurrency 4, zero errors; p50 60ms, p95 110ms, max 125ms. This is a local development smoke test, not prolonged-soak/capacity certification. Reproduce with npm run test:load; ignored artifacts/load-check.json records the result.
- Encrypted backup backups/itrade-2026-11-03T20-25-20-768Z.enc restored in a scratch database; all 14 migrations verified. Main data was not restored over or seeded with test holdings.
- Real Gemini newsImpact review for the Ethereum Foundation digital-public-infrastructure headline succeeded at 20:25 UTC. Asset/sector/horizon/verification fields rendered and persisted after reload. Sentiment filtering worked.
- News, portfolio, markets and intelligence fit the 390px mobile viewport without page overflow. No browser console errors; temporary QA tab closed and viewport reset. User's Money Management tab preserved.
- Exchange connectivity failed during final checks; the user identified their VPN and asked to leave it alone. No further troubleshooting/provider switching was performed. Retained quotes remain stale and normal background recovery stays enabled.
- Readiness report identifies unsupplied device/account/licensed-feed/hosting configuration. Retention dry-run found zero expired records and deleted nothing.
