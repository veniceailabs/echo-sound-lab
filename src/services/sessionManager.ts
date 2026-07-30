/**
 * Session Manager - Autosave + Quick Restore for Echo Sound Lab
 * Saves session state every 5 seconds and on config changes
 */

import { ProcessingConfig, RevisionEntry } from '../types';
import { getSecureItem, removeSecureItem, setSecureItem } from './secureStorage';
import { parseSessionInterchangePackage } from './sessionInterchangeService';
import { parseStudioSessionRecoveryBundleJson } from './studioSessionRecoveryService';

export interface SessionState {
  version: string;
  savedAt: number;
  fileName: string | null;
  config: ProcessingConfig;
  isAbComparing: boolean;
  playheadSeconds: number;
  appliedSuggestionIds: string[];
  echoReportSummary: string | null;
  activeMode: 'SINGLE' | 'MULTI' | 'AI_STUDIO' | 'VIDEO';
  revisionLog: RevisionEntry[];
  // WAM plugin state
  activeWamPluginId: string | null;
  importContext?: SessionImportContext | null;
}

const SESSION_KEY = 'echo-session-v2';
const AUTOSAVE_INTERVAL = 5000; // 5 seconds

function isSessionStateLike(value: unknown): value is SessionState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SessionState>;
  return typeof candidate.version === 'string' && typeof candidate.config === 'object' && candidate.config !== null;
}

function cloneSessionState(session: SessionState): SessionState {
  return JSON.parse(JSON.stringify(session)) as SessionState;
}

export type SessionImportSourceKind = 'recovery-bundle' | 'session-package' | 'session-state';

export interface SessionImportEngineSummary {
  masteringQualityMode: string;
  recommendedRenderPath: string;
  chainSignature: string | null;
  noteCount: number;
}

export interface SessionImportContext {
  sourceKind: SessionImportSourceKind;
  sourceLabel: string;
  canRestoreAudioLess: boolean;
  engineSummary: SessionImportEngineSummary | null;
}

export interface SessionImportEnvelope {
  session: SessionState;
  sourceKind: SessionImportSourceKind;
  sourceLabel: string;
  canRestoreAudioLess: boolean;
  importContext: SessionImportContext;
  sessionPackage: ReturnType<typeof parseSessionInterchangePackage> | null;
  recoveryBundle: ReturnType<typeof parseStudioSessionRecoveryBundleJson> | null;
}

class SessionManager {
  private autosaveTimer: number | null = null;
  private currentSession: SessionState | null = null;
  private lastImportEnvelope: SessionImportEnvelope | null = null;
  private onRestoreCallback: ((session: SessionState) => void) | null = null;
  private saveDebounceTimer: number | null = null;
  private lastSaveTime: number = 0;
  private MIN_SAVE_INTERVAL = 1000; // Minimum 1 second between saves

  /**
   * Initialize session manager and check for existing session
   */
  async init(): Promise<SessionState | null> {
    const saved = await this.loadSession();
    if (saved) {
      this.currentSession = saved;
    }
    return saved;
  }

