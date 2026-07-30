import type { ArrangementAnalysis } from '../arrangementAnalyzer';
import type { HookLiftAnalysis } from './hookLiftLogic';
import type { CompressionStackAnalysis } from './compressionStackLogic';
import type { DelayAutomationAnalysis } from './delayAutomationLogic';
import type { VocalContextAwarenessAnalysis } from './contextAwareness';
import type { PresenceAirAnalysis } from './presenceAirTuning';
import type { VocalIntentAnalysis } from './vocalIntentDetector';
import type { VocalProfile } from './vocalProfiler';

export type AdLibRole = 'supportive' | 'punctuation' | 'response' | 'intimate';

export interface AdLibPlacementRecommendation {
  role: AdLibRole;
  triggerHint: string;
  triggerLocationHint: string;
  depthShiftDb: number;
  panPosition: number;
  stereoWidth: number;
  delayOffsetMs: number;
  highPassHz: number;
  saturationDb: number;
  reverbMix: number;
  confidence: number;
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
}

export interface AdLibPlacementAnalysis {
  shouldApply: boolean;
  overallConfidence: number;
  primaryRecommendation?: AdLibPlacementRecommendation;
  alternateRecommendations: AdLibPlacementRecommendation[];
  rationale: string;
  riskNotes: string[];
  interactionNotes: string[];
  skipReason?: string;
}

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

function sectionDensity(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.55;
  const weighted = arrangement.sections.reduce((sum, section) => sum + section.density * section.energy, 0);
  return clamp(weighted / arrangement.sections.length, 0, 1);
}

function hookEnergy(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.72;
  const hook = [...arrangement.sections].sort((a, b) => b.energy - a.energy)[0];
  return hook?.energy ?? 0.72;
}

function verseEnergy(arrangement?: ArrangementAnalysis): number {
  if (!arrangement || arrangement.sections.length === 0) return 0.45;
  const verse = [...arrangement.sections].sort((a, b) => a.energy - b.energy)[0];
  return verse?.energy ?? 0.45;
}

function chooseRole(
  profile: VocalProfile,
  compression: CompressionStackAnalysis,
  delay: DelayAutomationAnalysis,
  hookLift: HookLiftAnalysis,
  arrangement?: ArrangementAnalysis,
  intent?: VocalIntentAnalysis,
  context?: VocalContextAwarenessAnalysis
): AdLibRole {
  const density = sectionDensity(arrangement);
  const contrast = hookLift.verseVsHookContrast.contrastScore;
  const leadMovement = delay.shouldApply ? (delay.primaryRecommendation?.useCase === 'hook_excitement' ? 0.15 : 0.1) : 0.05;

  if (profile.breathiness > 0.28 && leadMovement >= 0.1 && delay.primaryRecommendation?.useCase === 'ad_lib_support') {
    return 'response';
  }

  if (profile.transientSharpness > 0.42 || (profile.breathiness < 0.2 && contrast < 0.28)) {
    return 'punctuation';
  }

  if (hookLift.amountOfLift > 0.28 || density > 0.55 || compression.strategy !== 'single_stage') {
    return 'supportive';
  }

  if (intent?.intent === 'whispered' || intent?.intent === 'intimate') {
    return contrast > 0.25 ? 'response' : 'supportive';
  }

  if (intent?.intent === 'aggressive' || intent?.intent === 'belted') {
    return contrast > 0.22 ? 'punctuation' : 'supportive';
  }

  if (context?.densityClass === 'dense' || context?.densityClass === 'wall_of_sound') {
    return contrast > 0.24 ? 'supportive' : 'punctuation';
  }

  const sparseIntent = intent?.intent as string | undefined;
  if (context?.densityClass === 'sparse' && (sparseIntent === 'intimate' || sparseIntent === 'conversational')) {
    return 'response';
  }

  return contrast > 0.2 ? 'supportive' : 'punctuation';
}

