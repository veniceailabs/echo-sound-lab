import type { ABVariant } from '../types';

const ASSIGNMENT_KEY_PREFIX = 'echo.ab.variant.assignment.v1';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function assignmentKey(experimentId: string): string {
  return `${ASSIGNMENT_KEY_PREFIX}.${experimentId}`;
}

function safeReadNumber(key: string): number {
  if (!isBrowser()) return 0;
  try {
    return Number.parseInt(window.localStorage.getItem(key) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function safeWriteNumber(key: string, value: number): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // ignore storage failures in private mode / low quota environments
  }
}

function pickStickyVariant(experimentId: string, variants: ABVariant[]): ABVariant {
  if (variants.length === 0) {
    throw new Error('abVariantService.pickStickyVariant requires at least one variant');
  }

  if (!isBrowser()) {
    return variants[0];
  }

  const key = assignmentKey(experimentId);
  const stored = window.localStorage.getItem(key) as ABVariant | null;
  if (stored && variants.includes(stored)) {
    return stored;
  }

  const chosen = variants[Math.floor(Math.random() * variants.length)];
  try {
    window.localStorage.setItem(key, chosen);
  } catch {
    // ignore storage failures
  }
  return chosen;
}

function recordEvent(eventName: string, increment = 1): number {
  const key = `echo.events.${eventName}`;
  const next = safeReadNumber(key) + increment;
  safeWriteNumber(key, next);
  return next;
}

function getEventCount(eventName: string): number {
  return safeReadNumber(`echo.events.${eventName}`);
}

function clearExperiment(experimentId: string): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(assignmentKey(experimentId));
  } catch {
    // ignore
  }
}

export const abVariantService = {
  pickStickyVariant,
  recordEvent,
  getEventCount,
  clearExperiment,
};

export type ABVariantService = typeof abVariantService;
