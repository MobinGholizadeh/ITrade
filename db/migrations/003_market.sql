CREATE TABLE market_pairs (provider text NOT NULL, asset text NOT NULL, currency text NOT NULL, metadata jsonb NOT NULL, PRIMARY KEY(provider,asset));
CREATE TABLE market_quotes (provider text NOT NULL, asset text NOT NULL, data jsonb NOT NULL, observed_at timestamptz NOT NULL, PRIMARY KEY(provider,asset));
CREATE TABLE candles (provider text NOT NULL, asset text NOT NULL, timeframe text NOT NULL, time bigint NOT NULL, data jsonb NOT NULL, PRIMARY KEY(provider,asset,timeframe,time));
CREATE INDEX candles_recent ON candles(provider,asset,timeframe,time DESC);
CREATE TABLE service_status (name text PRIMARY KEY, state text NOT NULL, detail text NOT NULL, checked_at timestamptz NOT NULL DEFAULT now(), success_at timestamptz);
