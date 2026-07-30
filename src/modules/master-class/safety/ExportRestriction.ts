/**
 * EXPORT RESTRICTION POLICY
 *
 * Sprint 1: Skeleton
 * Semantic policy gate preventing stem export while allowing lesson PDF export
 *
 * Integrates with Action Authority PolicyEngine to enforce governance at execution time.
 * This is the critical safety layer that transforms the "theft tool" into a "tuition tool."
 *
 * Version: 1.0.0
 * Date: January 4, 2026
 */

import { PolicyEngine } from '../../../action-authority/governance/semantic/PolicyEngine';
import { buildSemanticContext } from '../../../action-authority/governance/semantic/utils';
import type { PolicyResult, PolicyViolationType } from '../../../action-authority/governance/semantic/types';

/**
 * Export types that can be restricted
 */
export type ExportFormat = 'STEMS' | 'MIDI' | 'PDF' | 'AUDIO_BUFFER';

/**
 * Export request context
 */
export interface ExportRequest {
  lessonId: string;
  userId: string;
  format: ExportFormat;
  stems?: ('vocals' | 'drums' | 'bass' | 'other')[];
  timestamp: number;
}

/**
 * Export restriction policy configuration
 */
export const EXPORT_RESTRICTION_POLICY: Record<ExportFormat, {
  allowed: boolean;
  reason: string;
  violationType: PolicyViolationType;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}> = {
  STEMS: {
    allowed: false,
    reason: 'Stem export blocked - copyright protection. Use Master Class mode for learning.',
    violationType: 'EXTERNAL_API_CALL' as PolicyViolationType, // Using existing type, represents "unauthorized access"
    severity: 'CRITICAL',
  },
  AUDIO_BUFFER: {
    allowed: false,
    reason: 'Direct audio buffer access blocked - prevents unauthorized extraction.',
    violationType: 'PRODUCTION_DATA_MODIFICATION' as PolicyViolationType,
    severity: 'CRITICAL',
  },
  MIDI: {
    allowed: false,
    reason: 'MIDI export blocked - reserved for future premium features.',
    violationType: 'PII_EXPOSURE' as PolicyViolationType, // Using existing type to represent "unauthorized access"
    severity: 'HIGH',
  },
  PDF: {
    allowed: true,
    reason: 'PDF export allowed - promotes learning and sharing of practice progress.',
    violationType: 'CUSTOM_RULE' as PolicyViolationType,
    severity: 'LOW',
  },
};

/**
 * ExportRestrictionManager
 *
 * Enforces export restrictions via semantic policy.
 * Acts as a governance gate between user intent and system execution.
 */
export class ExportRestrictionManager {
  /**
   * Check if an export is allowed
   *
   * This is the critical safety gate. It blocks stem export at the governance layer,
   * preventing circumvention at the UI level.
   *
   * @param request - Export request with format and metadata
   * @returns {allowed: boolean, reason: string, policyResult?: PolicyResult}
   */
  public static checkExportAllowed(
    request: ExportRequest
  ): { allowed: boolean; reason: string; policyResult?: PolicyResult } {
    try {
      // Build semantic context for this export request
      const context = buildSemanticContext({
        id: `export-${request.lessonId}-${request.timestamp}`,
        type: 'EXPORT_REQUEST',
        data: {
          lessonId: request.lessonId,
          userId: request.userId,
          format: request.format,
          stems: request.stems,
          timestamp: request.timestamp,
        },
      });

      // Evaluate against policy engine
      const policyResult = PolicyEngine.evaluate(context);

      // Determine if export is allowed based on policy
      const policy = EXPORT_RESTRICTION_POLICY[request.format];

      if (!policyResult.isValid) {
        // Policy violation - block the export
        return {
          allowed: false,
          reason: policyResult.reason || policy.reason,
          policyResult,
        };
      }

      // Additional application-level check
      if (!policy.allowed) {
        return {
          allowed: false,
          reason: policy.reason,
        };
      }

      // Export is allowed
      return {
        allowed: true,
        reason: policy.reason,
      };
    } catch (error) {
      // Fail-safe: block on error
      console.error('[ExportRestrictionManager] Error evaluating export policy:', error);

      return {
        allowed: false,
        reason: 'Export check failed - blocking for safety',
      };
    }
  }

  /**
   * Log an export attempt for forensic trail
   */
  public static logExportAttempt(
    request: ExportRequest,
    allowed: boolean,
    reason: string
  ): void {
    const logLevel = allowed ? 'info' : 'warn';

    console.log(`[ExportRestrictionManager:EXPORT_${allowed ? 'ALLOWED' : 'BLOCKED'}]`, {
      lessonId: request.lessonId,
      userId: request.userId,
      format: request.format,
      allowed,
      reason,
      timestamp: request.timestamp,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    });

    // In production, this would write to ForensicAuditLog
    // For now, it's available in browser console
  }

