import { AudioMetrics, MixSignature, Suggestion, ProcessingConfig, MixIntent, EQSettings, EchoMetrics, EchoReportTool, DynamicEQBand, LimiterConfig, CompressionPreset, SaturationConfig, StereoImagerConfig, TransientShaperConfig, ReverbConfig, MultibandCompressionConfig, DeEsserConfig, DynamicEQConfig, MixReadiness, ColorFilterType } from '../types';
import { storageService } from './storageService';

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));
const dbToLinear = (db: number) => Math.pow(10, db / 20);

export interface IMixAnalysisService { 
    extractMixSignature(buffer: AudioBuffer): Promise<MixSignature>;
    generateEchoMetrics(beforeBuffer: AudioBuffer, afterBuffer: AudioBuffer): Promise<EchoMetrics>; 
    applyPromptToMix(intent: MixIntent): ProcessingConfig;
    classifyMixReadiness(metrics: EchoMetrics): MixReadiness; 
    normalizeMixIntent(raw: any, current: ProcessingConfig, readiness: MixReadiness): ProcessingConfig; 
    analyzeStaticMetrics(bufferOverride?: AudioBuffer | null): AudioMetrics;
}

export class MixAnalysisService implements IMixAnalysisService { 
    
    analyzeStaticMetrics(bufferOverride?: AudioBuffer | null): AudioMetrics {
        const buffer = bufferOverride;
        if (!buffer) return { rms: 0, peak: 0, duration: 0, spectralCentroid: 0, spectralRolloff: 0, crestFactor: 0 };
        const data = buffer.getChannelData(0);
        let sumSq = 0;
        let peakVal = 0;
        for (let i = 0; i < data.length; i++) {
            const s = data[i];
            sumSq += s * s;
            if (Math.abs(s) > peakVal) peakVal = Math.abs(s);
        }
        const rms = Math.sqrt(sumSq / data.length);
        const crestFactor = rms > 0 ? 20 * Math.log10(peakVal / rms) : 0;
        // Convert both to dBFS (20 * log10(linear))
        const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -96;
        const peakDb = peakVal > 0 ? 20 * Math.log10(peakVal) : -96;
        return { rms: rmsDb, peak: peakDb, duration: buffer.duration, spectralCentroid: 0, spectralRolloff: 0, crestFactor };
    }

