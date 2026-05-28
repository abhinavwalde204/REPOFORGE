CREATE TABLE IF NOT EXISTS editor_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  requirement_text TEXT NOT NULL,
  affected_files JSONB,
  diffs_json JSONB,
  migration_guide TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
