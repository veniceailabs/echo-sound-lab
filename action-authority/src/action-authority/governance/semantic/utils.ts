/**
 * Semantic Safety Utilities
 *
 * Helper functions for building semantic context and supporting PolicyEngine operations.
 */

import { SemanticContext } from './types';

/**
 * Build semantic context from an action proposal or work order
 * Extracts relevant information for policy evaluation
 */
export function buildSemanticContext(action: {
  id?: string;
  type?: string;
  actionType?: string;
  parameters?: Record<string, unknown>;
  audit?: { auditId?: string };
  codeContext?: unknown;
  dataContext?: unknown;
}): SemanticContext {
  const actionType = action.type || action.actionType || 'UNKNOWN';
  const proposalId = action.id || action.audit?.auditId || `action_${Date.now()}`;

  // Extract code context if present
  let codeContext: SemanticContext['codeContext'] | undefined;
  if (action.codeContext && typeof action.codeContext === 'object') {
    const ctx = action.codeContext as Record<string, unknown>;
    codeContext = {
      files: Array.isArray(ctx.files) ? (ctx.files as string[]) : [],
      functions: Array.isArray(ctx.functions) ? (ctx.functions as string[]) : [],
      apis: Array.isArray(ctx.apis) ? (ctx.apis as string[]) : [],
    };
  }

  // Extract data context if present
  let dataContext: SemanticContext['dataContext'] | undefined;
  if (action.dataContext && typeof action.dataContext === 'object') {
    const ctx = action.dataContext as Record<string, unknown>;
    dataContext = {
      fields: Array.isArray(ctx.fields) ? (ctx.fields as string[]) : [],
      values: Array.isArray(ctx.values) ? (ctx.values as unknown[]) : [],
    };
  }

  return Object.freeze({
    proposalId,
    actionType,
    parameters: action.parameters || {},
    codeContext,
    dataContext,
  });
}

/**
 * Hash semantic context for caching purposes
 * Returns a simple hash string for use as cache key
 */
export function hashContext(context: SemanticContext): string {
  try {
    const contextStr = JSON.stringify(context);
    return `ctx_${simpleHash(contextStr)}`;
  } catch (error) {
    // Fallback to timestamp-based hash
    return `ctx_fallback_${Date.now()}`;
  }
}

/**
 * Simple hash function for context
 * In production, would use crypto.subtle.digest
 * For now, uses a basic string hash for performance
 */
function simpleHash(str: string): string {
  let hash = 0;

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(16);
}

/**
 * Extract code context from action metadata
 */
export function extractCodeContext(action: any): SemanticContext['codeContext'] | undefined {
  if (!action || typeof action !== 'object') return undefined;

  // Look for code context in various places
  const ctx =
    action.codeContext ||
    action.context?.code ||
    action.metadata?.codeContext ||
    undefined;

  if (!ctx || typeof ctx !== 'object') return undefined;

  return {
    files: extractArrayField(ctx.files),
    functions: extractArrayField(ctx.functions),
    apis: extractArrayField(ctx.apis),
  };
}

/**
 * Extract data context from action metadata
 */
export function extractDataContext(action: any): SemanticContext['dataContext'] | undefined {
  if (!action || typeof action !== 'object') return undefined;

  const ctx =
    action.dataContext ||
    action.context?.data ||
    action.metadata?.dataContext ||
    undefined;

  if (!ctx || typeof ctx !== 'object') return undefined;

  return {
    fields: extractArrayField(ctx.fields),
    values: extractArrayField(ctx.values),
  };
}

/**
 * Safe extraction of array field
 */
function extractArrayField(field: unknown): string[] {
  if (Array.isArray(field)) {
    return field.map((item) => String(item));
  }
  return [];
}

/**
 * Flatten object for pattern matching
 * Converts nested objects to dot-notation strings
 */
export function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};

  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

    const value = obj[key];
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      result[newKey] = '';
    } else if (typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten nested objects
      Object.assign(result, flattenObject(value, newKey));
    } else if (Array.isArray(value)) {
      // Arrays: stringify elements
      result[newKey] = value.map((v) => String(v)).join(', ');
    } else {
      result[newKey] = String(value);
    }
  }

  return result;
}

/**
 * Check if a string contains any external API indicators
 */
export function hasExternalAPI(text: string): boolean {
  const apiPatterns = [
    /https?:\/\/(?!localhost|127\.0\.0\.1|::1)/i,
    /(fetch|axios|request|http\.get|http\.post)/i,
    /wss?:\/\/(?!localhost|127\.0\.0\.1|::1)/i,
  ];

  return apiPatterns.some((pattern) => pattern.test(text));
}

/**
 * Check if a string contains PII patterns
 */
export function hasPII(text: string): boolean {
  const piiPatterns = [
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/,
    /\b\d{3}-\d{2}-\d{4}\b/, // SSN
    /\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/, // Phone
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
  ];

  return piiPatterns.some((pattern) => pattern.test(text));
}

/**
 * Check if action involves production data
 */
export function isProductionContext(text: string): boolean {
  const prodPatterns = [/(production|prod|live|staging[^-])/i];

  return prodPatterns.some((pattern) => pattern.test(text));
}

/**
 * Check if action has destructive semantics
 */
export function isDestructiveOperation(text: string): boolean {
  const destructivePatterns = [/(delete|drop|truncate|destroy|remove)\s+(?:from|table|database)/i];

  return destructivePatterns.some((pattern) => pattern.test(text));
}