function buildRecommendation(
  role: AdLibRole,
  profile: VocalProfile,
  compression: CompressionStackAnalysis,
  presenceAir: PresenceAirAnalysis,
  delay: DelayAutomationAnalysis,
  hookLift: HookLiftAnalysis,
  arrangement?: ArrangementAnalysis,
  intent?: VocalIntentAnalysis,
  context?: VocalContextAwarenessAnalysis
): AdLibPlacementRecommendation {
  const density = sectionDensity(arrangement);
  const hook = hookEnergy(arrangement);
  const verse = verseEnergy(arrangement);
  const contrast = hookLift.verseVsHookContrast.contrastScore;
  const topEndLift = presenceAir.presenceTargets.reduce((sum, target) => sum + target.gainDb, 0) +
    presenceAir.airTargets.reduce((sum, target) => sum + target.gainDb, 0);
  const delayMovement = delay.shouldApply ? delay.overallConfidence : 0.25;

  if (role === 'supportive') {
    const intentDepthShift =
      intent?.intent === 'whispered' || intent?.intent === 'intimate'
        ? -1.4
        : intent?.intent === 'aggressive' || intent?.intent === 'belted'
          ? 0.6
          : 0;
    return {
      role,
      triggerHint: 'supporting ad-lib or hook garnish',
      triggerLocationHint: 'behind the lead / hook side phrase',
      depthShiftDb: clamp(
        -8.2 - density * 2.8 - hookLift.amountOfLift * 1.8 + intentDepthShift +
        (context?.adLibAdjustment.direction === 'deepen' ? -1.4 : 0) +
        (context?.adLibAdjustment.direction === 'bring_forward' ? 0.45 : 0),
        -14,
        -5
      ),
      panPosition: clamp(profile.voiceTypeConfidence > 0.75 ? 0.45 : -0.45, -0.7, 0.7),
      stereoWidth: clamp(
        0.5 + density * 0.12 +
        (context?.adLibAdjustment.direction === 'deepen' ? -0.1 : 0) +
        (context?.adLibAdjustment.direction === 'bring_forward' ? 0.04 : 0),
        0.42,
        0.7
      ),
      delayOffsetMs: clamp(16 + delayMovement * 16, 10, 36),
      highPassHz: clamp(200 + profile.warmth * 40 + density * 30, 180, 280),
      saturationDb: clamp(0.45 + contrast * 0.95, 0.4, 1.8),
      reverbMix: clamp(
        0.1 + density * 0.06 +
        (context?.adLibAdjustment.direction === 'deepen' ? 0.03 : 0) -
        (context?.adLibAdjustment.direction === 'bring_forward' ? 0.02 : 0),
        0.08,
        0.2
      ),
      confidence: clamp(0.68 + contrast * 0.1 + profile.voiceTypeConfidence * 0.06, 0, 1),
      rationale: 'Supportive ad-libs should sit behind the lead and widen the hook without pulling attention from the main line.',
      riskNotes: [
        'Do not move the ad-lib forward enough to compete with the lead vocal.',
        'Keep the low end filtered so the support layer stays out of the way.',
      ],
      interactionNotes: [
        `Hook energy ${hook.toFixed(2)} vs verse energy ${verse.toFixed(2)} suggests there is room for background support.`,
        delay.shouldApply
          ? 'Delay is already creating motion, so this layer should stay diffuse and secondary.'
          : 'Because delay is restrained, the ad-lib can provide some of the movement on its own.',
      ],
    };
  }

  if (role === 'response') {
    const intentDepthShift =
      intent?.intent === 'whispered' || intent?.intent === 'intimate'
        ? -0.9
        : intent?.intent === 'aggressive' || intent?.intent === 'belted'
          ? 0.4
          : 0;
    return {
      role,
      triggerHint: 'response phrase or call-and-response line',
      triggerLocationHint: 'opposite the lead / after the answer phrase',
      depthShiftDb: clamp(
        -7.2 - density * 2.0 + intentDepthShift +
        (context?.adLibAdjustment.direction === 'deepen' ? -1 : 0) +
        (context?.adLibAdjustment.direction === 'bring_forward' ? 0.35 : 0),
        -12,
        -4.8
      ),
      panPosition: clamp(profile.breathiness > 0.4 ? 0.6 : -0.6, -0.8, 0.8),
      stereoWidth: clamp(
        0.42 + profile.breathiness * 0.16 +
        (context?.adLibAdjustment.direction === 'deepen' ? -0.06 : 0) +
        (context?.adLibAdjustment.direction === 'bring_forward' ? 0.03 : 0),
        0.36,
        0.62
      ),
      delayOffsetMs: clamp(90 + hookLift.amountOfLift * 35, 75, 150),
      highPassHz: clamp(170 + profile.transientSharpness * 50, 160, 280),
      saturationDb: clamp(0.32 + topEndLift * 0.08, 0.25, 1.4),
      reverbMix: clamp(
        0.12 + density * 0.05 +
        (context?.adLibAdjustment.direction === 'deepen' ? 0.02 : 0) -
        (context?.adLibAdjustment.direction === 'bring_forward' ? 0.02 : 0),
        0.08,
        0.18
      ),
      confidence: clamp(0.62 + profile.breathiness * 0.1 + hookLift.amountOfLift * 0.08, 0, 1),
      rationale: 'Response ad-libs should answer the lead with a clear offset so the call-and-response feels intentional.',
      riskNotes: [
        'Do not make the response too loud or it will stop sounding like a reply.',
        'Keep the offset musical and consistent so the pattern is recognizable.',
      ],
      interactionNotes: [
        'This role works best when the hook is already lifted and the ad-lib can act as a conversational answer.',
        delay.shouldApply && delay.primaryRecommendation?.useCase === 'ad_lib_support'
          ? 'Delay and response timing should complement each other rather than stacking the same effect twice.'
          : 'The response layer can carry some of the groove because the delay layer is not already dominant.',
      ],
    };
  }

  return {
    role,
    triggerHint: 'short punctuation ad-lib',
    triggerLocationHint: 'phrase tail / hook punctuation',
    depthShiftDb: clamp(-4.8 - density * 1.4, -9, -4),
    panPosition: clamp(profile.transientSharpness > 0.5 ? 0.1 : -0.1, -0.35, 0.35),
    stereoWidth: clamp(
      0.24 + profile.transientSharpness * 0.14 +
      (intent?.intent === 'aggressive' || intent?.intent === 'belted' ? 0.03 : 0) -
      (intent?.intent === 'intimate' || intent?.intent === 'whispered' ? 0.04 : 0) +
      (context?.adLibAdjustment.direction === 'deepen' ? -0.05 : 0) +
      (context?.adLibAdjustment.direction === 'bring_forward' ? 0.02 : 0),
      0.18,
      0.44
    ),
    delayOffsetMs: clamp(5 + contrast * 14, 0, 18),
    highPassHz: clamp(220 + profile.warmth * 20, 200, 320),
    saturationDb: clamp(0.2 + contrast * 0.65, 0.18, 1),
    reverbMix: clamp(
      0.06 + (1 - density) * 0.05 +
      (context?.adLibAdjustment.direction === 'deepen' ? 0.015 : 0) -
      (context?.adLibAdjustment.direction === 'bring_forward' ? 0.01 : 0),
      0.05,
      0.12
    ),
    confidence: clamp(0.66 + profile.voiceTypeConfidence * 0.08, 0, 1),
    rationale: 'Punctuation ad-libs should stay close to the lead, adding a quick accent without changing the section depth.',
    riskNotes: [
      'Do not pan or widen so far that the phrase stops feeling attached to the lead.',
      'Keep the timing offset short so the accent still feels like part of the main line.',
    ],
    interactionNotes: [
      'A short punctuation layer is best when the hook already has lift and motion elsewhere.',
      'If the lead is already wet, keep this layer drier and tighter to avoid clutter.',
      'Keep the punctuation attached to the lead so it reads as an accent, not a separate part.',
    ],
  };
}

