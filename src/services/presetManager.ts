import { ProcessingPreset, ProcessingConfig } from '../types';

const STORAGE_KEY = 'echo_sound_lab_presets';
const BUILTIN_PRESETS_KEY = 'echo_builtin_presets_loaded';

/**
 * Built-in professional presets for common mastering scenarios
 */
const BUILTIN_PRESETS: ProcessingPreset[] = [
    {
        id: 'preset-warm-master',
        name: 'Warm Analog Master',
        description: 'Warm, vintage sound with tape saturation and smooth highs',
        genre: 'General',
        createdAt: Date.now(),
        config: {
            saturation: { type: 'tape', amount: 0.3, mix: 0.7 },
            eq: [
                { frequency: 80, gain: 1.5, type: 'lowshelf' },
                { frequency: 250, gain: -1, type: 'peaking', q: 0.8 },
                { frequency: 3000, gain: 0.5, type: 'peaking', q: 1.2 },
                { frequency: 10000, gain: -0.5, type: 'highshelf' }
            ],
            compression: {
                threshold: -18,
                ratio: 2.5,
                attack: 0.01,
                release: 0.3,
                makeupGain: 2
            },
            limiter: {
                threshold: -1.5,
                release: 0.1,
                ratio: 20
            }
        }
    },
    {
        id: 'preset-bright-pop',
        name: 'Bright Pop Master',
        description: 'Modern, bright sound with enhanced high frequencies',
        genre: 'Pop',
        createdAt: Date.now(),
        config: {
            saturation: { type: 'digital', amount: 0.15, mix: 0.5 },
            eq: [
                { frequency: 60, gain: -1, type: 'lowshelf' },
                { frequency: 200, gain: -2, type: 'peaking', q: 1.0 },
                { frequency: 2000, gain: 1.5, type: 'peaking', q: 1.5 },
                { frequency: 8000, gain: 3, type: 'highshelf' }
            ],
            compression: {
                threshold: -20,
                ratio: 4,
                attack: 0.005,
                release: 0.15,
                makeupGain: 3
            },
            stereoImager: {
                lowWidth: 1.17,
                midWidth: 1.17,
                highWidth: 1.17,
                crossovers: [300, 5000]
            },
            limiter: {
                threshold: -2,
                release: 0.05,
                ratio: 20
            }
        }
    },
    {
        id: 'preset-hip-hop',
        name: 'Hip-Hop Master',
        description: 'Heavy lows, punchy transients, controlled dynamics',
        genre: 'Hip-Hop',
        createdAt: Date.now(),
        config: {
            eq: [
                { frequency: 50, gain: 3, type: 'lowshelf' },
                { frequency: 150, gain: -1.5, type: 'peaking', q: 0.7 },
                { frequency: 1000, gain: -0.5, type: 'peaking', q: 1.0 },
                { frequency: 5000, gain: 1, type: 'peaking', q: 1.2 },
                { frequency: 12000, gain: 2, type: 'highshelf' }
            ],
            transientShaper: {
                attack: 0.4,
                sustain: -0.2,
                mix: 0.6
            },
            saturation: { type: 'tube', amount: 0.25, mix: 0.6 },
            limiter: {
                threshold: -1,
                release: 0.08,
                ratio: 20
            }
        }
    },
    {
        id: 'preset-electronic',
        name: 'Electronic Dance Master',
        description: 'Wide stereo, pumping compression, crystal highs',
        genre: 'Electronic',
        createdAt: Date.now(),
        config: {
            eq: [
                { frequency: 40, gain: 2, type: 'lowshelf' },
                { frequency: 120, gain: -2, type: 'peaking', q: 1.2 },
                { frequency: 4000, gain: 1.5, type: 'peaking', q: 1.5 },
                { frequency: 10000, gain: 2.5, type: 'highshelf' }
            ],
            compression: {
                threshold: -16,
                ratio: 6,
                attack: 0.003,
                release: 0.1,
                makeupGain: 4
            },
            stereoImager: {
                lowWidth: 1.3,
                midWidth: 1.3,
                highWidth: 1.3,
                crossovers: [250, 4000]
            },
            saturation: { type: 'digital', amount: 0.2, mix: 0.5 },
            limiter: {
                threshold: -0.5,
                release: 0.05,
                ratio: 20
            }
        }
    },
    {
        id: 'preset-rock',
        name: 'Rock Master',
        description: 'Powerful mids, controlled dynamics, natural sound',
        genre: 'Rock',
        createdAt: Date.now(),
        config: {
            eq: [
                { frequency: 80, gain: 1, type: 'lowshelf' },
                { frequency: 400, gain: -1, type: 'peaking', q: 0.9 },
                { frequency: 2500, gain: 2, type: 'peaking', q: 1.3 },
                { frequency: 8000, gain: 0.5, type: 'highshelf' }
            ],
            compression: {
                threshold: -20,
                ratio: 3,
                attack: 0.01,
                release: 0.25,
                makeupGain: 2.5
            },
            saturation: { type: 'tube', amount: 0.35, mix: 0.8 },
            transientShaper: {
                attack: 0.3,
                sustain: 0.1,
                mix: 0.5
            },
            limiter: {
                threshold: -1.2,
                release: 0.1,
                ratio: 20
            }
        }
    },
    {
        id: 'preset-vocal',
        name: 'Vocal Focus',
        description: 'Clarity and presence for vocal-heavy tracks',
        genre: 'Vocal',
        createdAt: Date.now(),
        config: {
            eq: [
                { frequency: 100, gain: -2, type: 'lowshelf' },
                { frequency: 300, gain: -1.5, type: 'peaking', q: 1.0 },
                { frequency: 3000, gain: 3, type: 'peaking', q: 1.5 },
                { frequency: 8000, gain: 1.5, type: 'highshelf' }
            ],
            deEsser: {
                frequency: 7000,
                threshold: -18,
                amount: 0.6
            },
            compression: {
                threshold: -18,
                ratio: 3.5,
                attack: 0.008,
                release: 0.2,
                makeupGain: 2
            },
            stereoImager: {
                lowWidth: 1.03,
                midWidth: 1.03,
                highWidth: 1.03,
                crossovers: [300, 5000]
            },
            limiter: {
                threshold: -1,
                release: 0.08,
                ratio: 20
            }
        }
    },
    {
        id: 'preset-streaming',
        name: 'Streaming Optimized',
        description: 'Balanced for Spotify, Apple Music (-14 LUFS target)',
        genre: 'General',
        createdAt: Date.now(),
        config: {
            eq: [
                { frequency: 50, gain: -1, type: 'lowshelf' },
                { frequency: 1000, gain: 0.5, type: 'peaking', q: 1.0 },
                { frequency: 8000, gain: 1, type: 'highshelf' }
            ],
            compression: {
                threshold: -18,
                ratio: 2.5,
                attack: 0.01,
                release: 0.2,
                makeupGain: 1.5
            },
            limiter: {
                threshold: -1,
                release: 0.08,
                ratio: 20
            },
            outputTrimDb: -1
        }
    },
    {
        id: 'preset-broadcast',
        name: 'Broadcast Standard',
        description: 'EBU R128 compliant (-23 LUFS for broadcast)',
        genre: 'Broadcast',
        createdAt: Date.now(),
        config: {
            eq: [
                { frequency: 80, gain: 0, type: 'lowshelf' },
                { frequency: 1000, gain: 0, type: 'peaking', q: 1.0 },
                { frequency: 10000, gain: 0, type: 'highshelf' }
            ],
            compression: {
                threshold: -24,
                ratio: 2,
                attack: 0.015,
                release: 0.3,
                makeupGain: 0
            },
            limiter: {
                threshold: -2,
                release: 0.1,
                ratio: 10
            },
            outputTrimDb: -2
        }
    }
];

