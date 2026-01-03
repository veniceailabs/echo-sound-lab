/**
 * PolicyEngine: Semantic Safety Governance Gate
 *
 * Static singleton that evaluates actions against semantic policies.
 * Follows governance gate pattern (like QuorumGate, LeasesGate).
 * Returns frozen PolicyResult objects with clear allow/deny decisions.
 *
 * Integration Points:
 * - FSM: Monitors policy during HOLDING state (100ms polling)
 * - Dispatcher: Pre-execution gate (before LeasesGate/QuorumGate)
 * - ForensicAuditLog: Logs all evaluations for compliance
 */

import {
  PolicyConfig,
  PolicyResult,
  PolicyViolation,
  SemanticContext,
  PolicyViolationType,
  PolicySeverity,
} from './types';
import { SemanticAnalyzer } from './SemanticAnalyzer';

export class PolicyEngine {
  /**
   * Frozen configuration - set at initialization
   */
  private static config: PolicyConfig | null = null;

  /**
   * Initialization flag - prevent re-initialization
   */
  private static initialized: boolean = false;

  /**
   * Result cache - LRU cache for performance
   * Key: SHA-256 of context, Value: PolicyResult
   */
  private static resultCache = new Map<string, PolicyResult>();
  private static readonly MAX_CACHE_SIZE = 100;

  /**
   * Initialize PolicyEngine with configuration
   * Must be called once at application startup
   */
  static initialize(config: PolicyConfig): void {
    if (this.initialized) {
      throw new Error('PolicyEngine already initialized - cannot re-initialize');
    }

    // Deep freeze configuration
    this.config = this.deepFreeze(config);
    this.initialized = true;

    // Log initialization event (would be sent to ForensicAuditLog)
    this.logEvent({
      type: 'POLICY_ENGINE_INIT',
      timestamp: Date.now(),
      data: {
        version: config.version,
        customRulesCount: config.customRules.length,
        coreRulesEnabled: {
          piiDetection: config.coreRulesOverrides?.piiDetection?.enabled !== false,
          externalApiDetection: config.coreRulesOverrides?.externalApiDetection?.enabled !== false,
          productionDataProtection: config.coreRulesOverrides?.productionDataProtection
            ?.enabled !== false,
        },
      },
    });
  }

  /**
   * Evaluate semantic context against policies
   * Core method - called by FSM and Dispatcher
   * Returns frozen PolicyResult with allow/deny decision
   */
  static evaluate(context: SemanticContext): PolicyResult {
    if (!this.initialized || !this.config) {
      throw new Error('PolicyEngine not initialized - call initialize() first');
    }

    const startTime = performance.now();

    // Check cache
    const cacheKey = this.hashContext(context);
    if (this.resultCache.has(cacheKey)) {
      return this.resultCache.get(cacheKey)!;
    }

    // Run analysis
    const violations = SemanticAnalyzer.analyze(context, this.config.customRules);

    // Filter to blocking violations (CRITICAL/HIGH severity)
    const blockingViolations = violations.filter(
      (v) => v.severity === PolicySeverity.CRITICAL || v.severity === PolicySeverity.HIGH,
    );

    // Build result
    const evaluationTimeMs = performance.now() - startTime;
    const result: PolicyResult = Object.freeze({
      isValid: blockingViolations.length === 0,
      reason:
        blockingViolations.length > 0 ? blockingViolations[0].reason : undefined,
      violations: Object.freeze(violations),
      metadata: Object.freeze({
        evaluationTimeMs,
        policiesChecked: Object.freeze(this.getPolicyNames()),
        timestamp: Date.now(),
      }),
    });

    // Cache result
    this.cacheResult(cacheKey, result);

    // Log evaluation
    this.logEvent({
      type: 'POLICY_EVALUATION',
      timestamp: Date.now(),
      data: {
        proposalId: context.proposalId,
        actionType: context.actionType,
        isValid: result.isValid,
        violationCount: violations.length,
        blockingViolationCount: blockingViolations.length,
        evaluationTimeMs: evaluationTimeMs.toFixed(2),
      },
    });

    // If violations found, log details
    if (violations.length > 0) {
      this.logEvent({
        type: 'POLICY_VIOLATION',
        timestamp: Date.now(),
        data: {
          proposalId: context.proposalId,
          violations: violations.map((v) => ({
            type: v.type,
            severity: v.severity,
            matchCount: v.matches.length,
          })),
        },
      });
    }

    return result;
  }