    async extractMixSignature(buffer: AudioBuffer): Promise<MixSignature> {
        const offlineCtx = new OfflineAudioContext(5, buffer.length, buffer.sampleRate);
        const source = offlineCtx.createBufferSource();
        source.buffer = buffer;

        const frequencies = [150, 400, 1000, 4000, 8000];
        const merger = offlineCtx.createChannelMerger(5);

        const low = offlineCtx.createBiquadFilter();
        low.type = 'lowpass';
        low.frequency.value = frequencies[0];

        const lowMid = offlineCtx.createBiquadFilter();
        lowMid.type = 'bandpass';
        lowMid.frequency.value = frequencies[1];

        const mid = offlineCtx.createBiquadFilter();
        mid.type = 'bandpass';
        mid.frequency.value = frequencies[2];

        const highMid = offlineCtx.createBiquadFilter();
        highMid.type = 'bandpass';
        highMid.frequency.value = frequencies[3];

        const high = offlineCtx.createBiquadFilter();
        high.type = 'highpass';
        high.frequency.value = frequencies[4];

        [low, lowMid, mid, highMid, high].forEach((filter, index) => {
            source.connect(filter);
            filter.connect(merger, 0, index);
        });

        merger.connect(offlineCtx.destination);
        source.start(0);

        const renderedBuffer = await offlineCtx.startRendering();

        const getBandRMS = (channelIndex: number) => {
            const data = renderedBuffer.getChannelData(channelIndex);
            let sumSq = 0;
            for (let i = 0; i < data.length; i += 100) {
                sumSq += data[i] * data[i];
            }
            return Math.sqrt(sumSq / (data.length / 100));
        };

        const bandEnergies = {
            low: getBandRMS(0),
            lowMid: getBandRMS(1),
            mid: getBandRMS(2),
            highMid: getBandRMS(3),
            high: getBandRMS(4)
        };

        const totalEnergy = Object.values(bandEnergies).reduce((a, b) => a + b, 0) || 1;
        const tonalBalance = {
            low: bandEnergies.low / totalEnergy,
            lowMid: bandEnergies.lowMid / totalEnergy,
            mid: bandEnergies.mid / totalEnergy,
            highMid: bandEnergies.highMid / totalEnergy,
            high: bandEnergies.high / totalEnergy
        };

        const rawData = buffer.getChannelData(0);
        let maxPeak = 0;
        let sumSqTotal = 0;
        for (let i = 0; i < rawData.length; i += 100) {
            const abs = Math.abs(rawData[i]);
            if (abs > maxPeak) maxPeak = abs;
            sumSqTotal += abs * abs;
        }
        const rmsTotal = Math.sqrt(sumSqTotal / (rawData.length / 100));
        const crestFactor = rmsTotal > 0 ? 20 * Math.log10(maxPeak / rmsTotal) : 0;

        let stereoWidthVal = 0;
        if (buffer.numberOfChannels > 1) {
            const L = buffer.getChannelData(0);
            const R = buffer.getChannelData(1);
            let sideEnergy = 0;
            let midEnergy = 0;
            for(let i=0; i<L.length; i+=1000) {
                const mid = (L[i] + R[i]) / 2;
                const side = (L[i] - R[i]) / 2;
                midEnergy += mid * mid;
                sideEnergy += side * side;
            }
            stereoWidthVal = midEnergy > 0 ? Math.sqrt(sideEnergy / midEnergy) : 0;
        }

        return {
            tonalBalance,
            stereoWidth: { 
                low: stereoWidthVal * 0.5, 
                mid: stereoWidthVal, 
                high: stereoWidthVal * 1.2 
            },
            dynamics: {
                rms: rmsTotal > 0 ? 20 * Math.log10(rmsTotal) : -Infinity,
                peak: maxPeak > 0 ? 20 * Math.log10(maxPeak) : -Infinity,
                crestFactor: crestFactor
            },
            character: {
                brightness: tonalBalance.high + tonalBalance.highMid,
                warmth: tonalBalance.low + tonalBalance.lowMid
            }
        };
    }

    classifyMixReadiness(metrics: EchoMetrics): MixReadiness {
        const rmsDb = metrics.after.rms; 
        const peakDb = metrics.after.peak;
        const crestFactor = metrics.after.crestFactor;

        if (rmsDb < -18 || crestFactor > 12) { 
            return 'raw_demo';
        }
        if (rmsDb >= -18 && rmsDb < -12 && crestFactor > 8 && peakDb < -1) { 
            return 'in_progress';
        }
        if (rmsDb >= -12 && rmsDb < -8 && crestFactor > 6 && peakDb < -0.8) { 
            return 'pre_master';
        }
        if (rmsDb >= -8 && rmsDb <= -4 && crestFactor <= 6 && peakDb >= -0.8) { 
            return 'finished_master';
        }
        
        return 'in_progress'; 
    }

