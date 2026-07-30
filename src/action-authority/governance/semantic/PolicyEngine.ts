/**
 * POLICY ENGINE - GOVERNANCE GATE
 *
 * Static singleton that enforces semantic policies.
 * Follows the QuorumGate/LeasesGate architectural pattern.
 *
 * Responsibilities:
 * - Initialize with policy configuration
 * - Evaluate actions against policies
 * - Cache results for performance
 * - Log all evaluations for forensics
 * - Return immutable results
 */

import { SemanticAnalyzer } from './SemanticAnalyzer';
import {
  PolicyConfig,
  PolicyResult,
  PolicyViolation,
  SemanticContext,
} from './types';
import { getDefaultPolicyConfig } from './defaultConfig';

interface CacheEntry {
  result: PolicyResult;
  timestamp: number;
}

/**
 * LRU Cache implementation for policy results
 */
class LRUCache<T> {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  get(key: string): PolicyResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.result;
  }

  set(key: string, result: PolicyResult): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, { result, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

/**
 * Policy Engine - Static Singleton
 * Enforces semantic policies for all action proposals
 */
export class PolicyEngine {
  private static instance: PolicyEngine | null = null;
  private static readonly VERSION = '1.0.0';

  private config: PolicyConfig;
  private cache: LRUCache<PolicyResult>;
  private initialized: boolean = false;

  /**
   * Private constructor - use static methods
   */
  private constructor(config: PolicyConfig) {
    this.config = structuredClone(config); // Deep copy
    Object.freeze(this.config); // Immutable configuration
    this.cache = new LRUCache(config.performance?.cacheMaxSize || 100);
  }

  /**
   * Initialize the Policy Engine with configuration
   * Must be called once before any evaluations
   *
   * @throws Error if already initialized
   */
  public static initialize(config?: Partial<PolicyConfig>): void {
    if (this.instance !== null) {
      throw new Error('[PolicyEngine] Already initialized. Call only once.');
    }

    const fullConfig = config ? { ...getDefaultPolicyConfig(), ...config } : getDefaultPolicyConfig();
    this.instance = new PolicyEngine(fullConfig);
    this.instance.initialized = true;

    // Log initialization
    this.logEvent('POLICY_ENGINE_INIT', {
      version: this.VERSION,
      configVersion: fullConfig.version,
      coreRules: fullConfig.coreRules,
      customRulesCount: fullConfig.customRules?.length || 0,
    });
  }

  /**
   * Get singleton instance (must be initialized first)
   */
  private static getInstance(): PolicyEngine {
    if (!this.instance) {
      throw new Error('[PolicyEngine] Not initialized. Call initialize() first.');
    }
    return this.instance;
  }

  /**
   * Evaluate action against all policies
   * Returns immutable PolicyResult object
   */
  public static evaluate(context: SemanticContext): PolicyResult {
    const instance = this.getInstance();
    const startTime = performance.now();

    try {
      // Check cache first
      const cacheKey = this.hashContext(context);
      const cached = instance.cache.get(cacheKey);
      if (cached) {
        this.logEvent('POLICY_EVALUATION', {
          proposalId: context.proposalId,
          cached: true,
          isValid: cached.isValid,
          violationCount: cached.violations.length,
        });
        return cached;
      }

      // Run analysis
      const violations = SemanticAnalyzer.analyze(context, instance.config);
      const evaluationTimeMs = performance.now() - startTime;

      // Build result
      const result: PolicyResult = {
        isValid: violations.length === 0 || !violations.some(v =>
          v.severity === 'CRITICAL' || v.severity === 'HIGH'
        ),
        reason: violations.length === 0
          ? 'All policies passed'
          : violations
              .filter(v => v.severity === 'CRITICAL' || v.severity === 'HIGH')
              .map(v => v.reason)
              .join('; '),
        violations,
        metadata: {
          evaluationTimeMs,
          patternsChecked: this.countPatterns(instance.config),
          fromCache: false,
          engineVersion: PolicyEngine.VERSION,
        },
      };

      // Freeze result for immutability
      Object.freeze(result);
      Object.freeze(result.violations);
      Object.freeze(result.metadata);

      // Cache result
      if (evaluationTimeMs < (instance.config.performance?.timeoutMs || 50)) {
        instance.cache.set(cacheKey, result);
      }

      // Log evaluation
      this.logEvent('POLICY_EVALUATION', {
        proposalId: context.proposalId,
        cached: false,
        isValid: result.isValid,
        violationCount: violations.length,
        evaluationTimeMs,
      });

      // Log violations if any
      if (violations.length > 0) {
        this.logEvent('POLICY_VIOLATION', {
          proposalId: context.proposalId,
          violations: violations.map(v => ({
            type: v.type,
            severity: v.severity,
            reason: v.reason,
          })),
        });
      }

      return result;
    } catch (error) {
      const evaluationTimeMs = performance.now() - startTime;

      // Log error
      this.logEvent('POLICY_EVALUATION_ERROR', {
        proposalId: context.proposalId,
        error: error instanceof Error ? error.message : String(error),
        evaluationTimeMs,
      });

      // Fail-safe: return valid on error (don't block actions)
      const result: PolicyResult = {
        isValid: true,
        reason: 'Evaluation error - allowing action',
        violations: [],
        metadata: {
          evaluationTimeMs,
          patternsChecked: 0,
          fromCache: false,
          engineVersion: PolicyEngine.VERSION,
        },
      };

      Object.freeze(result);
      return result;
    }
  }

  /**
   * Reload configuration at runtime (hot reload)
   * Creates new instance with updated config
   */
  public static reloadConfig(newConfig: Partial<PolicyConfig>): void {
    if (!this.instance) {
      throw new Error('[PolicyEngine] Not initialized. Call initialize() first.');
    }

    const fullConfig = { ...this.instance.config, ...newConfig };
    this.instance.config = structuredClone(fullConfig);
    Object.freeze(this.instance.config);

    // Clear cache when config changes
    this.instance.cache.clear();

    this.logEvent('POLICY_CONFIG_RELOAD', {
      newConfigVersion: fullConfig.version,
      customRulesCount: fullConfig.customRules?.length || 0,
      cacheCleared: true,
    });
  }

  /**
   * Check if action is exempt from specific violation type
   */
  public static isExempt(actionType: string, violationType: string): boolean {
    const instance = this.getInstance();
    const exemptions = instance.config.exemptions || {};

    // Check action-specific exemptions
    const actionKey = `actionType:${actionType}`;
    if (exemptions[actionKey]?.includes(violationType)) {
      return true;
    }

    // Check violation-type exemptions
    const violationKey = `violationType:${violationType}`;
    return exemptions[violationKey]?.includes(actionType) || false;
  }

  /**
   * Get current configuration (read-only)
   */
  public static getConfig(): Readonly<PolicyConfig> {
    const instance = this.getInstance();
    return instance.config;
  }

  /**
   * Get cache stats
   */
  public static getCacheStats(): { size: number; maxSize: number } {
    const instance = this.getInstance();
    return {
      size: instance.cache.size(),
      maxSize: instance.config.performance?.cacheMaxSize || 100,
    };
  }

  /**
   * Clear all cached results
   */
  public static clearCache(): void {
    const instance = this.getInstance();
    instance.cache.clear();
    this.logEvent('POLICY_CACHE_CLEARED', { timestamp: Date.now() });
  }

  /**
   * Reset engine (for testing)
   */
  public static reset(): void {
    this.instance = null;
  }

  /**
   * Hash context for caching
   */
  private static hashContext(context: SemanticContext): string {
    const str = [
      context.proposalId,
      context.actionType,
      JSON.stringify(context.parameters),
      context.codeContext,
      JSON.stringify(context.dataContext),
    ].join('|');

    // Simple hash using Node's crypto or fallback
    return btoa(str).substring(0, 32);
  }

  /**
   * Count total patterns being evaluated
   */
  private static countPatterns(config: PolicyConfig): number {
    let count = 0;

    // Core patterns
    if (config.coreRules.piiDetection) count += 4; // email, ssn, phone, cc
    if (config.coreRules.externalApiDetection) count += 2; // url, fetch
    if (config.coreRules.productionDataProtection) count += 2; // destructive, production

    // Custom patterns
    count += config.customRules?.filter(r => r.enabled).length || 0;

    return count;
  }

  /**
   * Log events for forensic audit trail
   */
  private static logEvent(
    eventType: string,
    eventData: Record<string, unknown>
  ): void {
    const instance = this.instance;
    const shouldLog =
      instance?.config.logging?.logEvaluations ||
      (eventType === 'POLICY_VIOLATION' && instance?.config.logging?.logViolationsOnly) ||
      (eventType.includes('ERROR') && instance?.config.logging?.logErrors);

    if (shouldLog) {
      console.log(`[PolicyEngine:${eventType}]`, eventData);
    }

    // Always log critical events
    if (eventType === 'POLICY_ENGINE_INIT' || eventType === 'POLICY_VIOLATION') {
      // TODO: Send to ForensicAuditLog
    }
  }
}
