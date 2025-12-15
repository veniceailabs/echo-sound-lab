import { ProjectSession, EchoSessionSnapshot, TestChecklistState, DebugLogEntry } from "../types";

const SESSION_KEY = 'echo.sessionSnapshot.v1';
const TEST_CHECKLIST_KEY = 'echo.testChecklist.v1';
const DEBUG_LOG_KEY = 'echo.debugLog.v1';
const TEST_MODE_KEY = 'echo.testMode.v1';

const MAX_DEBUG_LOG_ENTRIES = 200;

class StorageService {
    saveSessionSnapshot(snapshot: EchoSessionSnapshot): void {
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
        } catch (e) {
            console.warn("Failed to save session snapshot to localStorage:", e);
        }
    }

    loadSessionSnapshot(): EchoSessionSnapshot | null {
        try {
            const stored = localStorage.getItem(SESSION_KEY);
            if (stored) {
                const snapshot = JSON.parse(stored);
                if (snapshot.createdAt && snapshot.processingConfig !== undefined && snapshot.isAbComparing !== undefined) {
                    return snapshot;
                }
            }
        } catch (e) {
            console.warn("Failed to load or parse session snapshot from localStorage:", e);
        }
        return null;
    }

    clearSessionSnapshot(): void {
        try {
            localStorage.removeItem(SESSION_KEY);
        } catch (e) {
            console.warn("Failed to clear session snapshot from localStorage:", e);
        }
    }

    saveTestChecklist(state: TestChecklistState): void {
        try {
            localStorage.setItem(TEST_CHECKLIST_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn("Failed to save test checklist to localStorage:", e);
        }
    }

    loadTestChecklist(): TestChecklistState | null {
        try {
            const stored = localStorage.getItem(TEST_CHECKLIST_KEY);
            if (stored) {
                const checklist = JSON.parse(stored);
                if (checklist.lastUpdatedAt) {
                    return checklist;
                }
            }
        } catch (e) {
            console.warn("Failed to load or parse test checklist from localStorage:", e);
        }
        return null;
    }

    clearTestChecklist(): void {
        try {
            localStorage.removeItem(TEST_CHECKLIST_KEY);
        } catch (e) {
            console.warn("Failed to clear test checklist from localStorage:", e);
        }
    }

    pushDebugLog(entry: Omit<DebugLogEntry, 'id' | 'timestamp'>): void {
        try {
            const logs = this.getDebugLogs();
            const newEntry: DebugLogEntry = {
                id: Date.now().toString() + Math.random().toString(36).substring(7),
                timestamp: new Date().toISOString(),
                ...entry
            };
            const updatedLogs = [newEntry, ...logs].slice(0, MAX_DEBUG_LOG_ENTRIES);
            localStorage.setItem(DEBUG_LOG_KEY, JSON.stringify(updatedLogs));
        } catch (e) {
            console.warn("Failed to push debug log entry to localStorage:", e);
        }
    }

    getDebugLogs(): DebugLogEntry[] {
        try {
            const stored = localStorage.getItem(DEBUG_LOG_KEY);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.warn("Failed to get debug logs from localStorage:", e);
            return [];
        }
    }

    clearDebugLogs(): void {
        try {
            localStorage.removeItem(DEBUG_LOG_KEY);
        } catch (e) {
            console.warn("Failed to clear debug logs from localStorage:", e);
        }
    }

    saveTestMode(isEnabled: boolean): void {
        try {
            localStorage.setItem(TEST_MODE_KEY, JSON.stringify(isEnabled));
        } catch (e) {
            console.warn("Failed to save test mode state:", e);
        }
    }

    loadTestMode(): boolean {
        try {
            const stored = localStorage.getItem(TEST_MODE_KEY);
            return stored ? JSON.parse(stored) : false;
        } catch (e) {
            console.warn("Failed to load test mode state:", e);
            return false;
        }
    }
}

export const storageService = new StorageService();