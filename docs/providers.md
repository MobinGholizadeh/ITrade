# Providers and configuration

Reviewed against official documentation on 2026-11-02/03. Network reachability and plan entitlements can change. Read-only adapters fail visibly; they do not mix venue prices or silently equate USD and USDT.

| Provider            | Configuration and implemented behavior                                                                                                                                                                                                                  | Live acceptance                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Coinbase Exchange   | Public REST and WebSocket; USD pairs; 1m/5m/15m/1h/4h/1d/1w. Complete base candles aggregate unsupported intervals, with Monday UTC weekly boundaries                                                                                                   | Real quotes, stream and candles verified; outage and recovery observed |
| Binance Spot        | Configurable public REST/stream; USDT explicitly identified                                                                                                                                                                                             | Access probe timed out; adapter simulations only                       |
| Kraken market       | Public REST/WS v2, XBT/BTC mapping, USD. REST quote timestamp denotes receipt; unavailable rolling change stays null                                                                                                                                    | Public probe returned 403; not live certified                          |
| CoinGecko Demo      | Optional COINGECKO_DEMO_API_KEY, exact coin IDs, hourly USD market-cap metadata; two-hour freshness gate, attribution                                                                                                                                   | Key absent; schema validated only                                      |
| RSS/Atom            | Fed, SEC, CoinDesk, Ethereum Foundation and Kraken Blog. Headlines/links/dates only, bounded XML, no full articles                                                                                                                                      | See verification record for individual sources                         |
| CryptoPanic v2      | Optional CRYPTOPANIC_API_KEY and CRYPTOPANIC_PLAN (developer/growth/enterprise). Original link preferred, aggregator source visible, never assumed official. One page per poll; default hourly, configure CRYPTOPANIC_POLL_SECONDS to fit monthly quota | No key/plan supplied                                                   |
| Gemini              | Official @google/genai Interactions. GEMINI_API_KEY server-only. Settings model overrides GEMINI_MODEL; default gemini-3.5-flash-lite. Request timeout 5–60s, daily request budget/intensity in Settings, token accounting                              | Real structured market and chat responses verified                     |
| Alchemy             | ALCHEMY_API_KEY; public Ethereum, Base, Arbitrum One and OP Mainnet addresses. Native ETH plus paginated ERC-20 balances/decimal metadata. Chain+contract identity for tokens; no signing                                                               | Mock RPC precision/identity tests; no user addresses/key               |
| Helius              | HELIUS_API_KEY; public Solana address. Finalized native SOL plus SPL and Token-2022 balances aggregated by mint                                                                                                                                         | Mock RPC tests; no user address/key                                    |
| Kraken account      | Add dedicated API key/secret through Portfolio. GetApiKeyInfo permission validation before storing and every Balance sync. Query-funds required; unknown or transaction permissions rejected. AES-256-GCM encryption                                    | No account credentials supplied                                        |
| Alternative.me      | Public daily Bitcoin-focused Fear & Greed composite, thirty observations, source attribution and explicit stale age; hourly polling                                                                                                                     | Live result recorded in verification                                   |
| FMP                 | Optional FMP_API_KEY with economic-calendar entitlement. Upcoming dated events, actual/estimate/previous nullable                                                                                                                                       | No key supplied                                                        |
| Institutional flows | Administrator supplies a licensed HTTPS normalized JSON endpoint and explicitly sets ETF_FLOW_LICENSE_CONFIRMED=true. Optional ETF_FLOW_API_KEY bearer header                                                                                           | No licensed feed supplied                                              |
| Web Push            | VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, legitimate mailto:/HTTPS VAPID_SUBJECT, user browser subscription and Settings opt-in                                                                                                                              | Outbox/lifecycle verified; real device delivery pending                |

## Data and quota contracts

