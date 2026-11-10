import { z } from "zod";
import { timeframes } from "./settings";

export const decimalSchema = z.string().regex(/^(0|[1-9]\d*)(\.\d+)?$/);
export const providerIds = ["coinbase", "binance", "kraken"] as const;
export type ProviderId = (typeof providerIds)[number];
export type Timeframe = (typeof timeframes)[number];
export type AssetIdentity = {
  id: string;
  symbol: string;
  name: string;
  chain?: string;
  contract?: string;
};
export type TradingPair = {
  id: string;
  provider: ProviderId;
  symbol: string;
  base: AssetIdentity;
  quote: AssetIdentity;
};
export const quoteSchema = z
  .object({
    pairId: z.string().min(1),
    provider: z.enum(providerIds),
    quoteAsset: z.string().min(1),
    price: decimalSchema.refine(
      (v) => /[1-9]/.test(v),
      "Price must be positive",
    ),
    bid: decimalSchema.nullable(),
    ask: decimalSchema.nullable(),
    eventTime: z.iso.datetime(),
    receivedAt: z.iso.datetime(),
  })
  .strict();
export type Quote = z.infer<typeof quoteSchema>;
export type Candle = {
  pairId: string;
  timeframe: Timeframe;
  openTime: string;
  closeTime: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  closed: boolean;
};
export type ProviderHealth = {
  state: "connecting" | "live" | "stale" | "offline" | "not_configured";
  lastEventAt: string | null;
  reason?: string;
};

/** Public spot data only: there are deliberately no order or transaction methods. */
export interface MarketDataProvider {
  readonly id: ProviderId;
  listPairs(signal?: AbortSignal): Promise<TradingPair[]>;
  getCandles(
    pair: TradingPair,
    timeframe: Timeframe,
    from: Date,
    to: Date,
    signal?: AbortSignal,
  ): Promise<Candle[]>;
  subscribe(
    pairs: TradingPair[],
    onQuote: (quote: Quote) => void,
    signal: AbortSignal,
  ): Promise<void>;
  health(): ProviderHealth;
}
export type NewsItem = {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  publishedAt: string | null;
  firstSeenAt: string;
  verification: "unverified" | "official" | "corroborated" | "conflicting";
};
export interface NewsProvider {
  readonly id: string;
  poll(since: Date | null, signal?: AbortSignal): Promise<NewsItem[]>;
}
export type Holding = {
  assetId: string;
  quantity: string;
  averageEntryPrice: string | null;
  quoteAsset: string | null;
  observedAt: string;
};
export interface ReadOnlyPortfolioProvider {
  readonly id: string;
  verifyReadOnly(signal?: AbortSignal): Promise<boolean>;
  getHoldings(signal?: AbortSignal): Promise<Holding[]>;
}
export type InstitutionalFlow = {
  instrumentId: string;
  netFlow: string;
  currency: string;
  reportDate: string;
  publishedAt: string;
  sourceUrl: string;
};
export interface InstitutionalFlowProvider {
  readonly id: string;
  getFlows(
    from: Date,
    to: Date,
    signal?: AbortSignal,
  ): Promise<InstitutionalFlow[]>;
}
export interface NotificationChannel {
  readonly id: string;
  deliver(notification: {
    idempotencyKey: string;
    title: string;
    body: string;
    alertId: string;
  }): Promise<{ deliveryId: string }>;
}
