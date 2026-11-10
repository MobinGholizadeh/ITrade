CREATE TABLE risk_profiles (
  id smallint PRIMARY KEY CHECK (id = 1),
  configuration jsonb CHECK (configuration IS NULL OR jsonb_typeof(configuration) = 'object'),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO risk_profiles (id) VALUES (1);

CREATE TABLE risk_plans (
  id uuid PRIMARY KEY,
  profile_id smallint NOT NULL REFERENCES risk_profiles(id),
  input jsonb NOT NULL,
  calculation jsonb NOT NULL,
  profile_snapshot jsonb NOT NULL,
  calculator_version text NOT NULL DEFAULT '1',
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  outcome jsonb,
  CHECK (outcome IS NULL OR jsonb_typeof(outcome) = 'object')
);
CREATE INDEX risk_plans_created_idx ON risk_plans (created_at DESC);
