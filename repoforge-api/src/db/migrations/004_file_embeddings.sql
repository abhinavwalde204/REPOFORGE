CREATE TABLE IF NOT EXISTS file_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID REFERENCES analyses(id) ON DELETE CASCADE,
  file_path VARCHAR(1000) NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_embeddings_analysis ON file_embeddings(analysis_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON file_embeddings
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
