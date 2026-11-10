CREATE INDEX IF NOT EXISTS ai_news_context_idx ON ai_analyses ((context->>'newsId'), created_at DESC) WHERE kind='news';
