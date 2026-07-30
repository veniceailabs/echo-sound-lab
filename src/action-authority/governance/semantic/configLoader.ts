/**
 * CONFIGURATION LOADER
 *
 * Loads policy configurations from JSON files
 * Validates against schema
 * Provides error handling and fallback
 */

import fs from 'fs';
import path from 'path';
import { PolicyConfig } from './types';
import { getDefaultPolicyConfig } from './defaultConfig';
import { deepFreeze } from './utils';

/**
 * Simplified JSON schema validator
 * Validates basic structure without external dependencies
 */
function validateConfigStructure(config: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config || typeof config !== 'object') {
    errors.push('Configuration must be an object');
    return { valid: false, errors };
  }

  const cfg = config as Record<string, unknown>;

  // Check required fields
  if (!cfg.version || typeof cfg.version !== 'string') {
    errors.push('Missing required field: version (must be string)');
  }

  if (!cfg.coreRules || typeof cfg.coreRules !== 'object') {
    errors.push('Missing required field: coreRules (must be object)');
  } else {
    const coreRules = cfg.coreRules as Record<string, unknown>;
    if (typeof coreRules.piiDetection !== 'boolean') {
      errors.push('coreRules.piiDetection must be boolean');
    }
    if (typeof coreRules.externalApiDetection !== 'boolean') {
      errors.push('coreRules.externalApiDetection must be boolean');
    }
    if (typeof coreRules.productionDataProtection !== 'boolean') {
      errors.push('coreRules.productionDataProtection must be boolean');
    }
  }

  // Validate custom rules if present
  if (cfg.customRules && Array.isArray(cfg.customRules)) {
    for (let i = 0; i < cfg.customRules.length; i++) {
      const rule = cfg.customRules[i];
      if (!rule || typeof rule !== 'object') {
        errors.push(`customRules[${i}] must be an object`);
        continue;
      }

      const r = rule as Record<string, unknown>;
      if (!r.id || typeof r.id !== 'string') {
        errors.push(`customRules[${i}] missing required field: id`);
      }
      if (!r.pattern || typeof r.pattern !== 'string') {
        errors.push(`customRules[${i}] missing required field: pattern`);
      }
      if (!r.enabled || typeof r.enabled !== 'boolean') {
        errors.push(`customRules[${i}] missing required field: enabled`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load policy configuration from JSON file
 * Returns default config if file doesn't exist or is invalid
 *
 * @param filePath - Path to JSON config file
 * @returns Validated, frozen PolicyConfig object
 */
export function loadPolicyConfig(filePath: string): PolicyConfig {
  try {
    // Resolve absolute path
    const absolutePath = path.resolve(filePath);

    // Check file exists
    if (!fs.existsSync(absolutePath)) {
      console.warn(`[ConfigLoader] Config file not found: ${absolutePath}`);
      console.warn('[ConfigLoader] Using default configuration');
      return deepFreeze(getDefaultPolicyConfig());
    }

    // Read file
    const fileContent = fs.readFileSync(absolutePath, 'utf-8');

    // Parse JSON
    let config: unknown;
    try {
      config = JSON.parse(fileContent);
    } catch (parseError) {
      console.error(
        '[ConfigLoader] Failed to parse JSON:',
        parseError instanceof Error ? parseError.message : String(parseError)
      );
      console.warn('[ConfigLoader] Using default configuration');
      return deepFreeze(getDefaultPolicyConfig());
    }

    // Validate structure
    const validation = validateConfigStructure(config);
    if (!validation.valid) {
      console.error('[ConfigLoader] Configuration validation failed:');
      validation.errors.forEach(err => console.error(`  - ${err}`));
      console.warn('[ConfigLoader] Using default configuration');
      return deepFreeze(getDefaultPolicyConfig());
    }

    // Merge with defaults (user config overrides defaults)
    const mergedConfig = mergeWithDefaults(config as Record<string, unknown>);

    // Freeze and return
    return deepFreeze(mergedConfig);
  } catch (error) {
    console.error(
      '[ConfigLoader] Unexpected error loading config:',
      error instanceof Error ? error.message : String(error)
    );
    console.warn('[ConfigLoader] Using default configuration');
    return deepFreeze(getDefaultPolicyConfig());
  }
}

/**
 * Merge user config with defaults
 * User config takes precedence
 */
function mergeWithDefaults(userConfig: Record<string, unknown>): PolicyConfig {
  const defaults = getDefaultPolicyConfig();

  return {
    version: String(userConfig.version) || defaults.version,
    coreRules: {
      piiDetection:
        typeof userConfig.coreRules === 'object' &&
        userConfig.coreRules &&
        'piiDetection' in userConfig.coreRules
          ? (userConfig.coreRules as Record<string, unknown>).piiDetection === true
          : defaults.coreRules.piiDetection,
      externalApiDetection:
        typeof userConfig.coreRules === 'object' &&
        userConfig.coreRules &&
        'externalApiDetection' in userConfig.coreRules
          ? (userConfig.coreRules as Record<string, unknown>).externalApiDetection === true
          : defaults.coreRules.externalApiDetection,
      productionDataProtection:
        typeof userConfig.coreRules === 'object' &&
        userConfig.coreRules &&
        'productionDataProtection' in userConfig.coreRules
          ? (userConfig.coreRules as Record<string, unknown>).productionDataProtection === true
          : defaults.coreRules.productionDataProtection,
    },
    customRules: Array.isArray(userConfig.customRules)
      ? (userConfig.customRules as unknown[]).map(rule => ({
          id: String((rule as Record<string, unknown>).id || ''),
          name: String((rule as Record<string, unknown>).name || ''),
          checkFields: Array.isArray((rule as Record<string, unknown>).checkFields)
            ? ((rule as Record<string, unknown>).checkFields as string[])
            : [],
          pattern: String((rule as Record<string, unknown>).pattern || ''),
          violationType: String((rule as Record<string, unknown>).violationType || 'CUSTOM_RULE'),
          severity: String((rule as Record<string, unknown>).severity || 'MEDIUM'),
          reason: String((rule as Record<string, unknown>).reason || ''),
          suggestedFix: String((rule as Record<string, unknown>).suggestedFix || ''),
          enabled: (rule as Record<string, unknown>).enabled === true,
        }))
      : defaults.customRules,
    exemptions:
      typeof userConfig.exemptions === 'object' && userConfig.exemptions
        ? (userConfig.exemptions as Record<string, string[]>)
        : defaults.exemptions,
    performance: {
      timeoutMs:
        typeof (userConfig.performance as Record<string, unknown> | undefined)?.timeoutMs ===
        'number'
          ? ((userConfig.performance as Record<string, unknown>).timeoutMs as number)
          : defaults.performance.timeoutMs,
      maxPatternComplexity:
        typeof (userConfig.performance as Record<string, unknown> | undefined)
          ?.maxPatternComplexity === 'number'
          ? ((userConfig.performance as Record<string, unknown>).maxPatternComplexity as number)
          : defaults.performance.maxPatternComplexity,
      cacheMaxSize:
        typeof (userConfig.performance as Record<string, unknown> | undefined)?.cacheMaxSize ===
        'number'
          ? ((userConfig.performance as Record<string, unknown>).cacheMaxSize as number)
          : defaults.performance.cacheMaxSize,
    },
    logging: {
      logEvaluations:
        (userConfig.logging as Record<string, unknown> | undefined)?.logEvaluations === true
          ? true
          : (userConfig.logging as Record<string, unknown> | undefined)?.logEvaluations === false
            ? false
            : defaults.logging.logEvaluations,
      logViolationsOnly:
        (userConfig.logging as Record<string, unknown> | undefined)?.logViolationsOnly === true
          ? true
          : (userConfig.logging as Record<string, unknown> | undefined)?.logViolationsOnly === false
            ? false
            : defaults.logging.logViolationsOnly,
      logErrors:
        (userConfig.logging as Record<string, unknown> | undefined)?.logErrors === true
          ? true
          : (userConfig.logging as Record<string, unknown> | undefined)?.logErrors === false
            ? false
            : defaults.logging.logErrors,
    },
  };
}

/**
 * Get config file path from environment or default
 */
export function getDefaultConfigPath(): string {
  const envPath = process.env.POLICY_CONFIG_PATH;
  if (envPath) {
    return envPath;
  }

  // Default to config directory
  return path.join(process.cwd(), 'config', 'semantic-policies.json');
}

/**
 * Load config from default location
 */
export function loadDefaultConfig(): PolicyConfig {
  return loadPolicyConfig(getDefaultConfigPath());
}
