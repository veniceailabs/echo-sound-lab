/**
 * POLICY TYPES
 * The vocabulary of safety.
 *
 * Defines the interface and taxonomy for security policies that govern
 * which actions are allowed to execute.
 */

import { ExecutionPayload } from '../../types/execution-contract';

/**
 * Policy Level: The severity of a policy violation
 */
export enum PolicyLevel {
  INFO = 'INFO',           // Allow, but log for audit trail
  WARNING = 'WARNING',     // Allow, but mark in forensic log
  BLOCK = 'BLOCK'          // Hard stop. No execution allowed. Ever.
}

/**
 * Policy Result: The verdict of a policy check
 */
export interface PolicyResult {
  allowed: boolean;        // true = execution permitted, false = execution blocked
  level: PolicyLevel;      // Severity level of the check result
  reason: string;          // Human-readable explanation
  policyName: string;      // Which policy made this decision
}

/**
 * Security Policy: A single rule in the Constitution
 *
 * Each policy is a pure function that examines a proposal and returns a verdict.
 * Policies are chained: first BLOCK wins (fail fast).
 */
export interface SecurityPolicy {
  name: string;            // Unique policy identifier (e.g., 'MAX_GAIN_LIMIT')
  description: string;     // Human-readable description of what this policy protects
  validate: (payload: ExecutionPayload) => PolicyResult; // The actual validation function
}

/**
 * Policy Violation Event (for audit logging)
 */
export interface PolicyViolation {
  timestamp: number;
  policyName: string;
  reason: string;
  payload: ExecutionPayload;
  level: PolicyLevel;
}
