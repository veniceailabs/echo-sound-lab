/**
 * ESL Capability Adapter
 *
 * Wraps ESL services with CapabilityAuthority enforcement.
 * Three critical integration points:
 * 1. sessionManager.autosave → FILE_WRITE
 * 2. audioProcessingPipeline.processAudio → PARAMETER_ADJUSTMENT
 * 3. batchProcessor.enqueueJob → RENDER_EXPORT
 *
 * Default: DENY. No action executes without explicit capability.
 */

import { CapabilityAuthority } from './CapabilityAuthority';
import { Capability, CapabilityRequest, TextInputFieldType } from './capabilities';
import { ProcessingAction, ProcessingConfig, SessionState } from '../types';

export class ESLCapabilityAdapter {
  constructor(
    private authority: CapabilityAuthority,
    private appId: string
  ) {}

  // =========================================================================
  // SESSION MANAGER WRAPPER
  // =========================================================================

  /**
   * Guard autosave operation.
   * Autosave cannot proceed without FILE_WRITE capability.
   * Typically called every 5 seconds by sessionManager.
   */
  async canAutosave(sessionState: SessionState): Promise<boolean> {
    try {
      this.authority.assertAllowed({
        capability: Capability.FILE_WRITE,
        scope: {
          appId: this.appId,
          resourceIds: ['session:autosave']
        },
        reason: 'Autosave session state'
      });
      return true;
    } catch (e) {
      // Authority denied. Autosave is halted.
      // Logger would emit this to audit trail.
      return false;
    }
  }

  /**
   * Explicit save (user-initiated or programmatic).
   * Requires FILE_WRITE + may require ACC if configured.
   */
  async guardSaveSession(sessionState: SessionState): Promise<CapabilityRequest> {
    return {
      capability: Capability.FILE_WRITE,
      scope: {
        appId: this.appId,
        resourceIds: ['session:explicit-save']
      },
      reason: `Save session: ${sessionState.fileName || 'untitled'}`
    };
  }

  // =========================================================================
  // AUDIO PROCESSING PIPELINE WRAPPER
  // =========================================================================

