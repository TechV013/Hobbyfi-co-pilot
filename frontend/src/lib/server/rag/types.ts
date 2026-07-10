export interface RagDocument {
  id: string;
  vendorId: string | null;
  title: string;
  content: string;
  category: DocumentCategory;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DocumentCategory =
  | "membership-policy"
  | "refund-policy"
  | "pricing"
  | "trial-rules"
  | "vendor-guide"
  | "faq";

export interface DocumentSearchResult {
  document: RagDocument;
  score: number;
}

export interface NewDocument {
  vendorId?: string | null;
  title: string;
  content: string;
  category: DocumentCategory;
  metadata?: Record<string, unknown>;
}
