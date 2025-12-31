/**
 * EQ Settings Persistence
 * Manages localStorage for saving and loading EQ settings
 */

import { EQSettings, DynamicEQConfig } from '../types';

const EQ_STORAGE_KEY = 'echo_eq_settings';
const DYNAMIC_EQ_STORAGE_KEY = 'echo_dynamic_eq_settings';

/**
 * Save EQ settings to localStorage
 */
export function saveEQSettings(eqSettings: EQSettings): void {
  try {
    localStorage.setItem(EQ_STORAGE_KEY, JSON.stringify(eqSettings));
  } catch (error) {
    console.warn('[EQPersistence] Failed to save EQ settings:', error);
  }
}

/**
 * Load EQ settings from localStorage
 */
export function loadEQSettings(): EQSettings | null {
  try {
    const saved = localStorage.getItem(EQ_STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as EQSettings;
  } catch (error) {
    console.warn('[EQPersistence] Failed to load EQ settings:', error);
    return null;
  }
}

/**
 * Save Dynamic EQ settings to localStorage
 */
export function saveDynamicEQSettings(dynamicEQ: DynamicEQConfig): void {
  try {
    localStorage.setItem(DYNAMIC_EQ_STORAGE_KEY, JSON.stringify(dynamicEQ));
  } catch (error) {
    console.warn('[EQPersistence] Failed to save Dynamic EQ settings:', error);
  }
}

/**
 * Load Dynamic EQ settings from localStorage
 */
export function loadDynamicEQSettings(): DynamicEQConfig | null {
  try {
    const saved = localStorage.getItem(DYNAMIC_EQ_STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as DynamicEQConfig;
  } catch (error) {
    console.warn('[EQPersistence] Failed to load Dynamic EQ settings:', error);
    return null;
  }
}

/**
 * Clear all EQ settings from localStorage
 */
export function clearEQSettings(): void {
  try {
    localStorage.removeItem(EQ_STORAGE_KEY);
    localStorage.removeItem(DYNAMIC_EQ_STORAGE_KEY);
  } catch (error) {
    console.warn('[EQPersistence] Failed to clear EQ settings:', error);
  }
}
