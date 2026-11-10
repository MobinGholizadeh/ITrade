CREATE TABLE portfolio_connections(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kind text NOT NULL CHECK(kind IN('manual','ethereum','solana','kraken')),label text NOT NULL,address text,credentials text,status text NOT NULL DEFAULT 'pending',synced_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX wallet_identity ON portfolio_connections(kind,address) WHERE address IS NOT NULL;
CREATE UNIQUE INDEX one_exchange ON portfolio_connections(kind) WHERE kind='kraken';
CREATE TABLE holdings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),connection_id uuid NOT NULL REFERENCES portfolio_connections(id) ON DELETE CASCADE,asset text NOT NULL,quantity numeric NOT NULL CHECK(quantity>=0),cost_basis numeric CHECK(cost_basis>=0),acquired_at date,notes text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(connection_id,asset));
CREATE TABLE portfolio_snapshots(id bigserial PRIMARY KEY,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX portfolio_history ON portfolio_snapshots(created_at DESC);
