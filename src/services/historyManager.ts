import { HistoryEntry, ProcessingConfig, AudioMetrics } from '../types';
import { audioEngine } from './audioEngine';

const MAX_HISTORY_ENTRIES = 50;
const STORAGE_KEY = 'echo_sound_lab_history';

class HistoryManagerService {
    private history: HistoryEntry[] = [];
    private currentIndex: number = -1;
    private maxEntries: number = MAX_HISTORY_ENTRIES;
    private bufferSnapshots: Map<string, AudioBuffer> = new Map();

    constructor() {
        this.loadFromStorage();
    }

    /**
     * Load history from localStorage (without buffer snapshots for performance)
     */
    private loadFromStorage(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Load without buffer snapshots
                this.history = parsed.map((entry: any) => ({
                    ...entry,
                    bufferSnapshot: undefined
                }));
                this.currentIndex = this.history.length - 1;
            }
        } catch (error) {
            console.error('Failed to load history:', error);
        }
    }

    /**
     * Save history to localStorage (excluding buffer snapshots)
     */
    private saveToStorage(): void {
        try {
            // Save without buffer snapshots to avoid localStorage quota issues
            const toSave = this.history.map(entry => ({
                ...entry,
                bufferSnapshot: undefined
            }));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
        } catch (error) {
            console.error('Failed to save history:', error);
        }
    }

    /**
     * Add a new history entry
     */
    addEntry(
        action: HistoryEntry['action'],
        description: string,
        config: ProcessingConfig,
        metrics: AudioMetrics,
        includeBufferSnapshot: boolean = false
    ): void {
        // Remove any entries after current index (when user makes change after undo)
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        // Create new entry
        const entry: HistoryEntry = {
            id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            action,
            description,
            config: JSON.parse(JSON.stringify(config)), // Deep clone
            metrics: JSON.parse(JSON.stringify(metrics)), // Deep clone
            bufferSnapshot: undefined
        };

        // Optionally save buffer snapshot (for in-memory only, not localStorage)
        if (includeBufferSnapshot) {
            const buffer = audioEngine.getProcessedBuffer() || audioEngine.getBuffer() || audioEngine.getOriginalBuffer();
            if (buffer) {
                this.bufferSnapshots.set(entry.id, buffer);
                entry.bufferSnapshot = entry.id;
            }
        }

        this.history.push(entry);
        this.currentIndex = this.history.length - 1;

        // Trim history if it exceeds max entries
        if (this.history.length > this.maxEntries) {
            this.history = this.history.slice(-this.maxEntries);
            this.currentIndex = this.history.length - 1;
        }

        this.saveToStorage();
    }

    /**
     * Undo to previous state
     */
    undo(): HistoryEntry | null {
        if (!this.canUndo()) return null;

        this.currentIndex--;
        return this.history[this.currentIndex];
    }

    /**
     * Redo to next state
     */
    redo(): HistoryEntry | null {
        if (!this.canRedo()) return null;

        this.currentIndex++;
        return this.history[this.currentIndex];
    }

    /**
     * Check if undo is available
     */
    canUndo(): boolean {
        return this.currentIndex > 0;
    }

    /**
     * Check if redo is available
     */
    canRedo(): boolean {
        return this.currentIndex < this.history.length - 1;
    }

    /**
     * Get current entry
     */
    getCurrentEntry(): HistoryEntry | null {
        if (this.currentIndex < 0 || this.currentIndex >= this.history.length) {
            return null;
        }
        return this.history[this.currentIndex];
    }

    /**
     * Get all history entries
     */
    getAllEntries(): HistoryEntry[] {
        return [...this.history];
    }

    /**
     * Get recent entries (last N)
     */
    getRecentEntries(count: number = 10): HistoryEntry[] {
        return this.history.slice(-count);
    }

    /**
     * Jump to specific entry by ID
     */
    jumpToEntry(id: string): HistoryEntry | null {
        const index = this.history.findIndex(e => e.id === id);
        if (index === -1) return null;

        this.currentIndex = index;
        return this.history[index];
    }

    /**
     * Get history timeline for visualization
     */
    getTimeline(): Array<{
        entry: HistoryEntry;
        isCurrent: boolean;
        isAccessible: boolean;
    }> {
        return this.history.map((entry, index) => ({
            entry,
            isCurrent: index === this.currentIndex,
            isAccessible: index <= this.currentIndex
        }));
    }

    /**
     * Clear all history
     */
    clearHistory(): void {
        this.history = [];
        this.currentIndex = -1;
        this.bufferSnapshots.clear();
        this.saveToStorage();
    }

    /**
     * Alias for clearHistory() for convenience
     */
    clear(): void {
        this.clearHistory();
    }

    /**
     * Get a buffer snapshot for snapshot A/B comparison
     */
    getBufferSnapshot(entryId: string): AudioBuffer | null {
        return this.bufferSnapshots.get(entryId) || null;
    }

    /**
     * Store a buffer snapshot for an entry (in-memory only)
     */
    setBufferSnapshot(entryId: string, buffer: AudioBuffer): void {
        this.bufferSnapshots.set(entryId, buffer);
    }

    /**
     * Get stats about history
     */
    getStats(): {
        totalEntries: number;
        currentIndex: number;
        canUndo: boolean;
        canRedo: boolean;
        memoryUsage: string;
    } {
        const memoryUsageBytes = new Blob([JSON.stringify(this.history)]).size;
        const memoryUsageMB = (memoryUsageBytes / 1024 / 1024).toFixed(2);

        return {
            totalEntries: this.history.length,
            currentIndex: this.currentIndex,
            canUndo: this.canUndo(),
            canRedo: this.canRedo(),
            memoryUsage: `${memoryUsageMB} MB`
        };
    }

    /**
     * Export history as JSON
     */
    exportHistory(): string {
        return JSON.stringify({
            history: this.history,
            currentIndex: this.currentIndex,
            exportedAt: new Date().toISOString()
        }, null, 2);
    }

    /**
     * Import history from JSON
     */
    importHistory(json: string): boolean {
        try {
            const imported = JSON.parse(json);
            if (!imported.history || !Array.isArray(imported.history)) {
                return false;
            }

            this.history = imported.history;
            this.currentIndex = imported.currentIndex ?? this.history.length - 1;
            this.saveToStorage();
            return true;
        } catch (error) {
            console.error('Failed to import history:', error);
            return false;
        }
    }
}

export const historyManager = new HistoryManagerService();
