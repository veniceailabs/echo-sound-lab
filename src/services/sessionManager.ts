/**
 * Session Manager - Autosave + Quick Restore for Echo Sound Lab
 * Saves session state every 5 seconds and on config changes
 */

import { ProcessingConfig, EchoReport, Suggestion } from '../types';

export interface SessionState {
  version: string;
  savedAt: number;
  fileName: string | null;
  config: ProcessingConfig;
  isAbComparing: boolean;
  playheadSeconds: number;
  appliedSuggestionIds: string[];
  echoReportSummary: string | null;
  activeMode: 'SINGLE' | 'MULTI' | 'AI_STUDIO';
  // WAM plugin state
  activeWamPluginId: string | null;
}

const SESSION_KEY = 'echo-session-v2';
const AUTOSAVE_INTERVAL = 5000; // 5 seconds

class SessionManager {
  private autosaveTimer: number | null = null;
  private currentSession: SessionState | null = null;
  private onRestoreCallback: ((session: SessionState) => void) | null = null;
  private saveDebounceTimer: number | null = null;
  private lastSaveTime: number = 0;
  private MIN_SAVE_INTERVAL = 1000; // Minimum 1 second between saves

  /**
   * Initialize session manager and check for existing session
   */
  init(): SessionState | null {
    const saved = this.loadSession();
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
        this.saveSession(this.currentSession);
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
      this.saveSessionNow(this.currentSession);
    } else {
      // Otherwise, debounce the save
      this.saveDebounceTimer = window.setTimeout(() => {
        this.saveSessionNow(this.currentSession!);
      }, this.MIN_SAVE_INTERVAL - timeSinceLastSave);
    }
  }

  /**
   * Save session to localStorage immediately (internal use)
   */
  private saveSessionNow(session: SessionState) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      this.lastSaveTime = Date.now();
      // Removed console.log to reduce noise
    } catch (e) {
      console.warn('[SessionManager] Failed to save session:', e);
    }
  }

  /**
   * Save session to localStorage (legacy method)
   */
  private saveSession(session: SessionState) {
    this.saveSessionNow(session);
  }

  /**
   * Load session from localStorage
   */
  private loadSession(): SessionState | null {
    try {
      const data = localStorage.getItem(SESSION_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // Validate version
        if (parsed.version === '2.1') {
          return parsed as SessionState;
        }
      }
    } catch (e) {
      console.warn('[SessionManager] Failed to load session:', e);
    }
    return null;
  }

  /**
   * Clear saved session
   */
  clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
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
  async importSession(file: File): Promise<SessionState | null> {
    try {
      const text = await file.text();
      const session = JSON.parse(text) as SessionState;

      // Validate
      if (session.version && session.config) {
        this.currentSession = session;
        this.saveSession(session);
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
      activeWamPluginId: null,
    };
  }
}

export const sessionManager = new SessionManager();
