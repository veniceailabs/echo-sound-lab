import { 
    MultibandCompressionConfig, 
    TransientShaperConfig, 
    StereoImagerConfig,
    DeEsserConfig,
    DynamicEQConfig,
    SaturationConfig,
    ReverbConfig,
    ColorFilterType,
    DynamicEQBand
} from '../types';

export class AdvancedDspService {

    createMultibandCompressor(ctx: BaseAudioContext, config: MultibandCompressionConfig) {
        const input = ctx.createGain();
        const output = ctx.createGain();

        // Validate and sanitize crossover frequencies
        const crossover1 = Math.max(50, Math.min(500, config.crossovers?.[0] || 150));
        const crossover2 = Math.max(crossover1 + 500, Math.min(10000, config.crossovers?.[1] || 4000));

        // Reasonable compression with good level control
        const DEFAULT_LOW = { threshold: -24, ratio: 2.0, attack: 0.030, release: 0.250, makeupGain: 0 };
        const DEFAULT_MID = { threshold: -24, ratio: 2.0, attack: 0.030, release: 0.250, makeupGain: 0 };
        const DEFAULT_HIGH = { threshold: -24, ratio: 2.0, attack: 0.030, release: 0.250, makeupGain: 0 };

        const lowSettings = { ...DEFAULT_LOW, ...config.low };
        const midSettings = { ...DEFAULT_MID, ...config.mid };
        const highSettings = { ...DEFAULT_HIGH, ...config.high };

        // Use 1st-order filters instead of 2nd-order to reduce phase distortion
        // Single-order filters only (no cascading) - much cleaner sound
        const Q_FIRSTORDER = 0.707; // Standard Butterworth for 1st order

        // LOW BAND: Single lowpass filter at crossover1
        const lowpass1 = ctx.createBiquadFilter();
        lowpass1.type = 'lowpass';
        lowpass1.frequency.value = crossover1;
        lowpass1.Q.value = Q_FIRSTORDER;

        const lowBandComp = ctx.createDynamicsCompressor();
        const lowBandGain = ctx.createGain();
        input.connect(lowpass1);
        lowpass1.connect(lowBandComp);
        lowBandComp.connect(lowBandGain);
        lowBandGain.connect(output);

        // MID BAND: Highpass at crossover1 → Lowpass at crossover2 (single filters)
        const highpass1 = ctx.createBiquadFilter();
        highpass1.type = 'highpass';
        highpass1.frequency.value = crossover1;
        highpass1.Q.value = Q_FIRSTORDER;

        const lowpass2 = ctx.createBiquadFilter();
        lowpass2.type = 'lowpass';
        lowpass2.frequency.value = crossover2;
        lowpass2.Q.value = Q_FIRSTORDER;

        const midBandComp = ctx.createDynamicsCompressor();
        const midBandGain = ctx.createGain();
        input.connect(highpass1);
        highpass1.connect(lowpass2);
        lowpass2.connect(midBandComp);
        midBandComp.connect(midBandGain);
        midBandGain.connect(output);

        // HIGH BAND: Single highpass filter at crossover2
        const highpass2 = ctx.createBiquadFilter();
        highpass2.type = 'highpass';
        highpass2.frequency.value = crossover2;
        highpass2.Q.value = Q_FIRSTORDER;

        const highBandComp = ctx.createDynamicsCompressor();
        const highBandGain = ctx.createGain();
        input.connect(highpass2);
        highpass2.connect(highBandComp);
        highBandComp.connect(highBandGain);
        highBandGain.connect(output);

        // Apply safe compression settings
        lowBandComp.threshold.value = lowSettings.threshold;
        lowBandComp.ratio.value = lowSettings.ratio;
        lowBandComp.attack.value = lowSettings.attack;
        lowBandComp.release.value = lowSettings.release;
        lowBandComp.knee.value = 6; // Soft knee
        lowBandGain.gain.value = Math.pow(10, lowSettings.makeupGain / 20);

        midBandComp.threshold.value = midSettings.threshold;
        midBandComp.ratio.value = midSettings.ratio;
        midBandComp.attack.value = midSettings.attack;
        midBandComp.release.value = midSettings.release;
        midBandComp.knee.value = 6;
        midBandGain.gain.value = Math.pow(10, midSettings.makeupGain / 20);

        highBandComp.threshold.value = highSettings.threshold;
        highBandComp.ratio.value = highSettings.ratio;
        highBandComp.attack.value = highSettings.attack;
        highBandComp.release.value = highSettings.release;
        highBandComp.knee.value = 6;
        highBandGain.gain.value = Math.pow(10, highSettings.makeupGain / 20);

        return {
            input,
            output,
            setLow: (t: number, r: number, a: number, rel: number, mg: number) => {
                lowBandComp.threshold.setTargetAtTime(t, ctx.currentTime, 0.02);
                lowBandComp.ratio.setTargetAtTime(r, ctx.currentTime, 0.02);
                lowBandComp.attack.setTargetAtTime(a, ctx.currentTime, 0.02);
                lowBandComp.release.setTargetAtTime(rel, ctx.currentTime, 0.02);
                lowBandGain.gain.setTargetAtTime(Math.pow(10, mg / 20), ctx.currentTime, 0.02);
            },
            setMid: (t: number, r: number, a: number, rel: number, mg: number) => {
                midBandComp.threshold.setTargetAtTime(t, ctx.currentTime, 0.02);
                midBandComp.ratio.setTargetAtTime(r, ctx.currentTime, 0.02);
                midBandComp.attack.setTargetAtTime(a, ctx.currentTime, 0.02);
                midBandComp.release.setTargetAtTime(rel, ctx.currentTime, 0.02);
                midBandGain.gain.setTargetAtTime(Math.pow(10, mg / 20), ctx.currentTime, 0.02);
            },
            setHigh: (t: number, r: number, a: number, rel: number, mg: number) => {
                highBandComp.threshold.setTargetAtTime(t, ctx.currentTime, 0.02);
                highBandComp.ratio.setTargetAtTime(r, ctx.currentTime, 0.02);
                highBandComp.attack.setTargetAtTime(a, ctx.currentTime, 0.02);
                highBandComp.release.setTargetAtTime(rel, ctx.currentTime, 0.02);
                highBandGain.gain.setTargetAtTime(Math.pow(10, mg / 20), ctx.currentTime, 0.02);
            },
            setCrossovers: (c1: number, c2: number) => {
                const validC1 = Math.max(50, Math.min(500, c1));
                const validC2 = Math.max(validC1 + 500, Math.min(10000, c2));

                // Update crossover frequencies (1st-order filters)
                lowpass1.frequency.setTargetAtTime(validC1, ctx.currentTime, 0.02);
                highpass1.frequency.setTargetAtTime(validC1, ctx.currentTime, 0.02);
                lowpass2.frequency.setTargetAtTime(validC2, ctx.currentTime, 0.02);
                highpass2.frequency.setTargetAtTime(validC2, ctx.currentTime, 0.02);
            }
        };
    }

