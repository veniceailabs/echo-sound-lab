/**
 * UTILITY FUNCTIONS FOR SEMANTIC POLICY ENGINE
 *
 * Helper functions for:
 * - Context extraction from action proposals
 * - Context hashing for caching
 * - Configuration utilities
 */

import { SemanticContext } from './types';

/**
 * Build semantic context from an action proposal
 * Extracts all relevant information for policy evaluation
 */
export function buildSemanticContext(action: {
  id: string;
  type: string;
  parameters?: Record<string, unknown>;
  code?: string;
  data?: Record<string, unknown>;
}): SemanticContext {
  return {
    proposalId: action.id,
    actionType: action.type,
    parameters: action.parameters || {},
    codeContext: action.code,
    dataContext: action.data,
    timestamp: Date.now(),
  };
}

/**
 * Hash a context object for cache key generation
 * Uses simple base64 encoding for speed
 */
export function hashContext(context: SemanticContext): string {
  const str = [
    context.proposalId,
    context.actionType,
    JSON.stringify(context.parameters),
    context.codeContext,
    JSON.stringify(context.dataContext),
  ]
    .filter(s => s)
    .join('|');

  // Use btoa for browser, Buffer for Node
  try {
    return btoa(str).substring(0, 32);
  } catch {
    return Buffer.from(str).toString('base64').substring(0, 32);
  }
}

/**
 * Deep freeze an object recursively
 * Used to make configurations and results immutable
 */
export function deepFreeze<T>(obj: T): T {
  Object.freeze(obj);

  if (typeof obj === 'object' && obj !== null) {
    Object.getOwnPropertyNames(obj).forEach(prop => {
      const value = (obj as Record<string, unknown>)[prop];
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        deepFreeze(value as object);
      }
    });
  }

  return obj;
}

/**
 * Extract text content from various data types
 */
export function extractText(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map(extractText).filter(s => s).join(' ');
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return '';
}

/**
 * Get nested property value from object
 * Supports dot notation: "foo.bar.baz"
 */
export function getNestedProperty(
  obj: Record<string, unknown>,
  path: string
): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Sanitize user input to prevent regex injection
 * Escapes special regex characters
 */
export function sanitizeRegexInput(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Create a safe regex with timeout protection
 * Returns null if regex is too complex
 */
export function createSafeRegex(
  pattern: string,
  flags?: string,
  maxComplexity: number = 50
): RegExp | null {
  try {
    // Check pattern complexity (simple heuristic)
    const complexity = calculateRegexComplexity(pattern);
    if (complexity > maxComplexity) {
      console.warn(`[SafeRegex] Pattern too complex: ${complexity} > ${maxComplexity}`);
      return null;
    }

    return new RegExp(pattern, flags);
  } catch (error) {
    console.warn('[SafeRegex] Invalid regex pattern:', error);
    return null;
  }
}

/**
 * Calculate regex pattern complexity (simple heuristic)
 * Helps prevent ReDoS attacks
 */
function calculateRegexComplexity(pattern: string): number {
  let complexity = 0;

  // Quantifiers (* + ? {n,m}) increase complexity
  complexity += (pattern.match(/[\*\+\?]|\{\d+,\d*\}/g) || []).length * 5;

  // Alternation (|) increases complexity
  complexity += (pattern.match(/\|/g) || []).length * 3;

  // Character classes increase complexity slightly
  complexity += (pattern.match(/\[.*?\]/g) || []).length * 2;

  // Lookahead/lookbehind increase complexity significantly
  complexity += (pattern.match(/\(\?[=!<]/g) || []).length * 10;

  // Base complexity for pattern length
  complexity += Math.ceil(pattern.length / 10);

  return complexity;
}

/**
 * Validate regex pattern for safety
 */
export function isValidRegexPattern(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Merge policy configurations (shallow merge with special handling)
 */
export function mergeConfigs<T extends Record<string, unknown>>(
  base: T,
  override: Partial<T>
): T {
  const merged = { ...base };

  for (const key in override) {
    if (override.hasOwnProperty(key)) {
      const value = override[key];

      // Deep merge for nested objects
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        base[key] &&
        typeof base[key] === 'object'
      ) {
        merged[key] = mergeConfigs(base[key] as Record<string, unknown>, value as Record<string, unknown>) as T[Extract<keyof T, string>];
      } else {
        merged[key] = value as T[Extract<keyof T, string>];
      }
    }
  }

  return merged;
}

/**
 * Generate a unique cache key
 */
export function generateCacheKey(prefix: string, data: unknown): string {
  const str = `${prefix}:${JSON.stringify(data)}`;
  try {
    return btoa(str);
  } catch {
    return Buffer.from(str).toString('base64');
  }
}

/**
 * Parse error messages safely
 */
export function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Redact sensitive information from error messages
 */
export function redactSensitiveData(text: string): string {
  // Redact email addresses
  text = text.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]');

  // Redact phone numbers
  text = text.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]');

  // Redact SSNs
  text = text.replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]');

  // Redact credit cards
  text = text.replace(/\b(?:\d{4}[-\s]?){3}\d{4}\b/g, '[CC]');

  // Redact API keys (simple heuristic)
  text = text.replace(/(?:api[_-]?key|secret[_-]?key|token)['\"]?\s*[:=]\s*['\"]?[a-zA-Z0-9\-_\.]{20,}['\"]?/gi, '[API_KEY]');

  return text;
}

/**
 * Performance timing wrapper
 */
export function measureTime<T>(
  name: string,
  fn: () => T,
  maxDurationMs: number = 50
): { result: T; durationMs: number; exceeded: boolean } {
  const start = performance.now();
  const result = fn();
  const durationMs = performance.now() - start;
  const exceeded = durationMs > maxDurationMs;

  if (exceeded) {
    console.warn(`[Performance] ${name} took ${durationMs.toFixed(2)}ms (limit: ${maxDurationMs}ms)`);
  }

  return { result, durationMs, exceeded };
}
