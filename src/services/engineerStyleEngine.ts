/**
 * Engineer Style Engine
 *
 * Analyzes mixes through the lens of specific world-class mix engineers.
 * Extracts perceptual "signatures" (EQ, dynamics, stereo, saturation, reverb)
 * from documented characteristics of their work, then generates APL proposals
 * that nudge a mix toward that aesthetic.
 *
 * These are perceptual target profiles — not copies of specific tracks.
 */

import { MixSignature, ProcessingConfig } from '../types';
import { mixAnalysisService } from './mixAnalysis';
import { lufsMeteringService } from './lufsMetering';
import { postJson } from './backendApi';

// ─── Profile type definitions ────────────────────────────────────────────────

export interface FrequencyProfile {
  /** dB adjustments at key frequency bands (20Hz → 20kHz) */
  sub: number;       // 30 Hz
  lowBass: number;   // 60 Hz
  bass: number;      // 100 Hz
  lowMid: number;    // 250 Hz
  mid: number;       // 1000 Hz
  upper: number;     // 3000 Hz
  presence: number;  // 5000 Hz
  air: number;       // 10000 Hz
  brilliance: number; // 16000 Hz
}

export interface DynamicProfile {
  targetLUFS: number;   // integrated loudness target
  targetLRA: number;    // loudness range target (dB)
  targetCrest: number;  // crest factor target (dB)
}

export interface StereoProfile {
  width: number;       // 0–2 (1 = unprocessed)
  correlation: number; // 0–1 target L/R correlation
  midBoost: number;    // relative mid channel level
}

export interface SaturationProfile {
  amount: number;      // 0–1
  character: 'tape' | 'tube' | 'console' | 'digital';
}

export interface ReverbProfile {
  decay: number;    // RT60 seconds
  predelay: number; // ms
  wet: number;      // 0–1 mix amount
}

export interface EngineerProfile {
  id: string;
  name: string;
  signature: string; // human-readable description sent to Gemini
  eqTarget: FrequencyProfile;
  dynamicTarget: DynamicProfile;
  stereoTarget: StereoProfile;
  saturationTarget: SaturationProfile;
  reverbTarget: ReverbProfile;
}

// ─── Engineer Profiles ───────────────────────────────────────────────────────

/**
 * IMPORTANT: These profiles are constructed from publicly documented, widely
 * discussed perceptual characteristics of each engineer's body of work.
 * They are abstract aesthetic targets — not reproductions of any specific track.
 */