    createTransientShaper(ctx: BaseAudioContext, config: TransientShaperConfig) {
        const input = ctx.createGain();
        const output = ctx.createGain();

        const dryGain = ctx.createGain();
        const wetGain = ctx.createGain();

        const transientComp = ctx.createDynamicsCompressor();
        transientComp.threshold.value = -10; 
        transientComp.ratio.value = 10;
        transientComp.attack.value = 0.001; 
        transientComp.release.value = 0.05; 
        const attackGain = ctx.createGain(); 

        const sustainComp = ctx.createDynamicsCompressor();
        sustainComp.threshold.value = -30; 
        sustainComp.ratio.value = 2; 
        sustainComp.attack.value = 0.05; 
        sustainComp.release.value = 0.5; 
        const sustainGain = ctx.createGain(); 

        input.connect(dryGain);
        dryGain.connect(output);

        input.connect(transientComp);
        transientComp.connect(attackGain);
        attackGain.connect(wetGain);

        input.connect(sustainComp);
        sustainComp.connect(sustainGain);
        sustainGain.connect(wetGain);

        wetGain.connect(output);

        attackGain.gain.value = 1 + config.attack;
        sustainGain.gain.value = 1 + config.sustain;
        dryGain.gain.value = 1 - config.mix;
        wetGain.gain.value = config.mix;

        return {
            input,
            output,
            setAttack: (val: number) => { attackGain.gain.setTargetAtTime(1 + val, ctx.currentTime, 0.02); },
            setSustain: (val: number) => { sustainGain.gain.setTargetAtTime(1 + val, ctx.currentTime, 0.02); },
            setMix: (mix: number) => {
                dryGain.gain.setTargetAtTime(1 - mix, ctx.currentTime, 0.02);
                wetGain.gain.setTargetAtTime(mix, ctx.currentTime, 0.02);
            }
        };
    }

