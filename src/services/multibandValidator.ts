import { MultibandCompressionConfig } from '../types';

export interface MultibandValidationResult {
    isValid: boolean;
    isSafe: boolean;
    warnings: string[];
    errors: string[];
    hasConfiguration: boolean;
}

export class MultibandValidator {

    static validate(config: MultibandCompressionConfig | undefined): MultibandValidationResult {
        const warnings: string[] = [];
        const errors: string[] = [];
        let hasConfiguration = false;

        if (!config) {
            return {
                isValid: true,
                isSafe: true,
                warnings: [],
                errors: [],
                hasConfiguration: false
            };
        }

        const crossover1 = config.crossovers?.[0];
        const crossover2 = config.crossovers?.[1];

        if (crossover1 === undefined || crossover2 === undefined) {
            errors.push('Crossover frequencies are undefined');
        } else {
            if (isNaN(crossover1) || isNaN(crossover2)) {
                errors.push('Crossover frequencies contain invalid values (NaN)');
            }

            if (crossover1 < 50 || crossover1 > 500) {
                warnings.push(`Low crossover (${crossover1}Hz) outside recommended range (50-500Hz)`);
            }

            if (crossover2 < 1000 || crossover2 > 10000) {
                warnings.push(`High crossover (${crossover2}Hz) outside recommended range (1000-10000Hz)`);
            }

            if (crossover1 >= crossover2) {
                errors.push(`Low crossover (${crossover1}Hz) must be below high crossover (${crossover2}Hz)`);
            } else if (crossover2 - crossover1 < 500) {
                warnings.push('Crossovers too close (<500Hz spacing) - may cause frequency masking');
            }
        }

        const lowConfig = config.low || {};
        const midConfig = config.mid || {};
        const highConfig = config.high || {};

        const lowConfigured = Object.keys(lowConfig).length > 0 && lowConfig.threshold !== undefined;
        const midConfigured = Object.keys(midConfig).length > 0 && midConfig.threshold !== undefined;
        const highConfigured = Object.keys(highConfig).length > 0 && highConfig.threshold !== undefined;

        hasConfiguration = lowConfigured || midConfigured || highConfigured;

        if (!lowConfigured && !midConfigured && !highConfigured) {
            warnings.push('No band compression settings configured - using safe defaults');
        } else {
            if (!lowConfigured) {
                warnings.push('Low band not configured - using safe defaults');
            }
            if (!midConfigured) {
                warnings.push('Mid band not configured - using safe defaults');
            }
            if (!highConfigured) {
                warnings.push('High band not configured - using safe defaults');
            }
        }

        [
            { name: 'Low', config: lowConfig },
            { name: 'Mid', config: midConfig },
            { name: 'High', config: highConfig }
        ].forEach(({ name, config }) => {
            if (config.threshold !== undefined) {
                if (config.threshold < -60 || config.threshold > 0) {
                    errors.push(`${name} band threshold (${config.threshold}dB) out of range (-60 to 0dB)`);
                }
            }

            if (config.ratio !== undefined) {
                if (config.ratio < 1 || config.ratio > 20) {
                    errors.push(`${name} band ratio (${config.ratio}:1) out of range (1:1 to 20:1)`);
                }
            }

            if (config.attack !== undefined) {
                if (config.attack < 0.001 || config.attack > 1) {
                    warnings.push(`${name} band attack (${config.attack}s) unusual (typically 0.001-1s)`);
                }
            }

            if (config.release !== undefined) {
                if (config.release < 0.01 || config.release > 2) {
                    warnings.push(`${name} band release (${config.release}s) unusual (typically 0.01-2s)`);
                }
            }
        });

        const isValid = errors.length === 0;
        const isSafe = isValid && warnings.length === 0;

        return {
            isValid,
            isSafe,
            warnings,
            errors,
            hasConfiguration
        };
    }

    static getSuggestions(config: MultibandCompressionConfig): string[] {
        const suggestions: string[] = [];

        const validation = this.validate(config);

        if (!validation.hasConfiguration) {
            suggestions.push('Configure thresholds, ratios, attack/release for each band');
            suggestions.push('Recommended starting points:');
            suggestions.push('  Low: threshold -30dB, ratio 2.5:1, attack 10ms, release 100ms');
            suggestions.push('  Mid: threshold -24dB, ratio 3:1, attack 5ms, release 80ms');
            suggestions.push('  High: threshold -18dB, ratio 3.5:1, attack 2ms, release 50ms');
        }

        if (validation.errors.length > 0) {
            suggestions.push('Fix configuration errors before processing');
        }

        return suggestions;
    }
}
