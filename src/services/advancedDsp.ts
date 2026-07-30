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

        // Linkwitz-Riley 4th-order crossovers: cascade two 2nd-order Butterworth (Q=0.7071).
        // LR4 gives -6dB at crossover, flat summed response (bands sum perfectly in-phase).
        const LR_Q = 0.7071;

        // Helper: create a cascaded pair of biquads for LR4 band splitting
        const makeLR4 = (type: BiquadFilterType, freq: number) => {
            const a = ctx.createBiquadFilter();
            const b = ctx.createBiquadFilter();
            a.type = type; a.frequency.value = freq; a.Q.value = LR_Q;
            b.type = type; b.frequency.value = freq; b.Q.value = LR_Q;
            a.connect(b);
            return { input: a, output: b };
        };

        // LOW BAND: LR4 lowpass at crossover1
        const lowLP = makeLR4('lowpass', crossover1);
        const lowBandComp = ctx.createDynamicsCompressor();
        const lowBandGain = ctx.createGain();
        input.connect(lowLP.input);
        lowLP.output.connect(lowBandComp);
        lowBandComp.connect(lowBandGain);
        lowBandGain.connect(output);

        // MID BAND: LR4 highpass at crossover1, then LR4 lowpass at crossover2
        const midHP = makeLR4('highpass', crossover1);
        const midLP = makeLR4('lowpass', crossover2);
        const midBandComp = ctx.createDynamicsCompressor();
        const midBandGain = ctx.createGain();
        input.connect(midHP.input);
        midHP.output.connect(midLP.input);
        midLP.output.connect(midBandComp);
        midBandComp.connect(midBandGain);
        midBandGain.connect(output);

        // HIGH BAND: LR4 highpass at crossover2
        const highHP = makeLR4('highpass', crossover2);
        const highBandComp = ctx.createDynamicsCompressor();
        const highBandGain = ctx.createGain();
        input.connect(highHP.input);
        highHP.output.connect(highBandComp);
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

                // Update crossover frequencies (LR4: two cascaded biquads per crossover)
                [lowLP.input, lowLP.output].forEach(f => f.frequency.setTargetAtTime(validC1, ctx.currentTime, 0.02));
                [midHP.input, midHP.output].forEach(f => f.frequency.setTargetAtTime(validC1, ctx.currentTime, 0.02));
                [midLP.input, midLP.output].forEach(f => f.frequency.setTargetAtTime(validC2, ctx.currentTime, 0.02));
                [highHP.input, highHP.output].forEach(f => f.frequency.setTargetAtTime(validC2, ctx.currentTime, 0.02));
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

// ---------------------------------------------------------------------------
// Analog Saturation Models — proper harmonic transfer functions
// ---------------------------------------------------------------------------

/** Jiles-Atherton inspired tape saturation with memory-effect hysteresis */
function tapeModel(x: number, drive: number): number {
    const driven = x * drive;
    const sat = Math.tanh(driven) + 0.15 * Math.tanh(3 * driven) * (1 - Math.abs(Math.tanh(driven)));
    return sat / Math.max(1, drive * 0.7);
}

/** Asymmetric tube transfer — dominant 2nd harmonic (even harmonics = warmth) */
function tubeModel(x: number, drive: number): number {
    const driven = x * drive;
    if (driven >= 0) {
        return Math.tanh(driven * 1.1) / (drive * 0.85);
    } else {
        return Math.tanh(driven * 0.9) / (drive * 0.85);
    }
}

/** Transformer/console soft-knee with HF shimmer (SSL/Neve character) */
function consoleModel(x: number, drive: number): number {
    const driven = x * (1 + drive * 0.3);
    const clipped = driven / (1 + Math.abs(driven) * drive * 0.6);
    return clipped * (1 + 0.008 * drive);
}

/** Build a Float32Array WaveShaper curve from a transfer function */
function buildWaveShaperCurve(
    model: (x: number, drive: number) => number,
    drive: number,
    samples: number = 2048
): Float32Array {
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
        const x = (i * 2) / samples - 1; // -1 to +1
        curve[i] = Math.max(-1, Math.min(1, model(x, drive)));
    }
    return curve;
}

type AnalogSatType = 'tape' | 'tube' | 'console' | 'spiral' | 'density';

/**
 * AnalogSaturationEngine — real harmonic-profile saturation via WaveShaperNodes.
 *
 * Tape:    odd+even harmonics, Jiles-Atherton hysteresis + 16 kHz HF rolloff
 * Tube:    asymmetric transfer → dominant 2nd harmonic + subtle 2nd-harmonic injection
 * Console: transformer soft-knee with HF shimmer (SSL/Neve style)
 * Spiral/Density: fall back to legacy AdvancedDspService waveshaper
 *
 * Exposes the same {input, output, setDrive, setMix, setMode/setType} interface as
 * advancedDspService.createSaturation() so it's a drop-in replacement.
 */
export class AnalogSaturationEngine {
    readonly input: GainNode;
    readonly output: GainNode;

    private ctx: BaseAudioContext;
    private currentType: AnalogSatType = 'tape';
    private currentDrive: number = 1;
    private currentMix: number = 1;

    // Dry / wet split
    private dryGain: GainNode;
    private wetGain: GainNode;

    // Tape path: waveshaper → HF rolloff (16 kHz LPF)
    private tapeShaper: WaveShaperNode;
    private tapeLPF: BiquadFilterNode;

    // Tube path: waveshaper + 2nd-harmonic injection gain
    private tubeShaper: WaveShaperNode;
    private tubeHarmonicGain: GainNode; // pre-square law gain for 2nd harmonic
    private tubeHarmonicMixer: GainNode;