    createDeEsser(ctx: BaseAudioContext, config: DeEsserConfig) {
        const input = ctx.createGain();
        const output = ctx.createGain();

        // Split into sibilant detection path and main signal path
        const splitter = ctx.createGain();
        const mainPath = ctx.createGain();

        input.connect(splitter);
        input.connect(mainPath);

        // Sibilant detection: isolate high frequencies
        const sibilantBandFilter = ctx.createBiquadFilter();
        sibilantBandFilter.type = 'bandpass';
        sibilantBandFilter.frequency.value = config.frequency;
        sibilantBandFilter.Q.value = 10;

        // Compress the detected sibilant band
        const sibilantCompressor = ctx.createDynamicsCompressor();
        sibilantCompressor.threshold.value = config.threshold;
        sibilantCompressor.ratio.value = 4 + (config.amount * 6);
        sibilantCompressor.attack.value = 0.001;  // Fast attack for sibilants
        sibilantCompressor.release.value = 0.05;
        sibilantCompressor.knee.value = 3; // Soft knee

        // Invert the compressed signal for subtraction
        const invertCompressed = ctx.createGain();
        invertCompressed.gain.value = -1;

        // Add original sibilant band back (creates difference signal)
        const differenceMixer = ctx.createGain();

        splitter.connect(sibilantBandFilter);
        sibilantBandFilter.connect(sibilantCompressor);
        sibilantBandFilter.connect(differenceMixer); // Original sibilant
        sibilantCompressor.connect(invertCompressed);
        invertCompressed.connect(differenceMixer); // Inverted compressed

        // Mix reduced sibilance back with main signal
        differenceMixer.connect(output);
        mainPath.connect(output);

        return {
            input,
            output,
            setFrequency: (f: number) => {
                sibilantBandFilter.frequency.setTargetAtTime(f, ctx.currentTime, 0.02);
            },
            setThreshold: (t: number) => { sibilantCompressor.threshold.setTargetAtTime(t, ctx.currentTime, 0.02); },
            setIntensity: (amt: number) => {
                sibilantCompressor.ratio.setTargetAtTime(4 + (amt * 6), ctx.currentTime, 0.02);
            }
        };
    }

