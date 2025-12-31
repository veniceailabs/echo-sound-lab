import { AudioMetrics, ProcessingConfig, MixSignature } from '../types';
import { mixAnalysisService } from './mixAnalysis';
import { lufsMeteringService } from './lufsMetering';

export interface ReferenceMatchResult {
    targetMetrics: AudioMetrics;
    targetSignature: MixSignature;
    currentMetrics: AudioMetrics;
    currentSignature: MixSignature;
    suggestedConfig: ProcessingConfig;
    matchPercentage: number;
    analysis: {
        tonalDifference: string;
        dynamicsDifference: string;
        stereoWidthDifference: string;
        loudnessDifference: string;
        recommendations: string[];
    };
}

class ReferenceMatchingService {

    /**
     * Analyze a reference track and generate matching config
     */
    async analyzeReference(
        referenceBuffer: AudioBuffer,
        currentBuffer: AudioBuffer
    ): Promise<ReferenceMatchResult> {

        // Extract signatures from both tracks
        const [refSignature, curSignature] = await Promise.all([
            mixAnalysisService.extractMixSignature(referenceBuffer),
            mixAnalysisService.extractMixSignature(currentBuffer)
        ]);

        // Get detailed metrics
        const refMetrics = mixAnalysisService.analyzeStaticMetrics(referenceBuffer);
        const curMetrics = mixAnalysisService.analyzeStaticMetrics(currentBuffer);

        // Measure LUFS for both
        const [refLUFS, curLUFS] = await Promise.all([
            lufsMeteringService.measureLUFS(referenceBuffer),
            lufsMeteringService.measureLUFS(currentBuffer)
        ]);

        refMetrics.lufs = {
            integrated: refLUFS.integratedLUFS,
            shortTerm: refLUFS.shortTermLUFS,
            momentary: refLUFS.momentaryLUFS,
            loudnessRange: refLUFS.loudnessRange,
            truePeak: refLUFS.truePeak
        };

        curMetrics.lufs = {
            integrated: curLUFS.integratedLUFS,
            shortTerm: curLUFS.shortTermLUFS,
            momentary: curLUFS.momentaryLUFS,
            loudnessRange: curLUFS.loudnessRange,
            truePeak: curLUFS.truePeak
        };

        // Generate suggested processing config
        const suggestedConfig = this.generateMatchingConfig(
            refSignature,
            curSignature,
            refMetrics,
            curMetrics
        );

        // Calculate match percentage
        const matchPercentage = this.calculateMatchPercentage(
            refSignature,
            curSignature,
            refMetrics,
            curMetrics
        );

        // Generate analysis
        const analysis = this.generateAnalysis(
            refSignature,
            curSignature,
            refMetrics,
            curMetrics
        );

        return {
            targetMetrics: refMetrics,
            targetSignature: refSignature,
            currentMetrics: curMetrics,
            currentSignature: curSignature,
            suggestedConfig,
            matchPercentage,
            analysis
        };
    }

    /**
     * Generate processing config to match reference
     */
    private generateMatchingConfig(
        refSig: MixSignature,
        curSig: MixSignature,
        refMetrics: AudioMetrics,
        curMetrics: AudioMetrics
    ): ProcessingConfig {
        const config: ProcessingConfig = {};

        // EQ matching
        config.eq = this.generateMatchingEQ(refSig, curSig);

        // Dynamics matching
        const dynamicsGap = refSig.dynamics.rms - curSig.dynamics.rms;
        const crestGap = refSig.dynamics.crestFactor - curSig.dynamics.crestFactor;

        if (Math.abs(dynamicsGap) > 1 || Math.abs(crestGap) > 1) {
            const targetRatio = crestGap > 0 ? 2 : 4; // Less compression or more
            const targetThreshold = -24 + dynamicsGap;

            config.compression = {
                threshold: Math.max(-40, Math.min(-10, targetThreshold)),
                ratio: Math.max(1.5, Math.min(8, targetRatio)),
                attack: 0.01,
                release: 0.2,
                makeupGain: Math.max(-6, Math.min(6, dynamicsGap * 0.5))
            };
        }

        // Stereo width matching
        const avgRefWidth = (refSig.stereoWidth.low + refSig.stereoWidth.mid + refSig.stereoWidth.high) / 3;
        const avgCurWidth = (curSig.stereoWidth.low + curSig.stereoWidth.mid + curSig.stereoWidth.high) / 3;
        const widthGap = avgRefWidth - avgCurWidth;

        if (Math.abs(widthGap) > 0.1) {
            const targetWidth = Math.max(0.7, Math.min(1.6, avgCurWidth + widthGap));
            config.stereoImager = {
                lowWidth: targetWidth,
                midWidth: targetWidth,
                highWidth: targetWidth,
                crossovers: [300, 5000]
            };
        }

        // Saturation if reference is warmer
        const warmthGap = refSig.character.warmth - curSig.character.warmth;
        if (warmthGap > 0.05) {
            config.saturation = {
                type: 'tape',
                amount: Math.min(0.5, warmthGap * 2),
                mix: 0.7
            };
        }

        // Limiter for loudness matching
        if (refMetrics.lufs && curMetrics.lufs) {
            const lufsGap = refMetrics.lufs.integrated - curMetrics.lufs.integrated;
            config.limiter = {
                threshold: -1,
                release: 0.08,
                ratio: 20
            };

            // Adjust output trim to match LUFS
            config.outputTrimDb = Math.max(-12, Math.min(6, lufsGap * 0.8));
        }

        return config;
    }

