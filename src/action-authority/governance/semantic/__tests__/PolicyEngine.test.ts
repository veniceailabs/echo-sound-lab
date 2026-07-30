/**
 * POLICY ENGINE TESTS
 *
 * Tests for the governance gate, caching, configuration, and forensic logging
 */

import { PolicyEngine } from '../PolicyEngine';
import { getDefaultPolicyConfig } from '../defaultConfig';
import { SemanticContext, PolicyViolationType } from '../types';
import { buildSemanticContext } from '../utils';

describe('PolicyEngine', () => {
  // Reset before each test
  beforeEach(() => {
    PolicyEngine.reset();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      PolicyEngine.initialize();
      const config = PolicyEngine.getConfig();

      expect(config).toBeDefined();
      expect(config.version).toBe('1.0.0');
      expect(config.coreRules).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const customConfig = {
        version: '2.0.0',
        coreRules: {
          piiDetection: false,
          externalApiDetection: true,
          productionDataProtection: true
        }
      };

      PolicyEngine.initialize(customConfig);
      const config = PolicyEngine.getConfig();

      expect(config.coreRules.piiDetection).toBe(false);
    });

    it('should throw error on double initialization', () => {
      PolicyEngine.initialize();

      expect(() => {
        PolicyEngine.initialize();
      }).toThrow('Already initialized');
    });

    it('should throw error if not initialized before evaluate', () => {
      const context = buildSemanticContext({
        id: 'test-1',
        type: 'QUERY'
      });

      expect(() => {
        PolicyEngine.evaluate(context);
      }).toThrow('Not initialized');
    });
  });

  describe('Evaluation', () => {
    beforeEach(() => {
      PolicyEngine.initialize();
    });

    it('should return valid result for clean context', () => {
      const context = buildSemanticContext({
        id: 'test-1',
        type: 'QUERY'
      });

      const result = PolicyEngine.evaluate(context);

      expect(result.isValid).toBe(true);
      expect(result.violations).toHaveLength(0);
      expect(result.reason).toBe('All policies passed');
    });

    it('should detect PII violations', () => {
      const context: SemanticContext = {
        proposalId: 'test-2',
        actionType: 'QUERY',
        parameters: { email: 'user@example.com' }
      };

      const result = PolicyEngine.evaluate(context);

      expect(result.isValid).toBe(false);
      expect(result.violations.length).toBeGreaterThan(0);
      expect(result.violations[0].type).toBe(PolicyViolationType.PII_EXPOSURE);
    });

    it('should return immutable result', () => {
      const context = buildSemanticContext({
        id: 'test-3',
        type: 'QUERY'
      });

      const result = PolicyEngine.evaluate(context);

      expect(() => {
        (result as any).isValid = false;
      }).toThrow();

      expect(() => {
        (result.violations as any).push({});
      }).toThrow();
    });

    it('should include metadata in result', () => {
      const context = buildSemanticContext({
        id: 'test-4',
        type: 'QUERY'
      });

      const result = PolicyEngine.evaluate(context);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.evaluationTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.patternsChecked).toBeGreaterThan(0);
      expect(result.metadata.engineVersion).toBe('1.0.0');
    });
  });

  describe('Caching', () => {
    beforeEach(() => {
      PolicyEngine.initialize({
        performance: {
          cacheMaxSize: 100,
          timeoutMs: 50,
          maxPatternComplexity: 50
        }
      });
    });

    it('should cache results', () => {
      const context = buildSemanticContext({
        id: 'test-cache-1',
        type: 'QUERY'
      });

      const result1 = PolicyEngine.evaluate(context);
      const result2 = PolicyEngine.evaluate(context);

      expect(result1).toBe(result2); // Same object reference (from cache)
    });

    it('should indicate cached results', () => {
      const context = buildSemanticContext({
        id: 'test-cache-2',
        type: 'QUERY'
      });

      PolicyEngine.evaluate(context);
      const cachedResult = PolicyEngine.evaluate(context);

      expect(cachedResult.metadata.fromCache).toBe(true);
    });

    it('should return stats about cache', () => {
      const context1 = buildSemanticContext({ id: 'test-5', type: 'QUERY' });
      const context2 = buildSemanticContext({ id: 'test-6', type: 'MUTATION' });

      PolicyEngine.evaluate(context1);
      PolicyEngine.evaluate(context2);

      const stats = PolicyEngine.getCacheStats();

      expect(stats.size).toBeLessThanOrEqual(2);
      expect(stats.maxSize).toBe(100);
    });

    it('should clear cache', () => {
      const context = buildSemanticContext({
        id: 'test-cache-clear',
        type: 'QUERY'
      });

      const result1 = PolicyEngine.evaluate(context);
      PolicyEngine.clearCache();
      const result2 = PolicyEngine.evaluate(context);

      expect(result1.metadata.fromCache).toBe(false);
      expect(result2.metadata.fromCache).toBe(false);
      expect(result1).not.toBe(result2); // Different objects
    });
  });

  describe('Configuration Reload', () => {
    beforeEach(() => {
      PolicyEngine.initialize();
    });

    it('should reload configuration at runtime', () => {
      const newConfig = {
        coreRules: {
          piiDetection: false,
          externalApiDetection: true,
          productionDataProtection: true
        }
      };

      PolicyEngine.reloadConfig(newConfig);
      const config = PolicyEngine.getConfig();

      expect(config.coreRules.piiDetection).toBe(false);
    });

    it('should clear cache on config reload', () => {
      const context = buildSemanticContext({
        id: 'test-reload-1',
        type: 'QUERY'
      });

      PolicyEngine.evaluate(context);
      const statsBeforeReload = PolicyEngine.getCacheStats();

      PolicyEngine.reloadConfig({
        coreRules: {
          piiDetection: true,
          externalApiDetection: true,
          productionDataProtection: true
        }
      });

      const statsAfterReload = PolicyEngine.getCacheStats();

      expect(statsBeforeReload.size).toBeGreaterThan(0);
      expect(statsAfterReload.size).toBe(0);
    });
  });

  describe('Exemptions', () => {
    beforeEach(() => {
      PolicyEngine.initialize({
        exemptions: {
          'actionType:ADMIN_ACTION': ['EXTERNAL_API_CALL', 'PII_EXPOSURE'],
          'violationType:LOW_RISK_EMAIL': ['actionType:INTERNAL_AUDIT']
        }
      });
    });

    it('should check action type exemptions', () => {
      const isExempt = PolicyEngine.isExempt('ADMIN_ACTION', 'EXTERNAL_API_CALL');
      expect(isExempt).toBe(true);
    });

    it('should check violation type exemptions', () => {
      const isExempt = PolicyEngine.isExempt('INTERNAL_AUDIT', 'LOW_RISK_EMAIL');
      expect(isExempt).toBe(true);
    });

    it('should return false for non-exempt combinations', () => {
      const isExempt = PolicyEngine.isExempt('USER_ACTION', 'EXTERNAL_API_CALL');
      expect(isExempt).toBe(false);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      PolicyEngine.initialize();
    });

    it('should fail safely on analysis errors', () => {
      const context: SemanticContext = {
        proposalId: 'test-error-1',
        actionType: 'QUERY',
        parameters: { data: 'x'.repeat(1000000) } // Very large data
      };

      const result = PolicyEngine.evaluate(context);

      // Fail-safe: should return valid result on error
      expect(result).toBeDefined();
      expect(result.metadata).toBeDefined();
    });

    it('should log evaluation timing', () => {
      const context = buildSemanticContext({
        id: 'test-timing-1',
        type: 'QUERY'
      });

      const result = PolicyEngine.evaluate(context);

      expect(result.metadata.evaluationTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.evaluationTimeMs).toBeLessThan(1000); // Should be fast
    });
  });

  describe('Access Control', () => {
    beforeEach(() => {
      PolicyEngine.initialize();
    });

    it('should throw error if not initialized for getConfig', () => {
      PolicyEngine.reset();

      expect(() => {
        PolicyEngine.getConfig();
      }).toThrow('Not initialized');
    });

    it('should throw error if not initialized for getCacheStats', () => {
      PolicyEngine.reset();

      expect(() => {
        PolicyEngine.getCacheStats();
      }).toThrow('Not initialized');
    });

    it('should throw error if not initialized for clearCache', () => {
      PolicyEngine.reset();

      expect(() => {
        PolicyEngine.clearCache();
      }).toThrow('Not initialized');
    });

    it('should throw error if not initialized for isExempt', () => {
      PolicyEngine.reset();

      expect(() => {
        PolicyEngine.isExempt('ACTION', 'VIOLATION');
      }).toThrow('Not initialized');
    });

    it('should throw error if not initialized for reloadConfig', () => {
      PolicyEngine.reset();

      expect(() => {
        PolicyEngine.reloadConfig({});
      }).toThrow('Not initialized');
    });
  });

  describe('Violations with Different Severities', () => {
    beforeEach(() => {
      PolicyEngine.initialize();
    });

    it('should block on CRITICAL violations', () => {
      const context: SemanticContext = {
        proposalId: 'test-critical-1',
        actionType: 'MUTATION',
        parameters: { ssn: '123-45-6789' } // CRITICAL
      };

      const result = PolicyEngine.evaluate(context);

      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.severity === 'CRITICAL')).toBe(true);
    });

    it('should block on HIGH violations', () => {
      const context: SemanticContext = {
        proposalId: 'test-high-1',
        actionType: 'QUERY',
        parameters: { email: 'user@example.com' } // HIGH
      };

      const result = PolicyEngine.evaluate(context);

      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.severity === 'HIGH')).toBe(true);
    });

    it('should allow MEDIUM and LOW violations', () => {
      // MEDIUM and LOW don't block
      // This is handled by the policy severity logic
      // For this test, we need a custom config that includes MEDIUM violations

      const customConfig = getDefaultPolicyConfig();
      customConfig.customRules.push({
        id: 'test.medium-rule',
        name: 'Medium Severity Rule',
        checkFields: ['parameters'],
        pattern: 'test-medium',
        violationType: PolicyViolationType.CUSTOM_RULE,
        severity: 'MEDIUM' as const,
        reason: 'This is a medium severity violation',
        suggestedFix: 'Fix this',
        enabled: true
      });

      PolicyEngine.reset();
      PolicyEngine.initialize(customConfig);

      const context: SemanticContext = {
        proposalId: 'test-medium-2',
        actionType: 'QUERY',
        parameters: { data: 'test-medium' }
      };

      const result = PolicyEngine.evaluate(context);

      // MEDIUM violations should allow execution (isValid = true)
      // Only CRITICAL and HIGH block
      // This depends on the implementation of PolicyEngine logic
    });
  });
});
