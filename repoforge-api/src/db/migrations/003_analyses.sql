CREATE TABLE IF NOT EXISTS analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  repo_owner VARCHAR(255) NOT NULL,
  repo_name VARCHAR(255) NOT NULL,
  repo_full_name VARCHAR(511) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  health_grade VARCHAR(2),
  health_score DECIMAL(4,1),
  file_count INTEGER,
  function_count INTEGER,
  circular_deps_count INTEGER,
  dead_code_percent DECIMAL(5,2),
  security_issue_count INTEGER,
  result_json JSONB,
  repo_score_json JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_repo ON analyses(repo_full_name);
CREATE INDEX IF NOT EXISTS idx_analyses_status ON analyses(status);
