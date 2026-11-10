CREATE TABLE user_settings (
  id smallint PRIMARY KEY CHECK (id = 1),
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(configuration) = 'object'),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO user_settings (id) VALUES (1);

CREATE TABLE provider_configurations (
  id text PRIMARY KEY CHECK (id IN ('coinbase', 'binance', 'kraken')),
  display_name text NOT NULL,
  integration_state text NOT NULL DEFAULT 'not_implemented' CHECK (integration_state IN ('not_implemented', 'disabled', 'enabled')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO provider_configurations (id, display_name) VALUES ('coinbase', 'Coinbase Exchange'), ('binance', 'Binance Spot'), ('kraken', 'Kraken');

CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  details jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_created_at_idx ON audit_events (created_at DESC);