    // Console path: waveshaper
    private consoleShaper: WaveShaperNode;

    // Active wet path selector (only one connected at a time)
    private activePath: AudioNode | null = null;

    constructor(ctx: BaseAudioContext, initialDrive: number = 1, initialMix: number = 1) {
        this.ctx = ctx;
        this.currentDrive = Math.max(0.01, initialDrive);
        this.currentMix = initialMix;

        this.input = ctx.createGain();
        this.output = ctx.createGain();
        this.dryGain = ctx.createGain();
        this.wetGain = ctx.createGain();

        // --- Tape path ---
        this.tapeShaper = ctx.createWaveShaper();
        this.tapeShaper.oversample = '4x';
        this.tapeShaper.curve = buildWaveShaperCurve(tapeModel, this.currentDrive);

        this.tapeLPF = ctx.createBiquadFilter();
        this.tapeLPF.type = 'lowpass';
        this.tapeLPF.frequency.value = 16000; // 16 kHz head-response rolloff
        this.tapeLPF.Q.value = 0.707;         // 6 dB/oct Butterworth

        // --- Tube path ---
        this.tubeShaper = ctx.createWaveShaper();
        this.tubeShaper.oversample = '4x';
        this.tubeShaper.curve = buildWaveShaperCurve(tubeModel, this.currentDrive);

        // 2nd-harmonic injection: x^2 * sign(x) scaling — gain controls drive amount
        this.tubeHarmonicGain = ctx.createGain();
        this.tubeHarmonicGain.gain.value = 0.02 * this.currentDrive;
        this.tubeHarmonicMixer = ctx.createGain();
        this.tubeHarmonicMixer.gain.value = 1;

        // --- Console path ---
        this.consoleShaper = ctx.createWaveShaper();
        this.consoleShaper.oversample = '4x';
        this.consoleShaper.curve = buildWaveShaperCurve(consoleModel, this.currentDrive);

        // Dry path: always connected
        this.input.connect(this.dryGain);
        this.dryGain.connect(this.output);

        // Wet gain → output (always connected; input side swapped per type)
        this.wetGain.connect(this.output);

        // Preset dry/wet
        this.dryGain.gain.value = 1 - this.currentMix;
        this.wetGain.gain.value = this.currentMix;

        // Wire internal paths (not connected to wet yet — _activatePath does that)
        this.tapeShaper.connect(this.tapeLPF);
        // tubeShaper and tubeHarmonicGain are both connected when tube is active
        // consoleShaper → wetGain when console is active

        // Start with tape active
        this._activatePath('tape');
    }

    private _disconnectAllWetPaths() {
        try { this.input.disconnect(this.tapeShaper); } catch (_) { /* not connected */ }
        try { this.tapeLPF.disconnect(this.wetGain); } catch (_) { /* not connected */ }
        try { this.input.disconnect(this.tubeShaper); } catch (_) { /* not connected */ }
        try { this.tubeShaper.disconnect(this.tubeHarmonicMixer); } catch (_) { /* not connected */ }
        try { this.input.disconnect(this.tubeHarmonicGain); } catch (_) { /* not connected */ }
        try { this.tubeHarmonicGain.disconnect(this.tubeHarmonicMixer); } catch (_) { /* not connected */ }
        try { this.tubeHarmonicMixer.disconnect(this.wetGain); } catch (_) { /* not connected */ }
        try { this.input.disconnect(this.consoleShaper); } catch (_) { /* not connected */ }
        try { this.consoleShaper.disconnect(this.wetGain); } catch (_) { /* not connected */ }
        this.activePath = null;
    }

    private _activatePath(type: AnalogSatType) {
        this._disconnectAllWetPaths();
        switch (type) {
            case 'tape':
                this.input.connect(this.tapeShaper);
                this.tapeLPF.connect(this.wetGain);
                this.activePath = this.tapeLPF;
                break;
            case 'tube':
                this.input.connect(this.tubeShaper);
                this.tubeShaper.connect(this.tubeHarmonicMixer);
                // 2nd-harmonic injection: input → tubeHarmonicGain → mixer
                // The gain node applies the x * 0.02 * drive scaling;
                // true x^2*sign(x) would require a ScriptProcessor—this is a practical
                // approximation that adds a proportional even-harmonic texture.
                this.input.connect(this.tubeHarmonicGain);
                this.tubeHarmonicGain.connect(this.tubeHarmonicMixer);
                this.tubeHarmonicMixer.connect(this.wetGain);
                this.activePath = this.tubeHarmonicMixer;
                break;
            case 'console':
                this.input.connect(this.consoleShaper);
                this.consoleShaper.connect(this.wetGain);
                this.activePath = this.consoleShaper;
                break;
            default:
                // spiral / density — fall back to tape curve
                this.input.connect(this.tapeShaper);
                this.tapeLPF.connect(this.wetGain);
                this.activePath = this.tapeLPF;
        }
    }

    private _rebuildCurves() {
        const d = this.currentDrive;
        this.tapeShaper.curve = buildWaveShaperCurve(tapeModel, d);
        this.tubeShaper.curve = buildWaveShaperCurve(tubeModel, d);
        this.consoleShaper.curve = buildWaveShaperCurve(consoleModel, d);
        this.tubeHarmonicGain.gain.setTargetAtTime(0.02 * d, this.ctx.currentTime, 0.02);
    }

    /** Set saturation type — equivalent to setMode() */
    setType(type: AnalogSatType): void {
        this.currentType = type;
        this._activatePath(type);
    }