    createDynamicEQ(ctx: BaseAudioContext, config: DynamicEQConfig) {
        const input = ctx.createGain();
        const output = ctx.createGain();

        const bandProcessors: Array<{
            eqFilter: BiquadFilterNode;
            detectorFilter: BiquadFilterNode;
            compressor: DynamicsCompressorNode;
            dynamicGain: GainNode;
            enabledGain: GainNode;
        }> = [];

        // Main signal path (passes through unaffected if no bands enabled)
        const mainPath = ctx.createGain();
        input.connect(mainPath);
        mainPath.connect(output);

        config.slice(0, 2).forEach((bandConfig: DynamicEQBand) => {
            // Main signal path: EQ filter → dynamic gain (controlled by detector)
            const eqFilter = ctx.createBiquadFilter();
            eqFilter.type = bandConfig.type;
            eqFilter.frequency.value = bandConfig.frequency;
            eqFilter.Q.value = bandConfig.q;
            eqFilter.gain.value = bandConfig.gain;

            // Detection path: isolate frequency for level detection
            const detectorFilter = ctx.createBiquadFilter();
            detectorFilter.type = 'bandpass'; // Always bandpass for detection
            detectorFilter.frequency.value = bandConfig.frequency;
            detectorFilter.Q.value = bandConfig.q * 2; // Tighter Q for detection

            // Compressor acts on detected frequency level
            const compressor = ctx.createDynamicsCompressor();
            compressor.threshold.value = bandConfig.threshold;
            compressor.ratio.value = bandConfig.mode === 'expand' ? 1 / 4 : 4;
            compressor.attack.value = bandConfig.attack;
            compressor.release.value = bandConfig.release;
            compressor.knee.value = 6; // Smooth compression

            // Dynamic gain controlled by compressor
            const dynamicGain = ctx.createGain();
            dynamicGain.gain.value = 1;

            const enabledGain = ctx.createGain();
            enabledGain.gain.value = bandConfig.enabled ? 1 : 0;

            // Wire it up:
            // Detection path: input → detector filter → compressor → (controls dynamicGain)
            input.connect(detectorFilter);
            detectorFilter.connect(compressor);

            // Main path: input → EQ filter → dynamic gain → enabled gate → output
            input.connect(eqFilter);
            eqFilter.connect(dynamicGain);

            // Compressor output creates gain reduction envelope
            // Mix with original to create dynamic EQ effect
            compressor.connect(dynamicGain);

            dynamicGain.connect(enabledGain);
            enabledGain.connect(output);

            bandProcessors.push({
                eqFilter,
                detectorFilter,
                compressor,
                dynamicGain,
                enabledGain,
            });
        });

        return {
            input,
            output,
            updateBand: (idx: number, b: DynamicEQBand) => {
                if (bandProcessors[idx]) {
                    const band = bandProcessors[idx];
                    band.eqFilter.frequency.setTargetAtTime(b.frequency, ctx.currentTime, 0.02);
                    band.eqFilter.Q.setTargetAtTime(b.q, ctx.currentTime, 0.02);
                    band.eqFilter.gain.setTargetAtTime(b.gain, ctx.currentTime, 0.02);

                    band.detectorFilter.frequency.setTargetAtTime(b.frequency, ctx.currentTime, 0.02);
                    band.detectorFilter.Q.setTargetAtTime(b.q * 2, ctx.currentTime, 0.02);

                    band.compressor.threshold.setTargetAtTime(b.threshold, ctx.currentTime, 0.02);
                    band.compressor.ratio.setTargetAtTime(b.mode === 'expand' ? 1 / 4 : 4, ctx.currentTime, 0.02);
                    band.compressor.attack.setTargetAtTime(b.attack, ctx.currentTime, 0.02);
                    band.compressor.release.setTargetAtTime(b.release, ctx.currentTime, 0.02);
                }
            },
            toggleBand: (idx: number, enabled: boolean) => {
                if (bandProcessors[idx]) {
                    bandProcessors[idx].enabledGain.gain.setTargetAtTime(enabled ? 1 : 0, ctx.currentTime, 0.05);
                }
            }
        };
    }

