import type { DocumentSearchResult } from "./types";

export interface ContextBuilderOptions {
  maxTokens?: number;
}

const ESTIMATE_CHARS_PER_TOKEN = 4;

export function buildContext(
  results: DocumentSearchResult[],
  _query: string,
  options: ContextBuilderOptions = {},
): string {
  const maxTokens = options.maxTokens ?? 3000;
  const maxChars = maxTokens * ESTIMATE_CHARS_PER_TOKEN;

  const parts: string[] = [];
  let totalChars = 0;

  for (const { document, score } of results) {
    const header = `## ${document.title} [${document.category}]`;
    const body = document.content;
    const separator = parts.length === 0 ? "" : "\n\n";
    const chunk = `${separator}${header}\n${body}`;

    if (totalChars + chunk.length > maxChars && parts.length > 0) break;

    parts.push(chunk);
    totalChars += chunk.length;
  }

  if (parts.length === 0) return "";

  return `The following documentation is relevant to the user's question:\n\n${parts.join("")}`;
}

export function buildContextMessage(
  results: DocumentSearchResult[],
  query: string,
): { role: "system" | "user"; content: string } | null {
  const context = buildContext(results, query);
  if (!context) return null;
  return { role: "system" as const, content: context };
}
