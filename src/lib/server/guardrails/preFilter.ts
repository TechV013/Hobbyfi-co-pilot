const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+previous\s+instructions/i,
  /developer\s+mode/i,
  /system\s+override/i,
  /ignore\s+all\s+previous/i,
  /you\s+are\s+(?:now\s+)?a/i,
  /show\s+all\s+vendors/i,
  /drop\s+table/i,
  /select\s+\*\s+from/i,
  /delete\s+from/i,
  /update\s+\w+\s+set/i,
  /--\s*$.*/m,
  /;\s*$/,
];

export function detectPromptInjection(message: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(message));
}
