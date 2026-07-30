/**
 * SEMANTIC SAFETY TYPE DEFINITIONS
 *
 * Defines all types for the semantic policy engine that enforces
 * policy violations during action execution.
 */

/**
 * Types of policy violations that can be detected
 */
export enum PolicyViolationType {
  /**
   * Personally Identifiable Information exposed
   * (emails, SSNs, phone numbers, credit cards)
   */
  PII_EXPOSURE = 'PII_EXPOSURE',

  /**
   * External API calls or network access detected
   * (HTTP URLs, fetch/axios calls, WebSocket connections)
   */
  EXTERNAL_API_CALL = 'EXTERNAL_API_CALL',

  /**
   * Production data modification with destructive operations
   * (DELETE, DROP, TRUNCATE on production databases)
   */
  PRODUCTION_DATA_MODIFICATION = 'PRODUCTION_DATA_MODIFICATION',

  /**
   * Custom user-defined rule violation
   */
  CUSTOM_RULE = 'CUSTOM_RULE',
}

/**
 * Severity level of a policy violation
 */
export enum PolicySeverity {
  /**
   * Blocks action immediately, non-negotiable
   */
  CRITICAL = 'CRITICAL',

  /**
   * Strongly blocks action, requires explicit override
   */
  HIGH = 'HIGH',

  /**
   * Warns but allows action, informational
   */
  MEDIUM = 'MEDIUM',

  /**
   * Logged only, does not block
   */
  LOW = 'LOW',
}

/**
 * A single pattern match found in the action context
 */
export interface PatternMatch {
  /**
   * The regex pattern that was matched
   */
  pattern: string;

  /**
   * The actual matched text from the context
   */
  matched: string;

  /**
   * Location where match was found (e.g., "parameter.email")
   */
  location: string;

  /**
   * Confidence score (0-1), informational only
   * Never used for blocking decisions, only logged
   */
  confidence: number;
}

/**
 * A single policy violation detected
 */
export interface PolicyViolation {
  /**
   * Type of violation (PII_EXPOSURE, EXTERNAL_API_CALL, etc)
   */
  type: PolicyViolationType;

  /**
   * Severity level (CRITICAL, HIGH, MEDIUM, LOW)
   * Only CRITICAL and HIGH block execution
   */
  severity: PolicySeverity;

  /**
   * Human-readable description of the violation
   * Example: "Email address detected in action parameters"
   */
  reason: string;

  /**
   * Array of specific matches found
   * Empty array if violation is based on pattern, not specific match
   */
  matches: PatternMatch[];

  /**
   * Suggested fix for the user
   * Example: "Remove email from parameters or use anonymized identifier"
   */
  suggestedFix: string;
}

/**
 * Context for evaluating semantic policies
 * Includes the action proposal and its parameters/code
 */
export interface SemanticContext {
  /**
   * Unique identifier for this action proposal
   */
  proposalId: string;

  /**
   * Type of action being evaluated (e.g., "MUTATION", "QUERY")
   */
  actionType: string;

  /**
   * Parameters passed to the action
   */
  parameters: Record<string, unknown>;

  /**
   * Code being executed (if available)
   */
  codeContext?: string;

  /**
   * Data context (user input, API responses, etc)
   */
  dataContext?: Record<string, unknown>;

  /**
   * Timestamp when evaluation occurred
   */
  timestamp?: number;
}

/**
 * Result of evaluating a semantic policy
 */
export interface PolicyResult {
  /**
   * Whether the action passed all policy checks
   */
  isValid: boolean;

  /**
   * Human-readable reason if invalid
   */
  reason: string;

  /**
   * All violations detected (empty if isValid is true)
   */
  violations: PolicyViolation[];

  /**
   * Metadata about the evaluation
   */
  metadata: {
    /**
     * Time taken to evaluate in milliseconds
     */
    evaluationTimeMs: number;

    /**
     * Number of patterns checked
     */
    patternsChecked: number;

    /**
     * Whether result was from cache
     */
    fromCache: boolean;

    /**
     * Policy engine version that performed evaluation
     */
    engineVersion: string;
  };
}

/**
 * User-defined policy rule (from JSON config)
 */
export interface PolicyRule {
  /**
   * Unique identifier for this rule
   */
  id: string;

  /**
   * Display name
   */
  name: string;

  /**
   * Which fields to check (e.g., "parameters.email", "codeContext")
   */
  checkFields: string[];

  /**
   * Regex pattern to match against
   */
  pattern: string;

  /**
   * What type of violation this represents
   */
  violationType: PolicyViolationType | string;

  /**
   * Severity of violation if this rule matches
   */
  severity: PolicySeverity;

  /**
   * Reason/description for the violation
   */
  reason: string;

  /**
   * Suggested fix for users
   */
  suggestedFix: string;

  /**
   * Whether this rule is enabled
   */
  enabled: boolean;
}

/**
 * Complete policy configuration for the application
 */
export interface PolicyConfig {
  /**
   * Configuration version (for migration/compatibility)
   */
  version: string;

  /**
   * Which core rules to enable/disable
   */
  coreRules: {
    /**
     * Enable PII detection (emails, SSNs, phone numbers)
     */
    piiDetection: boolean;

    /**
     * Enable external API detection
     */
    externalApiDetection: boolean;

    /**
     * Enable production data protection
     */
    productionDataProtection: boolean;
  };

  /**
   * User-defined custom rules
   */
  customRules: PolicyRule[];

  /**
   * Exemptions for specific action types or violations
   * Example: { "actionType:ADMIN_QUERY": ["EXTERNAL_API_CALL"] }
   */
  exemptions: Record<string, string[]>;

  /**
   * Performance settings
   */
  performance: {
    /**
     * Maximum time to spend evaluating policies (ms)
     */
    timeoutMs: number;

    /**
     * Maximum regex complexity to prevent ReDoS attacks
     */
    maxPatternComplexity: number;

    /**
     * Cache size (max number of results to cache)
     */
    cacheMaxSize: number;
  };

  /**
   * Logging settings
   */
  logging: {
    /**
     * Log all policy evaluations (verbose)
     */
    logEvaluations: boolean;

    /**
     * Log only violations (concise)
     */
    logViolationsOnly: boolean;

    /**
     * Log failed policy checks (debug)
     */
    logErrors: boolean;
  };
}

/**
 * Execution result with policy information
 * Extends existing execution result
 */
export interface AAExecutionResultWithPolicy {
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED';
  error?: {
    code: string;
    message: string;
  };
  policyResult?: PolicyResult;
  data?: unknown;
}
