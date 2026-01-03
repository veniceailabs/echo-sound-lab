/**
 * Level 4: Contextual Reasoning - Semantic Safety Types
 *
 * Core type definitions for policy violations, semantic context,
 * and policy evaluation results. Follows immutability principles
 * and supports Amendment H (confidence is informational only).
 */

/**
 * Policy violation types
 * Defines the categories of semantic policy violations
 */
export enum PolicyViolationType {
  PII_EXPOSURE = 'PII_EXPOSURE',
  EXTERNAL_API_CALL = 'EXTERNAL_API_CALL',
  PRODUCTION_DATA_MODIFICATION = 'PRODUCTION_DATA_MODIFICATION',
  CUSTOM_RULE = 'CUSTOM_RULE',
}

/**
 * Severity levels for policy violations
 * CRITICAL and HIGH trigger auto-blocking
 * MEDIUM and LOW are logged but allow execution (future use)
 */
export enum PolicySeverity {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

/**
 * Pattern match result
 * Records when a semantic pattern was detected in an action
 * Confidence is informational per Amendment H (never used for blocking)
 */
export interface PatternMatch {
  readonly pattern: string; // Regex pattern name or description
  readonly matched: string; // The actual matched string
  readonly location: {
    readonly line?: number;
    readonly column?: number;
    readonly field?: string; // Which field contained the match
  };
  readonly confidence: number; // 0.0-1.0, informational only per Amendment H
}

/**
 * Policy violation details
 * Describes a specific policy violation found during analysis
 */
export interface PolicyViolation {
  readonly type: PolicyViolationType; // What kind of violation
  readonly severity: PolicySeverity; // How serious (blocks if CRITICAL/HIGH)
  readonly reason: string; // Human-readable explanation
  readonly matches: ReadonlyArray<PatternMatch>; // Specific matches found
  readonly suggestedFix?: string; // Optional guidance for user
  readonly timestamp: number; // When violation was detected
}

/**
 * Semantic context extracted from an action proposal
 * Used as input to policy evaluation
 */
export interface SemanticContext {
  readonly proposalId: string; // Unique identifier
  readonly actionType: string; // e.g., "SEND_EMAIL", "APPLY_LIMITER"
  readonly parameters: Record<string, unknown>; // Action parameters
  readonly codeContext?: {
    readonly files: ReadonlyArray<string>; // Files involved
    readonly functions: ReadonlyArray<string>; // Functions called
    readonly apis: ReadonlyArray<string>; // APIs used
  };
  readonly dataContext?: {
    readonly fields: ReadonlyArray<string>; // Data fields affected
    readonly values: ReadonlyArray<unknown>; // Sample values
  };
}

/**
 * Policy evaluation result
 * Returned by PolicyEngine.evaluate()
 * Follows governance gate pattern with isValid + structured metadata
 */
export interface PolicyResult {
  readonly isValid: boolean; // Primary decision: allow or block
  readonly reason?: string; // Why invalid (if applicable)
  readonly violations: ReadonlyArray<PolicyViolation>; // All violations found
  readonly metadata: {
    readonly evaluationTimeMs: number; // How long evaluation took
    readonly policiesChecked: ReadonlyArray<string>; // Which policies were evaluated
    readonly timestamp: number; // When evaluation occurred
  };
}

/**
 * User-defined policy rule
 * Allows custom policies to be defined in configuration files
 */
export interface PolicyRule {
  readonly id: string; // Unique rule identifier
  readonly name: string; // Human-readable name
  readonly description: string; // What this rule prevents
  readonly type: PolicyViolationType; // Category of violation
  readonly severity: PolicySeverity; // How serious when violated
  readonly enabled: boolean; // Can be disabled in config
  readonly patterns: ReadonlyArray<{
    readonly regex: string; // Regular expression to match
    readonly flags?: string; // Regex flags (g, i, m, etc.)
    readonly field?: string; // Optional: specific field to check
  }>;
  readonly exemptions?: ReadonlyArray<string>; // Action types that are exempt
}

/**
 * Policy configuration
 * Complete policy configuration including core rules and user customizations
 */
export interface PolicyConfig {
  readonly version: string; // Configuration version (semver)
  readonly customRules: ReadonlyArray<PolicyRule>; // User-defined rules
  readonly coreRulesOverrides?: {
    readonly piiDetection?: { enabled: boolean };
    readonly externalApiDetection?: { enabled: boolean };
    readonly productionDataProtection?: { enabled: boolean };
  };
}

/**
 * Forensic policy event
 * Emitted to ForensicAuditLog for policy evaluations
 */
export interface PolicyEvent {
  readonly type:
    | 'POLICY_ENGINE_INIT'
    | 'POLICY_EVALUATION'
    | 'POLICY_VIOLATION'
    | 'POLICY_CONFIG_RELOAD'
    | 'EXECUTION_BLOCKED_POLICY'
    | 'FSM_AUTO_REVOKE_POLICY';
  readonly timestamp: number;
  readonly data: Record<string, unknown>;
}