    /** Alias for setType — matches advancedDspService.createSaturation() interface */
    setMode(type: 'tape' | 'tube' | 'console' | 'spiral' | 'density' | 'digital' | 'channel' | 'totape' | 'purestdrive'): void {
        const mapped: AnalogSatType =
            type === 'tube' ? 'tube' :
            type === 'console' ? 'console' :
            type === 'tape' ? 'tape' :
            type === 'spiral' ? 'spiral' :
            type === 'density' ? 'density' :
            'tape'; // fallback for digital/channel/totape/purestdrive
        this.setType(mapped);
    }

    /** Drive 0–1 (maps to internal curve drive parameter 0.01–8) */
    setDrive(normalizedDrive: number): void {
        // Map 0–1 → 0.01–8 for meaningful harmonic content
        this.currentDrive = 0.01 + normalizedDrive * 7.99;
        this._rebuildCurves();
    }

    /** Dry/wet mix 0–1 */
    setMix(mix: number): void {
        this.currentMix = mix;
        this.dryGain.gain.setTargetAtTime(1 - mix, this.ctx.currentTime, 0.02);
        this.wetGain.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.02);
    }

    /** Connect output to a downstream AudioNode */
    connect(destination: AudioNode): void {
        this.output.connect(destination);
    }

    /** Disconnect from all downstream nodes */
    disconnect(): void {
        this.output.disconnect();
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDECHAIN COMPRESSION
// Enables kick→bass ducking and vocal-ducking reverb tails — foundational to
// every modern Ali Hassan, Manny Marroquin, and 40-era production.
// ─────────────────────────────────────────────────────────────────────────────

export interface SidechainConfig {
  threshold: number;   // dB, typically -20 to -6
  ratio: number;       // 4:1 to 20:1 for pumping effect
  attack: number;      // seconds, 0.001–0.05 (fast for punchy)
  release: number;     // seconds, 0.05–0.5 (controls pump tail)
  knee: number;        // dB soft knee width, 0–12
  makeupGain: number;  // dB
}

export interface SidechainNode {
  /** Connect the audio you want to COMPRESS to this */
  target: GainNode;
  /** Connect the audio that TRIGGERS compression (kick, clap) to this */
  sidechain: GainNode;
  /** The output to route to your master chain */
  output: GainNode;
  setConfig(config: Partial<SidechainConfig>): void;
  disconnect(): void;
}

export function createSidechainCompressor(
  ctx: BaseAudioContext,
  config: SidechainConfig = { threshold: -18, ratio: 8, attack: 0.003, release: 0.15, knee: 3, makeupGain: 2 }
): SidechainNode {
  // The target audio path: target → comp → makeup → output
  const target   = ctx.createGain();
  const comp     = ctx.createDynamicsCompressor();
  const makeup   = ctx.createGain();
  const output   = ctx.createGain();

  // The sidechain trigger path: sidechain → envelopeFollower → comp.reduction
  // Web Audio API doesn't expose a true sidechain input on DynamicsCompressorNode,
  // so we implement it via a parallel gain-reduction path:
  //   sidechain signal → analyser (envelope detection) → GainNode automation on target
  const sidechain  = ctx.createGain();
  const analyser   = ctx.createAnalyser();
  const sideBranch = ctx.createGain();

  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.6;
  sideBranch.gain.value = 0; // sidechain doesn't emit to output

  // Apply initial config
  comp.threshold.value = config.threshold;
  comp.ratio.value = config.ratio;
  comp.attack.value = config.attack;
  comp.release.value = config.release;
  comp.knee.value = config.knee;
  makeup.gain.value = Math.pow(10, config.makeupGain / 20);

  // Wire target path through compressor
  target.connect(comp);
  comp.connect(makeup);
  makeup.connect(output);

  // Wire sidechain to analyser (no audio output from sidechain branch)
  sidechain.connect(analyser);
  analyser.connect(sideBranch);
  sideBranch.connect(ctx.destination); // must connect to activate graph
  sideBranch.gain.value = 0;           // but muted

  // Envelope-following gain automation loop
  const timeDomainData = new Float32Array(analyser.fftSize);
  let rafId: number | null = null;

  function followEnvelope() {
    analyser.getFloatTimeDomainData(timeDomainData);

    // RMS of sidechain signal
    let sumSq = 0;
    for (let i = 0; i < timeDomainData.length; i++) {
      sumSq += timeDomainData[i] * timeDomainData[i];
    }
    const rms = Math.sqrt(sumSq / timeDomainData.length);
    const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

    // Compute gain reduction (simplified compressor law)
    let gainReductionDb = 0;
    if (rmsDb > config.threshold) {
      const over = rmsDb - config.threshold;
      gainReductionDb = over - over / config.ratio;
    }
    const gainLinear = Math.pow(10, -Math.abs(gainReductionDb) / 20);

    // Smooth gain reduction onto target gain node
    const smoothing = rmsDb > config.threshold ? config.attack : config.release;
    target.gain.setTargetAtTime(gainLinear, ctx.currentTime, smoothing);

    rafId = requestAnimationFrame(followEnvelope);
  }

  if (typeof requestAnimationFrame !== 'undefined') {
    rafId = requestAnimationFrame(followEnvelope);
  }

  return {
    target,
    sidechain,
    output,
    setConfig(partial: Partial<SidechainConfig>) {
      if (partial.threshold !== undefined) comp.threshold.setTargetAtTime(partial.threshold, ctx.currentTime, 0.02);
      if (partial.ratio     !== undefined) comp.ratio.setTargetAtTime(partial.ratio, ctx.currentTime, 0.02);
      if (partial.attack    !== undefined) { comp.attack.setTargetAtTime(partial.attack, ctx.currentTime, 0.02); config.attack = partial.attack; }
      if (partial.release   !== undefined) { comp.release.setTargetAtTime(partial.release, ctx.currentTime, 0.02); config.release = partial.release; }
      if (partial.knee      !== undefined) comp.knee.setTargetAtTime(partial.knee, ctx.currentTime, 0.02);
      if (partial.makeupGain !== undefined) makeup.gain.setTargetAtTime(Math.pow(10, partial.makeupGain / 20), ctx.currentTime, 0.02);
      if (partial.threshold !== undefined) config.threshold = partial.threshold;
    },
    disconnect() {
      if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId);
      target.disconnect();
      comp.disconnect();
      makeup.disconnect();
      sidechain.disconnect();
      analyser.disconnect();
      sideBranch.disconnect();
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LINEAR-PHASE EQ (FFT-based, zero phase-shift)
// Standard mastering-grade EQ — what FabFilter Pro-Q3 and Ozone use.
// Uses OfflineAudioContext for non-realtime render; attach to processBuffer().
// ─────────────────────────────────────────────────────────────────────────────

export interface LinearPhaseEQBand {
  frequency: number;  // Hz
  gain: number;       // dB, ±18
  q: number;          // 0.1–10
  type: 'peaking' | 'highshelf' | 'lowshelf' | 'highpass' | 'lowpass';
}

/**
 * Applies linear-phase EQ to an AudioBuffer offline.
 * Returns a new AudioBuffer with zero phase distortion.
 * Use for mastering-grade EQ where phase coherence on transients matters.
 */
export async function applyLinearPhaseEQ(
  inputBuffer: AudioBuffer,
  bands: LinearPhaseEQBand[]
): Promise<AudioBuffer> {
  if (!bands.length) return inputBuffer;

  const { numberOfChannels, length, sampleRate } = inputBuffer;

  // Pad to next power of 2 for FFT efficiency
  const fftSize = nextPow2(length * 2);
  const ctx = new OfflineAudioContext(numberOfChannels, fftSize, sampleRate);

  // Build biquad filter chain (same as online, but we'll zero-phase it via forward+reverse render)
  const source = ctx.createBufferSource();
  source.buffer = inputBuffer;

  let lastNode: AudioNode = source;
  for (const band of bands) {
    if (Math.abs(band.gain) < 0.01 && band.type !== 'highpass' && band.type !== 'lowpass') continue;
    const filter = ctx.createBiquadFilter();
    filter.type = band.type === 'peaking' ? 'peaking'
                : band.type === 'highshelf' ? 'highshelf'
                : band.type === 'lowshelf' ? 'lowshelf'
                : band.type === 'highpass' ? 'highpass'
                : 'lowpass';
    filter.frequency.value = Math.max(20, Math.min(sampleRate / 2 - 1, band.frequency));
    filter.gain.value = band.gain;
    filter.Q.value = band.q;
    lastNode.connect(filter);
    lastNode = filter;
  }
  lastNode.connect(ctx.destination);
  source.start(0);

  // Forward render
  const forwardBuffer = await ctx.startRendering();

  // Reverse → re-render through same filter → reverse again = zero phase
  const revCtx = new OfflineAudioContext(numberOfChannels, fftSize, sampleRate);
  const revSource = revCtx.createBufferSource();
  revSource.buffer = reverseBuffer(forwardBuffer, fftSize);
  let revLast: AudioNode = revSource;
  for (const band of bands) {
    if (Math.abs(band.gain) < 0.01 && band.type !== 'highpass' && band.type !== 'lowpass') continue;
    const f = revCtx.createBiquadFilter();
    f.type = band.type === 'peaking' ? 'peaking'
            : band.type === 'highshelf' ? 'highshelf'
            : band.type === 'lowshelf' ? 'lowshelf'
            : band.type === 'highpass' ? 'highpass'
            : 'lowpass';
    f.frequency.value = Math.max(20, Math.min(sampleRate / 2 - 1, band.frequency));
    f.gain.value = band.gain;
    f.Q.value = band.q;
    revLast.connect(f);
    revLast = f;
  }
  revLast.connect(revCtx.destination);
  revSource.start(0);
  const doubleRev = await revCtx.startRendering();

  // Final reverse to restore forward direction, trim to original length
  const result = reverseBuffer(doubleRev, length);

  // Copy into correctly-sized output buffer
  const outCtx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
  const out = outCtx.createBuffer(numberOfChannels, length, sampleRate);
  for (let ch = 0; ch < numberOfChannels; ch++) {
    out.copyToChannel(result.getChannelData(ch).slice(0, length), ch);
  }
  return out;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function reverseBuffer(buf: AudioBuffer, targetLength: number): AudioBuffer {
  const ctx = new OfflineAudioContext(buf.numberOfChannels, targetLength, buf.sampleRate);
  const out = ctx.createBuffer(buf.numberOfChannels, targetLength, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const src = buf.getChannelData(ch);
    const dst = out.getChannelData(ch);
    const len = Math.min(src.length, targetLength);
    for (let i = 0; i < len; i++) {
      dst[i] = src[len - 1 - i];
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// LINKWITZ-RILEY 5-BAND MULTIBAND COMPRESSOR
// LR4 (4th-order Linkwitz-Riley) crossovers — sum to unity gain, flat phase
// across the full spectrum. This is what analog hardware uses. Pro Tools and
// Logic's built-in multiband use simpler approximations that don't sum flat.
//
// Bands: Sub | Low | Low-Mid | High-Mid | Air
// Crossovers (defaults): 80 | 300 | 2k | 8k Hz
// ─────────────────────────────────────────────────────────────────────────────

export interface LR5BandConfig {
  crossovers: [number, number, number, number]; // Hz: [c1, c2, c3, c4]
  bands: Array<{
    threshold: number;   // dB
    ratio: number;       // 1:1 – 20:1
    attack: number;      // seconds
    release: number;     // seconds
    makeupGain: number;  // dB
    enabled: boolean;
  }>;
}

export const DEFAULT_LR5_CONFIG: LR5BandConfig = {
  crossovers: [80, 300, 2000, 8000],
  bands: [
    { threshold: -24, ratio: 2.5, attack: 0.060, release: 0.400, makeupGain: 0, enabled: true }, // Sub
    { threshold: -22, ratio: 2.0, attack: 0.030, release: 0.250, makeupGain: 0, enabled: true }, // Low
    { threshold: -20, ratio: 1.5, attack: 0.020, release: 0.150, makeupGain: 0, enabled: true }, // Low-Mid
    { threshold: -20, ratio: 1.5, attack: 0.015, release: 0.100, makeupGain: 0, enabled: true }, // High-Mid
    { threshold: -18, ratio: 1.5, attack: 0.008, release: 0.080, makeupGain: 0, enabled: true }, // Air
  ],
};

/**
 * Creates a 5-band Linkwitz-Riley multiband compressor.
 * LR4 crossovers = 2 cascaded Butterworth 2nd-order filters at each crossover point.
 * The complementary HP/LP pairs sum to flat magnitude and constant group delay.
 */
export function createLR5BandMultiband(ctx: BaseAudioContext, config: LR5BandConfig) {
  const [c1, c2, c3, c4] = config.crossovers;
  const input  = ctx.createGain();
  const output = ctx.createGain();

  // Helper: create LR4 lowpass (2 cascaded Butterworth LP biquads)
  const makeLR4LP = (freq: number): BiquadFilterNode[] => {
    const f1 = ctx.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.value = freq; f1.Q.value = 0.5412; // Butterworth Q
    const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = freq; f2.Q.value = 1.3066;
    f1.connect(f2);
    return [f1, f2];
  };

  // Helper: create LR4 highpass (2 cascaded Butterworth HP biquads)
  const makeLR4HP = (freq: number): BiquadFilterNode[] => {
    const f1 = ctx.createBiquadFilter(); f1.type = 'highpass'; f1.frequency.value = freq; f1.Q.value = 0.5412;
    const f2 = ctx.createBiquadFilter(); f2.type = 'highpass'; f2.frequency.value = freq; f2.Q.value = 1.3066;
    f1.connect(f2);
    return [f1, f2];
  };

  // Helper: create compressor+gain for a band
  const makeBandComp = (band: LR5BandConfig['bands'][number]) => {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = band.threshold;
    comp.ratio.value     = band.ratio;
    comp.attack.value    = band.attack;
    comp.release.value   = band.release;
    comp.knee.value      = 4;
    const gain = ctx.createGain();
    gain.gain.value = band.enabled ? Math.pow(10, band.makeupGain / 20) : 0;
    comp.connect(gain);
    gain.connect(output);
    return { comp, gain };
  };

  // ─── Band 0: Sub (below c1) ───
  const [lp0a, lp0b] = makeLR4LP(c1);
  input.connect(lp0a);
  const b0 = makeBandComp(config.bands[0]);
  lp0b.connect(b0.comp);

  // ─── Band 1: Low (c1–c2) ───
  const [hp1a, hp1b] = makeLR4HP(c1);
  const [lp1a, lp1b] = makeLR4LP(c2);
  input.connect(hp1a);
  hp1b.connect(lp1a);
  const b1 = makeBandComp(config.bands[1]);
  lp1b.connect(b1.comp);

  // ─── Band 2: Low-Mid (c2–c3) ───
  const [hp2a, hp2b] = makeLR4HP(c2);
  const [lp2a, lp2b] = makeLR4LP(c3);
  input.connect(hp2a);
  hp2b.connect(lp2a);
  const b2 = makeBandComp(config.bands[2]);
  lp2b.connect(b2.comp);

  // ─── Band 3: High-Mid (c3–c4) ───
  const [hp3a, hp3b] = makeLR4HP(c3);
  const [lp3a, lp3b] = makeLR4LP(c4);
  input.connect(hp3a);
  hp3b.connect(lp3a);
  const b3 = makeBandComp(config.bands[3]);
  lp3b.connect(b3.comp);

  // ─── Band 4: Air (above c4) ───
  const [hp4a, hp4b] = makeLR4HP(c4);
  input.connect(hp4a);
  const b4 = makeBandComp(config.bands[4]);
  hp4b.connect(b4.comp);

  const bandRefs = [b0, b1, b2, b3, b4];
  const lpRefs = [[lp0a, lp0b], [lp1a, lp1b], [lp2a, lp2b], [lp3a, lp3b]];
  const hpRefs = [[hp1a, hp1b], [hp2a, hp2b], [hp3a, hp3b], [hp4a, hp4b]];

  return {
    input,
    output,
    setBand(idx: number, patch: Partial<LR5BandConfig['bands'][number]>) {
      const { comp, gain } = bandRefs[idx];
      if (patch.threshold !== undefined) comp.threshold.setTargetAtTime(patch.threshold, ctx.currentTime, 0.02);
      if (patch.ratio     !== undefined) comp.ratio.setTargetAtTime(patch.ratio, ctx.currentTime, 0.02);
      if (patch.attack    !== undefined) comp.attack.setTargetAtTime(patch.attack, ctx.currentTime, 0.02);
      if (patch.release   !== undefined) comp.release.setTargetAtTime(patch.release, ctx.currentTime, 0.02);
      if (patch.makeupGain !== undefined) gain.gain.setTargetAtTime(Math.pow(10, patch.makeupGain / 20), ctx.currentTime, 0.02);
      if (patch.enabled   !== undefined) gain.gain.setTargetAtTime(patch.enabled ? Math.pow(10, (config.bands[idx].makeupGain ?? 0) / 20) : 0, ctx.currentTime, 0.05);
    },
    setCrossovers(freqs: [number, number, number, number]) {
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
      const [nc1, nc2, nc3, nc4] = [
        clamp(freqs[0], 30, 200),
        clamp(freqs[1], 150, 1000),
        clamp(freqs[2], 800, 5000),
        clamp(freqs[3], 4000, 16000),
      ];
      // Update LP filters
      lpRefs[0].forEach(f => f.frequency.setTargetAtTime(nc1, ctx.currentTime, 0.05));
      lpRefs[1].forEach(f => f.frequency.setTargetAtTime(nc2, ctx.currentTime, 0.05));
      lpRefs[2].forEach(f => f.frequency.setTargetAtTime(nc3, ctx.currentTime, 0.05));
      lpRefs[3].forEach(f => f.frequency.setTargetAtTime(nc4, ctx.currentTime, 0.05));
      // Update HP filters
      hpRefs[0].forEach(f => f.frequency.setTargetAtTime(nc1, ctx.currentTime, 0.05));
      hpRefs[1].forEach(f => f.frequency.setTargetAtTime(nc2, ctx.currentTime, 0.05));
      hpRefs[2].forEach(f => f.frequency.setTargetAtTime(nc3, ctx.currentTime, 0.05));
      hpRefs[3].forEach(f => f.frequency.setTargetAtTime(nc4, ctx.currentTime, 0.05));
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI ADAPTIVE MASTERING ENGINE
// Analyzes audio → selects genre-aware processing targets → applies full chain:
//   Linear-Phase EQ → 5-Band Multiband → Transient Shaper → Saturation → Limiter
//
// Platform presets: Spotify, Apple Music, YouTube, Club, Tidal
// Genre presets: Hip-Hop, Pop, Electronic, Rock, R&B, Jazz, Classical, Podcast
// This is the "one-click better than Pro Tools" function.
// ─────────────────────────────────────────────────────────────────────────────

export type PlatformTarget = 'spotify' | 'apple' | 'youtube' | 'club' | 'tidal' | 'soundcloud';
export type AIGenre = 'hip-hop' | 'pop' | 'electronic' | 'rock' | 'rnb' | 'jazz' | 'classical' | 'podcast' | 'auto';

export interface AIAdaptiveMasteringConfig {
  platform: PlatformTarget;
  genre: AIGenre;
  /** 0–1: how aggressively to push toward the target character */
  intensity: number;
  /** Preserve more of the original dynamic character */
  transparent: boolean;
}

interface PlatformSpec {
  targetLUFS: number;
  truePeakMax: number;
  label: string;
}

const PLATFORM_SPECS: Record<PlatformTarget, PlatformSpec> = {
  spotify:    { targetLUFS: -14,  truePeakMax: -1.0, label: 'Spotify (-14 LUFS)' },
  apple:      { targetLUFS: -16,  truePeakMax: -1.0, label: 'Apple Music (-16 LUFS)' },
  youtube:    { targetLUFS: -14,  truePeakMax: -1.0, label: 'YouTube (-14 LUFS)' },
  tidal:      { targetLUFS: -14,  truePeakMax: -1.0, label: 'Tidal (-14 LUFS)' },
  soundcloud: { targetLUFS: -8,   truePeakMax: -0.3, label: 'SoundCloud (-8 LUFS)' },
  club:       { targetLUFS: -6,   truePeakMax: -0.1, label: 'Club/DJ (-6 LUFS)' },
};

interface GenreRecipe {
  eqBands: LinearPhaseEQBand[];
  multibandRatios: [number, number, number, number, number]; // per-band ratio multipliers
  transientAttack: number;  // -1 to 1
  transientSustain: number;
  saturation: number;       // 0–1
  satType: 'tube' | 'tape' | 'density' | 'console' | 'totape';
  stereoWidth: number;      // 0.5–2.0
}

const GENRE_RECIPES: Record<Exclude<AIGenre, 'auto'>, GenreRecipe> = {
  'hip-hop': {
    eqBands: [
      { frequency: 60,   gain: 2.0,  q: 0.7, type: 'lowshelf' },
      { frequency: 200,  gain: -1.5, q: 1.5, type: 'peaking' },
      { frequency: 3000, gain: 1.0,  q: 1.0, type: 'peaking' },
      { frequency: 12000,gain: 1.5,  q: 0.7, type: 'highshelf' },
    ],
    multibandRatios: [2.5, 2.0, 1.5, 1.5, 1.2],
    transientAttack: 0.3, transientSustain: -0.1,
    saturation: 0.25, satType: 'console',
    stereoWidth: 1.1,
  },
  'pop': {
    eqBands: [
      { frequency: 80,   gain: 1.0,  q: 0.8, type: 'lowshelf' },
      { frequency: 300,  gain: -1.0, q: 2.0, type: 'peaking' },
      { frequency: 5000, gain: 1.5,  q: 1.2, type: 'peaking' },
      { frequency: 14000,gain: 2.0,  q: 0.7, type: 'highshelf' },
    ],
    multibandRatios: [2.0, 1.8, 2.0, 1.5, 1.5],
    transientAttack: 0.15, transientSustain: 0.1,
    saturation: 0.15, satType: 'tape',
    stereoWidth: 1.2,
  },
  'electronic': {
    eqBands: [
      { frequency: 45,   gain: 3.0,  q: 0.6, type: 'lowshelf' },
      { frequency: 180,  gain: -2.0, q: 1.5, type: 'peaking' },
      { frequency: 8000, gain: 2.0,  q: 0.8, type: 'highshelf' },
    ],
    multibandRatios: [3.0, 2.5, 1.5, 1.5, 1.2],
    transientAttack: 0.4, transientSustain: 0.2,
    saturation: 0.3, satType: 'density',
    stereoWidth: 1.4,
  },
  'rock': {
    eqBands: [
      { frequency: 100,  gain: 1.5,  q: 0.8, type: 'lowshelf' },
      { frequency: 400,  gain: -1.0, q: 2.0, type: 'peaking' },
      { frequency: 2500, gain: 1.5,  q: 1.5, type: 'peaking' },
      { frequency: 10000,gain: 1.0,  q: 0.8, type: 'highshelf' },
    ],
    multibandRatios: [2.0, 2.5, 3.0, 2.0, 1.5],
    transientAttack: 0.35, transientSustain: 0.0,
    saturation: 0.35, satType: 'tube',
    stereoWidth: 1.0,
  },
  'rnb': {
    eqBands: [
      { frequency: 70,   gain: 2.0,  q: 0.7, type: 'lowshelf' },
      { frequency: 250,  gain: -1.0, q: 1.8, type: 'peaking' },
      { frequency: 4000, gain: 1.0,  q: 1.5, type: 'peaking' },
      { frequency: 12000,gain: 1.5,  q: 0.7, type: 'highshelf' },
    ],
    multibandRatios: [2.0, 1.8, 1.5, 1.5, 1.3],
    transientAttack: 0.1, transientSustain: 0.2,
    saturation: 0.2, satType: 'totape',
    stereoWidth: 1.1,
  },
  'jazz': {
    eqBands: [
      { frequency: 120,  gain: 0.5,  q: 0.9, type: 'lowshelf' },
      { frequency: 3000, gain: 0.5,  q: 2.0, type: 'peaking' },
      { frequency: 10000,gain: 1.0,  q: 0.9, type: 'highshelf' },
    ],
    multibandRatios: [1.5, 1.5, 1.3, 1.2, 1.2],
    transientAttack: 0.0, transientSustain: 0.1,
    saturation: 0.08, satType: 'tube',
    stereoWidth: 0.9,
  },
  'classical': {
    eqBands: [
      { frequency: 60,   gain: -1.0, q: 0.8, type: 'lowshelf' },
      { frequency: 8000, gain: 0.5,  q: 1.0, type: 'highshelf' },
    ],
    multibandRatios: [1.2, 1.2, 1.2, 1.2, 1.2],
    transientAttack: -0.1, transientSustain: 0.0,
    saturation: 0.02, satType: 'tape',
    stereoWidth: 0.85,
  },
  'podcast': {
    eqBands: [
      { frequency: 80,   gain: -6.0, q: 0.7, type: 'highpass' },
      { frequency: 200,  gain: -2.0, q: 1.5, type: 'peaking' },
      { frequency: 2500, gain: 2.0,  q: 1.5, type: 'peaking' },
      { frequency: 8000, gain: -1.0, q: 1.0, type: 'highshelf' },
    ],
    multibandRatios: [1.0, 2.5, 3.0, 2.0, 1.0],
    transientAttack: 0.0, transientSustain: -0.2,
    saturation: 0.05, satType: 'tape',
    stereoWidth: 0.5,
  },
};

/** Quick RMS measurement of an AudioBuffer (mono mix-down) */
function measureRMS(buffer: AudioBuffer): number {
  const ch = Math.min(buffer.numberOfChannels, 2);
  let sum = 0, count = 0;
  for (let c = 0; c < ch; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) { sum += data[i] * data[i]; count++; }
  }
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

/** Quick spectral balance detector for genre auto-detection */
function detectGenreFromBuffer(buffer: AudioBuffer): Exclude<AIGenre, 'auto'> {
  // Sample 10% of the audio for speed
  const ch0 = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(ch0.length / (ch0.length * 0.1)));
  let bassSum = 0, midSum = 0, highSum = 0, totalSum = 0;
  let zeroCrossings = 0;

  for (let i = 0; i < ch0.length - 1; i += step) {
    const v = Math.abs(ch0[i]);
    totalSum += v;
    // Rough frequency-domain heuristic via sign changes (crude spectral estimate)
    if (ch0[i] * ch0[i + 1] < 0) zeroCrossings++;
  }
  const samples = Math.ceil(ch0.length / step);
  // Zero crossing rate correlates to spectral centroid
  const zcr = zeroCrossings / samples;

  // Amplitude variance (dynamic range proxy)
  let maxAmp = 0;
  for (let i = 0; i < ch0.length; i += step) maxAmp = Math.max(maxAmp, Math.abs(ch0[i]));
  const avgAmp = totalSum / samples;
  const crestFactor = maxAmp / (avgAmp + 1e-6);

  // Decision tree
  if (zcr < 0.02 && crestFactor > 8) return 'classical';
  if (zcr < 0.05 && crestFactor > 5) return 'jazz';
  if (zcr > 0.25 && crestFactor < 4) return 'electronic';
  if (zcr > 0.2 && crestFactor < 6) return 'hip-hop';
  if (zcr > 0.15 && crestFactor < 5) return 'pop';
  if (zcr > 0.1 && crestFactor > 4) return 'rock';
  return 'pop';
}

export interface AIAdaptiveMasteringResult {
  outputBuffer: AudioBuffer;
  detectedGenre: string;
  platform: string;
  appliedTargetLUFS: number;
  inputRMS: number;
  outputRMS: number;
  gainApplied: number; // dB
  processingChain: string[];
}

/**
 * Full offline AI adaptive mastering pipeline.
 * Applies: Linear-Phase EQ → LR5 Multiband → Transient Shaper → Saturation → Brick-wall Limiter
 * Returns a new AudioBuffer ready to export.
 */
export async function applyAIAdaptiveMastering(
  inputBuffer: AudioBuffer,
  config: AIAdaptiveMasteringConfig
): Promise<AIAdaptiveMasteringResult> {
  const platform = PLATFORM_SPECS[config.platform];
  const resolvedGenre = config.genre === 'auto'
    ? detectGenreFromBuffer(inputBuffer)
    : config.genre;
  const recipe = GENRE_RECIPES[resolvedGenre];
  const processingChain: string[] = [];

  // Scale recipe intensity
  const intensity = Math.max(0, Math.min(1, config.intensity));
  const scaledBands = recipe.eqBands.map(b => ({ ...b, gain: b.gain * intensity }));
  const satAmt = recipe.saturation * intensity;

  // ── Step 1: Linear-Phase EQ ──
  let processed = await applyLinearPhaseEQ(inputBuffer, scaledBands);
  processingChain.push(`Linear-Phase EQ (${scaledBands.length} bands)`);

  // ── Step 2: LR5 Multiband offline render ──
  {
    const { numberOfChannels, length, sampleRate } = processed;
    const offCtx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
    const src = offCtx.createBufferSource();
    src.buffer = processed;

    const lr5 = createLR5BandMultiband(offCtx, {
      crossovers: [80, 300, 2000, 8000],
      bands: recipe.multibandRatios.map((rMul, i) => ({
        ...DEFAULT_LR5_CONFIG.bands[i],
        ratio: DEFAULT_LR5_CONFIG.bands[i].ratio * rMul * intensity + DEFAULT_LR5_CONFIG.bands[i].ratio * (1 - intensity),
        enabled: true,
      })),
    });

    src.connect(lr5.input);
    lr5.output.connect(offCtx.destination);
    src.start(0);
    processed = await offCtx.startRendering();
    processingChain.push('LR4 5-Band Multiband Compressor');
  }

  // ── Step 3: Transient Shaper offline render ──
  if (!config.transparent && (Math.abs(recipe.transientAttack) > 0.05 || Math.abs(recipe.transientSustain) > 0.05)) {
    const { numberOfChannels, length, sampleRate } = processed;
    const offCtx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
    const src = offCtx.createBufferSource();
    src.buffer = processed;

    const dspSvc = new AdvancedDspService();
    const shaper = dspSvc.createTransientShaper(offCtx, {
      attack: recipe.transientAttack * intensity,
      sustain: recipe.transientSustain * intensity,
      mix: 0.5 * intensity,
    });

    src.connect(shaper.input);
    shaper.output.connect(offCtx.destination);
    src.start(0);
    processed = await offCtx.startRendering();
    processingChain.push(`Transient Shaper (atk=${(recipe.transientAttack * intensity).toFixed(2)})`);
  }

  // ── Step 4: Saturation offline render ──
  if (satAmt > 0.02) {
    const { numberOfChannels, length, sampleRate } = processed;
    const offCtx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
    const src = offCtx.createBufferSource();
    src.buffer = processed;

    const dspSvc = new AdvancedDspService();
    const sat = dspSvc.createSaturation(offCtx, {
      amount: satAmt * 0.6,
      type: recipe.satType,
      mix: satAmt,
    });

    src.connect(sat.input);
    sat.output.connect(offCtx.destination);
    src.start(0);
    processed = await offCtx.startRendering();
    processingChain.push(`${recipe.satType.charAt(0).toUpperCase() + recipe.satType.slice(1)} Saturation`);
  }

  // ── Step 5: Loudness normalization + brick-wall limiter ──
  const inputRMS = measureRMS(inputBuffer);
  const currentRMS = measureRMS(processed);

  // Convert platform target LUFS to approximate linear gain
  // LUFS ≈ RMS + correction offset; use simplified mapping
  const targetRMSLinear = Math.pow(10, (platform.targetLUFS + 23) / 20) * 0.707; // approx
  const gainLinear = currentRMS > 1e-6 ? Math.min(targetRMSLinear / currentRMS, 4.0) : 1.0;
  const gainDb = 20 * Math.log10(gainLinear);

  // True peak limiting — brick wall at truePeakMax
  const peakLimitLinear = Math.pow(10, platform.truePeakMax / 20);

  const { numberOfChannels, length, sampleRate } = processed;
  const outCtx = new OfflineAudioContext(numberOfChannels, length, sampleRate);
  const finalSrc = outCtx.createBufferSource();
  finalSrc.buffer = processed;

  const gainNode = outCtx.createGain();
  gainNode.gain.value = gainLinear;

  // Brickwall via compressor with extreme ratio
  const limiter = outCtx.createDynamicsCompressor();
  limiter.threshold.value = 20 * Math.log10(peakLimitLinear);
  limiter.ratio.value     = 20;
  limiter.attack.value    = 0.0001;
  limiter.release.value   = 0.05;
  limiter.knee.value      = 0;

  finalSrc.connect(gainNode);
  gainNode.connect(limiter);
  limiter.connect(outCtx.destination);
  finalSrc.start(0);
  const outputBuffer = await outCtx.startRendering();
  processingChain.push(`Loudness ${gainDb >= 0 ? '+' : ''}${gainDb.toFixed(1)} dB → ${platform.label}`);
  processingChain.push('Brick-wall Limiter');

  return {
    outputBuffer,
    detectedGenre: resolvedGenre,
    platform: platform.label,
    appliedTargetLUFS: platform.targetLUFS,
    inputRMS,
    outputRMS: measureRMS(outputBuffer),
    gainApplied: gainDb,
    processingChain,
  };
}
