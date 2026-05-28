CREATE TABLE IF NOT EXISTS user_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
  file_path VARCHAR(1000) NOT NULL,
  original_content TEXT NOT NULL,
  patched_content TEXT NOT NULL,
  patch_source VARCHAR(50) NOT NULL,
  editor_session_id UUID REFERENCES editor_sessions(id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, analysis_id, file_path, version)
);
CREATE INDEX IF NOT EXISTS idx_patches_user_analysis ON user_patches(user_id, analysis_id);
CREATE INDEX IF NOT EXISTS idx_patches_file ON user_patches(analysis_id, file_path);
CREATE INDEX IF NOT EXISTS idx_patches_active ON user_patches(user_id, analysis_id, is_active);