  /**
   * Guard parameter adjustment (e.g., EQ slider change).
   * Low-risk, usually allowed. But checked for side-effects.
   */
  async canAdjustParameter(
    parameterId: string,
    newValue: number
  ): Promise<boolean> {
    try {
      this.authority.assertAllowed({
        capability: Capability.PARAMETER_ADJUSTMENT,
        scope: {
          appId: this.appId,
          resourceIds: [parameterId]
        },
        reason: `Adjust parameter: ${parameterId}`
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Guard processing action execution.
   * Each action is reversibility-classified and checked.
   */
  async guardProcessingAction(action: ProcessingAction): Promise<CapabilityRequest> {
    // Reversible actions (EQ, compression, etc.) = PARAMETER_ADJUSTMENT
    if (action.reversibility === 'Fully') {
      return {
        capability: Capability.PARAMETER_ADJUSTMENT,
        scope: {
          appId: this.appId,
          resourceIds: [action.id]
        },
        reason: `Apply reversible action: ${action.description}`
      };
    }

    // Non-reversible actions (bounce, export) = RENDER_EXPORT
    if (action.reversibility === 'Non-Reversible') {
      return {
        capability: Capability.RENDER_EXPORT,
        scope: {
          appId: this.appId,
          resourceIds: [action.id]
        },
        reason: `Apply non-reversible action: ${action.description}`
      };
    }

    // Partial reversibility (rare) = conservative: treat as RENDER_EXPORT
    return {
      capability: Capability.RENDER_EXPORT,
      scope: {
        appId: this.appId,
        resourceIds: [action.id]
      },
      reason: `Apply partially reversible action: ${action.description}`
    };
  }

  // =========================================================================
  // BATCH PROCESSOR WRAPPER (Rule C4: Single-Action ACC Binding)
  // =========================================================================

  /**
   * Guard batch job enqueueing.
   * Rule C4: Each job requires independent FILE_WRITE or RENDER_EXPORT ACC.
   * Cannot batch-enqueue without per-job confirmation.
   */
  async guardBatchJob(
    jobId: string,
    jobType: 'render' | 'export' | 'bounce',
    description: string
  ): Promise<CapabilityRequest> {
    // All batch operations are RENDER_EXPORT (irreversible, background)
    return {
      capability: Capability.RENDER_EXPORT,
      scope: {
        appId: this.appId,
        resourceIds: [`batch:${jobId}`]
      },
      reason: `${jobType.toUpperCase()} — ${description}`
    };
  }

  /**
   * Enforce Rule C4: No implicit batch expansion.
   * If user approves "export to MP3", system cannot silently also export to WAV.
   * Each export must be independently approved.
   */
  guardNoBatchChaining(jobIds: string[]): void {
    if (jobIds.length > 1) {
      throw new Error(
        `[BATCH_CHAINING_DENIED] Rule C4: Cannot enqueue ${jobIds.length} jobs without per-job ACC.\n` +
        `Each job requires independent RENDER_EXPORT approval.`
      );
    }
  }

  // =========================================================================
  // FILE OPERATIONS WRAPPER
  // =========================================================================

  /**
   * Guard file read (open audio, load preset).
   * Generally allowed if FILE_READ capability exists.
   */
  async canReadFile(filePath: string): Promise<boolean> {
    try {
      this.authority.assertAllowed({
        capability: Capability.FILE_READ,
        scope: {
          appId: this.appId,
          resourceIds: [filePath]
        },
        reason: `Read file: ${filePath}`
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Guard file write (save session, export audio).
   * High-risk. Requires FILE_WRITE capability + may require ACC.
   */
  async guardWriteFile(
    filePath: string,
    contentType: string
  ): Promise<CapabilityRequest> {
    // Validate content type (Rule C2: no executable output)
    const executableTypes = ['.sh', '.bash', '.zsh', '.scpt', '.app', '.py', '.js'];
    const isExecutable = executableTypes.some(ext => filePath.endsWith(ext));

    if (isExecutable) {
      throw new Error(
        `[NON_EXECUTABLE_OUTPUT_CONSTRAINT] Rule C2: Cannot write executable file.\n` +
        `File: ${filePath}\n` +
        `Executable output is forbidden regardless of capability.`
      );
    }

    return {
      capability: Capability.FILE_WRITE,
      scope: {
        appId: this.appId,
        resourceIds: [filePath]
      },
      reason: `Write file: ${filePath} (type: ${contentType})`
    };
  }

  // =========================================================================
  // TEXT INPUT WRAPPER (Context-Aware)
  // =========================================================================

  /**
   * Guard text input based on field type (Context Narrowing).
   * TEXT_INPUT_SAFE for names/labels/metadata.
   * TEXT_INPUT_COMMAND for code/terminal/macro (requires explicit grant).
   */
  async canTextInput(
    fieldId: string,
    fieldType: TextInputFieldType = TextInputFieldType.UNKNOWN
  ): Promise<boolean> {
    try {
      // Default to conservative: treat UNKNOWN as COMMAND
      const capabilityNeeded =
        fieldType === TextInputFieldType.SAFE
          ? Capability.TEXT_INPUT_SAFE
          : Capability.TEXT_INPUT_COMMAND;

      this.authority.assertAllowed({
        capability: capabilityNeeded,
        scope: {
          appId: this.appId,
          resourceIds: [fieldId]
        },
        reason: `Text input: ${fieldType || 'unknown field type'}`
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Create a TEXT_INPUT request for the appropriate capability.
   */
  async guardTextInput(
    fieldId: string,
    fieldType: TextInputFieldType = TextInputFieldType.UNKNOWN
  ): Promise<CapabilityRequest> {
    const capabilityNeeded =
      fieldType === TextInputFieldType.SAFE
        ? Capability.TEXT_INPUT_SAFE
        : Capability.TEXT_INPUT_COMMAND;

    return {
      capability: capabilityNeeded,
      scope: {
        appId: this.appId,
        resourceIds: [fieldId]
      },
      reason: `Text input to ${fieldType || 'unknown'} field: ${fieldId}`
    };
  }

  // =========================================================================
  // TRANSPORT CONTROL WRAPPER
  // =========================================================================

  /**
   * Guard playback control (play, pause, stop).
   * Low-risk, usually always allowed if capability exists.
   */
  async canTransportControl(control: 'play' | 'pause' | 'stop'): Promise<boolean> {
    try {
      this.authority.assertAllowed({
        capability: Capability.TRANSPORT_CONTROL,
        scope: {
          appId: this.appId
        },
        reason: `Transport: ${control}`
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  // =========================================================================
  // SIDE-EFFECT DETECTION (Rule C3)
  // =========================================================================

  /**
   * Detect if a parameter adjustment has side-effects.
   * If yes, promote to FILE_WRITE or RENDER_EXPORT.
   * Rule C3: Side-Effect Promotion
   */
  detectSideEffect(parameterId: string, newValue: any): Capability | null {
    // Examples:
    const sideEffectMap: Record<string, Capability> = {
      'autosave:enabled': Capability.FILE_WRITE,
      'background-render:enabled': Capability.RENDER_EXPORT,
      'working-directory': Capability.FILE_WRITE,
      'auto-backup:enabled': Capability.FILE_WRITE,
      'session-persistence': Capability.FILE_WRITE,
    };

    return sideEffectMap[parameterId] || null;
  }

  /**
   * If side-effect detected, create escalated request.
   */
  async guardSideEffectParameter(
    parameterId: string,
    newValue: any
  ): Promise<CapabilityRequest | null> {
    const escalatedCapability = this.detectSideEffect(parameterId, newValue);

    if (!escalatedCapability) {
      return null; // No side-effect, normal PARAMETER_ADJUSTMENT
    }

    // Side-effect detected → escalate
    return {
      capability: escalatedCapability,
      scope: {
        appId: this.appId,
        resourceIds: [parameterId]
      },
      reason: `Parameter has side-effect: ${parameterId} → ${escalatedCapability}`
    };
  }

  // =========================================================================
  // BOUNDARY VIOLATION AUDIT
  // =========================================================================

  /**
   * Log capability violation to audit trail.
   * Should be called by exception handlers.
   */
  logViolation(request: CapabilityRequest, error: Error): void {
    console.error(
      `[CAPABILITY_VIOLATION] ${new Date().toISOString()}\n` +
      `Capability: ${request.capability}\n` +
      `Scope: ${JSON.stringify(request.scope)}\n` +
      `Reason: ${request.reason}\n` +
      `Error: ${error.message}`
    );
    // TODO: Also write to Self Session audit log
  }
}

export default ESLCapabilityAdapter;
