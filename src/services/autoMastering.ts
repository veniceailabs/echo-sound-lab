import { AudioMetrics, MixSignature, ProcessingConfig } from '../types';
import { mixAnalysisService } from './mixAnalysis';
import { presetManager } from './presetManager';
import { lufsMeteringService } from './lufsMetering';

export interface GenreDetectionResult {
    genre: string;
    confidence: number;
    characteristics: {
        bassHeavy: boolean;
        bright: boolean;
        dynamic: boolean;
        wide: boolean;
    };
    suggestedPreset: string;
}

class AutoMasteringService {

    /**
     * Detect genre based on audio characteristics
     */
    async detectGenre(buffer: AudioBuffer): Promise<GenreDetectionResult> {
        const signature = await mixAnalysisService.extractMixSignature(buffer);
        const metrics = mixAnalysisService.analyzeStaticMetrics(buffer);

        // Extract characteristics
        const characteristics = {
            bassHeavy: signature.tonalBalance.low + signature.tonalBalance.lowMid > 0.4,
            bright: signature.tonalBalance.high + signature.tonalBalance.highMid > 0.35,
            dynamic: signature.dynamics.crestFactor > 10,
            wide: (signature.stereoWidth.mid + signature.stereoWidth.high) / 2 > 0.8
        };

        // Genre detection heuristics
        let genre = 'General';
        let confidence = 0.5;
        let suggestedPreset = 'preset-streaming';

        // Electronic/EDM: Wide stereo, bright, compressed, heavy bass
        if (!characteristics.dynamic && characteristics.wide && characteristics.bright && characteristics.bassHeavy) {
            genre = 'Electronic';
            confidence = 0.85;
            suggestedPreset = 'preset-electronic';
        }
        // Hip-Hop: Heavy bass, punchy (medium dynamics), not too wide
        else if (characteristics.bassHeavy && !characteristics.wide && signature.dynamics.crestFactor > 8 && signature.dynamics.crestFactor < 12) {
            genre = 'Hip-Hop';
            confidence = 0.80;
            suggestedPreset = 'preset-hip-hop';
        }
        // Rock: Warm, mid-focused, moderate dynamics
        else if (!characteristics.bright && signature.tonalBalance.mid > 0.25 && characteristics.dynamic) {
            genre = 'Rock';
            confidence = 0.75;
            suggestedPreset = 'preset-rock';
        }
        // Pop: Bright, compressed, balanced
        else if (characteristics.bright && !characteristics.dynamic && !characteristics.bassHeavy) {
            genre = 'Pop';
            confidence = 0.75;
            suggestedPreset = 'preset-bright-pop';
        }
        // Vocal/Acoustic: Dynamic, mid-focused
        else if (characteristics.dynamic && signature.tonalBalance.mid + signature.tonalBalance.highMid > 0.45) {
            genre = 'Vocal';
            confidence = 0.70;
            suggestedPreset = 'preset-vocal';
        }

        return {
            genre,
            confidence,
            characteristics,
            suggestedPreset
        };
    }

    /**
     * Automatically generate optimal mastering config
     */
    async autoMaster(
        buffer: AudioBuffer,
        targetLoudness: number = -14, // Default to Spotify standard
        useGenreDetection: boolean = true
    ): Promise<{
        config: ProcessingConfig;
        genre: string;
        confidence: number;
        analysis: string;
    }> {

        // Get audio signature and metrics
        const [signature, metrics, lufs] = await Promise.all([
            mixAnalysisService.extractMixSignature(buffer),
            Promise.resolve(mixAnalysisService.analyzeStaticMetrics(buffer)),
            lufsMeteringService.measureLUFS(buffer)
        ]);

        // Detect genre
        let genre = 'General';
        let confidence = 0.5;
        let baseConfig: ProcessingConfig = {};

        if (useGenreDetection) {
            const genreResult = await this.detectGenre(buffer);
            genre = genreResult.genre;
            confidence = genreResult.confidence;

            // Get preset for detected genre
            const preset = presetManager.getPresetById(genreResult.suggestedPreset);
            if (preset) {
                baseConfig = { ...preset.config };
            }
        }

        // Adjust config based on current state
        const adjustedConfig = this.adjustConfigForTarget(
            baseConfig,
            signature,
            metrics,
            lufs.integratedLUFS,
            targetLoudness
        );

        // Generate analysis
        const analysis = this.generateAnalysis(signature, metrics, lufs.integratedLUFS, targetLoudness, genre);

        return {
            config: adjustedConfig,
            genre,
            confidence,
            analysis
        };
    }