    /**
     * Generate EQ to match reference tonal balance
     * Per-band limits prevent aggressive cuts from squishing the mix
     */
    private generateMatchingEQ(refSig: MixSignature, curSig: MixSignature): ProcessingConfig['eq'] {
        const eq: ProcessingConfig['eq'] = [];

        // Low frequency matching (80Hz) - max ±5dB to preserve bass warmth
        const lowGap = refSig.tonalBalance.low - curSig.tonalBalance.low;
        if (Math.abs(lowGap) > 0.02) {
            eq.push({
                frequency: 80,
                gain: Math.max(-5, Math.min(5, lowGap * 15)),
                type: 'lowshelf'
            });
        }

        // Low-mid frequency matching (250Hz) - max ±3dB to preserve body
        const lowMidGap = refSig.tonalBalance.lowMid - curSig.tonalBalance.lowMid;
        if (Math.abs(lowMidGap) > 0.02) {
            eq.push({
                frequency: 250,
                gain: Math.max(-3, Math.min(3, lowMidGap * 15)),
                type: 'peaking',
                q: 1.0
            });
        }

        // Mid frequency matching (1kHz) - max ±4dB
        const midGap = refSig.tonalBalance.mid - curSig.tonalBalance.mid;
        if (Math.abs(midGap) > 0.02) {
            eq.push({
                frequency: 1000,
                gain: Math.max(-4, Math.min(4, midGap * 15)),
                type: 'peaking',
                q: 1.2
            });
        }

        // High-mid frequency matching (4kHz/presence) - max ±3dB to prevent squishing
        const highMidGap = refSig.tonalBalance.highMid - curSig.tonalBalance.highMid;
        if (Math.abs(highMidGap) > 0.02) {
            eq.push({
                frequency: 4000,
                gain: Math.max(-3, Math.min(3, highMidGap * 15)),
                type: 'peaking',
                q: 1.5
            });
        }

        // High frequency matching (10kHz) - max ±4dB
        const highGap = refSig.tonalBalance.high - curSig.tonalBalance.high;
        if (Math.abs(highGap) > 0.02) {
            eq.push({
                frequency: 10000,
                gain: Math.max(-4, Math.min(4, highGap * 15)),
                type: 'highshelf'
            });
        }

        return eq.length > 0 ? eq : undefined;
    }

    /**
     * Calculate how close current mix is to reference (0-100%)
     */
    private calculateMatchPercentage(
        refSig: MixSignature,
        curSig: MixSignature,
        refMetrics: AudioMetrics,
        curMetrics: AudioMetrics
    ): number {
        let totalScore = 0;
        let maxScore = 0;

        // Tonal balance scoring (40% weight)
        const tonalDiff =
            Math.abs(refSig.tonalBalance.low - curSig.tonalBalance.low) +
            Math.abs(refSig.tonalBalance.lowMid - curSig.tonalBalance.lowMid) +
            Math.abs(refSig.tonalBalance.mid - curSig.tonalBalance.mid) +
            Math.abs(refSig.tonalBalance.highMid - curSig.tonalBalance.highMid) +
            Math.abs(refSig.tonalBalance.high - curSig.tonalBalance.high);

        const tonalScore = Math.max(0, 40 - (tonalDiff * 100));
        totalScore += tonalScore;
        maxScore += 40;

        // Dynamics scoring (30% weight)
        const rmsDiff = Math.abs(refSig.dynamics.rms - curSig.dynamics.rms);
        const crestDiff = Math.abs(refSig.dynamics.crestFactor - curSig.dynamics.crestFactor);
        const dynamicsScore = Math.max(0, 30 - (rmsDiff + crestDiff));
        totalScore += dynamicsScore;
        maxScore += 30;

        // Stereo width scoring (20% weight)
        const widthDiff =
            Math.abs(refSig.stereoWidth.low - curSig.stereoWidth.low) +
            Math.abs(refSig.stereoWidth.mid - curSig.stereoWidth.mid) +
            Math.abs(refSig.stereoWidth.high - curSig.stereoWidth.high);
        const widthScore = Math.max(0, 20 - (widthDiff * 10));
        totalScore += widthScore;
        maxScore += 20;

        // Loudness scoring (10% weight) - if LUFS available
        if (refMetrics.lufs && curMetrics.lufs) {
            const lufsDiff = Math.abs(refMetrics.lufs.integrated - curMetrics.lufs.integrated);
            const loudnessScore = Math.max(0, 10 - lufsDiff);
            totalScore += loudnessScore;
            maxScore += 10;
        }

        return Math.round((totalScore / maxScore) * 100);
    }

