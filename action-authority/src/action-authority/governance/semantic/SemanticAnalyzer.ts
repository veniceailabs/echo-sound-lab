/**
 * Semantic Analyzer: Pattern Matching Engine
 *
 * Analyzes action semantic context for policy violations using
 * rule-based pattern matching. Implements three core policies:
 * - PII Detection (emails, SSNs, phone numbers, credit cards)
 * - External API Detection (HTTP calls, fetch/axios, WebSocket)
 * - Production Data Protection (DELETE/DROP with prod markers)
 */

import {
  PolicyViolation,
  PolicyViolationType,
  PolicySeverity,
  PolicyRule,
  SemanticContext,
  PatternMatch,
} from './types';

export class SemanticAnalyzer {
  /**
   * PII Detection Patterns
   * Matches common personally identifiable information
   */
  private static readonly PII_PATTERNS = Object.freeze({
    email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
    phone: /\b(\+\d{1,2}\s?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
    creditCard: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  });

  /**
   * External API Detection Patterns
   * Matches external service calls and HTTP connections
   */
  private static readonly API_PATTERNS = Object.freeze({
    externalUrl: /https?:\/\/(?!localhost|127\.0\.0\.1|::1|0\.0\.0\.0)[^\s"'<>]+/gi,
    apiLibrary: /(fetch|axios|request|http\.get|http\.post|xmlhttprequest)/gi,
    webSocket: /wss?:\/\/(?!localhost|127\.0\.0\.1|::1)[^\s"'<>]+/gi,
  });

  /**
   * Production Data Modification Patterns
   * Matches destructive operations with production markers
   */
  private static readonly DESTRUCTIVE_PATTERNS = Object.freeze({
    destructive: /(delete|drop|truncate|destroy|remove)\s+(?:from|table|database)/gi,
    production: /(production|prod|live|staging[^-])/gi,
  });

  /**
   * Main analysis method
   * Evaluates semantic context against all policies
   * Returns frozen array of violations
   */
  static analyze(
    context: SemanticContext,
    customRules: ReadonlyArray<PolicyRule>,
  ): ReadonlyArray<PolicyViolation> {
    const violations: PolicyViolation[] = [];

    // 1. Check core PII detection policy
    const piiViolation = this.checkPIIExposure(context);
    if (piiViolation) violations.push(piiViolation);

    // 2. Check core External API detection policy
    const apiViolation = this.checkExternalAPI(context);
    if (apiViolation) violations.push(apiViolation);

    // 3. Check core Production Data Protection policy
    const prodViolation = this.checkProductionData(context);
    if (prodViolation) violations.push(prodViolation);

    // 4. Check custom rules
    for (const rule of customRules) {
      if (!rule.enabled) continue;

      // Check if action type is exempt from this rule
      if (rule.exemptions?.includes(context.actionType)) {
        continue;
      }

      const customViolation = this.checkCustomRule(context, rule);
      if (customViolation) violations.push(customViolation);
    }

    // Return frozen array
    return Object.freeze(violations);
  }

  /**
   * PII Exposure Check
   * Detects emails, SSNs, phone numbers, credit cards in action data
   */
  private static checkPIIExposure(context: SemanticContext): PolicyViolation | null {
    const matches: PatternMatch[] = [];

    // Check parameters for PII
    const parametersText = JSON.stringify(context.parameters);

    // Email detection
    const emailMatches = this.extractMatches(parametersText, this.PII_PATTERNS.email);
    matches.push(
      ...emailMatches.map((m) => ({
        ...m,
        confidence: 0.95, // High confidence for email pattern
      })),
    );

    // SSN detection
    const ssnMatches = this.extractMatches(parametersText, this.PII_PATTERNS.ssn);
    matches.push(
      ...ssnMatches.map((m) => ({
        ...m,
        confidence: 0.90,
      })),
    );

    // Phone number detection
    const phoneMatches = this.extractMatches(parametersText, this.PII_PATTERNS.phone);
    matches.push(
      ...phoneMatches.map((m) => ({
        ...m,
        confidence: 0.85, // Medium-high confidence (false positives possible)
      })),
    );

    // Credit card detection
    const ccMatches = this.extractMatches(parametersText, this.PII_PATTERNS.creditCard);
    matches.push(
      ...ccMatches.map((m) => ({
        ...m,
        confidence: 0.80, // Medium confidence (could be fake/test data)
      })),
    );

    if (matches.length === 0) return null;

    return Object.freeze({
      type: PolicyViolationType.PII_EXPOSURE,
      severity: PolicySeverity.CRITICAL,
      reason: `Personally identifiable information (PII) detected in action parameters: ${
        matches.length
      } match(es) found (${
        matches
          .slice(0, 3)
          .map((m) => m.pattern)
          .join(', ')
      }${matches.length > 3 ? ', ...' : ''})`,
      matches: Object.freeze(matches),
      suggestedFix: 'Remove personal data from action parameters or use anonymized/tokenized values',
      timestamp: Date.now(),
    });
  }

  /**
   * External API Detection
   * Detects HTTP calls, fetch/axios usage, WebSocket connections to external services
   */
  private static checkExternalAPI(context: SemanticContext): PolicyViolation | null {
    const matches: PatternMatch[] = [];

    const contextText = JSON.stringify({
      parameters: context.parameters,
      codeContext: context.codeContext,
    });

    // External URL detection
    const urlMatches = this.extractMatches(contextText, this.API_PATTERNS.externalUrl);
    matches.push(
      ...urlMatches.map((m) => ({
        ...m,
        pattern: 'external-url',
        confidence: 0.95,
      })),
    );

    // API library detection
    const libraryMatches = this.extractMatches(contextText, this.API_PATTERNS.apiLibrary);
    matches.push(
      ...libraryMatches.map((m) => ({
        ...m,
        pattern: 'api-library-call',
        confidence: 0.90,
      })),
    );

    // WebSocket detection
    const wsMatches = this.extractMatches(contextText, this.API_PATTERNS.webSocket);
    matches.push(
      ...wsMatches.map((m) => ({
        ...m,
        pattern: 'websocket-external',
        confidence: 0.95,
      })),
    );

    if (matches.length === 0) return null;

    return Object.freeze({
      type: PolicyViolationType.EXTERNAL_API_CALL,
      severity: PolicySeverity.HIGH,
      reason: `External API call detected: ${matches.length} indicator(s) found - ${
        matches
          .slice(0, 2)
          .map((m) => m.matched)
          .join(', ')
      }${matches.length > 2 ? ', ...' : ''}`,
      matches: Object.freeze(matches),
      suggestedFix:
        'Use authorized internal APIs or obtain security approval for external service calls',
      timestamp: Date.now(),
    });
  }

  /**
   * Production Data Protection
   * Detects destructive operations (DELETE, DROP) on production databases
   */
  private static checkProductionData(context: SemanticContext): PolicyViolation | null {
    const matches: PatternMatch[] = [];

    const contextText = JSON.stringify({
      parameters: context.parameters,
      codeContext: context.codeContext,
    });

    // Check for destructive operations
    const destructiveMatches = this.extractMatches(contextText, this.DESTRUCTIVE_PATTERNS.destructive);

    if (destructiveMatches.length === 0) return null;

    // Confirm with production markers
    const productionMarkers = this.extractMatches(contextText, this.DESTRUCTIVE_PATTERNS.production);

    if (productionMarkers.length === 0) return null; // Destructive op on non-prod is OK

    // Both destructive + prod markers present = violation
    matches.push(...destructiveMatches);
    matches.push(...productionMarkers);

    return Object.freeze({
      type: PolicyViolationType.PRODUCTION_DATA_MODIFICATION,
      severity: PolicySeverity.CRITICAL,
      reason: `Destructive operation on production database detected: ${destructiveMatches
        .map((m) => m.matched)
        .join(', ')} on ${productionMarkers.map((m) => m.matched).join(', ')}`,
      matches: Object.freeze(matches),
      suggestedFix:
        'Double-check this is intentional. Consider testing on staging database first',
      timestamp: Date.now(),
    });
  }

  /**
   * Custom Rule Check
   * Evaluates user-defined patterns against semantic context
   */
  private static checkCustomRule(
    context: SemanticContext,
    rule: PolicyRule,
  ): PolicyViolation | null {
    const matches: PatternMatch[] = [];

    for (const patternDef of rule.patterns) {
      try {
        // Build regex with flags
        const regex = new RegExp(patternDef.regex, patternDef.flags || 'g');

        // Determine what to search based on field specification
        let searchText = JSON.stringify(context.parameters);

        if (patternDef.field) {
          const fieldValue = this.getFieldValue(context, patternDef.field);
          searchText = String(fieldValue);
        }

        // Extract matches
        const patternMatches = this.extractMatches(searchText, regex);
        matches.push(
          ...patternMatches.map((m) => ({
            ...m,
            pattern: `custom-rule:${rule.id}`,
            confidence: 0.85, // User-defined patterns have moderate confidence
          })),
        );
      } catch (error) {
        // Invalid regex pattern - log but don't crash
        console.error(`Invalid regex in rule ${rule.id}: ${patternDef.regex}`, error);
        continue;
      }
    }

    if (matches.length === 0) return null;

    return Object.freeze({
      type: rule.type,
      severity: rule.severity,
      reason: `Custom policy rule violated: ${rule.name} - ${rule.description}`,
      matches: Object.freeze(matches),
      suggestedFix: rule.description,
      timestamp: Date.now(),
    });
  }

  /**
   * Extract regex matches with location information
   */
  private static extractMatches(text: string, pattern: RegExp): PatternMatch[] {
    const matches: PatternMatch[] = [];

    // Timeout protection: limit iterations
    const maxIterations = 1000;
    let iterations = 0;

    try {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null && iterations < maxIterations) {
        iterations++;
        matches.push({
          pattern: pattern.source,
          matched: match[0],
          location: {
            column: match.index,
          },
          confidence: 0.85, // Default confidence
        });

        // Prevent infinite loop for empty matches
        if (match[0].length === 0) {
          pattern.lastIndex++;
        }
      }
    } catch (error) {
      console.error('Error executing pattern match:', error);
    }

    // Enforce timeout: if we hit max iterations, it's suspicious
    if (iterations >= maxIterations) {
      console.warn('Pattern matching timeout: max iterations exceeded');
      // Return what we have so far
    }

    return matches;
  }

  /**
   * Get nested field value from context using dot notation
   * e.g., "parameters.email" or "codeContext.apis[0]"
   */
  private static getFieldValue(context: SemanticContext, fieldPath: string): unknown {
    const parts = fieldPath.split('.');
    let current: any = context;

    for (const part of parts) {
      if (current == null) return null;
      current = current[part];
    }

    return current;
  }
}
