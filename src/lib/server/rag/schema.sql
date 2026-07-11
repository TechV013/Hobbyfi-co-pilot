CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS "documents" (
  "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "vendor_id" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "embedding" vector(3072),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_documents_vendor_id ON documents(vendor_id);

-- Create after data insertion: CREATE INDEX IF NOT EXISTS idx_documents_embedding
-- ON documents USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100);