    async generateEchoMetrics(beforeBuffer: AudioBuffer, afterBuffer: AudioBuffer): Promise<EchoMetrics> {
        const analyzeBuffer = async (buffer: AudioBuffer) => {
            const signature = await this.extractMixSignature(buffer);
            return {
                tonalBalance: signature.tonalBalance,
                rms: signature.dynamics.rms,
                peak: signature.dynamics.peak,
                crestFactor: signature.dynamics.crestFactor,
                stereoWidth: (signature.stereoWidth.low + signature.stereoWidth.mid + signature.stereoWidth.high) / 3
            };
        };

        const beforeMetrics = await analyzeBuffer(beforeBuffer);
        let afterMetrics = await analyzeBuffer(afterBuffer);

        if (afterMetrics.peak > -0.3) {
            console.warn(`Clipping detected in 'after' buffer (${afterMetrics.peak.toFixed(1)} dBFS). Applying temporary gain reduction for AI analysis.`);
            const gainToApply = -(afterMetrics.peak - (-0.3));
            
            const offlineCtx = new OfflineAudioContext(afterBuffer.numberOfChannels, afterBuffer.length, afterBuffer.sampleRate);
            const source = offlineCtx.createBufferSource();
            source.buffer = afterBuffer;
            const gainNode = offlineCtx.createGain();
            gainNode.gain.value = dbToLinear(gainToApply); 
            
            source.connect(gainNode);
            gainNode.connect(offlineCtx.destination);
            source.start(0);

            const normalizedBuffer = await offlineCtx.startRendering();
            afterMetrics = await analyzeBuffer(normalizedBuffer); 
            console.log(`Re-analyzed metrics with safe gain. New peak: ${afterMetrics.peak.toFixed(1)} dBFS`);
            storageService.pushDebugLog({ level: 'warn', category: 'Metrics', message: `Post-processing peak was ${beforeMetrics.peak.toFixed(1)} dBFS, reduced to ${afterMetrics.peak.toFixed(1)} dBFS for AI analysis.` }); 
        }

        const issues: string[] = [];
        if (afterMetrics.peak > -0.5) issues.push("Peaks are high, risking clipping on some playback systems.");
        if (afterMetrics.rms < -14) issues.push("Overall loudness is low for most commercial platforms.");
        if (afterMetrics.crestFactor > 12) issues.push("Dynamic range is very wide, may lack punch.");
        if (afterMetrics.tonalBalance.high < beforeMetrics.tonalBalance.high * 0.8) issues.push("High frequencies seem dull compared to the original.");
        if (afterMetrics.tonalBalance.low > beforeMetrics.tonalBalance.low * 1.2) issues.push("Low frequencies may be muddy or boomy.");
        if (afterMetrics.stereoWidth < 0.2) issues.push("Stereo image is narrow.");

        return {
            before: beforeMetrics,
            after: afterMetrics,
            issues: issues
        };
    }

    applyPromptToMix(intent: MixIntent): ProcessingConfig {
        const config: ProcessingConfig = {};

        if (intent.eqAdjustment && intent.eqAdjustment.length > 0) {
            config.eq = intent.eqAdjustment;
        }

        if (intent.dynamicProcessing) {
            const makeup = intent.dynamicProcessing.makeupGain || 0;
            config.compression = {
                threshold: -24 + (intent.dynamicProcessing.thresholdOffset || 0),
                ratio: intent.dynamicProcessing.ratio || 2.5,
                attack: 0.015,
                release: 0.25,
                makeupGain: makeup
            };
        }

        if (intent.stereoWidthOffset !== 0) {
            const baseWidth = 1.0; 
            const newWidth = Math.max(0, Math.min(2, baseWidth + (intent.stereoWidthOffset * 0.5)));
            
            config.stereoImager = {
                lowWidth: newWidth * 0.8,
                midWidth: newWidth,
                highWidth: newWidth * 1.2,
                crossovers: [300, 5000]
            };
        }

        if (intent.reverbRequest) {
            config.motionReverb = {
                mix: intent.reverbRequest.mix,
                decay: intent.reverbRequest.type === 'hall' ? 2.5 : (intent.reverbRequest.type === 'plate' ? 1.2 : 0.8),
                preDelay: 0.02
            };
        }

        return config;
    }

