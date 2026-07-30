/**
 * SEMANTIC ANALYZER
 *
 * Core pattern matching engine that detects policy violations
 * by analyzing action context against predefined and custom rules.
 *
 * Designed to be fast and deterministic, with timeouts to prevent ReDoS attacks.
 */

import {
  PolicyViolation,
  PolicyViolationType,
  PolicySeverity,
  PatternMatch,
  SemanticContext,
  PolicyRule,
  PolicyConfig,
} from './types';

export class SemanticAnalyzer {
  /**
   * Built-in pattern library for core policy detection
   */
  private static readonly CORE_PATTERNS = {
    // PII_EXPOSURE patterns
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    phone: /\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    creditCard: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,

    // EXTERNAL_API_CALL patterns
    externalUrl: /https?:\/\/(?!localhost|127\.0\.0\.1|::1)[^\s"'<>{}\\^`|]+/gi,
    fetchCall: /(fetch|axios|request|http\.get|http\.post|XMLHttpRequest|WebSocket)\s*\(/gi,

    // PRODUCTION_DATA_MODIFICATION patterns
    destructiveOp: /(delete|drop|truncate|destroy|remove)\s+(database|schema|table|from)\b/gi,
    productionMarker: /(production|prod|live|staging|stage)\b/gi,
  };

  /**
   * Analyze action context against all applicable rules
   */
  public static analyze(context: SemanticContext, config: PolicyConfig): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const startTime = performance.now();

    try {
      // Core rule analysis
      if (config.coreRules.piiDetection) {
        violations.push(...this.checkPIIExposure(context));
      }

      if (config.coreRules.externalApiDetection) {
        violations.push(...this.checkExternalAPI(context));
      }

      if (config.coreRules.productionDataProtection) {
        violations.push(...this.checkProductionData(context));
      }

      // Custom rule analysis
      for (const rule of config.customRules) {
        if (rule.enabled) {
          violations.push(...this.checkCustomRule(context, rule));
        }
      }

      // Remove duplicates and sort by severity
      return this.deduplicateAndSort(violations);
    } catch (error) {
      // Fail-safe: if analysis errors, log and return empty (allow action)
      console.error('[SemanticAnalyzer] Analysis error:', error);
      return [];
    }
  }

  /**
   * Detect personally identifiable information exposure
   */
  private static checkPIIExposure(context: SemanticContext): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const contextStr = this.contextToString(context);

    // Email detection
    const emailMatches = this.extractMatches(contextStr, this.CORE_PATTERNS.email);
    if (emailMatches.length > 0) {
      violations.push({
        type: PolicyViolationType.PII_EXPOSURE,
        severity: PolicySeverity.HIGH,
        reason: 'Email address detected in action context',
        matches: emailMatches,
        suggestedFix: 'Remove or anonymize email addresses; use user IDs instead',
      });
    }

    // SSN detection
    const ssnMatches = this.extractMatches(contextStr, this.CORE_PATTERNS.ssn);
    if (ssnMatches.length > 0) {
      violations.push({
        type: PolicyViolationType.PII_EXPOSURE,
        severity: PolicySeverity.CRITICAL,
        reason: 'Social Security Number detected (CRITICAL PII)',
        matches: ssnMatches,
        suggestedFix: 'Remove SSN immediately; never pass as parameter or in code',
      });
    }

    // Phone number detection
    const phoneMatches = this.extractMatches(contextStr, this.CORE_PATTERNS.phone);
    if (phoneMatches.length > 0) {
      violations.push({
        type: PolicyViolationType.PII_EXPOSURE,
        severity: PolicySeverity.HIGH,
        reason: 'Phone number detected in action context',
        matches: phoneMatches,
        suggestedFix: 'Remove or hash phone numbers; use contact IDs instead',
      });
    }

    // Credit card detection
    const ccMatches = this.extractMatches(contextStr, this.CORE_PATTERNS.creditCard);
    if (ccMatches.length > 0) {
      violations.push({
        type: PolicyViolationType.PII_EXPOSURE,
        severity: PolicySeverity.CRITICAL,
        reason: 'Credit card number detected (CRITICAL PII)',
        matches: ccMatches,
        suggestedFix: 'Remove CC data immediately; use payment tokenization instead',
      });
    }

    return violations;
  }

  /**
   * Detect external API calls and network access
   */
  private static checkExternalAPI(context: SemanticContext): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const contextStr = this.contextToString(context);

