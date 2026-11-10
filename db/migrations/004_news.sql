CREATE TABLE news_articles(id text PRIMARY KEY, canonical_url text NOT NULL UNIQUE, source text NOT NULL, title text NOT NULL, published_at timestamptz, received_at timestamptz NOT NULL DEFAULT now(), cluster_id text NOT NULL, classification jsonb NOT NULL);
CREATE INDEX news_recent ON news_articles(published_at DESC);
CREATE INDEX news_cluster ON news_articles(cluster_id);