    createSaturation(ctx: BaseAudioContext, config: SaturationConfig) {
        const input = ctx.createGain();
        const output = ctx.createGain();

        const shaper = ctx.createWaveShaper();
        shaper.oversample = '4x';

        const dry = ctx.createGain();
        const wet = ctx.createGain();

        input.connect(dry);
        input.connect(shaper);

        shaper.connect(wet);
        dry.connect(output);
        wet.connect(output);

        // Saturation curve generators - includes Airwindows-style algorithms
        const makeCurve = (amount: number, type: string) => {
            const k = typeof amount === 'number' ? amount : 0;
            const n_samples = 4096; // Higher resolution for Airwindows curves
            const curve = new Float32Array(n_samples);
            const halfPi = Math.PI / 2;

            for (let i = 0; i < n_samples; ++i) {
                const x = (i * 2) / n_samples - 1; // -1 to 1

                switch (type) {
                    case 'tube':
                        // Classic tube emulation - asymmetric harmonics
                        curve[i] = x * (1 + k * 0.5) - 0.2 * Math.pow(x, 3);
                        break;

                    case 'tape':
                        // Tape saturation with soft compression
                        curve[i] = (x + k * Math.sin(x * Math.PI)) / (1 + k);
                        break;

                    case 'digital':
                        // Hard digital clipping
                        curve[i] = Math.max(-1, Math.min(1, x * (1 + k * 10)));
                        break;

                    case 'density':
                        // Airwindows Density algorithm - sine-based soft saturation
                        // Port of Chris Johnson's legendary algorithm
                        {
                            const absX = Math.abs(x);
                            let bridgerectifier = absX * halfPi;
                            if (bridgerectifier > halfPi) bridgerectifier = halfPi;

                            // Positive density = boosted sine saturation
                            if (k >= 0) {
                                bridgerectifier = Math.sin(bridgerectifier);
                            } else {
                                // Negative density = starved cosine
                                bridgerectifier = 1 - Math.cos(bridgerectifier);
                            }

                            // Blend based on amount
                            const blend = Math.abs(k);
                            const result = (absX * (1 - blend)) + (bridgerectifier * blend);
                            curve[i] = x >= 0 ? result : -result;
                        }
                        break;

                    case 'console':
                        // Airwindows Console-style encoding - frequency-dependent saturation
                        // Creates "impedance-like" behavior where signals interact
                        {
                            const absX = Math.abs(x);
                            // Console uses a spiral/density hybrid
                            let processed = absX;
                            if (absX > 0) {
                                // Soft knee saturation with harmonics
                                const knee = 0.5 + (k * 0.3);
                                if (absX > knee) {
                                    const excess = absX - knee;
                                    processed = knee + (excess / (1 + excess * (1 + k * 2)));
                                }
                                // Add subtle harmonics
                                processed += k * 0.05 * Math.sin(absX * Math.PI * 2);
                            }
                            curve[i] = x >= 0 ? processed : -processed;
                        }
                        break;

                    case 'spiral':
                        // Airwindows Spiral - less fat than Density, more clarity
                        {
                            const absX = Math.abs(x);
                            // Spiral algorithm - arctangent-based
                            const saturated = (2 / Math.PI) * Math.atan(absX * (1 + k * 3));
                            const blend = Math.min(1, k);
                            const result = (absX * (1 - blend)) + (saturated * blend);
                            curve[i] = x >= 0 ? result : -result;
                        }
                        break;

                    case 'channel':
                        // Airwindows Channel - one stage Density with simple dry/wet
                        {
                            const absX = Math.abs(x);
                            let bridgerectifier = absX * halfPi;
                            if (bridgerectifier > halfPi) bridgerectifier = halfPi;
                            bridgerectifier = Math.sin(bridgerectifier);
                            // Simple blend
                            const result = (absX * (1 - k)) + (bridgerectifier * k);
                            curve[i] = x >= 0 ? result : -result;
                        }
                        break;

                    case 'totape':
                        // Airwindows ToTape - tape head bump + saturation + flutter simulation
                        // Emulates magnetic tape recording characteristics
                        {
                            const absX = Math.abs(x);
                            // Tape head bump: slight bass boost and compression behavior
                            const headBump = 1.0 + (k * 0.1 * Math.cos(absX * Math.PI * 0.5));
                            // Tape saturation: soft limiting with harmonic content
                            let taped = absX * headBump;
                            // Apply soft saturation curve (softer than digital, harder than tube)
                            if (taped > 0.5) {
                                const excess = taped - 0.5;
                                taped = 0.5 + (excess / (1 + excess * (0.5 + k)));
                            }
                            // Add subtle odd harmonics (characteristic of tape)
                            taped += k * 0.02 * Math.sin(absX * Math.PI * 3);
                            // Slight compression at peaks
                            if (taped > 1) taped = 1 - (1 / (taped * (1 + k * 0.5)));
                            curve[i] = x >= 0 ? Math.min(1, taped) : -Math.min(1, taped);
                        }
                        break;

                    case 'purestdrive':
                        // Airwindows PurestDrive - ultra-clean, barely-there saturation
                        // Designed for transparency with subtle harmonic enhancement
                        {
                            const absX = Math.abs(x);
                            // PurestDrive uses extremely subtle nonlinearity
                            // Almost linear until pushed hard
                            let pure = absX;
                            // Very gentle polynomial saturation
                            const threshold = 0.7 + (0.25 * (1 - k)); // Higher threshold = cleaner
                            if (absX > threshold) {
                                // Soft knee above threshold
                                const excess = absX - threshold;
                                const softness = 2 + (k * 3); // More k = softer knee
                                pure = threshold + (excess / (1 + Math.pow(excess * softness, 2)));
                            }
                            // Minimal harmonic addition (barely audible even harmonics)
                            pure += k * 0.005 * (absX * absX); // 2nd harmonic hint
                            // Keep it clean - no harsh clipping
                            pure = Math.min(pure, 1);
                            curve[i] = x >= 0 ? pure : -pure;
                        }
                        break;

                    default:
                        // Fallback to tape
                        curve[i] = (x + k * Math.sin(x * Math.PI)) / (1 + k);
                }
            }
            return curve;
        };

        shaper.curve = makeCurve(config.amount, config.type);
        dry.gain.value = 1 - (config.mix ?? 1);
        wet.gain.value = config.mix ?? 1;

        return {
            input,
            output,
            setDrive: (amt: number) => {
                config.amount = amt;
                shaper.curve = makeCurve(amt, config.type);
            },
            setMix: (mix: number) => {
                dry.gain.setTargetAtTime(1 - mix, ctx.currentTime, 0.02);
                wet.gain.setTargetAtTime(mix, ctx.currentTime, 0.02);
            },
            setMode: (mode: 'tube'|'tape'|'digital'|'density'|'console'|'spiral'|'channel'|'totape'|'purestdrive') => {
                config.type = mode;
                shaper.curve = makeCurve(config.amount, mode);
            }
        };
    }