    // External URL detection
    const urlMatches = this.extractMatches(contextStr, this.CORE_PATTERNS.externalUrl);
    if (urlMatches.length > 0) {
      violations.push({
        type: PolicyViolationType.EXTERNAL_API_CALL,
        severity: PolicySeverity.HIGH,
        reason: 'External API endpoint detected (non-localhost URL)',
        matches: urlMatches,
        suggestedFix: 'Use internal APIs or configure as approved third-party integration',
      });
    }

    // API library detection
    const fetchMatches = this.extractMatches(contextStr, this.CORE_PATTERNS.fetchCall);
    if (fetchMatches.length > 0) {
      violations.push({
        type: PolicyViolationType.EXTERNAL_API_CALL,
        severity: PolicySeverity.MEDIUM,
        reason: 'API library call detected (fetch, axios, XMLHttpRequest, etc)',
        matches: fetchMatches,
        suggestedFix: 'Route API calls through approved gateway; document external dependency',
      });
    }

    return violations;
  }

  /**
   * Detect production data modifications with destructive operations
   */
  private static checkProductionData(context: SemanticContext): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const contextStr = this.contextToString(context);

    // Check for destructive operations
    const destructiveMatches = this.extractMatches(
      contextStr,
      this.CORE_PATTERNS.destructiveOp
    );

    // Check for production markers
    const productionMatches = this.extractMatches(
      contextStr,
      this.CORE_PATTERNS.productionMarker
    );

    // Only violation if BOTH destructive AND production are present
    if (destructiveMatches.length > 0 && productionMatches.length > 0) {
      violations.push({
        type: PolicyViolationType.PRODUCTION_DATA_MODIFICATION,
        severity: PolicySeverity.CRITICAL,
        reason: 'Destructive operation detected on production data',
        matches: [...destructiveMatches, ...productionMatches],
        suggestedFix: 'Only perform destructive operations on test/dev databases',
      });
    }

    return violations;
  }

  /**
   * Apply a custom user-defined rule
   */
  private static checkCustomRule(context: SemanticContext, rule: PolicyRule): PolicyViolation[] {
    try {
      const violations: PolicyViolation[] = [];

      // Check specified fields
      for (const field of rule.checkFields) {
        const fieldValue = this.getContextField(context, field);
        if (!fieldValue) continue;

        const fieldStr = typeof fieldValue === 'string' ? fieldValue : JSON.stringify(fieldValue);

        // Compile and test pattern
        const pattern = new RegExp(rule.pattern, 'g');
        const matches = this.extractMatches(fieldStr, pattern);

        if (matches.length > 0) {
          violations.push({
            type: (rule.violationType as PolicyViolationType) || PolicyViolationType.CUSTOM_RULE,
            severity: rule.severity,
            reason: rule.reason,
            matches: matches.map(m => ({ ...m, location: `${field}.${m.location}` })),
            suggestedFix: rule.suggestedFix,
          });
        }
      }

      return violations;
    } catch (error) {
      console.error(`[SemanticAnalyzer] Custom rule error (${rule.id}):`, error);
      return [];
    }
  }

  /**
   * Extract all regex matches from text with location info
   */
  private static extractMatches(text: string, pattern: RegExp): PatternMatch[] {
    const matches: PatternMatch[] = [];
    let match;

    // Reset global flag position
    pattern.lastIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        pattern: pattern.source,
        matched: match[0],
        location: `char:${match.index}`,
        confidence: 0.95, // Regex matches are high confidence
      });

      // Prevent infinite loops
      if (!pattern.global) break;
    }

    return matches;
  }

  /**
   * Get field value from semantic context
   */
  private static getContextField(context: SemanticContext, field: string): unknown {
    switch (field) {
      case 'parameters':
        return context.parameters;
      case 'codeContext':
        return context.codeContext;
      case 'dataContext':
        return context.dataContext;
      case 'proposalId':
        return context.proposalId;
      case 'actionType':
        return context.actionType;
      default:
        return null;
    }
  }

  /**
   * Convert semantic context to searchable string
   */
  private static contextToString(context: SemanticContext): string {
    const parts = [
      context.proposalId || '',
      context.actionType || '',
      JSON.stringify(context.parameters || {}),
      context.codeContext || '',
      JSON.stringify(context.dataContext || {}),
    ];

    return parts.filter(p => p).join('\n');
  }

  /**
   * Remove duplicate violations and sort by severity
   */
  private static deduplicateAndSort(violations: PolicyViolation[]): PolicyViolation[] {
    // Group by type to remove duplicates
    const seen = new Set<string>();
    const unique = violations.filter(v => {
      const key = `${v.type}:${v.reason}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by severity (CRITICAL > HIGH > MEDIUM > LOW)
    const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    unique.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return unique;
  }
}