class PresetManagerService {
    private presets: ProcessingPreset[] = [];

    constructor() {
        this.loadPresetsFromStorage();
        this.ensureBuiltinPresets();
    }

    /**
     * Load presets from localStorage
     */
    private loadPresetsFromStorage(): void {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                this.presets = JSON.parse(stored);
            }
        } catch (error) {
            console.error('Failed to load presets from storage:', error);
            this.presets = [];
        }
    }

    /**
     * Save presets to localStorage
     */
    private savePresetsToStorage(): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.presets));
        } catch (error) {
            console.error('Failed to save presets to storage:', error);
        }
    }

    /**
     * Ensure built-in presets are loaded (only once)
     */
    private ensureBuiltinPresets(): void {
        const builtinLoaded = localStorage.getItem(BUILTIN_PRESETS_KEY);
        if (!builtinLoaded) {
            this.presets = [...BUILTIN_PRESETS, ...this.presets];
            this.savePresetsToStorage();
            localStorage.setItem(BUILTIN_PRESETS_KEY, 'true');
        }
    }

    /**
     * Get all presets
     */
    getAllPresets(): ProcessingPreset[] {
        return [...this.presets];
    }

    /**
     * Get presets by genre
     */
    getPresetsByGenre(genre: string): ProcessingPreset[] {
        return this.presets.filter(p => p.genre?.toLowerCase() === genre.toLowerCase());
    }

    /**
     * Get preset by ID
     */
    getPresetById(id: string): ProcessingPreset | null {
        return this.presets.find(p => p.id === id) || null;
    }

    /**
     * Save a new preset
     */
    savePreset(preset: Omit<ProcessingPreset, 'id' | 'createdAt'>): ProcessingPreset {
        const newPreset: ProcessingPreset = {
            ...preset,
            id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            createdAt: Date.now()
        };

        this.presets.unshift(newPreset);
        this.savePresetsToStorage();
        return newPreset;
    }

    /**
     * Update an existing preset
     */
    updatePreset(id: string, updates: Partial<Omit<ProcessingPreset, 'id' | 'createdAt'>>): boolean {
        const index = this.presets.findIndex(p => p.id === id);
        if (index === -1) return false;

        // Don't allow updating built-in presets
        if (BUILTIN_PRESETS.some(bp => bp.id === id)) {
            console.warn('Cannot update built-in preset');
            return false;
        }

        this.presets[index] = {
            ...this.presets[index],
            ...updates
        };

        this.savePresetsToStorage();
        return true;
    }

    /**
     * Delete a preset
     */
    deletePreset(id: string): boolean {
        // Don't allow deleting built-in presets
        if (BUILTIN_PRESETS.some(bp => bp.id === id)) {
            console.warn('Cannot delete built-in preset');
            return false;
        }

        const index = this.presets.findIndex(p => p.id === id);
        if (index === -1) return false;

        this.presets.splice(index, 1);
        this.savePresetsToStorage();
        return true;
    }

    /**
     * Check if preset is built-in
     */
    isBuiltinPreset(id: string): boolean {
        return BUILTIN_PRESETS.some(bp => bp.id === id);
    }

    /**
     * Export presets as JSON
     */
    exportPresets(): string {
        return JSON.stringify(this.presets, null, 2);
    }

    /**
     * Import presets from JSON
     */
    importPresets(json: string): boolean {
        try {
            const imported = JSON.parse(json);
            if (!Array.isArray(imported)) return false;

            // Validate structure
            const valid = imported.every(p =>
                p.id && p.name && p.config && typeof p.config === 'object'
            );

            if (!valid) return false;

            // Add imported presets
            this.presets = [...this.presets, ...imported];
            this.savePresetsToStorage();
            return true;
        } catch (error) {
            console.error('Failed to import presets:', error);
            return false;
        }
    }

    /**
     * Reset to built-in presets only
     */
    resetToBuiltinPresets(): void {
        this.presets = [...BUILTIN_PRESETS];
        this.savePresetsToStorage();
    }
}

export const presetManager = new PresetManagerService();