Gemini is invoked for selected events and user research, not every tick. Failed attempts count against the atomic UTC-day request budget; identical concurrent inputs share a Redis lock. Automatic alert explanations have at most two attempts. SDK automatic retries are disabled to avoid hidden request multiplication. A single 503 retry reserves another daily request before calling; authentication, quota and schema failures are not retried. Chat tools are a server-controlled read-only allowlist. Holdings/context are sent only for the requested analysis; credentials and public wallet addresses are excluded.

Market REST calls are paced, response sizes/timeouts bounded, recovery jobs deduplicated per minute, and queues retry exponentially. A 429 is treated as unavailable, never as a valid price. Review actual provider account quotas before expanding assets or polling frequencies. Six supported scanner assets: BTC, ETH, SOL, ADA, AVAX, LINK. The initially configured tracked subset is smaller.

Portfolio token coverage is bounded: up to ten ERC-20 pages and 1,000 Solana token accounts per program. Partial/error results fail the connection snapshot instead of silently replacing balances with zero. Unpriced tokens make total valuation incomplete. No stablecoin peg is assumed. Manual holdings are replacement balances; duplicate wallets are rejected by chain/address.

News classification is conservative headline classification. Rumors/disputes never become confirmed just because an official feed repeats them. Exact and conservative token-overlap headline clusters retain source links but do not establish independent corroboration. Similar-headline matching requires consistent assets/category/verification and rejects changed numbers or contradiction markers; broader semantic matching and editorial fact-checking remain limitations. Publisher copyright/terms still apply; no Reuters/The Block scraping is implemented.

## Licensed flow endpoint contract

The endpoint returns an array (maximum 2,000 rows) of strict records:

```json
{
  "provider": "Your licensed provider",
  "fund": "Provider fund identifier",
  "asset": "BTC",
  "reportDate": "2026-10-30",
  "publishedAt": "2026-10-31T01:00:00Z",
  "netFlowUsd": null,
  "sourceUrl": "https://provider.example/report"
}
```

This is a schema example, not seeded data. Asset is BTC/ETH/SOL. Net flow is a signed decimal string or null. Report/publication chronology is validated. Latest publication revisions replace older records for a provider/fund/report date. UI bars show individual reported funds, not an inferred complete market total. Historical correlations and 24h forward watch returns do not imply causation, execution results or a validated win rate.

## Primary references

- [Coinbase market channels](https://docs.cdp.coinbase.com/exchange/websocket-feed/channels), [candles](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles), [REST limits](https://docs.cdp.coinbase.com/exchange/rest-api/rate-limits)
- [Binance Spot streams](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/ws-streams/~), [market REST](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market)
- [Kraken ticker](https://docs.kraken.com/exchange/api-reference/spot-websocket-v2/ticker), [key permissions](https://docs.kraken.com/api-reference/account-data/get-api-key-info), [authentication](https://docs.kraken.com/exchange/guides/rest/authentication)
- [Gemini models](https://ai.google.dev/gemini-api/docs/models), [Interactions API](https://ai.google.dev/api/interactions-api)
- [CryptoPanic API and plan limits](https://cryptopanic.com/developers/api/), [Fed feeds](https://www.federalreserve.gov/feeds/feeds.htm), [Ethereum blog](https://blog.ethereum.org/), [Kraken blog](https://blog.kraken.com/)
- [Alchemy chain support](https://www.alchemy.com/docs/reference/node-supported-chains), [Token API](https://www.alchemy.com/docs/reference/token-api-quickstart)
- [Helius getBalance](https://www.helius.dev/docs/api-reference/rpc/http/getbalance), [token accounts](https://www.helius.dev/docs/api-reference/rpc/http/gettokenaccountsbyowner)
- [CoinGecko Demo market data](https://docs.coingecko.com/demo/reference/coins-markets), [Alternative.me methodology/API](https://alternative.me/crypto/fear-and-greed-index/), [FMP calendar](https://site.financialmodelingprep.com/developer/docs/stable/economics-calendar)
- [Web Push library](https://github.com/web-push-libs/web-push), [browser Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
