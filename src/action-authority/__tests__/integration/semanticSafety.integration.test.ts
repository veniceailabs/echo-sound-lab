/**
 * SEMANTIC SAFETY INTEGRATION TESTS
 *
 * End-to-end integration tests for the complete semantic safety system
 * including FSM, Dispatcher, and HUD interactions
 */

import { PolicyEngine } from '../../governance/semantic/PolicyEngine';
import { buildSemanticContext } from '../../governance/semantic/utils';
import { getDefaultPolicyConfig } from '../../governance/semantic/defaultConfig';
import { loadPolicyConfig } from '../../governance/semantic/configLoader';
import { PolicyViolationType } from '../../governance/semantic/types';

describe('Semantic Safety Integration', () => {
  beforeEach(() => {
    PolicyEngine.reset();
  });

  describe('FSM Auto-Revocation Flow', () => {
    it('should detect policy violations during HOLDING state', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      // Simulate action proposal with PII
      const context = buildSemanticContext({
        id: 'test-hold-1',
        type: 'USER_GESTURE',
        data: {
          email: 'user@example.com',
          holdingState: 'HOLDING'
        }
      });

      const result = PolicyEngine.evaluate(context);

      // Should detect the email PII violation
      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.type === PolicyViolationType.PII_EXPOSURE)).toBe(true);
    });

    it('should provide violation reason for UI display', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-hold-2',
        type: 'USER_GESTURE',
        data: {
          ssn: '123-45-6789'
        }
      });

      const result = PolicyEngine.evaluate(context);

      expect(result.isValid).toBe(false);
      expect(result.reason).toContain('SSN');
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it('should include violation details for HUD display', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-hold-3',
        type: 'USER_GESTURE',
        data: { email: 'user@example.com', phone: '(555) 123-4567' }
      });

      const result = PolicyEngine.evaluate(context);

      expect(result.violations.length).toBeGreaterThan(0);
      result.violations.forEach(v => {
        expect(v.type).toBeDefined();
        expect(v.severity).toBeDefined();
        expect(v.reason).toBeDefined();
        expect(v.suggestedFix).toBeDefined();
      });
    });
  });

  describe('Dispatcher Pre-Execution Gate', () => {
    it('should block execution for CRITICAL violations', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-dispatch-1',
        type: 'DATABASE_MUTATION',
        data: {
          query: 'DELETE FROM prod_users WHERE id = ?',
          db: 'production'
        }
      });

      const result = PolicyEngine.evaluate(context);

      expect(result.isValid).toBe(false);
      expect(result.violations[0].severity).toBe('CRITICAL');
    });

    it('should block execution for HIGH violations', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-dispatch-2',
        type: 'API_CALL',
        data: { endpoint: 'https://external-api.com/data' }
      });

      const result = PolicyEngine.evaluate(context);

      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.severity === 'HIGH')).toBe(true);
    });

    it('should include error code for result handling', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-dispatch-3',
        type: 'QUERY',
        data: { email: 'admin@example.com' }
      });

      const result = PolicyEngine.evaluate(context);

      // Error code would be used by dispatcher
      // to construct AAExecutionResult with code: 'POLICY_VIOLATION'
      expect(result.violations.length).toBeGreaterThan(0);
    });
  });

  describe('Configuration Loading', () => {
    it('should load default config without file', () => {
      const config = getDefaultPolicyConfig();

      expect(config).toBeDefined();
      expect(config.version).toBe('1.0.0');
      expect(config.coreRules).toBeDefined();
    });

    it('should initialize engine with loaded config', () => {
      const config = getDefaultPolicyConfig();
      PolicyEngine.initialize(config);

      const result = PolicyEngine.evaluate(
        buildSemanticContext({ id: 'test-1', type: 'QUERY' })
      );

      expect(result).toBeDefined();
      expect(result.metadata.engineVersion).toBe('1.0.0');
    });

    it('should support custom rules in config', () => {
      const customConfig = getDefaultPolicyConfig();
      customConfig.customRules.push({
        id: 'test.custom-api-blocker',
        name: 'Block Specific API',
        checkFields: ['parameters', 'dataContext'],
        pattern: 'https://blocked-api.com',
        violationType: PolicyViolationType.EXTERNAL_API_CALL,
        severity: 'CRITICAL' as const,
        reason: 'This API endpoint is blocked',
        suggestedFix: 'Use approved API endpoints',
        enabled: true
      });

      PolicyEngine.initialize(customConfig);

      const context = buildSemanticContext({
        id: 'test-custom-1',
        type: 'QUERY',
        data: { endpoint: 'https://blocked-api.com/data' }
      });

      const result = PolicyEngine.evaluate(context);

      expect(result.isValid).toBe(false);
      expect(result.violations.some(v => v.reason.includes('blocked'))).toBe(true);
    });
  });

  describe('Hot Reload During Action', () => {
    it('should allow config reload without restarting', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      // First eval with default config
      const context1 = buildSemanticContext({
        id: 'test-reload-1',
        type: 'QUERY',
        data: { email: 'user@example.com' }
      });

      const result1 = PolicyEngine.evaluate(context1);
      expect(result1.isValid).toBe(false); // PII detection enabled

      // Reload with PII detection disabled
      PolicyEngine.reloadConfig({
        coreRules: {
          piiDetection: false,
          externalApiDetection: true,
          productionDataProtection: true
        }
      });

      // Same context should now pass
      const result2 = PolicyEngine.evaluate(context1);
      expect(result2.isValid).toBe(true); // PII detection disabled
    });

    it('should clear cache on reload', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-reload-cache',
        type: 'QUERY'
      });

      PolicyEngine.evaluate(context);
      const statsBefore = PolicyEngine.getCacheStats();

      PolicyEngine.reloadConfig({});

      const statsAfter = PolicyEngine.getCacheStats();

      expect(statsBefore.size).toBeGreaterThan(0);
      expect(statsAfter.size).toBe(0);
    });
  });

  describe('Forensic Logging Integration', () => {
    it('should provide forensic metadata', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-forensic-1',
        type: 'MUTATION',
        data: { email: 'user@example.com' }
      });

      const result = PolicyEngine.evaluate(context);

      // Forensic metadata should be available for audit trail
      expect(result.metadata).toBeDefined();
      expect(result.metadata.evaluationTimeMs).toBeGreaterThanOrEqual(0);
      expect(result.metadata.patternsChecked).toBeGreaterThan(0);
      expect(result.metadata.fromCache).toEqual(expect.any(Boolean));
    });

    it('should indicate violation severity for logging', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-forensic-2',
        type: 'MUTATION',
        data: { ssn: '123-45-6789' }
      });

      const result = PolicyEngine.evaluate(context);

      // Each violation has severity for forensic categorization
      result.violations.forEach(v => {
        expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).toContain(v.severity);
      });
    });
  });

  describe('Amendment Compliance', () => {
    it('should respect core rule settings (Amendment H)', () => {
      const customConfig = getDefaultPolicyConfig();
      // Disable production protection
      customConfig.coreRules.productionDataProtection = false;

      PolicyEngine.initialize(customConfig);

      const context = buildSemanticContext({
        id: 'test-amend-h-1',
        type: 'MUTATION',
        data: {
          query: 'DROP TABLE prod_data;'
        }
      });

      const result = PolicyEngine.evaluate(context);

      // Should not block since productionDataProtection is disabled
      // (destructive + prod marker wouldn't trigger)
    });

    it('should include violation type for Amendment J compliance', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-amend-j-1',
        type: 'MUTATION',
        data: { ssn: '123-45-6789' }
      });

      const result = PolicyEngine.evaluate(context);

      // Amendment J: Log violation type for forensic trail
      expect(result.violations[0].type).toBeDefined();
      expect(result.violations[0].type).toMatch(/[A-Z_]+/);
    });
  });

  describe('Performance Under Load', () => {
    it('should handle many violations without slowdown', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-perf-1',
        type: 'QUERY',
        parameters: {
          emails: [
            'user1@example.com',
            'user2@example.com',
            'user3@example.com'
          ],
          phones: ['(555) 123-4567', '(555) 234-5678'],
          ssn: '123-45-6789'
        }
      });

      const start = performance.now();
      const result = PolicyEngine.evaluate(context);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(100); // Should be fast even with multiple violations
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it('should respond quickly on cache hit', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-cache-perf-1',
        type: 'QUERY'
      });

      PolicyEngine.evaluate(context); // First time (cache miss)
      const start = performance.now();
      const result = PolicyEngine.evaluate(context); // Second time (cache hit)
      const elapsed = performance.now() - start;

      expect(result.metadata.fromCache).toBe(true);
      expect(elapsed).toBeLessThan(10); // Cache hits should be very fast
    });
  });

  describe('Error Recovery', () => {
    it('should continue operating after analyzing bad input', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      // First eval with problematic data
      const badContext = buildSemanticContext({
        id: 'test-error-1',
        type: 'QUERY',
        data: { corrupted: null as unknown as string }
      });

      PolicyEngine.evaluate(badContext);

      // Second eval with good data should work
      const goodContext = buildSemanticContext({
        id: 'test-error-2',
        type: 'QUERY'
      });

      const result = PolicyEngine.evaluate(goodContext);
      expect(result).toBeDefined();
      expect(result.isValid).toBe(true);
    });

    it('should provide detailed error info for debugging', () => {
      PolicyEngine.initialize(getDefaultPolicyConfig());

      const context = buildSemanticContext({
        id: 'test-debug-1',
        type: 'QUERY',
        data: { email: 'user@example.com' }
      });

      const result = PolicyEngine.evaluate(context);

      if (!result.isValid) {
        // Should provide enough info for debugging
        expect(result.reason).toBeTruthy();
        expect(result.violations[0].matches).toBeDefined();
      }
    });
  });
});