    /**
     * Adjust config to hit target loudness while maintaining quality
     */
    private adjustConfigForTarget(
        baseConfig: ProcessingConfig,
        signature: MixSignature,
        metrics: AudioMetrics,
        currentLUFS: number,
        targetLUFS: number
    ): ProcessingConfig {
        const config = { ...baseConfig };

        // Calculate loudness gap
        const lufsGap = targetLUFS - currentLUFS;

        // If we need more loudness
        if (lufsGap > 1) {
            // Increase compression
            if (!config.compression) {
                config.compression = {
                    threshold: -20,
                    ratio: 3,
                    attack: 0.01,
                    release: 0.2,
                    makeupGain: 0
                };
            }

            // Adjust compression to bring up loudness
            const currentThreshold = config.compression.threshold ?? -20;
            config.compression.threshold = Math.max(-30, currentThreshold - (lufsGap * 0.5));
            config.compression.ratio = Math.min(6, (config.compression.ratio ?? 3) + (lufsGap * 0.2));
            // PROTECTIVE MASTERING: Block automatic makeup gain (causes phase artifacts and gloss)
            config.compression.makeupGain = 0;

            // Ensure limiter prevents clipping
            config.limiter = {
                threshold: -0.8,
                release: 0.08,
                ratio: 20
            };
        }
        // If we need less loudness
        else if (lufsGap < -1) {
            // Reduce compression or add output trim
            config.outputTrimDb = Math.min(0, (config.outputTrimDb ?? 0) + (lufsGap * 0.8));
        }

        // Tonal balance adjustments
        if (signature.tonalBalance.low < 0.15) {
            // Lacking bass
            if (!config.eq) config.eq = [];
            config.eq.push({
                frequency: 80,
                gain: 2,
                type: 'lowshelf'
            });
        }

        if (signature.tonalBalance.high < 0.15) {
            // Lacking highs
            if (!config.eq) config.eq = [];
            config.eq.push({
                frequency: 10000,
                gain: 1.5,
                type: 'highshelf'
            });
        }

        // Stereo width optimization
        const avgWidth = (signature.stereoWidth.low + signature.stereoWidth.mid + signature.stereoWidth.high) / 3;
        if (avgWidth < 0.5) {
            // Narrow stereo - widen it
            config.stereoImager = {
                lowWidth: 1.25,
                midWidth: 1.25,
                highWidth: 1.25,
                crossovers: [300, 5000]
            };
        } else if (avgWidth > 1.5) {
            // Too wide - narrow it for mono compatibility
            config.stereoImager = {
                lowWidth: 0.95,
                midWidth: 0.95,
                highWidth: 0.95,
                crossovers: [300, 5000]
            };
        }

        return config;
    }

    /**
     * Generate human-readable analysis
     */
    private generateAnalysis(
        signature: MixSignature,
        metrics: AudioMetrics,
        currentLUFS: number,
        targetLUFS: number,
        genre: string
    ): string {
        const parts: string[] = [];

        parts.push(`Detected genre: ${genre}`);
        parts.push(`Current loudness: ${currentLUFS.toFixed(1)} LUFS (target: ${targetLUFS.toFixed(1)} LUFS)`);

        const lufsGap = targetLUFS - currentLUFS;
        if (Math.abs(lufsGap) > 1) {
            parts.push(`Loudness adjustment needed: ${lufsGap > 0 ? '+' : ''}${lufsGap.toFixed(1)} LU`);
        }

        // Tonal analysis
        if (signature.tonalBalance.low > 0.3) {
            parts.push('Bass-heavy mix');
        } else if (signature.tonalBalance.low < 0.15) {
            parts.push('Light on bass');
        }

        if (signature.tonalBalance.high > 0.25) {
            parts.push('Bright top end');
        } else if (signature.tonalBalance.high < 0.15) {
            parts.push('Lacking high-frequency energy');
        }

        // Dynamics
        if (signature.dynamics.crestFactor > 12) {
            parts.push('Very dynamic (uncompressed)');
        } else if (signature.dynamics.crestFactor < 6) {
            parts.push('Heavily compressed');
        }

        // Stereo
        const avgWidth = (signature.stereoWidth.low + signature.stereoWidth.mid + signature.stereoWidth.high) / 3;
        if (avgWidth > 1.2) {
            parts.push('Wide stereo image');
        } else if (avgWidth < 0.5) {
            parts.push('Narrow stereo image');
        }

        return parts.join('. ') + '.';
    }

    /**
     * Get session template for genre
     */
    getSessionTemplate(genre: string): ProcessingConfig {
        const presetMap: Record<string, string> = {
            'Electronic': 'preset-electronic',
            'Hip-Hop': 'preset-hip-hop',
            'Rock': 'preset-rock',
            'Pop': 'preset-bright-pop',
            'Vocal': 'preset-vocal',
            'General': 'preset-streaming'
        };

        const presetId = presetMap[genre] || 'preset-streaming';
        const preset = presetManager.getPresetById(presetId);

        return preset?.config || {};
    }
}

export const autoMasteringService = new AutoMasteringService();
