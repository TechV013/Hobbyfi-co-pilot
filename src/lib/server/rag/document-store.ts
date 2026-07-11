import { prisma } from "../db";
import { logger } from "../lib/logger";
import { generateEmbedding, generateEmbeddings } from "./embeddings";
import type { RagDocument, NewDocument, DocumentSearchResult, DocumentCategory } from "./types";

function toDocument(row: Record<string, unknown>): RagDocument {
  return {
    id: row.id as string,
    vendorId: (row.vendor_id as string) ?? null,
    title: row.title as string,
    content: row.content as string,
    category: row.category as DocumentCategory,
    metadata: row.metadata ? (row.metadata as Record<string, unknown>) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export class DocumentStore {
  async ensureTable(): Promise<void> {
    await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "documents"`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "documents" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "vendor_id" TEXT,
        "title" TEXT NOT NULL,
        "content" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "embedding" vector(3072),
        "metadata" JSONB,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category)
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_documents_vendor_id ON documents(vendor_id)
    `);
  }

  async createVectorIndex(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_documents_embedding
      ON documents USING ivfflat ("embedding" vector_cosine_ops) WITH (lists = 100)
    `);
  }

  async insert(doc: NewDocument, embedding: number[]): Promise<RagDocument> {
    const vectorStr = `[${embedding.join(",")}]`;
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `INSERT INTO "documents" ("vendor_id", "title", "content", "category", "embedding", "metadata")
       VALUES ($1, $2, $3, $4, $5::vector, $6::jsonb)
       RETURNING id, vendor_id, title, content, category, metadata, created_at, updated_at`,
      doc.vendorId ?? null,
      doc.title,
      doc.content,
      doc.category,
      vectorStr,
      doc.metadata ? JSON.stringify(doc.metadata) : null,
    );
    return toDocument(rows[0]);
  }

  async insertBatch(docs: NewDocument[], embeddings: number[][]): Promise<RagDocument[]> {
    const results: RagDocument[] = [];
    for (let i = 0; i < docs.length; i++) {
      const doc = await this.insert(docs[i], embeddings[i]);
      results.push(doc);
    }
    return results;
  }

  async search(
    queryEmbedding: number[],
    options: {
      limit?: number;
      category?: DocumentCategory;
      vendorId?: string;
      threshold?: number;
    } = {},
  ): Promise<DocumentSearchResult[]> {
    const vectorStr = `[${queryEmbedding.join(",")}]`;
    const limit = options.limit ?? 5;
    const threshold = options.threshold ?? 0.5;

    const conditions: string[] = [];
    const params: unknown[] = [vectorStr, limit, threshold];
    let paramIdx = 4;

    if (options.category) {
      conditions.push(`d.category = $${paramIdx++}`);
      params.push(options.category);
    }
    if (options.vendorId) {
      conditions.push(`d.vendor_id = $${paramIdx++}`);
      params.push(options.vendorId);
    }

    const whereClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT d.id, d.vendor_id, d.title, d.content, d.category, d.metadata, d.created_at, d.updated_at,
              1 - (d.embedding <=> $1::vector) AS score
       FROM "documents" d
       WHERE 1 - (d.embedding <=> $1::vector) >= $3
       ${whereClause}
       ORDER BY d.embedding <=> $1::vector
       LIMIT $2`,
      ...params,
    );
    return rows.map((r) => ({ document: toDocument(r), score: Number(r.score) }));
  }

  async count(): Promise<number> {
    const rows = await prisma.$queryRawUnsafe<{ count: string }[]>(
      `SELECT COUNT(*)::text AS count FROM "documents"`,
    );
    return Number(rows[0].count);
  }

  async getById(id: string): Promise<RagDocument | null> {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, vendor_id, title, content, category, metadata, created_at, updated_at
       FROM "documents" WHERE "id" = $1`,
      id,
    );
    return rows.length > 0 ? toDocument(rows[0]) : null;
  }

  async delete(id: string): Promise<void> {
    await prisma.$queryRawUnsafe(`DELETE FROM "documents" WHERE "id" = $1`, id);
  }

  async deleteByVendorId(vendorId: string): Promise<void> {
    await prisma.$queryRawUnsafe(`DELETE FROM "documents" WHERE "vendor_id" = $1`, vendorId);
  }

  async findByCategory(category: string): Promise<RagDocument[]> {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, vendor_id, title, content, category, metadata, created_at, updated_at
       FROM "documents" WHERE "category" = $1 ORDER BY "created_at" DESC`,
      category,
    );
    return rows.map(toDocument);
  }

  async findAll(limit = 100): Promise<RagDocument[]> {
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT id, vendor_id, title, content, category, metadata, created_at, updated_at
       FROM "documents" ORDER BY "created_at" DESC LIMIT $1`,
      limit,
    );
    return rows.map(toDocument);
  }
}

export const documentStore = new DocumentStore();
