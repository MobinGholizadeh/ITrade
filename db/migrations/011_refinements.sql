CREATE UNIQUE INDEX one_manual_connection ON portfolio_connections(kind) WHERE kind='manual';
ALTER TABLE alert_rules ADD COLUMN provider text NOT NULL DEFAULT 'coinbase';
ALTER TABLE alert_rules ADD COLUMN currency text NOT NULL DEFAULT 'USD';
ALTER TABLE alerts ADD COLUMN explanation_attempts integer NOT NULL DEFAULT 0;
CREATE TABLE asset_notification_preferences(asset text PRIMARY KEY,enabled boolean NOT NULL DEFAULT true);
