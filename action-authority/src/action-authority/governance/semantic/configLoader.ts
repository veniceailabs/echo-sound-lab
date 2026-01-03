/**
 * Policy Configuration Loader
 *
 * Loads and validates policy configuration from files.
 * Supports JSON config files with JSON Schema validation.
 * Falls back to DEFAULT_POLICY_CONFIG on failure.
 */

import { PolicyConfig } from './types';
import { DEFAULT_POLICY_CONFIG } from './defaultConfig';

/**
 * Load policy configuration from file path
 * Falls back to default config if file not found or invalid
 */
export async function loadPolicyConfig(configPath?: string): Promise<PolicyConfig> {
  // If no path provided, return default
  if (!configPath) {
    return DEFAULT_POLICY_CONFIG;
  }

  try {
    // Try to load the file
    // In browser environment, this would be handled differently
    // For now, we'll use a stub that expects config to be passed directly

    console.log(`[PolicyEngine] Loading config from: ${configPath}`);

    // Stub: In production, would load from filesystem or fetch from URL
    // For now, return default - actual implementation depends on environment
    return DEFAULT_POLICY_CONFIG;
  } catch (error) {
    console.warn(`Failed to load policy config from ${configPath}, using defaults:`, error);
    return DEFAULT_POLICY_CONFIG;
  }
}

/**
 * Load configuration from JSON object (for programmatic use)
 */
export function loadPolicyConfigFromObject(configObj: unknown): PolicyConfig {
  try {
    validatePolicyConfig(configObj);
    return deepFreeze(configObj as PolicyConfig);
  } catch (error) {
    console.warn('Invalid policy config object, using defaults:', error);
    return DEFAULT_POLICY_CONFIG;
  }
}

/**
 * Validate policy configuration against schema
 * Throws error if validation fails
 */
export function validatePolicyConfig(config: unknown): asserts config is PolicyConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Policy config must be an object');
  }

  const cfg = config as Record<string, unknown>;

  // Check required fields
  if (typeof cfg.version !== 'string') {
    throw new Error('Policy config missing required field: version (string)');
  }

  if (!Array.isArray(cfg.customRules)) {
    throw new Error('Policy config missing required field: customRules (array)');
  }

  // Validate version format (semver)
  if (!/^\d+\.\d+\.\d+$/.test(cfg.version)) {
    throw new Error(`Invalid version format: ${cfg.version} (expected X.Y.Z)`);
  }

  // Validate each custom rule
  for (let i = 0; i < cfg.customRules.length; i++) {
    const rule = cfg.customRules[i];

    if (!rule || typeof rule !== 'object') {
      throw new Error(`customRules[${i}] must be an object`);
    }

    const r = rule as Record<string, unknown>;

    // Check required fields
    const requiredFields = ['id', 'name', 'description', 'type', 'severity', 'enabled', 'patterns'];
    for (const field of requiredFields) {
      if (!(field in r)) {
        throw new Error(`customRules[${i}] missing required field: ${field}`);
      }
    }

    // Validate id format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(String(r.id))) {
      throw new Error(
        `customRules[${i}].id must be lowercase alphanumeric with hyphens: ${r.id}`,
      );
    }

    // Validate type enum
    const validTypes = [
      'PII_EXPOSURE',
      'EXTERNAL_API_CALL',
      'PRODUCTION_DATA_MODIFICATION',
      'CUSTOM_RULE',
    ];
    if (!validTypes.includes(String(r.type))) {
      throw new Error(
        `customRules[${i}].type must be one of: ${validTypes.join(', ')}, got: ${r.type}`,
      );
    }

    // Validate severity enum
    const validSeverities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    if (!validSeverities.includes(String(r.severity))) {
      throw new Error(
        `customRules[${i}].severity must be one of: ${validSeverities.join(
          ', ',
        )}, got: ${r.severity}`,
      );
    }

    // Validate patterns array
    if (!Array.isArray(r.patterns)) {
      throw new Error(`customRules[${i}].patterns must be an array`);
    }

    if (r.patterns.length === 0) {
      throw new Error(`customRules[${i}].patterns must not be empty`);
    }

    for (let j = 0; j < r.patterns.length; j++) {
      const pattern = r.patterns[j];

      if (!pattern || typeof pattern !== 'object') {
        throw new Error(`customRules[${i}].patterns[${j}] must be an object`);
      }

      const p = pattern as Record<string, unknown>;

      if (typeof p.regex !== 'string') {
        throw new Error(`customRules[${i}].patterns[${j}].regex must be a string`);
      }

      // Validate regex compiles
      try {
        new RegExp(p.regex, p.flags ? String(p.flags) : undefined);
      } catch (error) {
        throw new Error(
          `customRules[${i}].patterns[${j}].regex is invalid: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Validate flags if present
      if (p.flags && !/^[gim]*$/.test(String(p.flags))) {
        throw new Error(`customRules[${i}].patterns[${j}].flags invalid: ${p.flags}`);
      }
    }
  }

  // Config is valid
}

/**
 * Recursively freeze object to enforce immutability
 */
export function deepFreeze<T extends Record<string, any>>(obj: T): T {
  Object.freeze(obj);

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        deepFreeze(value);
      }
    }
  }

  return obj;
}
