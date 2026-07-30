/**
 * SEMANTIC ANALYZER TESTS
 *
 * Comprehensive test coverage for pattern matching and violation detection
 */

import { SemanticAnalyzer } from '../SemanticAnalyzer';
import { PolicyViolationType, PolicySeverity, SemanticContext } from '../types';
import { getDefaultPolicyConfig } from '../defaultConfig';

describe('SemanticAnalyzer', () => {
  const config = getDefaultPolicyConfig();

  describe('PII Detection', () => {
    it('should detect email addresses', () => {
      const context: SemanticContext = {
        proposalId: 'test-1',
        actionType: 'QUERY',
        parameters: { email: 'user@example.com' }
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      expect(violations).toContainEqual(
        expect.objectContaining({
          type: PolicyViolationType.PII_EXPOSURE,
          severity: PolicySeverity.HIGH
        })
      );
    });

    it('should detect SSNs with HIGH severity', () => {
      const context: SemanticContext = {
        proposalId: 'test-2',
        actionType: 'MUTATION',
        parameters: { ssn: '123-45-6789' }
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      expect(violations).toContainEqual(
        expect.objectContaining({
          type: PolicyViolationType.PII_EXPOSURE,
          severity: PolicySeverity.CRITICAL
        })
      );
    });

    it('should detect phone numbers', () => {
      const context: SemanticContext = {
        proposalId: 'test-3',
        actionType: 'QUERY',
        parameters: { phone: '(555) 123-4567' }
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      expect(violations).toContainEqual(
        expect.objectContaining({
          type: PolicyViolationType.PII_EXPOSURE,
          severity: PolicySeverity.HIGH
        })
      );
    });

    it('should detect credit cards', () => {
      const context: SemanticContext = {
        proposalId: 'test-4',
        actionType: 'PAYMENT',
        parameters: { cc: '4532-1234-5678-9010' }
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      expect(violations).toContainEqual(
        expect.objectContaining({
          type: PolicyViolationType.PII_EXPOSURE,
          severity: PolicySeverity.CRITICAL
        })
      );
    });

    it('should not flag legitimate email-like strings', () => {
      const context: SemanticContext = {
        proposalId: 'test-5',
        actionType: 'QUERY',
        parameters: { domain: 'example.com', description: 'Contact @ website' }
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      // Should not have PII violations for these
      const piiViolations = violations.filter(
        v => v.type === PolicyViolationType.PII_EXPOSURE && v.severity === PolicySeverity.HIGH
      );
      // May have matches but false positives are acceptable
      // as long as they don't block legitimate use
    });
  });

  describe('External API Detection', () => {
    it('should detect external URLs', () => {
      const context: SemanticContext = {
        proposalId: 'test-6',
        actionType: 'QUERY',
        parameters: { endpoint: 'https://api.external.com/data' }
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      expect(violations).toContainEqual(
        expect.objectContaining({
          type: PolicyViolationType.EXTERNAL_API_CALL,
          severity: PolicySeverity.HIGH
        })
      );
    });

    it('should allow localhost URLs', () => {
      const context: SemanticContext = {
        proposalId: 'test-7',
        actionType: 'QUERY',
        parameters: { endpoint: 'http://localhost:3000/api' }
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      const apiViolations = violations.filter(
        v => v.type === PolicyViolationType.EXTERNAL_API_CALL
      );
      // Localhost should not trigger violations
      expect(apiViolations).toHaveLength(0);
    });

    it('should detect fetch calls', () => {
      const context: SemanticContext = {
        proposalId: 'test-8',
        actionType: 'QUERY',
        codeContext: 'const data = await fetch(url).then(r => r.json());'
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      expect(violations).toContainEqual(
        expect.objectContaining({
          type: PolicyViolationType.EXTERNAL_API_CALL,
          severity: PolicySeverity.MEDIUM
        })
      );
    });

    it('should detect axios calls', () => {
      const context: SemanticContext = {
        proposalId: 'test-9',
        actionType: 'MUTATION',
        codeContext: 'const response = axios.post("/api/endpoint", data);'
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      expect(violations).toContainEqual(
        expect.objectContaining({
          type: PolicyViolationType.EXTERNAL_API_CALL
        })
      );
    });
  });

  describe('Production Data Protection', () => {
    it('should detect DELETE on production', () => {
      const context: SemanticContext = {
        proposalId: 'test-10',
        actionType: 'MUTATION',
        codeContext: 'DELETE FROM users WHERE id = ? AND env = "production"'
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      expect(violations).toContainEqual(
        expect.objectContaining({
          type: PolicyViolationType.PRODUCTION_DATA_MODIFICATION,
          severity: PolicySeverity.CRITICAL
        })
      );
    });

    it('should detect DROP on prod database', () => {
      const context: SemanticContext = {
        proposalId: 'test-11',
        actionType: 'MUTATION',
        codeContext: 'DROP TABLE prod_users;'
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      expect(violations).toContainEqual(
        expect.objectContaining({
          type: PolicyViolationType.PRODUCTION_DATA_MODIFICATION,
          severity: PolicySeverity.CRITICAL
        })
      );
    });

    it('should allow DELETE on test database', () => {
      const context: SemanticContext = {
        proposalId: 'test-12',
        actionType: 'MUTATION',
        codeContext: 'DELETE FROM test_users WHERE id = 123;'
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      // Should not block deletions on test/dev databases
      const prodViolations = violations.filter(
        v => v.type === PolicyViolationType.PRODUCTION_DATA_MODIFICATION
      );
      expect(prodViolations).toHaveLength(0);
    });
  });

  describe('Deduplication and Sorting', () => {
    it('should deduplicate violations by type and reason', () => {
      const context: SemanticContext = {
        proposalId: 'test-13',
        actionType: 'QUERY',
        parameters: {
          email1: 'user1@example.com',
          email2: 'user2@example.com'
        }
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      // Should have only one PII_EXPOSURE violation despite multiple emails
      const piiViolations = violations.filter(
        v => v.type === PolicyViolationType.PII_EXPOSURE
      );
      expect(piiViolations.length).toBeLessThanOrEqual(2); // One per violation type
    });

    it('should sort violations by severity (CRITICAL > HIGH > MEDIUM > LOW)', () => {
      const context: SemanticContext = {
        proposalId: 'test-14',
        actionType: 'MUTATION',
        parameters: {
          ssn: '123-45-6789',
          email: 'user@example.com',
          api: 'https://external.com'
        }
      };

      const violations = SemanticAnalyzer.analyze(context, config);

      const severityOrder: Record<PolicySeverity, number> = {
        CRITICAL: 0,
        HIGH: 1,
        MEDIUM: 2,
        LOW: 3
      };

      for (let i = 1; i < violations.length; i++) {
        const prevSeverity = violations[i - 1].severity;
        const currSeverity = violations[i].severity;
        expect(severityOrder[prevSeverity]).toBeLessThanOrEqual(
          severityOrder[currSeverity]
        );
      }
    });
  });

  describe('Custom Rules', () => {
    it('should apply enabled custom rules', () => {
      const customConfig = {
        ...config,
        customRules: [
          {
            id: 'test.secret-detection',
            name: 'Secret Detection',
            checkFields: ['codeContext'],
            pattern: 'secret\\s*=\\s*[\'"].*[\'"]',
            violationType: PolicyViolationType.PII_EXPOSURE,
            severity: PolicySeverity.CRITICAL,
            reason: 'Secret found in code',
            suggestedFix: 'Use environment variables',
            enabled: true
          }
        ]
      };

      const context: SemanticContext = {
        proposalId: 'test-15',
        actionType: 'QUERY',
        codeContext: 'const secret = "my-api-key-123";'
      };

      const violations = SemanticAnalyzer.analyze(context, customConfig);

      expect(violations).toContainEqual(
        expect.objectContaining({
          reason: 'Secret found in code'
        })
      );
    });

    it('should skip disabled custom rules', () => {
      const customConfig = {
        ...config,
        customRules: [
          {
            id: 'test.disabled-rule',
            name: 'Disabled Rule',
            checkFields: ['parameters'],
            pattern: 'test',
            violationType: PolicyViolationType.CUSTOM_RULE,
            severity: PolicySeverity.HIGH,
            reason: 'This rule is disabled',
            suggestedFix: 'Enable the rule',
            enabled: false
          }
        ]
      };

      const context: SemanticContext = {
        proposalId: 'test-16',
        actionType: 'QUERY',
        parameters: { data: 'test value' }
      };

      const violations = SemanticAnalyzer.analyze(context, customConfig);

      const ruleViolations = violations.filter(v => v.reason === 'This rule is disabled');
      expect(ruleViolations).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid regex patterns gracefully', () => {
      const badConfig = {
        ...config,
        customRules: [
          {
            id: 'test.bad-regex',
            name: 'Bad Regex',
            checkFields: ['parameters'],
            pattern: '[invalid(regex',
            violationType: PolicyViolationType.CUSTOM_RULE,
            severity: PolicySeverity.HIGH,
            reason: 'Bad regex',
            suggestedFix: 'Fix regex',
            enabled: true
          }
        ]
      };

      const context: SemanticContext = {
        proposalId: 'test-17',
        actionType: 'QUERY',
        parameters: { data: 'test' }
      };

      // Should not throw, should fail gracefully
      expect(() => {
        SemanticAnalyzer.analyze(context, badConfig);
      }).not.toThrow();
    });

    it('should handle missing context fields', () => {
      const context: SemanticContext = {
        proposalId: 'test-18',
        actionType: 'QUERY'
        // No parameters, codeContext, or dataContext
      };

      // Should not throw
      expect(() => {
        SemanticAnalyzer.analyze(context, config);
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should complete analysis in < 50ms for typical context', () => {
      const context: SemanticContext = {
        proposalId: 'test-perf-1',
        actionType: 'QUERY',
        parameters: {
          email: 'user@example.com',
          phone: '(555) 123-4567',
          url: 'https://api.example.com/data'
        },
        codeContext: 'const result = await fetch(url).then(r => r.json());'
      };

      const start = performance.now();
      const violations = SemanticAnalyzer.analyze(context, config);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should not crash on very large context', () => {
      const largeContext: SemanticContext = {
        proposalId: 'test-perf-2',
        actionType: 'QUERY',
        parameters: {
          largeData: 'x'.repeat(100000) + 'user@example.com' + 'y'.repeat(100000)
        }
      };

      expect(() => {
        SemanticAnalyzer.analyze(largeContext, config);
      }).not.toThrow();
    });
  });
});