export const ENGINEER_PROFILES: Record<string, EngineerProfile> = {

  mixedbyali: {
    id: 'mixedbyali',
    name: 'Mixed by Ali Hassan',
    signature:
      'Extreme vocal clarity and intelligibility. Bright high-frequency air above 12kHz. ' +
      'Tight, controlled low-end below 80Hz with a slight scoop in the low-mids (200–400Hz) ' +
      'to prevent muddiness. Moderate-high RMS with well-controlled peaks. ' +
      'Very present, forward vocals with minimal reverb. ' +
      'Known for: Kendrick Lamar, SZA, Travis Scott.',
    eqTarget: {
      sub: -1.5,
      lowBass: 0,
      bass: 1.0,
      lowMid: -1.5,
      mid: -0.5,
      upper: 1.0,
      presence: 1.5,
      air: 2.5,
      brilliance: 2.0,
    },
    dynamicTarget: { targetLUFS: -8, targetLRA: 4, targetCrest: 8 },
    stereoTarget: { width: 0.70, correlation: 0.75, midBoost: 1.2 },
    saturationTarget: { amount: 0.3, character: 'tube' },
    reverbTarget: { decay: 0.8, predelay: 8, wet: 0.12 },
  },

  '40': {
    id: '40',
    name: 'Noah "40" Shebib',
    signature:
      'Atmospheric, lush, deeply spacious. Heavy reverb on vocals and snares creates 3D depth. ' +
      'Soft attack compression preserves transients. Dark, warm low-mids. Vinyl-like tape warmth. ' +
      'Wide stereo image with a slightly diffuse center. High perceived depth over loudness. ' +
      'Known for: Drake, PARTYNEXTDOOR, dvsn.',
    eqTarget: {
      sub: 0,
      lowBass: 1.5,
      bass: 1.0,
      lowMid: 2.0,
      mid: 0.5,
      upper: -0.5,
      presence: -1.0,
      air: -1.5,
      brilliance: -1.5,
    },
    dynamicTarget: { targetLUFS: -10, targetLRA: 8, targetCrest: 12 },
    stereoTarget: { width: 0.90, correlation: 0.55, midBoost: 0.85 },
    saturationTarget: { amount: 0.45, character: 'tape' },
    reverbTarget: { decay: 3.2, predelay: 22, wet: 0.32 },
  },

  rianlewis: {
    id: 'rianlewis',
    name: 'Rian Lewis',
    signature:
      'Pop clarity and transparency. Surgical precision — problems removed, nothing added unnecessarily. ' +
      'Punchy, defined drum transients. Tightly controlled vocal dynamics. ' +
      'High perceived loudness without audible distortion or pumping. Clean, uncolored low-end. ' +
      'Known for: Ed Sheeran, Sam Smith, Lewis Capaldi.',
    eqTarget: {
      sub: -2.0,
      lowBass: 0,
      bass: 0.5,
      lowMid: -0.5,
      mid: 0,
      upper: 0.5,
      presence: 1.0,
      air: 1.5,
      brilliance: 1.0,
    },
    dynamicTarget: { targetLUFS: -7, targetLRA: 3, targetCrest: 6 },
    stereoTarget: { width: 0.65, correlation: 0.82, midBoost: 1.1 },
    saturationTarget: { amount: 0.2, character: 'console' },
    reverbTarget: { decay: 1.4, predelay: 12, wet: 0.18 },
  },

  mannymarroquin: {
    id: 'mannymarroquin',
    name: 'Manny Marroquin',
    signature:
      'Rock/pop powerhouse. Huge, punchy drum sound with heavy parallel compression. ' +
      'Wide, present vocals with a thick low-mid body. Warm saturation across the mix bus. ' +
      'Strong low-end weight. Upper-mid scoop for fatigue control at loud levels. ' +
      'Known for: Kanye West, Rihanna, Maroon 5, John Legend.',
    eqTarget: {
      sub: 1.0,
      lowBass: 2.0,
      bass: 1.5,
      lowMid: 1.5,
      mid: 0,
      upper: -0.5,
      presence: 0.5,
      air: 1.0,
      brilliance: 0.5,
    },
    dynamicTarget: { targetLUFS: -7, targetLRA: 5, targetCrest: 7 },
    stereoTarget: { width: 0.82, correlation: 0.68, midBoost: 1.0 },
    saturationTarget: { amount: 0.5, character: 'console' },
    reverbTarget: { decay: 1.8, predelay: 15, wet: 0.22 },
  },

};

// ─── Analysis types ───────────────────────────────────────────────────────────

export interface MixAnalysisResult {
  signature: MixSignature;
  lufs: number;       // integrated LUFS
  lra: number;        // loudness range
  crest: number;      // crest factor (dB)
  stereoWidth: number; // 0–2 M/S ratio derived
}

export interface StyleGap {
  /** EQ deltas (positive = need to boost, negative = need to cut) at each profile band */
  eqDelta: FrequencyProfile;
  /** Dynamics gaps */
  lufsGap: number;      // target − current (positive = need more loudness)
  lraGap: number;
  crestGap: number;
  /** Stereo gaps */
  widthGap: number;
  /** Saturation target */
  saturationTarget: SaturationProfile;
  /** Reverb target */
  reverbTarget: ReverbProfile;
}

export interface APLStyleProposal {
  engineerId: string;
  engineerName: string;
  description: string;
  processingConfig: ProcessingConfig;
  styleGap: StyleGap;
  confidence: number;
  geminiRationale: string;
}

// ─── Gemini call (mirrors the pattern used in geminiService.ts) ───────────────

const GEMINI_MODEL = 'gemini-3.1-pro-preview';

async function callGeminiForStyleMatch(prompt: string): Promise<string> {
  const response = await postJson<{ text?: string }>('/api/proxy/gemini', {
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.25,
      maxOutputTokens: 1200,
    },
  });
  return response.text?.trim() ?? '';
}

