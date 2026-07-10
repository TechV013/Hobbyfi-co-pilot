import { retrieve, documentStore, ingestSeedDocuments } from "../rag";
import type { IKnowledgeMemory, KnowledgeEntry } from "./types";

export class RAGKnowledgeMemory implements IKnowledgeMemory {
  private initialized = false;

  private async ensure(): Promise<void> {
    if (this.initialized) return;
    await documentStore.ensureTable();
    await ingestSeedDocuments();
    await documentStore.createVectorIndex().catch(() => {});
    this.initialized = true;
  }

  async search(query: string, limit = 5): Promise<KnowledgeEntry[]> {
    await this.ensure();
    const results = await retrieve(query, { limit, threshold: 0.3 });
    return results.map((r) => ({
      id: r.document.id,
      category: r.document.category,
      title: r.document.title,
      content: r.document.content,
      tags: [],
    }));
  }

  async getByCategory(category: string): Promise<KnowledgeEntry[]> {
    await this.ensure();
    const docs = await documentStore.findByCategory(category);
    return docs.map((d) => ({
      id: d.id,
      category: d.category,
      title: d.title,
      content: d.content,
      tags: [],
    }));
  }

  async getAll(): Promise<KnowledgeEntry[]> {
    await this.ensure();
    const docs = await documentStore.findAll();
    return docs.map((d) => ({
      id: d.id,
      category: d.category,
      title: d.title,
      content: d.content,
      tags: [],
    }));
  }
}