  /**
   * Get list of allowed export formats for a lesson
   */
  public static getAllowedFormats(): ExportFormat[] {
    return Object.entries(EXPORT_RESTRICTION_POLICY)
      .filter(([_, policy]) => policy.allowed)
      .map(([format]) => format as ExportFormat);
  }

  /**
   * Get list of blocked export formats
   */
  public static getBlockedFormats(): ExportFormat[] {
    return Object.entries(EXPORT_RESTRICTION_POLICY)
      .filter(([_, policy]) => !policy.allowed)
      .map(([format]) => format as ExportFormat);
  }

  /**
   * Validate that stems cannot be extracted
   *
   * Additional security check to ensure individual stem access is blocked
   */
  public static validateStemIsolationAllowed(
    lessonId: string,
    userId: string,
    instrument: 'vocals' | 'drums' | 'bass' | 'other'
  ): { allowed: boolean; reason: string } {
    // Stem isolation for LISTENING is allowed (focus mode)
    // Stem extraction is not (checked by checkExportAllowed)

    // For now, allow stem listening/focus mode
    return {
      allowed: true,
      reason: `${instrument} focus mode enabled - for learning only. Export is restricted.`,
    };
  }

  /**
   * Create a safe PDF export without stems
   *
   * This demonstrates how to create an allowed export format.
   * The PDF should include:
   * - Sheet music/tablature
   * - Learning paths and coaching tips
   * - Metadata about the lesson
   *
   * But NOT include:
   * - Individual audio stems
   * - Audio buffers
   * - Raw frequency data
   */
  public static createSafePdfExportManifest(lessonId: string, userId: string): {
    safeToExport: boolean;
    includedContent: string[];
    excludedContent: string[];
  } {
    return {
      safeToExport: true,
      includedContent: [
        'Sheet music notation',
        'Tablature (if available)',
        'Chord progression',
        'Learning paths',
        'AI coaching tips',
        'Practice exercises',
        'Lesson metadata (title, key, tempo)',
      ],
      excludedContent: [
        'Individual audio stems',
        'Audio buffers',
        'Frequency domain data',
        'MIDI note data (protected)',
        'Spectrogram data',
        'Raw waveform samples',
      ],
    };
  }

  /**
   * Enforce export restriction at the data level
   *
   * Even if UI controls are bypassed, this sanitizes the export data
   */
  public static sanitizeExportData(
    data: any,
    format: ExportFormat
  ): any {
    if (format === 'STEMS' || format === 'AUDIO_BUFFER') {
      // Remove all audio data
      const sanitized = { ...data };
      delete sanitized.stems;
      delete sanitized.audioBuffer;
      delete sanitized.waveform;
      delete sanitized.spectrogram;
      delete sanitized.midiData;
      return sanitized;
    }

    if (format === 'MIDI') {
      // MIDI data is protected in Sprint 1
      const sanitized = { ...data };
      delete sanitized.midiData;
      return sanitized;
    }

    if (format === 'PDF') {
      // PDF is allowed - return visualization-safe data
      return {
        title: data.title || 'Lesson',
        audioMetadata: data.audioMetadata,
        visualizations: data.visualizations,
        learningPaths: data.learningPaths,
        metadata: data.metadata,
        // Exclude stem analysis
      };
    }

    return data;
  }
}

/**
 * Semantic policy rule for export restrictions
 *
 * This would be added to the PolicyEngine configuration in production.
 * For Sprint 1, it's defined here as documentation.
 */
export const EXPORT_RESTRICTION_SEMANTIC_RULE = {
  id: 'master-class.export-restriction',
  name: 'Master Class Export Restriction',
  description: 'Blocks unauthorized export of audio stems while allowing lesson PDF export',
  checkFields: ['parameters', 'data'],
  patterns: [
    {
      // Block stem export attempts
      pattern: 'format.*STEMS|export.*stem|buffer.*audio|waveform.*download',
      severity: 'CRITICAL',
      reason: 'Stem export blocked - use Master Class learning mode instead',
    },
    {
      // Block MIDI export in Sprint 1
      pattern: 'format.*MIDI|midi.*export|midi.*download',
      severity: 'HIGH',
      reason: 'MIDI export reserved for future releases',
    },
  ],
  enabled: true,
};

/**
 * Integration helper for PolicyEngine
 */
export function initializeExportRestrictionPolicy(): void {
  try {
    // Ensure PolicyEngine is initialized
    const config = PolicyEngine.getConfig();
    console.log('[ExportRestrictionManager] PolicyEngine ready');
  } catch {
    // PolicyEngine not initialized - caller should have done this
    console.warn('[ExportRestrictionManager] PolicyEngine not initialized');
  }
}
