import { generateEmbedding } from "./embeddings";
import { documentStore } from "./document-store";
import type { DocumentSearchResult, DocumentCategory } from "./types";
import { logger } from "../lib/logger";

export interface RetrievalOptions {
  limit?: number;
  category?: DocumentCategory;
  vendorId?: string;
  threshold?: number;
}

export async function retrieve(
  query: string,
  options: RetrievalOptions = {},
): Promise<DocumentSearchResult[]> {
  const start = Date.now();
  const embedding = await generateEmbedding(query);
  const results = await documentStore.search(embedding, {
    limit: options.limit ?? 5,
    category: options.category,
    vendorId: options.vendorId,
    threshold: options.threshold ?? 0.3,
  });

  logger.info("RAG retrieval", {
    query: query.substring(0, 80),
    results: results.length,
    topScore: results[0]?.score.toFixed(4) ?? 0,
    durationMs: Date.now() - start,
  });

  return results;
}