    createStereoImager(ctx: BaseAudioContext, config: StereoImagerConfig) {
        const input = ctx.createGain();
        const output = ctx.createGain();
        
        if (ctx.destination.channelCount < 2) { 
             input.connect(output);
             return { input, output, setLowWidth:()=>{}, setMidWidth:()=>{}, setHighWidth:()=>{}, setCrossovers:()=>{} };
        }

        const merger = ctx.createChannelMerger(2);
        const splitter = ctx.createChannelSplitter(2);

        const M_gain = ctx.createGain();
        M_gain.gain.value = 0.5;
        const S_gain = ctx.createGain();
        S_gain.gain.value = 0.5;

        const invertR = ctx.createGain();
        invertR.gain.value = -1;

        input.connect(splitter); 

        splitter.connect(M_gain, 0); 
        splitter.connect(M_gain, 1); 

        splitter.connect(S_gain, 0); 
        splitter.connect(invertR, 1); 
        invertR.connect(S_gain); 

        const widthGain = ctx.createGain();
        const width = (config.lowWidth + config.midWidth + config.highWidth) / 3;
        widthGain.gain.value = width;
        S_gain.connect(widthGain);

        const M_to_L = ctx.createGain(); M_to_L.gain.value = 1;
        const M_to_R = ctx.createGain(); M_to_R.gain.value = 1;
        const S_to_L = ctx.createGain(); S_to_L.gain.value = 1;
        const S_to_R_inv = ctx.createGain(); S_to_R_inv.gain.value = -1;

        M_gain.connect(M_to_L);
        M_gain.connect(M_to_R);

        widthGain.connect(S_to_L);
        widthGain.connect(S_to_R_inv);

        M_to_L.connect(merger, 0, 0);
        S_to_L.connect(merger, 0, 0);

        M_to_R.connect(merger, 0, 1);
        S_to_R_inv.connect(merger, 0, 1);

        merger.connect(output);

        return {
            input,
            output,
            setLowWidth: (v: number) => { widthGain.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
            setMidWidth: (v: number) => { widthGain.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
            setHighWidth: (v: number) => { widthGain.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
            setCrossovers: (_c1: number, _c2: number) => {}
        };
    }

    createMotionReverb(ctx: BaseAudioContext, config: ReverbConfig) {
        const input = ctx.createGain();
        const output = ctx.createGain();
        
        const dry = ctx.createGain();
        const wet = ctx.createGain();
        const verbGain = ctx.createGain(); 

        const convolver = ctx.createConvolver();
        const length = ctx.sampleRate * (config.decay || 2.0);
        const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
        for(let i=0; i<length; i++) {
            const n = length - i;
            const env = Math.pow(n/length, 2);
            impulse.getChannelData(0)[i] = (Math.random()*2-1)*env;
            impulse.getChannelData(1)[i] = (Math.random()*2-1)*env;
        }
        convolver.buffer = impulse;

        input.connect(dry);
        input.connect(convolver);
        convolver.connect(verbGain);
        verbGain.connect(wet);
        
        dry.connect(output);
        wet.connect(output); 

        let osc: OscillatorNode | null = null;
        let lfoGain: GainNode | null = null;
        
        if (config.motion && config.motion.depth > 0) {
            osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.value = (config.motion.bpm || 120) / 60; 
            lfoGain = ctx.createGain();
            lfoGain.gain.value = config.motion.depth * 0.5; 
            
            osc.connect(lfoGain);
            lfoGain.connect(verbGain.gain); 
            osc.start();
        }

        const duckingComp = ctx.createDynamicsCompressor();
        if (config.duckingAmount && config.duckingAmount > 0) {
            duckingComp.threshold.value = -20 + (config.duckingAmount * -15); 
            duckingComp.ratio.value = 3 + (config.duckingAmount * 3); 
            duckingComp.attack.value = 0.01;
            duckingComp.release.value = 0.2;
            
            wet.disconnect(output); 
            wet.connect(duckingComp); 
            duckingComp.connect(output); 
        } else {
            duckingComp.threshold.value = 0;
            duckingComp.ratio.value = 1;
            duckingComp.attack.value = 0.01;
            duckingComp.release.value = 0.01;
        }

        dry.gain.value = 1 - config.mix;
        wet.gain.value = config.mix;

        return {
            input,
            output,
            setDepth: (d: number) => { if(lfoGain) lfoGain.gain.setTargetAtTime(d * 0.5, ctx.currentTime, 0.1); },
            setPulse: (bpm: number) => { if(osc) osc.frequency.setTargetAtTime(bpm/60, ctx.currentTime, 0.1); },
            setMix: (m: number) => {
                dry.gain.setTargetAtTime(1-m, ctx.currentTime, 0.02);
                wet.gain.setTargetAtTime(m, ctx.currentTime, 0.02);
            },
            setDucking: (amount: number) => {
                duckingComp.threshold.setTargetAtTime(-20 + (amount * -15), ctx.currentTime, 0.05);
                duckingComp.ratio.setTargetAtTime(3 + (amount * 3), ctx.currentTime, 0.05);
            }
        };
    }
}

export const advancedDspService = new AdvancedDspService();
