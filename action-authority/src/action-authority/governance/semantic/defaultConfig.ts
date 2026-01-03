/**
 * Default Policy Configuration
 *
 * Core policies (PII Detection, External API Detection, Production Data Protection)
 * These are built-in and cannot be disabled, but can be overridden via config.
 *
 * Example custom rule for AWS API key detection is included.
 */

import { PolicyConfig, PolicyViolationType, PolicySeverity } from './types';

export const DEFAULT_POLICY_CONFIG: PolicyConfig = Object.freeze({
  version: '1.0.0',
  customRules: Object.freeze([
    {
      id: 'aws-api-key-exposure',
      name: 'AWS API Key Exposure',
      description: 'Detects exposed AWS access keys in action parameters',
      type: PolicyViolationType.PII_EXPOSURE,
      severity: PolicySeverity.CRITICAL,
      enabled: true,
      patterns: Object.freeze([
        {
          regex: 'AKIA[0-9A-Z]{16}',
          flags: 'g',
        },
      ]),
    } as const,
  ]) as ReadonlyArray<any>,
  coreRulesOverrides: Object.freeze({
    piiDetection: { enabled: true },
    externalApiDetection: { enabled: true },
    productionDataProtection: { enabled: true },
  }) as const,
}) as unknown as PolicyConfig;