export class VocalAdLibPlacementLogic {
  public static analyze(
    profile: VocalProfile,
    compression: CompressionStackAnalysis,
    presenceAir: PresenceAirAnalysis,
    delay: DelayAutomationAnalysis,
    hookLift: HookLiftAnalysis,
    arrangement?: ArrangementAnalysis,
    intent?: VocalIntentAnalysis,
    context?: VocalContextAwarenessAnalysis
  ): AdLibPlacementAnalysis {
    const role = chooseRole(profile, compression, delay, hookLift, arrangement, intent, context);
    const primaryRecommendation = buildRecommendation(
      role,
      profile,
      compression,
      presenceAir,
      delay,
      hookLift,
      arrangement,
      intent,
      context
    );

    const alternateRole: AdLibRole = role === 'supportive'
      ? 'punctuation'
      : role === 'punctuation'
        ? 'response'
        : 'supportive';

    const alternateRecommendations = [
      buildRecommendation(alternateRole, profile, compression, presenceAir, delay, hookLift, arrangement, intent, context),
    ];

    const shouldApply = primaryRecommendation.confidence > 0.6;
    const overallConfidence = clamp(
      0.58 +
      hookLift.amountOfLift * 0.12 +
      presenceAir.overallConfidence * 0.1 +
      profile.voiceTypeConfidence * 0.08,
      0,
      1
    );

    if (!shouldApply) {
      return {
        shouldApply: false,
        overallConfidence,
        alternateRecommendations: [],
        rationale: 'The vocal support layer does not need extra depth or placement work right now.',
        riskNotes: [
          'The lead and hook already carry enough separation.',
          'Avoid adding background layers that would only create clutter.',
        ],
        interactionNotes: [
          'Compression, presence, delay, and hook lift are already carrying the section energy.',
        ],
        skipReason: 'Ad-lib placement is not needed for this section.',
      };
    }

    return {
      shouldApply: true,
      overallConfidence,
      primaryRecommendation,
      alternateRecommendations,
      rationale: [
        `Ad-lib role selected as ${role} based on hook lift, delay motion, and arrangement density.`,
        `Primary placement keeps the support layer behind the lead with a clear spatial role.`,
      ].join(' '),
      riskNotes: [
        'Keep support layers lower in level than the lead and never let them obscure the main lyric.',
        'Do not over-widen the layer if the hook already feels crowded.',
      ],
      interactionNotes: [
        `Hook section hint: ${hookLift.hookSectionHint}; verse section hint: ${hookLift.verseSectionHint}.`,
        delay.shouldApply
          ? 'Delay movement is already present, so ad-lib placement should reinforce that motion rather than duplicate it.'
          : 'The delay layer is restrained, so this placement can contribute a bit more of the section movement.',
      ],
    };
  }
}

export const vocalAdLibPlacementLogic = VocalAdLibPlacementLogic;