  /**
   * Check if an action type is exempt from a specific policy
   */
  static isExempt(actionType: string, violationType: PolicyViolationType): boolean {
    if (!this.config) return false;

    // Check custom rules for exemptions
    for (const rule of this.config.customRules) {
      if (rule.type !== violationType) continue;
      if (!rule.exemptions) continue;
      if (rule.exemptions.includes(actionType)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Hot-reload configuration without restarting application
   */
  static reloadConfig(newConfig: PolicyConfig): void {
    if (!this.initialized) {
      throw new Error('PolicyEngine not initialized');
    }

    this.config = this.deepFreeze(newConfig);
    this.resultCache.clear(); // Clear cache on config reload

    this.logEvent({
      type: 'POLICY_CONFIG_RELOAD',
      timestamp: Date.now(),
      data: {
        version: newConfig.version,
        customRulesCount: newConfig.customRules.length,
      },
    });
  }

  /**
   * Get list of policy names being checked
   */
  private static getPolicyNames(): ReadonlyArray<string> {
    const coreRules = [];

    if (this.config?.coreRulesOverrides?.piiDetection?.enabled !== false) {
      coreRules.push('PII_DETECTION');
    }
    if (this.config?.coreRulesOverrides?.externalApiDetection?.enabled !== false) {
      coreRules.push('EXTERNAL_API_DETECTION');
    }
    if (this.config?.coreRulesOverrides?.productionDataProtection?.enabled !== false) {
      coreRules.push('PRODUCTION_DATA_PROTECTION');
    }

    const customRules = (this.config?.customRules || [])
      .filter((r) => r.enabled)
      .map((r) => `custom:${r.id}`);

    return Object.freeze([...coreRules, ...customRules]);
  }

  /**
   * Hash context for cache key
   * Simple hash - in production would use crypto.subtle.digest
   */
  private static hashContext(context: SemanticContext): string {
    const str = JSON.stringify(context);
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `ctx_${Math.abs(hash).toString(16)}`;
  }

  /**
   * Cache result with LRU eviction
   */
  private static cacheResult(key: string, result: PolicyResult): void {
    // Evict oldest entry if cache is full
    if (this.resultCache.size >= this.MAX_CACHE_SIZE) {
      const firstKey = this.resultCache.keys().next().value;
      this.resultCache.delete(firstKey);
    }

    this.resultCache.set(key, result);
  }

  /**
   * Deep freeze object recursively
   */
  private static deepFreeze<T extends Record<string, any>>(obj: T): T {
    Object.freeze(obj);

    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (value && typeof value === 'object' && !Object.isFrozen(value)) {
          this.deepFreeze(value);
        }
      }
    }

    return obj;
  }

  /**
   * Log event to forensic audit log
   * In production, this would write to ForensicAuditLog.logEvent()
   * For now, we just console.log for development
   */
  private static logEvent(event: {
    type: string;
    timestamp: number;
    data: Record<string, unknown>;
  }): void {
    // TODO: Integrate with ForensicAuditLog when available
    // ForensicAuditLog.logEvent({
    //   type: event.type,
    //   timestamp: event.timestamp,
    //   actionId: '(policy-engine)',
    //   sessionId: '(system)',
    //   data: event.data
    // });

    // For now, just console.debug
    if (process.env.NODE_ENV === 'development') {
      console.debug('[PolicyEngine]', event.type, event.data);
    }
  }

  /**
   * Reset engine (test-only)
   */
  static reset(): void {
    this.config = null;
    this.initialized = false;
    this.resultCache.clear();
  }
}
