/**
 * DEFAULT POLICY CONFIGURATION
 *
 * Provides sensible defaults for the semantic policy engine.
 * This configuration:
 * - Enables all core safety policies (PII, API, Production Data)
 * - Includes example custom rules
 * - Has conservative timeout and complexity limits
 * - Enables comprehensive logging for audit trails
 */

import { PolicyConfig } from './types';

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  version: '1.0.0',

  coreRules: {
    /**
     * Detect PII exposure: emails, SSNs, phone numbers, credit cards
     * This protects against accidental exposure of sensitive data
     */
    piiDetection: true,

    /**
     * Detect external API calls: HTTP URLs, fetch/axios, WebSocket
     * This prevents unintended network access (good for sandboxing)
     */
    externalApiDetection: true,

    /**
     * Detect production data modifications: DELETE/DROP on production databases
     * Combined with database name/environment detection
     */
    productionDataProtection: true,
  },

  customRules: [
    /**
     * Example: Detect API keys in code (common mistake)
     */
    {
      id: 'custom.apikey-detection',
      name: 'API Key Exposure Detection',
      checkFields: ['parameters', 'codeContext', 'dataContext'],
      pattern: '(api[_-]?key|secret[_-]?key|auth[_-]?token)\\s*[:=]\\s*[\'"][a-zA-Z0-9\\-_.]{20,}[\'"]',
      violationType: 'PII_EXPOSURE',
      severity: 'CRITICAL',
      reason: 'API key or secret exposed in code or parameters',
      suggestedFix: 'Move credentials to environment variables or secrets manager',
      enabled: true,
    },

    /**
     * Example: Detect production database names being dropped
     */
    {
      id: 'custom.prod-db-drop',
      name: 'Production Database Drop Protection',
      checkFields: ['codeContext', 'parameters'],
      pattern: 'drop\\s+(database|schema|table)\\s+(?:prod|production|live)',
      violationType: 'PRODUCTION_DATA_MODIFICATION',
      severity: 'CRITICAL',
      reason: 'Attempting to drop production database',
      suggestedFix: 'Only perform destructive operations on test/dev databases',
      enabled: true,
    },

    /**
     * Example: Detect GDPR-relevant PII patterns
     */
    {
      id: 'custom.gdpr-email',
      name: 'GDPR Email Pattern Detection',
      checkFields: ['dataContext', 'parameters'],
      pattern: '\\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}\\b',
      violationType: 'PII_EXPOSURE',
      severity: 'HIGH',
      reason: 'Email address detected (GDPR sensitive data)',
      suggestedFix: 'Anonymize email or implement data minimization',
      enabled: true,
    },
  ],

  /**
   * Exemptions for specific scenarios
   * Format: "actionType:VALUE" or "violationType:VALUE"
   *
   * Example: Admin actions might be exempt from API call restrictions
   * "actionType:ADMIN_QUERY": ["EXTERNAL_API_CALL"]
   *
   * This prevents false positives for legitimate use cases
   */
  exemptions: {
    // No exemptions by default - policies apply universally
  },

  performance: {
    /**
     * Timeout for policy evaluation: 50ms
     * If evaluation takes longer, abort and log as error
     * Prevents ReDoS attacks from bringing down the system
     */
    timeoutMs: 50,

    /**
     * Maximum regex pattern complexity
     * Patterns with higher complexity are rejected
     * Standard patterns are typically 5-15 complexity units
     */
    maxPatternComplexity: 50,

    /**
     * LRU cache size for policy evaluation results
     * Avoids re-evaluating identical contexts
     * Set to 0 to disable caching
     */
    cacheMaxSize: 100,
  },

  logging: {
    /**
     * Log all policy evaluations with timing and pattern counts
     * Verbose but comprehensive for debugging
     */
    logEvaluations: true,

    /**
     * Only log when violations are detected
     * More concise, focuses on security events
     */
    logViolationsOnly: false,

    /**
     * Log evaluation errors (timeout, regex failures)
     * Important for identifying buggy rules
     */
    logErrors: true,
  },
};

/**
 * Get default configuration with optional overrides
 * Merges provided config with defaults (shallow merge)
 */
export function getDefaultPolicyConfig(overrides?: Partial<PolicyConfig>): PolicyConfig {
  if (!overrides) {
    return structuredClone(DEFAULT_POLICY_CONFIG);
  }

  return {
    ...DEFAULT_POLICY_CONFIG,
    ...overrides,
    coreRules: {
      ...DEFAULT_POLICY_CONFIG.coreRules,
      ...(overrides.coreRules || {}),
    },
    performance: {
      ...DEFAULT_POLICY_CONFIG.performance,
      ...(overrides.performance || {}),
    },
    logging: {
      ...DEFAULT_POLICY_CONFIG.logging,
      ...(overrides.logging || {}),
    },
  };
}
