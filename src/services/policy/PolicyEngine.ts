/**
 * POLICY ENGINE
 * The Judge. Evaluates all proposed actions against the Constitution.
 *
 * Single responsibility: Determine whether an execution is allowed.
 * Pure function logic: payload → PolicyResult
 *
 * Design: Fail-fast on first BLOCK, otherwise allow.
 */

import { ExecutionPayload } from '../../types/execution-contract';
import { SecurityPolicy, PolicyResult, PolicyLevel, PolicyViolation } from './PolicyTypes';
import { GlobalPolicies } from './StandardPolicies';

/**
 * PolicyEngine: The Final Gatekeeper
 *
 * This is a static singleton (like QuorumGate, LeasesGate in the existing codebase).
 * It evaluates payloads synchronously and returns verdicts.
 */
class PolicyEngine {
  private static instance: PolicyEngine;
  private policies: SecurityPolicy[] = [];
  private violationLog: PolicyViolation[] = [];
  private readonly MAX_LOG_ENTRIES = 1000; // Prevent memory bloat

  /**
   * Singleton constructor
   */
  private constructor() {
    this.policies = [...GlobalPolicies];
    console.log(`[PolicyEngine] Initialized with ${this.policies.length} policies.`);
  }

  /**
   * Get or create singleton instance
   */
  public static getInstance(): PolicyEngine {
    if (!PolicyEngine.instance) {
      PolicyEngine.instance = new PolicyEngine();
    }
    return PolicyEngine.instance;
  }

  /**
   * Main API: Evaluate a payload against all active policies
   *
   * Returns the first BLOCK result, or success if all pass.
   * Fail-fast behavior: stops on first violation.
   */
  public evaluate(payload: ExecutionPayload): PolicyResult {
    console.log(`[PolicyEngine] Evaluating safety for action: ${payload.actionType} on track: ${payload.parameters.track || 'N/A'}`);

    // Run through each policy
    for (const policy of this.policies) {
      const result = policy.validate(payload);

      // Log all violations for audit trail
      if (!result.allowed) {
        console.warn(`[PolicyEngine] VIOLATION DETECTED: ${result.policyName}`);
        console.warn(`[PolicyEngine] Reason: ${result.reason}`);

        // Add to violation log
        this.addViolationLog({
          timestamp: Date.now(),
          policyName: result.policyName,
          reason: result.reason,
          payload,
          level: result.level
        });

        return result; // Fail fast: return first BLOCK
      }
    }

    // All policies passed
    console.log(`[PolicyEngine] All policies passed. Execution allowed.`);
    return {
      allowed: true,
      level: PolicyLevel.INFO,
      reason: 'All policies passed.',
      policyName: 'GLOBAL_PASS'
    };
  }

  /**
   * Runtime API: Add a custom policy (e.g., from user config)
   *
   * Allows extending the policy set without modifying core code.
   * Example: User-defined rule "Don't touch drum tracks"
   */
  public addPolicy(policy: SecurityPolicy): void {
    console.log(`[PolicyEngine] Adding custom policy: ${policy.name}`);
    this.policies.push(policy);
  }

  /**
   * Audit API: Get violation history
   */
  public getViolationLog(): PolicyViolation[] {
    return [...this.violationLog]; // Return copy to prevent external mutation
  }

  /**
   * Audit API: Clear violation history (admin only)
   */
  public clearViolationLog(): void {
    this.violationLog = [];
    console.log(`[PolicyEngine] Violation log cleared.`);
  }

  /**
   * Internal: Log a violation for forensic audit trail
   */
  private addViolationLog(violation: PolicyViolation): void {
    this.violationLog.push(violation);

    // Prevent unbounded memory growth
    if (this.violationLog.length > this.MAX_LOG_ENTRIES) {
      this.violationLog.shift(); // Remove oldest entry
    }
  }

  /**
   * Debug API: List all active policies
   */
  public listPolicies(): string[] {
    return this.policies.map(p => p.name);
  }
}

/**
 * Singleton instance (follows existing pattern in codebase)
 */
export const policyEngine = PolicyEngine.getInstance();