    normalizeMixIntent(
        raw: any,
        current: ProcessingConfig,
        readiness: MixReadiness 
    ): ProcessingConfig {
        const next: ProcessingConfig = { ...current };

        const getClampedNumber = (val: any, min: number, max: number, defaultValue: number, paramName: string): number => {
            let effectiveMin = min;
            let effectiveMax = max;

            if (readiness === 'finished_master') {
                if (paramName.includes('eq[') && paramName.includes('].gain')) {
                    effectiveMin = clamp(min, -2, -2); 
                    effectiveMax = clamp(max, 1.5, 1.5);   
                    if (paramName.includes('highshelf')) {
                         effectiveMax = clamp(max, 0.5, 0.5); 
                    }
                } else if (paramName.includes('saturation.amount') || paramName.includes('saturation.mix')) {
                    effectiveMax = clamp(max, 0.2, 0.2); 
                } else if (paramName.includes('stereoImager') && (paramName.includes('Width') || paramName.includes('amount'))) {
                    effectiveMin = clamp(min, 0.9, 0.9); 
                    effectiveMax = clamp(max, 1.1, 1.1); 
                } else if (paramName.includes('limiter.threshold')) { 
                    effectiveMax = clamp(max, -0.8, -0.8);
                } else if (paramName.includes('outputTrimDb')) {
                    effectiveMin = clamp(min, -3, -3); 
                    effectiveMax = clamp(max, 0, 0);   
                } else if (paramName.includes('compression.ratio')) { 
                    effectiveMax = clamp(max, 4, 4);
                }
            }


            if (typeof val !== 'number' || isNaN(val)) {
                storageService.pushDebugLog({
                    level: 'warn',
                    category: 'MixIntentValidator',
                    message: `Invalid number for ${paramName}: ${val}. Using default ${defaultValue}. (Readiness: ${readiness})`
                });
                return defaultValue;
            }
            return clamp(val, effectiveMin, effectiveMax); 
        };

        const getClampedEnum = (val: any, enumOptions: string[], defaultValue: string, paramName: string): string => {
            if (typeof val !== 'string' || !enumOptions.includes(val)) {
                storageService.pushDebugLog({
                    level: 'warn',
                    category: 'MixIntentValidator',
                    message: `Invalid enum value for ${paramName}: ${val}. Using default ${defaultValue}.`
                });
                return defaultValue;
            }
            return val;
        };

        if (raw.inputTrimDb !== undefined) {
            next.inputTrimDb = getClampedNumber(raw.inputTrimDb, -24, 6, -3, 'inputTrimDb');
        }
        if (raw.outputTrimDb !== undefined) {
            next.outputTrimDb = getClampedNumber(raw.outputTrimDb, -24, 0, -1, 'outputTrimDb');
        }

        if (Array.isArray(raw.eq)) {
            next.eq = raw.eq.map((band: any, index: number) => ({
                frequency: getClampedNumber(band.frequency, 20, 20000, 1000, `eq[${index}].frequency`),
                gain: getClampedNumber(band.gain, -18, 18, 0, `eq[${index}].gain`),
                q: getClampedNumber(band.q, 0.1, 18, 1.0, `eq[${index}].q`),
                type: getClampedEnum(band.type, ['lowshelf', 'peaking', 'highshelf'], 'peaking', `eq[${index}].type`) as 'lowshelf' | 'peaking' | 'highshelf',
            }));
        }

        if (raw.compression) {
            next.compression = {
                threshold: getClampedNumber(raw.compression.threshold, -60, 0, -24, 'compression.threshold'),
                ratio: getClampedNumber(raw.compression.ratio, 1.0, 20.0, 3.0, 'compression.ratio'),
                attack: getClampedNumber(raw.compression.attack, 0.001, 1.0, 0.003, 'compression.attack'),
                release: getClampedNumber(raw.compression.release, 0.01, 2.0, 0.25, 'compression.release'),
                makeupGain: getClampedNumber(raw.compression.makeupGain, -12, 12, 0, 'compression.makeupGain'),
            };
        }

        if (raw.saturation) {
            next.saturation = {
                type: getClampedEnum(raw.saturation.type, ['tape', 'tube', 'digital'], 'tape', 'saturation.type') as "tape" | "tube" | "digital",
                amount: getClampedNumber(raw.saturation.amount, 0.0, 1.0, 0.0, 'saturation.amount'),
                mix: getClampedNumber(raw.saturation.mix, 0.0, 1.0, 1.0, 'saturation.mix'),
            };
        }

        if (raw.stereoImager) {
            next.stereoImager = {
                lowWidth: getClampedNumber(raw.stereoImager.lowWidth, 0.0, 2.0, 1.0, 'stereoImager.lowWidth'),
                midWidth: getClampedNumber(raw.stereoImager.midWidth, 0.0, 2.0, 1.0, 'stereoImager.midWidth'),
                highWidth: getClampedNumber(raw.stereoImager.highWidth, 0.0, 2.0, 1.0, 'stereoImager.highWidth'),
                crossovers: Array.isArray(raw.stereoImager.crossovers) && raw.stereoImager.crossovers.length === 2
                    ? [
                        getClampedNumber(raw.stereoImager.crossovers[0], 50, 1000, 300, 'stereoImager.crossovers[0]'),
                        getClampedNumber(raw.stereoImager.crossovers[1], 1000, 15000, 5000, 'stereoImager.crossovers[1]'),
                    ]
                    : [300, 5000], 
            };
        }

        if (raw.transientShaper) {
            next.transientShaper = {
                attack: getClampedNumber(raw.transientShaper.attack, -1.0, 1.0, 0.0, 'transientShaper.attack'),
                sustain: getClampedNumber(raw.transientShaper.sustain, -1.0, 1.0, 0.0, 'transientShaper.sustain'),
                mix: getClampedNumber(raw.transientShaper.mix, 0.0, 1.0, 1.0, 'transientShaper.mix'),
            };
        }
        
        if (raw.deEsser) {
            next.deEsser = {
                frequency: getClampedNumber(raw.deEsser.frequency, 3000, 10000, 7000, 'deEsser.frequency'),
                threshold: getClampedNumber(raw.deEsser.threshold, -40, 0, -20, 'deEsser.threshold'),
                amount: getClampedNumber(raw.deEsser.amount, 0.0, 1.0, 0.0, 'deEsser.amount'),
            };
        }

        if (Array.isArray(raw.dynamicEq)) {
            next.dynamicEq = raw.dynamicEq.map((band: any, index: number) => ({
                id: band.id || `dyn-eq-${index}`,
                frequency: getClampedNumber(band.frequency, 20, 20000, 1000, `dynamicEq[${index}].frequency`),
                gain: getClampedNumber(band.gain, -18, 18, 0, `dynamicEq[${index}].gain`),
                q: getClampedNumber(band.q, 0.1, 18, 1.0, `dynamicEq[${index}].q`),
                threshold: getClampedNumber(band.threshold, -60, 0, -20, `dynamicEq[${index}].threshold`),
                attack: getClampedNumber(band.attack, 0.001, 1.0, 0.01, `dynamicEq[${index}].attack`),
                release: getClampedNumber(band.release, 0.01, 2.0, 0.1, `dynamicEq[${index}].release`),
                type: getClampedEnum(band.type, ['peaking', 'lowshelf', 'highshelf'], 'peaking', `dynamicEq[${index}].type`) as 'peaking' | 'lowshelf' | 'highshelf',
                mode: getClampedEnum(band.mode, ['compress', 'expand'], 'compress', `dynamicEq[${index}].mode`) as 'compress' | 'expand',
                enabled: typeof band.enabled === 'boolean' ? band.enabled : false,
            }));
        }

        if (raw.multibandCompression) {
            const mb = raw.multibandCompression;
            next.multibandCompression = {
                low: {
                    threshold: getClampedNumber(mb.low?.threshold, -60, 0, -24, 'multiband.low.threshold'),
                    ratio: getClampedNumber(mb.low?.ratio, 1, 20, 3, 'multiband.low.ratio'),
                    attack: getClampedNumber(mb.low?.attack, 0.001, 1, 0.003, 'multiband.low.attack'),
                    release: getClampedNumber(mb.low?.release, 0.01, 2, 0.25, 'multiband.low.release'),
                    makeupGain: getClampedNumber(mb.low?.makeupGain, -12, 12, 0, 'multiband.low.makeupGain'),
                },
                mid: {
                    threshold: getClampedNumber(mb.mid?.threshold, -60, 0, -24, 'multiband.mid.threshold'),
                    ratio: getClampedNumber(mb.mid?.ratio, 1, 20, 3, 'multiband.mid.ratio'),
                    attack: getClampedNumber(mb.mid?.attack, 0.001, 1, 0.003, 'multiband.mid.attack'),
                    release: getClampedNumber(mb.mid?.release, 0.01, 2, 0.25, 'multiband.mid.release'),
                    makeupGain: getClampedNumber(mb.mid?.makeupGain, -12, 12, 0, 'multiband.mid.makeupGain'),
                },
                high: {
                    threshold: getClampedNumber(mb.high?.threshold, -60, 0, -24, 'multiband.high.threshold'),
                    ratio: getClampedNumber(mb.high?.ratio, 1, 20, 3, 'multiband.high.ratio'),
                    attack: getClampedNumber(mb.high?.attack, 0.001, 1, 0.003, 'multiband.high.attack'),
                    release: getClampedNumber(mb.high?.release, 0.01, 2, 0.25, 'multiband.high.release'),
                    makeupGain: getClampedNumber(mb.high?.makeupGain, -12, 12, 0, 'multiband.high.makeupGain'),
                },
                crossovers: Array.isArray(mb.crossovers) && mb.crossovers.length === 2
                    ? [
                        getClampedNumber(mb.crossovers[0], 50, 500, 150, 'multiband.crossovers[0]'),
                        getClampedNumber(mb.crossovers[1], 1000, 10000, 4000, 'multiband.crossovers[1]'),
                    ]
                    : [150, 4000],
            };
        }

        if (raw.motionReverb) {
            next.motionReverb = {
                mix: getClampedNumber(raw.motionReverb.mix, 0.0, 1.0, 0.0, 'motionReverb.mix'),
                decay: getClampedNumber(raw.motionReverb.decay, 0.1, 5.0, 2.0, 'motionReverb.decay'),
                preDelay: getClampedNumber(raw.motionReverb.preDelay, 0.0, 0.1, 0.01, 'motionReverb.preDelay'),
                motion: {
                    bpm: getClampedNumber(raw.motionReverb.motion?.bpm, 60, 180, 120, 'motionReverb.motion.bpm'),
                    depth: getClampedNumber(raw.motionReverb.motion?.depth, 0.0, 1.0, 0.0, 'motionReverb.motion.depth'),
                },
                duckingAmount: getClampedNumber(raw.motionReverb.duckingAmount, 0.0, 1.0, 0.0, 'motionReverb.duckingAmount'),
            };
        }

        if (raw.limiter) {
            next.limiter = {
                threshold: getClampedNumber(raw.limiter.threshold, -12, 0, -0.8, 'limiter.threshold'),
                release: getClampedNumber(raw.limiter.release, 0.01, 0.5, 0.08, 'limiter.release'),
                ratio: getClampedNumber(raw.limiter.ratio, 1, 20, 20, 'limiter.ratio'),
            };
        }

        if (raw.colorFilter !== undefined) {
            next.colorFilter = getClampedEnum(raw.colorFilter, ['Dawn Glow', 'Venice Blue', 'Jellyfish Warmth', 'Amber Tape', 'Noir Filter', 'Buffalo Snow', 'None'], 'None', 'colorFilter') as ColorFilterType;
        }

        storageService.pushDebugLog({
            level: 'info',
            category: 'MixIntentValidator',
            message: `Normalized MixIntent. Before: ${JSON.stringify(raw)}, After: ${JSON.stringify(next)}`
        });

        return next;
    }
}

export const mixAnalysisService = new MixAnalysisService();