    /**
     * Generate detailed analysis
     */
    private generateAnalysis(
        refSig: MixSignature,
        curSig: MixSignature,
        refMetrics: AudioMetrics,
        curMetrics: AudioMetrics
    ): ReferenceMatchResult['analysis'] {
        const recommendations: string[] = [];

        // Tonal analysis
        const lowGap = refSig.tonalBalance.low - curSig.tonalBalance.low;
        const highGap = refSig.tonalBalance.high - curSig.tonalBalance.high;

        let tonalDifference = 'Tonal balance is ';
        if (Math.abs(lowGap) < 0.02 && Math.abs(highGap) < 0.02) {
            tonalDifference += 'very close to reference.';
        } else {
            if (lowGap > 0.05) {
                tonalDifference += 'lacking low-end compared to reference. ';
                recommendations.push('Boost low frequencies (60-150 Hz) by ~' + (lowGap * 15).toFixed(1) + ' dB');
            } else if (lowGap < -0.05) {
                tonalDifference += 'too heavy in low-end. ';
                recommendations.push('Reduce low frequencies (60-150 Hz) by ~' + Math.abs(lowGap * 15).toFixed(1) + ' dB');
            }

            if (highGap > 0.05) {
                tonalDifference += 'Missing high-end brightness. ';
                recommendations.push('Boost high frequencies (8-12 kHz) by ~' + (highGap * 15).toFixed(1) + ' dB');
            } else if (highGap < -0.05) {
                tonalDifference += 'Too bright compared to reference. ';
                recommendations.push('Reduce high frequencies (8-12 kHz) by ~' + Math.abs(highGap * 15).toFixed(1) + ' dB');
            }
        }

        // Dynamics analysis
        const rmsDiff = refSig.dynamics.rms - curSig.dynamics.rms;
        const crestDiff = refSig.dynamics.crestFactor - curSig.dynamics.crestFactor;

        let dynamicsDifference = 'Dynamics are ';
        if (Math.abs(rmsDiff) < 1 && Math.abs(crestDiff) < 1) {
            dynamicsDifference += 'well-matched to reference.';
        } else {
            if (rmsDiff > 2) {
                dynamicsDifference += 'significantly quieter than reference. ';
                recommendations.push('Increase overall loudness with compression and limiting');
            } else if (rmsDiff < -2) {
                dynamicsDifference += 'louder than reference, may be over-compressed. ';
                recommendations.push('Reduce compression or lower limiter threshold');
            }

            if (crestDiff > 2) {
                dynamicsDifference += 'More dynamic range (less compressed). ';
            } else if (crestDiff < -2) {
                dynamicsDifference += 'More compressed than reference. ';
            }
        }

        // Stereo width analysis
        const avgRefWidth = (refSig.stereoWidth.low + refSig.stereoWidth.mid + refSig.stereoWidth.high) / 3;
        const avgCurWidth = (curSig.stereoWidth.low + curSig.stereoWidth.mid + curSig.stereoWidth.high) / 3;
        const widthGap = avgRefWidth - avgCurWidth;

        let stereoWidthDifference = 'Stereo width is ';
        if (Math.abs(widthGap) < 0.1) {
            stereoWidthDifference += 'comparable to reference.';
        } else if (widthGap > 0.2) {
            stereoWidthDifference += 'narrower than reference. ';
            recommendations.push('Widen stereo image, especially in high frequencies');
        } else if (widthGap < -0.2) {
            stereoWidthDifference += 'wider than reference. ';
            recommendations.push('Narrow stereo image to match reference');
        }

        // Loudness analysis
        let loudnessDifference = 'Loudness measurement ';
        if (refMetrics.lufs && curMetrics.lufs) {
            const lufsDiff = refMetrics.lufs.integrated - curMetrics.lufs.integrated;
            if (Math.abs(lufsDiff) < 0.5) {
                loudnessDifference += 'matches reference (' + curMetrics.lufs.integrated.toFixed(1) + ' LUFS).';
            } else if (lufsDiff > 0.5) {
                loudnessDifference += 'is ' + lufsDiff.toFixed(1) + ' LUFS quieter than reference.';
                recommendations.push('Increase overall loudness by ~' + lufsDiff.toFixed(1) + ' dB');
            } else {
                loudnessDifference += 'is ' + Math.abs(lufsDiff).toFixed(1) + ' LUFS louder than reference.';
                recommendations.push('Decrease overall loudness by ~' + Math.abs(lufsDiff).toFixed(1) + ' dB');
            }
        } else {
            loudnessDifference += 'unavailable (calculating...)';
        }

        return {
            tonalDifference,
            dynamicsDifference,
            stereoWidthDifference,
            loudnessDifference,
            recommendations
        };
    }

    /**
     * Quick match check - returns true if tracks are already very similar
     */
    async quickMatchCheck(ref: AudioBuffer, current: AudioBuffer): Promise<boolean> {
        const result = await this.analyzeReference(ref, current);
        return result.matchPercentage > 85;
    }
}

export const referenceMatchingService = new ReferenceMatchingService();