  /**
   * Start autosave timer
   */
  startAutosave() {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
    }
    this.autosaveTimer = window.setInterval(() => {
      if (this.currentSession) {
        this.saveSession(this.currentSession).catch((error) => {
          console.warn('[SessionManager] Autosave failed:', error);
        });
      }
    }, AUTOSAVE_INTERVAL);
  }

  /**
   * Stop autosave timer
   */
  stopAutosave() {
    if (this.autosaveTimer) {
      clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  /**
   * Update and save session with debouncing
   */
  updateSession(updates: Partial<SessionState>) {
    this.currentSession = {
      ...this.getDefaultSession(),
      ...this.currentSession,
      ...updates,
      savedAt: Date.now(),
    };

    // Clear existing debounce timer
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }

    // Check if enough time has passed since last save
    const now = Date.now();
    const timeSinceLastSave = now - this.lastSaveTime;

    if (timeSinceLastSave >= this.MIN_SAVE_INTERVAL) {
      // Save immediately if enough time has passed
      this.saveSessionNow(this.currentSession!).catch((error) => {
        console.warn('[SessionManager] Immediate save failed:', error);
      });
    } else {
      // Otherwise, debounce the save
      this.saveDebounceTimer = window.setTimeout(() => {
        this.saveSessionNow(this.currentSession!).catch((error) => {
          console.warn('[SessionManager] Debounced save failed:', error);
        });
      }, this.MIN_SAVE_INTERVAL - timeSinceLastSave);
    }
  }

  /**
   * Save session to localStorage immediately (internal use)
   */
  private async saveSessionNow(session: SessionState) {
    try {
      await setSecureItem(SESSION_KEY, session);
      this.lastSaveTime = Date.now();
    } catch (e) {
      console.warn('[SessionManager] Failed to save session:', e);
    }
  }

  /**
   * Save session to localStorage (legacy method)
   */
  private async saveSession(session: SessionState) {
    await this.saveSessionNow(session);
  }

  /**
   * Load session from localStorage
   */
  private async loadSession(): Promise<SessionState | null> {
    try {
      const data = await getSecureItem<SessionState>(SESSION_KEY);
      if (data && data.version === '2.1') {
        return {
          ...this.getDefaultSession(),
          ...data,
          revisionLog: data.revisionLog || []
        } as SessionState;
      }
    } catch (e) {
      console.warn('[SessionManager] Failed to load session:', e);
    }
    return null;
  }

  /**
   * Clear saved session
   */
  async clearSession() {
    try {
      await removeSecureItem(SESSION_KEY);
      this.currentSession = null;
      console.log('[SessionManager] Session cleared');
    } catch (e) {
      console.warn('[SessionManager] Failed to clear session:', e);
    }
  }

  /**
   * Export session as JSON file
   */
  exportSession(): void {
    if (!this.currentSession) return;

    const blob = new Blob([JSON.stringify(this.currentSession, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `echo-session-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Import session from JSON file
   */
  async importSessionEnvelope(file: File): Promise<SessionImportEnvelope | null> {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      const recoveryBundle = parseStudioSessionRecoveryBundleJson(text);
      const sessionPackage = parseSessionInterchangePackage(text);
      const importedSession =
        recoveryBundle?.sessionPackage.session ||
        sessionPackage?.session ||
        (isSessionStateLike(parsed) ? parsed : null);

      if (!importedSession) return null;

      const session = {
        ...this.getDefaultSession(),
        ...cloneSessionState(importedSession),
        savedAt: Date.now(),
        revisionLog: importedSession.revisionLog || [],
      } as SessionState;

      const sourceKind: SessionImportSourceKind = recoveryBundle
        ? 'recovery-bundle'
        : sessionPackage
          ? 'session-package'
          : 'session-state';
      const importContext: SessionImportContext = {
        sourceKind,
        sourceLabel:
          sourceKind === 'recovery-bundle'
            ? 'ESL recovery bundle'
            : sourceKind === 'session-package'
              ? 'ESL session package'
              : 'Saved session JSON',
        canRestoreAudioLess: sourceKind !== 'session-state',
        engineSummary: sessionPackage
          ? {
              masteringQualityMode: sessionPackage.engine.masteringQualityMode,
              recommendedRenderPath: sessionPackage.engine.recommendedRenderPath,
              chainSignature: sessionPackage.engine.chainSignature,
              noteCount: sessionPackage.notes.length,
            }
          : recoveryBundle
            ? {
                masteringQualityMode: recoveryBundle.sessionPackage.engine.masteringQualityMode,
                recommendedRenderPath: recoveryBundle.sessionPackage.engine.recommendedRenderPath,
                chainSignature: recoveryBundle.sessionPackage.engine.chainSignature,
                noteCount: recoveryBundle.notes.length,
              }
            : null,
      };
      session.importContext = importContext;

      return {
        session,
        sourceKind,
        sourceLabel: importContext.sourceLabel,
        canRestoreAudioLess: importContext.canRestoreAudioLess,
        importContext,
        sessionPackage,
        recoveryBundle,
      };
    } catch (e) {
      console.error('[SessionManager] Failed to import session envelope:', e);
      return null;
    }
  }

  async importSession(file: File): Promise<SessionState | null> {
    try {
      const envelope = await this.importSessionEnvelope(file);
      if (envelope) {
        this.lastImportEnvelope = envelope;
        const { session } = envelope;
        this.currentSession = session;
        await this.saveSession(session);
        return session;
      }
    } catch (e) {
      console.error('[SessionManager] Failed to import session:', e);
    }
    return null;
  }

  /**
   * Get current session
   */
  getSession(): SessionState | null {
    return this.currentSession;
  }

  getLastImportEnvelope(): SessionImportEnvelope | null {
    return this.lastImportEnvelope;
  }

  /**
   * Check if there's a session to restore
   */
  hasSession(): boolean {
    return this.currentSession !== null && this.currentSession.fileName !== null;
  }

  /**
   * Get time since last save
   */
  getTimeSinceLastSave(): string {
    if (!this.currentSession) return 'Never';
    const diff = Date.now() - this.currentSession.savedAt;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    return `${Math.floor(diff / 3600000)}h ago`;
  }

  /**
   * Default empty session
   */
  private getDefaultSession(): SessionState {
    return {
      version: '2.1',
      savedAt: Date.now(),
      fileName: null,
      config: {},
      isAbComparing: false,
      playheadSeconds: 0,
      appliedSuggestionIds: [],
      echoReportSummary: null,
      activeMode: 'SINGLE',
      revisionLog: [],
      activeWamPluginId: null,
      importContext: null,
    };
  }
}

export const sessionManager = new SessionManager();
