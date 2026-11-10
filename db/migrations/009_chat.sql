CREATE TABLE conversations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),title text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE conversation_messages(id bigserial PRIMARY KEY,conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,role text NOT NULL CHECK(role IN('user','assistant')),content jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX conversation_recent ON conversation_messages(conversation_id,id DESC);