function robustParse(raw: string): any | null {
  let text = raw.trim();
  const md = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (md) text = md[1];
  else text = text.replace(/^```json?\s*/,'').replace(/\s*```$/,'');
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

// ─── StyleMatchingEngine ──────────────────────────────────────────────────────

export class StyleMatchingEngine {

  /** Full audio analysis: signature + LUFS + derived stereo width */
  async analyzeCurrentMix(buffer: AudioBuffer): Promise<MixAnalysisResult> {
    const [signature, lufsResult] = await Promise.all([
      mixAnalysisService.extractMixSignature(buffer),
      lufsMeteringService.measureLUFS(buffer),
    ]);

    return {
      signature,
      lufs: lufsResult.integratedLUFS,
      lra: lufsResult.loudnessRange,
      crest: signature.dynamics.crestFactor,
      stereoWidth:
        (signature.stereoWidth.low + signature.stereoWidth.mid + signature.stereoWidth.high) / 3,
    };
  }

  /** Compute the numeric gap between current analysis and a target profile */
  computeGapToProfile(
    analysis: MixAnalysisResult,
    profile: EngineerProfile,
  ): StyleGap {
    const { signature } = analysis;
    const { eqTarget, dynamicTarget, stereoTarget } = profile;

    // Map tonalBalance (0–1 normalized ratios) to dB-like deltas
    // tonalBalance sums to ~1; we scale by 10 to get roughly ±dB range
    const tonalScaling = 10;
    const eqDelta: FrequencyProfile = {
      sub:        eqTarget.sub        - 0,
      lowBass:    eqTarget.lowBass    - 0,
      bass:       eqTarget.bass       - (signature.tonalBalance.low * tonalScaling),
      lowMid:     eqTarget.lowMid     - (signature.tonalBalance.lowMid * tonalScaling),
      mid:        eqTarget.mid        - (signature.tonalBalance.mid * tonalScaling),
      upper:      eqTarget.upper      - 0,
      presence:   eqTarget.presence   - (signature.tonalBalance.highMid * tonalScaling),
      air:        eqTarget.air        - (signature.tonalBalance.high * tonalScaling),
      brilliance: eqTarget.brilliance - 0,
    };

    return {
      eqDelta,
      lufsGap: dynamicTarget.targetLUFS - analysis.lufs,
      lraGap:  dynamicTarget.targetLRA  - analysis.lra,
      crestGap: dynamicTarget.targetCrest - analysis.crest,
      widthGap: stereoTarget.width - analysis.stereoWidth,
      saturationTarget: profile.saturationTarget,
      reverbTarget: profile.reverbTarget,
    };
  }

  /**
   * Ask Gemini for specific DSP parameter adjustments given the computed gap
   * and return a ProcessingConfig along with Gemini's rationale.
   */
  async generateAPLProposal(
    analysis: MixAnalysisResult,
    gap: StyleGap,
    profile: EngineerProfile,
  ): Promise<APLStyleProposal> {

    const prompt = `
You are a senior mastering engineer. Translate the following engineer-style gap analysis
into a concrete DSP parameter set. Output ONLY a single JSON object — no prose, no markdown fences.

## Target Engineer
Name: ${profile.name}
Aesthetic: ${profile.signature}

## Current Mix Analysis
- Integrated LUFS: ${analysis.lufs.toFixed(1)}
- Loudness Range (LRA): ${analysis.lra.toFixed(1)} dB
- Crest Factor: ${analysis.crest.toFixed(1)} dB
- Stereo Width (M/S ratio): ${analysis.stereoWidth.toFixed(3)}
- Tonal balance (0–1 normalised): low=${analysis.signature.tonalBalance.low.toFixed(3)}, lowMid=${analysis.signature.tonalBalance.lowMid.toFixed(3)}, mid=${analysis.signature.tonalBalance.mid.toFixed(3)}, highMid=${analysis.signature.tonalBalance.highMid.toFixed(3)}, high=${analysis.signature.tonalBalance.high.toFixed(3)}

## Style Gaps (current → target)
- LUFS gap: ${gap.lufsGap > 0 ? '+' : ''}${gap.lufsGap.toFixed(1)} dB (positive = need louder)
- LRA gap: ${gap.lraGap > 0 ? '+' : ''}${gap.lraGap.toFixed(1)} dB
- Crest gap: ${gap.crestGap > 0 ? '+' : ''}${gap.crestGap.toFixed(1)} dB
- Width gap: ${gap.widthGap > 0 ? '+' : ''}${gap.widthGap.toFixed(3)}
- Saturation: ${gap.saturationTarget.character} @ ${gap.saturationTarget.amount.toFixed(2)} amount
- Reverb: decay=${gap.reverbTarget.decay}s, predelay=${gap.reverbTarget.predelay}ms, wet=${gap.reverbTarget.wet.toFixed(2)}

## Instructions
Return a JSON object with these exact top-level keys:

{
  "rationale": "<2–3 sentence engineer-speak explanation of the main moves>",
  "eq": [
    { "frequency": <Hz number>, "gain": <dB -12 to +6>, "type": "lowshelf"|"peaking"|"highshelf", "q": <0.3–2.5> }
  ],
  "compression": {
    "threshold": <-40 to 0 dB>,
    "ratio": <1.0 to 8.0>,
    "attack": <0.001 to 0.1 seconds>,
    "release": <0.05 to 0.5 seconds>,
    "makeupGain": <-6 to 6 dB>
  },
  "saturation": { "type": "${gap.saturationTarget.character}", "amount": <0–1>, "mix": <0–1> },
  "stereoImager": { "lowWidth": <0.5–1.6>, "midWidth": <0.5–1.6>, "highWidth": <0.5–1.6>, "crossovers": [300, 5000] },
  "motionReverb": { "mix": <0–0.5>, "decay": <0.3–4.0>, "preDelay": <0.001–0.08> },
  "limiter": { "threshold": <-3 to -0.3 dB>, "release": <0.05 to 0.2>, "ratio": 20 },
  "outputTrimDb": <-6 to +3>
}

Rules:
- Max EQ boost anywhere: +4 dB. Max cut: -6 dB.
- Never boost above 10kHz more than +3 dB.
- Never cut 250–500 Hz (body/warmth zone).
- Compression ratio ≤ 5:1 at the master bus level.
- If the gap is already small (< 1 dB LUFS, < 0.05 width), keep parameters close to neutral.
- Output ONLY the JSON object. No markdown, no explanation outside the "rationale" field.
`.trim();

    let geminiRationale = 'Style matching applied based on engineer profile.';
    let rawConfig: Partial<ProcessingConfig> = {};

    try {
      const raw = await callGeminiForStyleMatch(prompt);
      const parsed = robustParse(raw);

      if (parsed) {
        geminiRationale = typeof parsed.rationale === 'string'
          ? parsed.rationale
          : geminiRationale;

        // Build ProcessingConfig from Gemini output
        if (Array.isArray(parsed.eq) && parsed.eq.length > 0) {
          rawConfig.eq = parsed.eq.map((band: any) => ({
            frequency: Number(band.frequency) || 1000,
            gain: Math.max(-12, Math.min(6, Number(band.gain) || 0)),
            type: (['lowshelf','peaking','highshelf'].includes(band.type)
              ? band.type : 'peaking') as 'lowshelf' | 'peaking' | 'highshelf',
            q: Math.max(0.3, Math.min(2.5, Number(band.q) || 1.0)),
          }));
        }

        if (parsed.compression && typeof parsed.compression === 'object') {
          const c = parsed.compression;
          rawConfig.compression = {
            threshold: Math.max(-40, Math.min(0, Number(c.threshold) || -24)),
            ratio: Math.max(1, Math.min(8, Number(c.ratio) || 2)),
            attack: Math.max(0.001, Math.min(0.1, Number(c.attack) || 0.01)),
            release: Math.max(0.05, Math.min(0.5, Number(c.release) || 0.2)),
            makeupGain: Math.max(-6, Math.min(6, Number(c.makeupGain) || 0)),
          };
        }

        if (parsed.saturation && typeof parsed.saturation === 'object') {
          const s = parsed.saturation;
          const satType = (['tape','tube','console','digital'] as const).includes(s.type)
            ? s.type as SaturationConfig['type']
            : gap.saturationTarget.character;
          rawConfig.saturation = {
            type: satType,
            amount: Math.max(0, Math.min(1, Number(s.amount) || gap.saturationTarget.amount)),
            mix: Math.max(0, Math.min(1, Number(s.mix) || 0.7)),
          };
        }

        if (parsed.stereoImager && typeof parsed.stereoImager === 'object') {
          const si = parsed.stereoImager;
          const clampW = (v: number) => Math.max(0.5, Math.min(1.6, v));
          rawConfig.stereoImager = {
            lowWidth: clampW(Number(si.lowWidth) || 1.0),
            midWidth: clampW(Number(si.midWidth) || 1.0),
            highWidth: clampW(Number(si.highWidth) || 1.0),
            crossovers: [300, 5000],
          };
        }

        if (parsed.motionReverb && typeof parsed.motionReverb === 'object') {
          const rv = parsed.motionReverb;
          rawConfig.motionReverb = {
            mix: Math.max(0, Math.min(0.5, Number(rv.mix) || gap.reverbTarget.wet)),
            decay: Math.max(0.3, Math.min(4.0, Number(rv.decay) || gap.reverbTarget.decay)),
            preDelay: Math.max(0.001, Math.min(0.08, Number(rv.preDelay) || gap.reverbTarget.predelay / 1000)),
          };
        }

        if (parsed.limiter && typeof parsed.limiter === 'object') {
          rawConfig.limiter = {
            threshold: Math.max(-3, Math.min(-0.3, Number(parsed.limiter.threshold) || -1)),
            release: Math.max(0.05, Math.min(0.2, Number(parsed.limiter.release) || 0.08)),
            ratio: 20,
          };
        }

        if (typeof parsed.outputTrimDb === 'number') {
          rawConfig.outputTrimDb = Math.max(-6, Math.min(3, parsed.outputTrimDb));
        }
      }
    } catch (err) {
      console.warn('[StyleMatchingEngine] Gemini call failed, using heuristic config:', err);
      rawConfig = this.buildHeuristicConfig(gap);
    }

    // If Gemini returned nothing useful, fall back to heuristic
    if (Object.keys(rawConfig).length === 0) {
      rawConfig = this.buildHeuristicConfig(gap);
    }

    return {
      engineerId: profile.id,
      engineerName: profile.name,
      description: `${profile.name} — ${profile.signature.split('.')[0]}.`,
      processingConfig: rawConfig as ProcessingConfig,
      styleGap: gap,
      confidence: 0.82,
      geminiRationale,
    };
  }

  /**
   * Top-level entry point: analyze the current mix, compute the gap to a
   * named engineer profile, and return a ready-to-execute APLStyleProposal.
   */
  async matchToProfile(
    buffer: AudioBuffer,
    profileId: string,
  ): Promise<APLStyleProposal> {
    const profile = ENGINEER_PROFILES[profileId];
    if (!profile) {
      throw new Error(`[StyleMatchingEngine] Unknown engineer profile: "${profileId}"`);
    }

    const analysis = await this.analyzeCurrentMix(buffer);
    const gap = this.computeGapToProfile(analysis, profile);
    return this.generateAPLProposal(analysis, gap, profile);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Deterministic fallback when Gemini is unavailable */
  private buildHeuristicConfig(gap: StyleGap): Partial<ProcessingConfig> {
    const config: Partial<ProcessingConfig> = {};

    // EQ from gap deltas
    const rawBands = [
      { frequency: 80,    gain: gap.eqDelta.bass,     type: 'lowshelf'  as const, q: 0.7 },
      { frequency: 250,   gain: gap.eqDelta.lowMid,   type: 'peaking'   as const, q: 1.0 },
      { frequency: 1000,  gain: gap.eqDelta.mid,       type: 'peaking'   as const, q: 1.2 },
      { frequency: 4000,  gain: gap.eqDelta.presence,  type: 'peaking'   as const, q: 1.5 },
      { frequency: 10000, gain: gap.eqDelta.air,        type: 'highshelf' as const, q: 0.7 },
    ];
    const activeBands = rawBands.filter(b => Math.abs(b.gain) > 0.3).map(b => ({
      frequency: b.frequency,
      gain: Math.max(-6, Math.min(4, b.gain)),
      type: b.type,
      q: b.q,
    }));
    if (activeBands.length > 0) config.eq = activeBands;

    // Compression for dynamics gap
    if (Math.abs(gap.lufsGap) > 1 || Math.abs(gap.crestGap) > 1) {
      config.compression = {
        threshold: -24,
        ratio: gap.lufsGap > 0 ? 3 : 1.5,
        attack: 0.01,
        release: 0.2,
        makeupGain: Math.max(-3, Math.min(3, gap.lufsGap * 0.5)),
      };
    }

    // Saturation
    config.saturation = {
      type: gap.saturationTarget.character,
      amount: gap.saturationTarget.amount,
      mix: 0.7,
    };

    // Stereo width
    if (Math.abs(gap.widthGap) > 0.05) {
      const w = Math.max(0.6, Math.min(1.5, 1.0 + gap.widthGap));
      config.stereoImager = { lowWidth: w * 0.8, midWidth: w, highWidth: w * 1.1, crossovers: [300, 5000] };
    }

    // Reverb
    config.motionReverb = {
      mix: gap.reverbTarget.wet,
      decay: gap.reverbTarget.decay,
      preDelay: gap.reverbTarget.predelay / 1000,
    };

    config.limiter = { threshold: -1, release: 0.08, ratio: 20 };

    return config;
  }
}

// Needed for import inside saturation type narrowing
type SaturationConfig = { type: 'tape' | 'tube' | 'digital' | 'density' | 'console' | 'spiral' | 'channel' | 'totape' | 'purestdrive'; amount: number; mix?: number };

export const styleMatchingEngine = new StyleMatchingEngine();
